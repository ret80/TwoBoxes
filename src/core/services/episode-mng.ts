import { EPISODES_DATA } from '../data';
import { findShortestSolution } from '../generation/solver';
import { createLevelFromData } from '../rules/create';
import { Episode } from '../types/episode';
import { Level } from '../types/level';

/**
 * Сколько уровней эпизода нужно пройти, чтобы открылся первый уровень
 * следующего эпизода (раздел 13 документации: «7 из 12»).
 */
export const EPISODE_GATE_LEVELS = 7;

export interface SaveData {
  version: number;
  curEpisodeId: number;
  curLevelId: number;
  episodes: { lastUnlockedLevel: number; unlockedAll: boolean }[];
}

const SAVE_VERSION = 1; // как в оригинале (script/global/save.gd)

/**
 * Менеджер эпизодов (аналог `script/game/levels/episode_mng.gd`).
 * Разблокировка: при победе `lastUnlockedLevel = max(lastUnlocked, current + 1)`
 * (раздел 13 документации).
 */
export class EpisodeManager {
  public episodes: Episode[];
  public curEpisodeId = 0;
  public curLevelId = 0;

  private saved = false;
  /** Кэш минимального числа ходов по уровням (считается лениво, один раз). */
  private minMovesCache = new Map<string, number>();

  constructor() {
    this.episodes = EPISODES_DATA.map((rows, i) => new Episode(i, rows));
  }

  getEpisode(episodeId: number): Episode {
    const ep = this.episodes[episodeId];
    if (!ep) throw new Error(`Эпизод ${episodeId} не найден`);
    return ep;
  }

  /** Ленивое создание уровня из данных карт. */
  getLevel(episodeId: number, levelId: number): Level {
    const ep = this.getEpisode(episodeId);
    const rows = ep.levelRows[levelId];
    if (!rows) throw new Error(`Уровень ${episodeId}-${levelId} не найден`);
    return createLevelFromData(episodeId, levelId, rows);
  }

  getCurLevel(): Level {
    return this.getLevel(this.curEpisodeId, this.curLevelId);
  }

  setCurLevel(episodeId: number, levelId: number): void {
    this.curEpisodeId = episodeId;
    this.curLevelId = levelId;
  }

  /**
   * Следующий уровень; на последнем уровне эпизода — первый уровень следующего
   * эпизода; в последнем эпизоде — остаться на текущем.
   * @returns true, если уровень изменился.
   */
  nextLevel(): boolean {
    const ep = this.getEpisode(this.curEpisodeId);
    if (this.curLevelId + 1 < ep.levelCount) {
      this.curLevelId++;
      return true;
    }
    if (this.curEpisodeId + 1 < this.episodes.length) {
      this.curEpisodeId++;
      this.curLevelId = 0;
      return true;
    }
    return false;
  }

  /**
   * Следующая карта по кругу через все эпизоды — для демо-фона в меню:
   * прогресс игрока при этом не меняется.
   */
  nextCyclicLevel(episodeId: number, levelId: number): { episodeId: number; levelId: number } {
    const counts = this.episodes.map((e) => e.levelCount);
    const total = counts.reduce((sum, n) => sum + n, 0);
    if (total === 0) return { episodeId, levelId };
    let flat = 0;
    for (let e = 0; e < episodeId; e++) flat += counts[e];
    flat = (flat + levelId + 1) % total;
    let episode = 0;
    while (flat >= counts[episode]) {
      flat -= counts[episode];
      episode++;
    }
    return { episodeId: episode, levelId: flat };
  }

  /**
   * Проверка блокировки уровня.
   *
   * Внутри эпизода действует свой прогресс, но первый уровень любого
   * следующего эпизода открывается только после EPISODE_GATE_LEVELS пройденных
   * уровней в предыдущем: иначе эпизод 2 начинался бы сразу, минуя эпизод 1.
   */
  isLocked(episodeId: number, levelId: number): boolean {
    const ep = this.getEpisode(episodeId);
    if (!ep.unlockedAll && levelId === 0 && episodeId > 0) {
      const prev = this.episodes[episodeId - 1];
      if (!prev.unlockedAll && prev.lastUnlockedLevel < EPISODE_GATE_LEVELS) return true;
    }
    return ep.isLocked(levelId);
  }

  /** Открыть все уровни всех эпизодов (отладочное меню). */
  unlockAllLevels(): void {
    for (const ep of this.episodes) {
      ep.unlockedAll = true;
      ep.lastUnlockedLevel = Math.max(ep.lastUnlockedLevel, ep.levelCount - 1);
    }
  }

  /** Все уровни открыты — для состояния отладочного переключателя. */
  isAllUnlocked(): boolean {
    return this.episodes.every((ep) => ep.unlockedAll);
  }

  /**
   * Минимальное число ходов: длина кратчайшего решения уровня.
   * Считается полным перебором (уровни маленькие) и кэшируется.
   */
  minMoves(episodeId: number, levelId: number): number {
    const key = `${episodeId}-${levelId}`;
    const cached = this.minMovesCache.get(key);
    if (cached !== undefined) return cached;
    const solution = findShortestSolution(this.getLevel(episodeId, levelId));
    const moves = solution ? solution.length : 0;
    this.minMovesCache.set(key, moves);
    return moves;
  }

  /** Разблокировка следующего уровня после победы на текущем. */
  unlockCurrent(): void {
    this.getEpisode(this.curEpisodeId).unlock(this.curLevelId);
  }

  serialize(): SaveData {
    return {
      version: SAVE_VERSION,
      curEpisodeId: this.curEpisodeId,
      curLevelId: this.curLevelId,
      episodes: this.episodes.map((e) => e.serialize()),
    };
  }

  deserialize(data: SaveData): void {
    if (data.version !== SAVE_VERSION) return;
    this.episodes.forEach((ep, i) => {
      const saved = data.episodes[i];
      if (saved) ep.deserialize(saved);
    });
    this.setCurLevel(data.curEpisodeId, data.curLevelId);
    this.saved = true;
  }

  /** Отметить, что прогресс уже есть: игра начата, Resume доступна. */
  markStarted(): void {
    this.saved = true;
  }

  /** Есть ли сохранённое состояние (активность кнопки Resume в главном меню). */
  isResume(): boolean {
    return this.saved;
  }
}
