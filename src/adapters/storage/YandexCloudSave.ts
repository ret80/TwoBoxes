import type { Player, SDK } from 'ysdk';
import type { ISaveStorage } from '../../ports/ISaveStorage';
import { LocalStorageSave } from './LocalStorageSave';

/**
 * Метка времени последней записи прогресса — служебный ключ в кэше и в облаке.
 * По ней решается, чей прогресс свежее: облачный или локальный.
 */
const SAVED_AT_KEY = 'savedAt';

/** Пауза перед отправкой: за один ход прогресс может писаться несколько раз. */
const UPLOAD_DELAY_MS = 1200;

/** Метка времени из данных: всё, что не число, считается «очень старым». */
function stamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export interface YandexCloudOptions {
  /** Ключи, которые едут в облако; остальные настройки остаются локальными. */
  cloudKeys: readonly string[];
  /**
   * Проверка облачного значения перед тем, как принять его в кэш. Вернуть
   * `false` — значение не наше (например, сохранение другой версии): тогда оно
   * уходит в резервную копию, а не затирается новой записью.
   */
  onRestore?: (key: string, value: unknown) => boolean;
}

/**
 * Хранилище прогресса в облаке Яндекс Игр (`ysdk.getPlayer()`), с локальным
 * кэшем поверх localStorage.
 *
 * Порт `ISaveStorage` синхронный, а облако — нет: поэтому чтение всегда идёт из
 * кэша, запись — сразу в кэш и с задержкой в облако. Площадка завернёт игру на
 * модерации, если прогресс живёт только в localStorage, а без SDK (dev, обычная
 * сборка) этот класс ведёт себя как обычный `LocalStorageSave`.
 */
export class YandexCloudSave implements ISaveStorage {
  private readonly local: ISaveStorage = new LocalStorageSave();
  private readonly cloudKeys: ReadonlySet<string>;
  private readonly onRestore?: (key: string, value: unknown) => boolean;
  private player: Player | null = null;
  /** Ключи, ожидающие отправки в облако. */
  private readonly pending = new Set<string>();
  /** Ключи, которые игрок уже менял: облако их не перетирает. */
  private readonly touched = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: YandexCloudOptions) {
    this.cloudKeys = new Set(options.cloudKeys);
    this.onRestore = options.onRestore;
  }

  /**
   * Забрать прогресс из облака. Вызывать после инициализации SDK; если SDK нет
   * или платформа ответила ошибкой, остаёмся на локальном кэше.
   */
  async init(sdk: SDK | null): Promise<void> {
    if (!sdk) return;
    try {
      const player = await sdk.getPlayer();
      const cloud = (await player.getData()) as Record<string, unknown>;
      this.player = player;
      this.merge(cloud);
      // Последний шанс дописать прогресс, если игрок закрывает вкладку.
      window.addEventListener('pagehide', this.flush);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.flush();
      });
      // Прогресс могли записать, пока облако грузилось: дослать его наверх.
      this.schedule();
    } catch (error) {
      console.warn('YandexCloudSave: облако недоступно, прогресс только локальный:', error);
    }
  }

  save(key: string, data: unknown): void {
    this.local.save(key, data);
    if (!this.cloudKeys.has(key)) return;
    this.touched.add(key);
    this.local.save(SAVED_AT_KEY, Date.now());
    this.pending.add(key);
    this.schedule();
  }

  load(key: string): unknown | null {
    return this.local.load(key);
  }

  remove(key: string): void {
    this.local.remove(key);
    if (!this.cloudKeys.has(key)) return;
    this.touched.add(key);
    this.pending.delete(key);
    // null в setData удаляет ключ из облака.
    this.upload({ [key]: null });
  }

  /** Отправить накопленное в облако сразу, не дожидаясь паузы. */
  flush = (): void => {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending.size === 0 || !this.player) return;
    const payload: Record<string, unknown> = { [SAVED_AT_KEY]: stamp(this.local.load(SAVED_AT_KEY)) };
    for (const key of this.pending) payload[key] = this.local.load(key);
    this.pending.clear();
    this.upload(payload);
  };

  /**
   * Слить облако с кэшем: более свежая сторона побеждает. Пустое облако
   * (первый запуск на площадке) получает локальный прогресс.
   *
   * Запись, сделанная в этой сессии, побеждает всегда: часы устройства могут
   * отставать от облачных, и по одной только метке свежий ход потерялся бы.
   */
  private merge(cloud: Record<string, unknown>): void {
    const cloudAt = stamp(cloud[SAVED_AT_KEY]);
    const localAt = stamp(this.local.load(SAVED_AT_KEY));
    const hasCloud = [...this.cloudKeys].some((key) => cloud[key] != null);

    if (!hasCloud || this.touched.size > 0 || localAt > cloudAt) {
      for (const key of this.cloudKeys) {
        if (this.local.load(key) != null) this.pending.add(key);
      }
      return;
    }

    // Сюда попадаем только когда игрок ничего не записывал в этой сессии.
    for (const key of this.cloudKeys) {
      if (cloud[key] == null) continue;
      // Сначала спрашиваем игру: значение может быть от другой версии формата.
      if (this.onRestore?.(key, cloud[key]) === false) {
        this.backup(key, cloud[key]);
        continue;
      }
      this.local.save(key, cloud[key]);
    }
    this.local.save(SAVED_AT_KEY, cloudAt);
  }

  /**
   * Отложить значение под `<ключ>-backup` — в кэше и в облаке. Ключ резерва в
   * облачный список не входит, поэтому новая игра его не перетирает.
   *
   * Нужен, когда сохранение нельзя ни применить, ни молча затереть (старый или
   * будущий формат). Сообщение игроку/разработчику пишет вызывающий: он знает,
   * чем именно значение не подошло.
   */
  backup(key: string, value: unknown): void {
    const backupKey = `${key}-backup`;
    this.local.save(backupKey, value);
    this.upload({ [backupKey]: value });
  }

  private schedule(): void {
    if (this.pending.size === 0 || !this.player || this.timer !== null) return;
    this.timer = setTimeout(this.flush, UPLOAD_DELAY_MS);
  }

  private upload(payload: Record<string, unknown>): void {
    this.player?.setData(payload).catch((error: unknown) => {
      console.warn('YandexCloudSave: не удалось записать прогресс в облако:', error);
    });
  }
}
