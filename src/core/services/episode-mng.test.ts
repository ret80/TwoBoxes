import { describe, expect, it } from 'vitest';
import { EpisodeManager } from './episode-mng';
import { EPISODE_1 } from '../data/episode-1';

/** Карты-заглушки для эпизода 2: тестам не нужна настоящая генерация. */
const EP2_ROWS = Array.from({ length: 12 }, () => EPISODE_1[0]);
const readyManager = (): EpisodeManager => {
  const mng = new EpisodeManager();
  mng.applyEpisodeRows(1, EP2_ROWS);
  return mng;
};

describe('EpisodeManager', () => {
  it('создаёт 2 эпизода; карты эпизода 2 приходят по одной', () => {
    const mng = new EpisodeManager();
    expect(mng.episodes).toHaveLength(2);
    expect(mng.getEpisode(0).levelCount).toBe(12);
    // Слоты второго эпизода видны сразу, но карт в них ещё нет.
    expect(mng.getEpisode(1).levelCount).toBe(12);
    expect(mng.hasLevel(1, 0)).toBe(false);
    expect(mng.isEpisodeReady(1)).toBe(false);

    mng.applyEpisodeLevel(1, 0, EPISODE_1[0]);
    expect(mng.hasLevel(1, 0)).toBe(true);
    expect(mng.hasLevel(1, 1)).toBe(false);
    expect(mng.isEpisodeReady(1)).toBe(false);

    mng.applyEpisodeRows(1, EP2_ROWS);
    expect(mng.isEpisodeReady(1)).toBe(true);
  });

  it('уровень 1 доступен, остальные заблокированы', () => {
    const mng = new EpisodeManager();
    expect(mng.isLocked(0, 0)).toBe(false);
    expect(mng.isLocked(0, 1)).toBe(true);
  });

  it('unlockCurrent разблокирует следующий уровень', () => {
    const mng = new EpisodeManager();
    mng.unlockCurrent(); // 0 → 1
    expect(mng.isLocked(0, 1)).toBe(false);
    expect(mng.isLocked(0, 2)).toBe(true);
  });

  it('nextLevel переходит через границу эпизода', () => {
    const mng = readyManager();
    mng.setCurLevel(0, 11);
    expect(mng.nextLevel()).toBe(true);
    expect(mng.curEpisodeId).toBe(1);
    expect(mng.curLevelId).toBe(0);
  });

  it('nextLevel ждёт готовности карт следующего эпизода', () => {
    const mng = new EpisodeManager();
    mng.setCurLevel(0, 11);
    // Эпизод 2 ещё генерируется в воркере — не уходим на пустую карту.
    expect(mng.nextLevel()).toBe(false);
    expect(mng.curEpisodeId).toBe(0);

    mng.applyEpisodeRows(1, EP2_ROWS);
    expect(mng.nextLevel()).toBe(true);
    expect(mng.curEpisodeId).toBe(1);
    expect(mng.curLevelId).toBe(0);
  });

  it('nextLevel в последнем эпизоде остаётся на месте', () => {
    const mng = readyManager();
    mng.setCurLevel(1, 11);
    expect(mng.nextLevel()).toBe(false);
    expect(mng.curEpisodeId).toBe(1);
    expect(mng.curLevelId).toBe(11);
  });

  it('serialize/deserialize сохраняет прогресс', () => {
    const mng = new EpisodeManager();
    mng.unlockCurrent();
    mng.setCurLevel(0, 2);
    const data = mng.serialize();
    expect(data.version).toBe(1);

    const restored = new EpisodeManager();
    restored.deserialize(data);
    expect(restored.isResume()).toBe(true);
    expect(restored.isLocked(0, 1)).toBe(false);
    expect(restored.curLevelId).toBe(2);
  });

  it('nextCyclicLevel идёт по картам по кругу и не трогает прогресс', () => {
    const mng = readyManager();
    mng.setCurLevel(0, 0);
    const second = mng.nextCyclicLevel(0, 0);
    expect(second).toEqual({ episodeId: 0, levelId: 1 });
    // последняя карта эпизода переходит в начало следующего
    const count = mng.getEpisode(0).levelCount;
    expect(mng.nextCyclicLevel(0, count - 1)).toEqual({ episodeId: 1, levelId: 0 });
    // прогресс и текущий уровень не меняются
    expect(mng.curLevelId).toBe(0);
    expect(mng.isLocked(0, 1)).toBe(true);
  });

  it('первый уровень следующего эпизода — только после 7 уровней предыдущего', () => {
    const mng = new EpisodeManager();
    expect(mng.isLocked(1, 0)).toBe(true);
    // шесть пройденных уровней первого эпизода недостаточно
    for (let level = 0; level < 6; level++) {
      mng.setCurLevel(0, level);
      mng.unlockCurrent();
    }
    expect(mng.isLocked(1, 0)).toBe(true);
    mng.setCurLevel(0, 6);
    mng.unlockCurrent();
    expect(mng.isLocked(1, 0)).toBe(false);
  });

  it('unlockAllLevels открывает все уровни обоих эпизодов', () => {
    const mng = readyManager();
    mng.unlockAllLevels();
    expect(mng.isAllUnlocked()).toBe(true);
    expect(mng.isLocked(0, 11)).toBe(false);
    expect(mng.isLocked(1, 0)).toBe(false);
    expect(mng.isLocked(1, 11)).toBe(false);
  });

  it('minMoves возвращает длину кратчайшего решения и кэширует его', () => {
    const mng = new EpisodeManager();
    const min = mng.minMoves(0, 0);
    expect(min).toBeGreaterThan(0);
    expect(mng.minMoves(0, 0)).toBe(min);
  });

  it('сохраняет прогресс эпизода при подстановке сгенерированных карт', () => {
    const mng = new EpisodeManager();
    mng.getEpisode(1).unlockedAll = true;
    mng.getEpisode(1).lastUnlockedLevel = 4;
    mng.applyEpisodeRows(1, EP2_ROWS);
    expect(mng.getEpisode(1).unlockedAll).toBe(true);
    expect(mng.getEpisode(1).lastUnlockedLevel).toBe(4);
    expect(mng.getEpisode(1).levelCount).toBe(12);
  });

  it('не предлагает Resume на уровень, которого ещё нет', () => {
    const mng = new EpisodeManager();
    // Сохранение указывает на эпизод 2, который генерируется в фоне.
    mng.deserialize({
      version: 1,
      curEpisodeId: 1,
      curLevelId: 5,
      episodes: [
        { lastUnlockedLevel: 11, unlockedAll: false },
        { lastUnlockedLevel: 0, unlockedAll: false },
      ],
    });
    expect(mng.isResume()).toBe(false);
    // До готовности карт показываем безопасный первый уровень.
    expect(mng.getCurLevel().label).toBe('1-1');

    mng.applyEpisodeRows(1, EP2_ROWS);
    expect(mng.isResume()).toBe(true);
    expect(mng.getCurLevel().label).toBe('2-6');
  });

  it('markStarted делает Resume доступной без загрузки сохранения', () => {
    const mng = new EpisodeManager();
    expect(mng.isResume()).toBe(false);
    mng.markStarted();
    expect(mng.isResume()).toBe(true);
  });

  it('getLevel создаёт уровень с корректными сущностями', () => {
    const mng = new EpisodeManager();
    const level = mng.getLevel(0, 0);
    expect(level.boxes).toHaveLength(2);
    expect(level.ends).toHaveLength(2);
    expect(level.label).toBe('1-1');
  });
});
