import { describe, expect, it } from 'vitest';
import { EpisodeManager } from './episode-mng';

describe('EpisodeManager', () => {
  it('создаёт 2 эпизода (по 12 уровней)', () => {
    const mng = new EpisodeManager();
    expect(mng.episodes).toHaveLength(2);
    expect(mng.getEpisode(0).levelCount).toBe(12);
    expect(mng.getEpisode(1).levelCount).toBe(12);
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
    const mng = new EpisodeManager();
    mng.setCurLevel(0, 11);
    expect(mng.nextLevel()).toBe(true);
    expect(mng.curEpisodeId).toBe(1);
    expect(mng.curLevelId).toBe(0);
  });

  it('nextLevel в последнем эпизоде остаётся на месте', () => {
    const mng = new EpisodeManager();
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
    const mng = new EpisodeManager();
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
    const mng = new EpisodeManager();
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
