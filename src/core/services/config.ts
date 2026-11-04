/**
 * Конфигурация (аналог `script/global/config.gd`).
 * Переменные: `sfxVolume` (по умолчанию 0.5), `demoMode`.
 * Событие `change` — подписка адаптеров (например, WebAudio на изменение громкости).
 */
export type ConfigKey = 'sfxVolume' | 'demoMode';

type ChangeListener = (key: ConfigKey, value: number | boolean) => void;

export class Config {
  private vars: Record<ConfigKey, number | boolean> = {
    sfxVolume: 0.5,
    demoMode: true,
  };

  private listeners = new Set<ChangeListener>();

  get<K extends ConfigKey>(key: K): (typeof this.vars)[K] {
    return this.vars[key] as (typeof this.vars)[K];
  }

  set<K extends ConfigKey>(key: K, value: (typeof this.vars)[K]): void {
    if (this.vars[key] === value) return;
    this.vars[key] = value;
    for (const l of this.listeners) l(key, value);
  }

  isDemoMode(): boolean {
    return this.vars.demoMode === true;
  }

  /** Подписка на изменения; возвращает функцию отписки. */
  subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
