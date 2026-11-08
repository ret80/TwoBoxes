import { describe, expect, it } from 'vitest';
import { EpisodeManager } from './episode-mng';
import { EPISODE_1 } from '../data/episode-1';
import { generateEpisodeLevelRecipe } from '../generation/level-generator';

/** Карты-заглушки для генерируемого эпизода: тестам не нужна генерация. */
const EP2_ROWS = Array.from({ length: 8 }, () => EPISODE_1[0]);
const readyManager = (): EpisodeManager => {
  const mng = new EpisodeManager();
  mng.applyEpisodeRows(1, EP2_ROWS);
  return mng;
};

describe('EpisodeManager', () => {
  it('создаёт 6 эпизодов; карты генерируемых приходят по одной', () => {
    const mng = new EpisodeManager();
    expect(mng.episodes).toHaveLength(6);
    expect(mng.getEpisode(0).levelCount).toBe(12);
    // Слоты сгенерированных эпизодов видны сразу, но карт в них ещё нет.
    for (let episode = 1; episode < 6; episode++) {
      expect(mng.getEpisode(episode).levelCount).toBe(8);
      expect(mng.hasLevel(episode, 0)).toBe(false);
    }
    expect(mng.hasLevel(1, 0)).toBe(false);
    expect(mng.isEpisodeReady(1)).toBe(false);

    mng.applyEpisodeLevel(1, 0, EPISODE_1[0]);
    expect(mng.hasLevel(1, 0)).toBe(true);
    expect(mng.hasLevel(1, 1)).toBe(false);
    expect(mng.isEpisodeReady(1)).toBe(false);

    mng.applyEpisodeRows(1, EP2_ROWS);
    expect(mng.isEpisodeReady(1)).toBe(true);
  });

  it('хранит настоящий сид сгенерированного уровня и собирает его заново', () => {
    const mng = new EpisodeManager();
    // У ручного эпизода сида генератора нет.
    expect(mng.getLevelSeed(0, 0)).toBeNull();

    const seed = 0x2b0b2;
    const count = 8;
    const { rows, seed: levelSeed } = generateEpisodeLevelRecipe(seed, 0, count, ['portal']);
    mng.applyEpisodeLevel(1, 0, rows, levelSeed);
    expect(mng.getLevelSeed(1, 0)).toBe(levelSeed);
    expect(mng.rebuildLevel(1, 0)).toEqual(rows);

    // Без сида собирать нечего.
    mng.applyEpisodeLevel(1, 1, rows);
    expect(mng.getLevelSeed(1, 1)).toBeNull();
    expect(mng.rebuildLevel(1, 1)).toBeNull();
  }, 30_000);

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
    mng.setCurLevel(5, 7);
    expect(mng.nextLevel()).toBe(false);
    expect(mng.curEpisodeId).toBe(5);
    expect(mng.curLevelId).toBe(7);
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

  it('первый уровень следующего эпизода — только после 7 из 12 уровней предыдущего', () => {
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

  it('для короткого эпизода порог следующего считается по доле, а не по числу', () => {
    const mng = new EpisodeManager();
    // Первый генерируемый эпизод — 8 уровней: 4 мало, 5 хватает.
    const episode = mng.getEpisode(1);
    episode.lastUnlockedLevel = 4;
    expect(mng.isLocked(2, 0)).toBe(true);
    episode.lastUnlockedLevel = 5;
    expect(mng.isLocked(2, 0)).toBe(false);
  });

  it('unlockAllLevels открывает все уровни всех эпизодов', () => {
    const mng = readyManager();
    mng.unlockAllLevels();
    expect(mng.isAllUnlocked()).toBe(true);
    expect(mng.isLocked(0, 11)).toBe(false);
    for (let episode = 1; episode < 6; episode++) {
      expect(mng.isLocked(episode, 0)).toBe(false);
      expect(mng.isLocked(episode, 7)).toBe(false);
    }
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
    expect(mng.getEpisode(1).levelCount).toBe(8);
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
