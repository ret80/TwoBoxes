/**
 * Порт аудио. Реализация — WebAudio-адаптер (Фаза 9).
 * AudioContext создаётся по user gesture (политики автозапуска браузеров).
 */
export interface IAudio {
  init(): Promise<void>;

  /** Звуковой эффект: 'swipe' — движение кубиков, 'message-appear' — диалог завершения. */
  playSfx(name: string, volume?: number): void;

  /** Фоновая музыка (loop). */
  playMusic(name: string, volume?: number): void;
  stopMusic(): void;

  setSfxVolume(volume: number): void;
  setMusicVolume(volume: number): void;

  /** Пауза/возобновление (suspend/resume AudioContext). */
  pause(): void;
  resume(): void;
}
