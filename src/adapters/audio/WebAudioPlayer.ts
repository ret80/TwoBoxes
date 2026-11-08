import type { IAudio } from '../../ports/IAudio';

const MUSIC_VOLUME = 0.3;

/**
 * Эмбиент-сет. Четыре аккорда сменяют друг друга каждые CHORD_SECONDS: бас
 * ведёт низ, пэд тянет середину, редкие «капли» мелодии идут по пентатонике
 * A-мажора. Пентатоника выбрана потому, что она не конфликтует ни с одним
 * аккордом сетки, поэтому мелодия может падать в любую долю без фальши.
 */
const CHORDS: { bass: number; pad: number[] }[] = [
  { bass: 110, pad: [220, 277.18, 329.63, 493.88] }, // A add9
  { bass: 92.5, pad: [185, 220, 277.18, 369.99] }, // F#m7
  { bass: 73.42, pad: [146.83, 220, 293.66, 369.99] }, // D add9
  { bass: 82.41, pad: [164.81, 246.94, 329.63, 415.3] }, // E
];
const PENTATONIC = [440, 493.88, 554.37, 659.25, 739.99];

const CHORD_SECONDS = 16;
/** Сколько секунд вперёд планируем события: запас больше интервала таймера. */
const SCHEDULE_AHEAD = 2.5;

/** Реверб: импульс из шума с экспоненциальным затуханием — длинный «зал». */
function createReverb(ctx: AudioContext, seconds = 3.6): ConvolverNode {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  const fadeIn = rate * 0.03; // не резкий удар, а мягкое нарастание
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const tail = Math.pow(1 - i / length, 2.6);
      data[i] = (Math.random() * 2 - 1) * tail * Math.min(1, i / fadeIn);
    }
  }
  const convolver = ctx.createConvolver();
  convolver.buffer = buffer;
  return convolver;
}

/**
 * Аудио-адаптер на WebAudio (план 9.1).
 * AudioContext создаётся по user gesture. Если wav-ассеты недоступны —
 * fallback: синтез коротких звуков через OscillatorNode (см. правки плана, п.12).
 * Звуки: 'swipe' — движение кубиков, 'place' — кубик встал на свою площадку,
 * 'portal' — телепорт, 'message-appear' — диалог завершения.
 * Музыка — генеративный эмбиент: аккорды, бас и редкая мелодия планируются
 * заранее по времени AudioContext, поэтому нет щелчков и дрейфа ритма.
 */
export class WebAudioPlayer implements IAudio {
  private ctx: AudioContext | null = null;
  private sfxVolume = 0.5;
  private musicVolume = MUSIC_VOLUME;
  private musicTimer: number | null = null;
  private musicVoices = new Set<AudioScheduledSourceNode>();
  private musicBus: GainNode | null = null;
  private musicDry: AudioNode | null = null;
  private musicSend: AudioNode | null = null;
  private chordIndex = 0;
  private nextChord = 0;
  private nextBell = 0;
  /** Белый шум для «всоса» телепорта: секунда моно, общая на все телепорты. */
  private noise: AudioBuffer | null = null;

  async init(): Promise<void> {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.ctx.onstatechange = () => {
      // Контекст усыпили извне (сворачивание вкладки) — сетку подхватим заново.
      if (this.ctx?.state === 'running' && this.musicBus) this.scheduleLoop();
    };
  }

