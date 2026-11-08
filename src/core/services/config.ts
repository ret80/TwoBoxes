/**
 * Конфигурация (аналог `script/global/config.gd`).
 * Переменные: `sfxVolume`, `musicVolume` (по умолчанию 0.5/0.3), `demoMode`,
 * скорость анимации `moveSpeed`, режим компаса `compass`, вид подсказки
 * `hintStyle`, тема `theme` (по умолчанию светлая, есть режим «как в системе»),
 * а также отладочные `showFps` и `projection`.
 * Событие `change` — подписка адаптеров (например, WebAudio на изменение громкости).
 */
/** Скорость анимации хода: штатная плавная или ускоренная. */
export type MoveSpeed = 'smooth' | 'fast';

/** Показ компаса L/D: авто (по последнему вводу) или всегда включён. */
export type CompassMode = 'auto' | 'on';

/** Вид подсказки: стрелки на полу или проволочный кубик, едущий по тому же пути. */
export type HintStyle = 'arrows' | 'cube';

/** Тема оформления интерфейса и сцены (после разрешения системной настройки). */
export type Theme = 'light' | 'dark';

/**
 * Выбор темы в настройках: явная светлая/тёмная или «как в системе» — тогда
 * тема следует за prefers-color-scheme и меняется на лету при смене настройки ОС.
 */
export type ThemeMode = Theme | 'system';

export type ConfigKey =
  | 'sfxVolume'
  | 'musicVolume'
  | 'demoMode'
  | 'showFps'
  | 'projection'
  | 'moveSpeed'
  | 'compass'
  | 'hintStyle'
  | 'theme';

type ConfigValue = number | boolean | string;
type ChangeListener = (key: ConfigKey, value: ConfigValue) => void;

export class Config {
  private vars: Record<ConfigKey, ConfigValue> = {
    sfxVolume: 0.5,
    musicVolume: 0.3,
    demoMode: true,
    showFps: false,
    // По умолчанию — изометрия с лёгкой прямой перспективой: чистая
    // аксонометрия читается как обратная перспектива (дальнее кажется крупнее).
    projection: 'iso',
    moveSpeed: 'smooth',
    compass: 'auto',
    hintStyle: 'arrows',
    theme: 'light',
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
