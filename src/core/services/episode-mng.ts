import { EPISODES_DATA } from '../data';
import { createLevelFromData } from '../rules/create';
import { Episode } from '../types/episode';
import { Level } from '../types/level';

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

  isLocked(episodeId: number, levelId: number): boolean {
    return this.getEpisode(episodeId).isLocked(levelId);
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
