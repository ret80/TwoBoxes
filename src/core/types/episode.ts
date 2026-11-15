import type { LevelRecord } from './game-result';

/**
 * Лучший заход важнее менее звёздного: сначала звёзды, затем ходы, затем
 * время. Так в сейве остаётся достижение, а не последняя попытка.
 */
const isBetterRecord = (next: LevelRecord, prev: LevelRecord): boolean => {
  if (next.stars !== prev.stars) return next.stars > prev.stars;
  if (next.moves !== prev.moves) return next.moves < prev.moves;
  return next.time < prev.time;
};

/**
 * Эпизод — набор уровней (аналог `script/game/levels/episode.gd`).
 * Уровни создаются лениво из сырых данных карт (строки) — см. EpisodeManager.
 */
export class Episode {
  /** Индекс максимального разблокированного уровня. */
  public lastUnlockedLevel = 0;
  /** Все уровни открыты (читы/отладка). */
  public unlockedAll = false;
  /** Лучший результат по уровням: индекс — номер уровня, `null` — не пройден. */
  public results: (LevelRecord | null)[] = [];

  constructor(
    public readonly episodeId: number,
    public readonly levelRows: string[][], // levelRows[i] — карты строк уровня i
  ) {}

  get levelCount(): number {
    return this.levelRows.length;
  }

  /**
   * Проверка блокировки уровня (аналог `is_locked()` в episode_mng.gd).
   * Уровень 1 каждого эпизода всегда доступен.
   */
  isLocked(levelId: number): boolean {
    if (this.unlockedAll) return false;
    return levelId > this.lastUnlockedLevel;
  }

  /** Разблокировка следующего уровня при победе (раздел 13 документации). */
  unlock(levelId: number): void {
    this.lastUnlockedLevel = Math.max(this.lastUnlockedLevel, levelId + 1);
  }

  /** Лучший результат уровня: `null` — уровень ещё не пройден. */
  result(levelId: number): LevelRecord | null {
    return this.results[levelId] ?? null;
  }

  /** Звёзды за уровень: 0 — ещё не пройден. */
  stars(levelId: number): number {
    return this.results[levelId]?.stars ?? 0;
  }

  /** Запомнить прохождение уровня (хранится лучший заход). */
  recordResult(levelId: number, record: LevelRecord): void {
    const prev = this.results[levelId];
    if (!prev || isBetterRecord(record, prev)) this.results[levelId] = { ...record };
  }

  /** Сериализация прогресса эпизода. */
  serialize(): {
    lastUnlockedLevel: number;
    unlockedAll: boolean;
    results: (LevelRecord | null)[];
  } {
    return {
      lastUnlockedLevel: this.lastUnlockedLevel,
      unlockedAll: this.unlockedAll,
      results: this.results.map((r) => (r ? { ...r } : null)),
    };
  }

  deserialize(data: {
    lastUnlockedLevel: number;
    unlockedAll: boolean;
    /** Старые сейвы этого поля не знают. */
    results?: (LevelRecord | null)[];
  }): void {
    this.lastUnlockedLevel = data.lastUnlockedLevel;
    this.unlockedAll = data.unlockedAll;
    this.results = (data.results ?? []).map((r) => (r ? { ...r } : null));
  }
}
