/**
 * Конфигурация (аналог `script/global/config.gd`).
 * Переменные: `sfxVolume`, `musicVolume` (по умолчанию 0.5/0.3), `demoMode`,
 * а также отладочные `showFps` и `projection`.
 * Событие `change` — подписка адаптеров (например, WebAudio на изменение громкости).
 */
export type ConfigKey =
  | 'sfxVolume'
  | 'musicVolume'
  | 'demoMode'
  | 'showFps'
  | 'projection';

type ConfigValue = number | boolean | string;
type ChangeListener = (key: ConfigKey, value: ConfigValue) => void;

export class Config {
  private vars: Record<ConfigKey, ConfigValue> = {
    sfxVolume: 0.5,
    musicVolume: 0.3,
    demoMode: true,
    showFps: false,
    projection: 'ortho',
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
