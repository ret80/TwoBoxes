import type { IAudio } from '../../ports/IAudio';

const MUSIC_VOLUME = 0.3;

/**
 * Аудио-адаптер на WebAudio (план 9.1).
 * AudioContext создаётся по user gesture. Если wav-ассеты недоступны —
 * fallback: синтез коротких звуков через OscillatorNode (см. правки плана, п.12).
 * Звуки: 'swipe' — движение кубиков, 'place' — кубик встал на свою площадку,
 * 'message-appear' — диалог завершения.
 */
export class WebAudioPlayer implements IAudio {
  private ctx: AudioContext | null = null;
  private sfxVolume = 0.5;
  private musicVolume = MUSIC_VOLUME;
  private musicNodes: OscillatorNode[] = [];
  private musicGain: GainNode | null = null;

  async init(): Promise<void> {
    if (this.ctx) return;
    this.ctx = new AudioContext();
  }

  private ensureContext(): AudioContext | null {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  playSfx(name: string, volume?: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const vol = (volume ?? this.sfxVolume) * this.sfxVolume;
    if (name === 'swipe') {
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
    // Фоновая музыка (план 9.2): без треков-ассетов — спокойный синтезированный
    // эмбиент. Тихий аккорд с расстроенными парами голосов даёт медленное
    // «дыхание» без резких атак, низкий low-pass убирает звон.
    const ctx = this.ensureContext();
    if (!ctx || this.musicNodes.length > 0) return;

    const master = ctx.createGain();
    const target = (volume ?? this.musicVolume) * 0.35;
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(target, ctx.currentTime + 5);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 820;
    filter.Q.value = 0.4;
    filter.connect(master);
    master.connect(ctx.destination);

    // A2 / E3 / A3 / C#4 — спокойный мажорный аккорд.
    const chord = [110, 164.81, 220, 277.18];
    const nodes: OscillatorNode[] = [];
    chord.forEach((freq, i) => {
      for (const detune of [-6, 6]) {
        const osc = ctx.createOscillator();
        osc.type = i < 2 ? 'sine' : 'triangle';
        osc.frequency.value = freq;
        osc.detune.value = detune;
        const voice = ctx.createGain();
        voice.gain.value = i < 2 ? 0.055 : 0.03;
        osc.connect(voice).connect(filter);
        osc.start();
        nodes.push(osc);
      }
    });

    // Медленное «дыхание» даёт расстройка пар голосов (биения), а не LFO
    // громкости: так нулевая громкость действительно выключает музыку.

    this.musicNodes = nodes;
    this.musicGain = master;
  }

  stopMusic(): void {
    for (const node of this.musicNodes) {
      try {
        node.stop();
      } catch {
        // повторный stop после остановки контекста безопасно игнорируем
      }
    }
    this.musicNodes = [];
    this.musicGain?.disconnect();
    this.musicGain = null;
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = volume;
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = volume;
    if (!this.musicGain || !this.ctx) return;
    this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicGain.gain.setTargetAtTime(
      this.musicVolume * 0.35,
      this.ctx.currentTime,
      0.15,
    );
  }

  pause(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }
}