  private ensureContext(): AudioContext | null {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  playSfx(name: string, volume?: number, durationMs?: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const vol = (volume ?? this.sfxVolume) * this.sfxVolume;
    if (name === 'portal') {
      // Телепорт: всос → тишина → «поп» на выходе → оседание на плиту.
      this.teleport(ctx, vol, durationMs ?? 1290);
    } else if (name === 'swipe') {
      // Свайп: короткий pitch-slide (fallback вместо wav-файла)
      this.tone(ctx, 320, 160, 0.12, vol, 'triangle');
    } else if (name === 'place') {
      // Кубик на месте: короткий высокий «динь» с мягким обертоном.
      this.tone(ctx, 880, 1180, 0.1, vol, 'triangle');
      this.tone(ctx, 1320, 1320, 0.16, vol * 0.35, 'sine', 0.05);
    } else if (name === 'message-appear') {
      // Сообщение: двухтоновый сигнал
      this.tone(ctx, 523, 523, 0.09, vol, 'sine');
      this.tone(ctx, 784, 784, 0.14, vol * 0.8, 'sine', 0.09);
    } else {
      this.tone(ctx, 440, 440, 0.1, vol, 'sine');
    }
  }

  /**
   * Телепорт. Звук идёт по тем же фазам, что и анимация кубика, и получает её
   * длительность: подъём и сжатие — всос, на исчезновении короткая тишина,
   * затем «поп» на выходе и тихий удар, когда кубик встал на плиту.
   */
  private teleport(ctx: AudioContext, volume: number, durationMs: number): void {
    const total = Math.max(300, durationMs) / 1000;
    const at = ctx.currentTime + 0.01;
    // Всос: шум сквозь полосовой фильтр, уходящий вверх, и поднимающийся тон.
    this.whoosh(ctx, at, total * 0.46, 240, 2600, volume * 0.75);
    this.tone(ctx, 190, 720, total * 0.46, volume * 0.2, 'triangle');
    // Выход: высота падает — кубик собирается из точки обратно в куб.
    const out = total * 0.52;
    this.tone(ctx, 1500, 520, total * 0.2, volume * 0.45, 'sine', out);
    this.tone(ctx, 760, 300, total * 0.34, volume * 0.22, 'triangle', out);
    // Кубик опустился на плиту.
    this.tone(ctx, 200, 130, 0.1, volume * 0.28, 'sine', total * 0.94);
  }

  /**
   * Шум сквозь полосовой фильтр с уходящей вверх частотой: так звучит
   * втягивание. Тихо на краях, чтобы не щёлкало на старте и не обрывалось.
   */
  private whoosh(
    ctx: AudioContext,
    at: number,
    dur: number,
    from: number,
    to: number,
    volume: number,
  ): void {
    if (dur <= 0.01) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer(ctx);
    source.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 2.4;
    band.frequency.setValueAtTime(from, at);
    band.frequency.exponentialRampToValueAtTime(to, at + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), at + dur * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    source.connect(band).connect(gain).connect(ctx.destination);
    source.start(at);
    source.stop(at + dur + 0.05);
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise && this.noise.sampleRate === ctx.sampleRate) return this.noise;
    const length = Math.floor(ctx.sampleRate);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;
    return buffer;
  }

