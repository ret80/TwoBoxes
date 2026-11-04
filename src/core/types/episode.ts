/**
 * Эпизод — набор уровней (аналог `script/game/levels/episode.gd`).
 * Уровни создаются лениво из сырых данных карт (строки) — см. EpisodeManager.
 */
export class Episode {
  /** Индекс максимального разблокированного уровня. */
  public lastUnlockedLevel = 0;
  /** Все уровни открыты (читы/отладка). */
  public unlockedAll = false;

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

  /** Сериализация прогресса эпизода. */
  serialize(): { lastUnlockedLevel: number; unlockedAll: boolean } {
    return { lastUnlockedLevel: this.lastUnlockedLevel, unlockedAll: this.unlockedAll };
  }

  deserialize(data: { lastUnlockedLevel: number; unlockedAll: boolean }): void {
    this.lastUnlockedLevel = data.lastUnlockedLevel;
    this.unlockedAll = data.unlockedAll;
  }
}
