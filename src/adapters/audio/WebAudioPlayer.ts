import type { IAudio } from '../../ports/IAudio';

const MUSIC_VOLUME = 0.3;

/**
 * Аудио-адаптер на WebAudio (план 9.1).
 * AudioContext создаётся по user gesture. Если wav-ассеты недоступны —
 * fallback: синтез коротких звуков через OscillatorNode (см. правки плана, п.12).
 * Звуки: 'swipe' — движение кубиков, 'message-appear' — диалог завершения.
 */
export class WebAudioPlayer implements IAudio {
  private ctx: AudioContext | null = null;
  private sfxVolume = 0.5;
  private musicVolume = MUSIC_VOLUME;
  private musicNode: AudioBufferSourceNode | null = null;
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
    // Фоновая музыка (план 9.2): без треков-ассетов — тихий эмбиент-гул.
    const ctx = this.ensureContext();
    if (!ctx || this.musicNode) return;
    const gain = ctx.createGain();
    gain.gain.value = (volume ?? this.musicVolume) * 0.05;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 110;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 164.8; // квинта
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc2.start();
    this.musicNode = osc as unknown as AudioBufferSourceNode;
    this.musicGain = gain;
  }

  stopMusic(): void {
    this.musicNode?.stop();
    this.musicNode = null;
    this.musicGain = null;
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = volume;
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = volume;
    if (this.musicGain) this.musicGain.gain.value = this.musicVolume * 0.05;
  }

  pause(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }
}