  private tone(
    ctx: AudioContext,
    from: number,
    to: number,
    dur: number,
    volume: number,
    type: OscillatorType,
    delay = 0,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t0 = ctx.currentTime + delay;
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (from !== to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  playMusic(_name: string, volume?: number): void {
    const ctx = this.ensureContext();
    if (!ctx || this.musicBus) return;

    const bus = ctx.createGain();
    const target = Math.max(0.001, volume ?? this.musicVolume);
    bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    bus.gain.exponentialRampToValueAtTime(target, ctx.currentTime + 5);
    bus.connect(ctx.destination);

    const dry = ctx.createGain();
    dry.gain.value = 0.75;
    dry.connect(bus);

    // Мягкий верх: пэд не шипит, но и не звучит глухо.
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2400;
    tone.Q.value = 0.3;
    tone.connect(dry);

    const reverb = createReverb(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.62;
    reverb.connect(wet).connect(bus);

    const send = ctx.createGain();
    send.gain.value = 0.5;
    send.connect(reverb);

    this.musicBus = bus;
    this.musicDry = tone;
    this.musicSend = send;
    this.musicVoices.clear();
    this.chordIndex = 0;
    this.nextChord = ctx.currentTime + 0.2;
    this.nextBell = ctx.currentTime + 7 + Math.random() * 4;
    this.scheduleLoop();
    this.musicTimer = window.setInterval(() => this.scheduleLoop(), 500);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    const ctx = this.ctx;
    const bus = this.musicBus;
    const voices = [...this.musicVoices];
    this.musicBus = null;
    this.musicDry = null;
    this.musicSend = null;
    this.musicVoices.clear();
    if (!ctx || !bus) {
      for (const voice of voices) this.stopVoice(voice);
      return;
    }
    // Сначала гасим шину, чтобы уход был плавным, и только потом режем голоса.
    const now = ctx.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setTargetAtTime(0.0001, now, 0.3);
    window.setTimeout(() => {
      for (const voice of voices) this.stopVoice(voice);
      bus.disconnect();
    }, 1200);
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = volume;
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = volume;
    if (!this.musicBus || !this.ctx) return;
    this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicBus.gain.setTargetAtTime(Math.max(0.0001, volume), this.ctx.currentTime, 0.2);
  }

  pause(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  /** Планировщик: держит впереди SCHEDULE_AHEAD секунд готовых событий. */
  private scheduleLoop(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const now = ctx.currentTime;
    while (this.nextChord < now + SCHEDULE_AHEAD) {
      const at = Math.max(this.nextChord, now + 0.05);
      this.playChord(ctx, at, this.chordIndex);
      this.chordIndex = (this.chordIndex + 1) % CHORDS.length;
      this.nextChord = at + CHORD_SECONDS;
    }
    if (this.nextBell < now + SCHEDULE_AHEAD) {
      const at = Math.max(this.nextBell, now + 0.5);
      this.playBell(ctx, at, PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)]);
      this.nextBell = at + 5 + Math.random() * 7;
    }
  }

  private playChord(ctx: AudioContext, at: number, index: number): void {
    const chord = CHORDS[index % CHORDS.length];
    // Хвост длиннее шага сетки почти на треть: аккорды перекрываются десять
    // секунд, поэтому смена гармонии слышна как смена цвета, а не как вдох-выдох.
    const dur = CHORD_SECONDS + 10;
    chord.pad.forEach((freq, i) => {
      const pan = chord.pad.length > 1 ? (i / (chord.pad.length - 1)) * 2 - 1 : 0;
      this.padVoice(ctx, freq, at, dur, pan * 0.7, 0.05);
      // Тихое удвоение октавой ниже — тело аккорда без лишней густоты сверху.
      this.padVoice(ctx, freq / 2, at, dur, -pan * 0.35, 0.018);
    });
    this.padVoice(ctx, chord.bass, at, dur, 0, 0.055, 'sine');
  }

  /**
   * Голос пэда: пара расстроенных треугольников на ноту. Медленное всплытие,
   * ровное удержание и долгий спад дают «дыхание» аккорда, а расстройка пары
   * добавляет медленное биение — движение без LFO и без щелчков.
   */
  private padVoice(
    ctx: AudioContext,
    freq: number,
    at: number,
    dur: number,
    pan: number,
    level: number,
    type: OscillatorType = 'triangle',
  ): void {
    for (const detune of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune;

      // Всплытие — экспонентой (медленный вдох), спад — линейно: экспонента
      // гасит голос за пару секунд и оставляет дырку между аккордами.
      const attack = 4;
      const release = 10;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(level, at + attack);
      gain.gain.setValueAtTime(level, at + dur - release);
      gain.gain.linearRampToValueAtTime(0, at + dur);

      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;

      osc.connect(gain).connect(panner);
      this.routeVoice(panner);
      osc.start(at);
      osc.stop(at + dur + 0.1);
      this.trackVoice(osc);
    }
  }

  /** «Капля» мелодии: короткая атака, долгий хвост, больше реверба, чем сухого. */
  private playBell(ctx: AudioContext, at: number, freq: number): void {
    for (const [ratio, level] of [
      [1, 0.05],
      [2, 0.012],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * ratio;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(level, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 3.5);

      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.random() * 1.2 - 0.6;

      osc.connect(gain).connect(panner);
      this.routeVoice(panner);
      osc.start(at);
      osc.stop(at + 3.6);
      this.trackVoice(osc);
    }
  }

  private routeVoice(node: AudioNode): void {
    if (this.musicDry) node.connect(this.musicDry);
    if (this.musicSend) node.connect(this.musicSend);
  }

  private trackVoice(node: AudioScheduledSourceNode): void {
    this.musicVoices.add(node);
    node.onended = () => this.musicVoices.delete(node);
  }

  private stopVoice(node: AudioScheduledSourceNode): void {
    try {
      node.stop();
    } catch {
      // повторный stop после остановки контекста безопасно игнорируем
    }
  }
}
