import { describe, expect, it } from 'vitest';
import { EPISODES_DATA } from './index';
import { EPISODE_1 } from './episode-1';
import { GENERATED_EPISODES, episodeMechanics, episodeTheme } from './generated-episodes';
import { generateEpisode } from '../generation/level-generator';
import { createLevelFromData } from '../rules/create';
import { solveLevel } from '../generation/solver';
import { measureLevel } from '../generation/difficulty';
import type { MechanicId } from '../generation/mechanics';

const MECHANIC_CHARS: Record<MechanicId, string[]> = {
  portal: ['a', 'b'],
  trap: ['t', 'T'],
  rotator: ['1', '2', '3', '4', '5', '6', '7', '8'],
  gyro: ['c', 'w'],
  switch: ['s'],
  oneWay: ['^', 'v', '<', '>'],
};

describe('набор эпизодов', () => {
  it('демо-уровни меню берут механики эпизода', () => {
    expect(episodeMechanics(4)).toEqual(['switch']);
    expect(episodeMechanics(5)).toEqual(['oneWay']);
    // У ручного первого эпизода своих механик нет.
    expect(episodeMechanics(0)).toEqual([]);
    expect(episodeMechanics(99)).toEqual([]);
  });

  it('первый эпизод ручной (12 уровней), остальные — по 8', () => {
    expect(EPISODES_DATA).toHaveLength(6);
    expect(EPISODES_DATA[0]).toBe(EPISODE_1);
    expect(EPISODES_DATA[0]).toHaveLength(12);
    for (let episode = 1; episode < EPISODES_DATA.length; episode++) {
      expect(EPISODES_DATA[episode]).toHaveLength(8);
      // Карты строит воркер: до его работы слоты пустые, но видны в списке.
      expect(EPISODES_DATA[episode].every((rows) => rows.length === 0)).toBe(true);
    }
  });

  it('у каждого генерируемого эпизода своя механика, в порядке списка механик', () => {
    expect(GENERATED_EPISODES.map((config) => config.mechanics)).toEqual([
      ['portal'],
      ['trap'],
      ['rotator'],
      ['switch'],
      ['oneWay'],
    ]);
    // Номера эпизодов идут подряд и продолжают ручной первый.
    expect(GENERATED_EPISODES.map((config) => config.episodeId)).toEqual([1, 2, 3, 4, 5]);
    // Сиды разные: эпизоды не должны повторять друг друга.
    expect(new Set(GENERATED_EPISODES.map((config) => config.seed)).size).toBe(5);
    expect(episodeTheme(0)).toBeNull();
    expect(episodeTheme(1)).toBe('portal');
    expect(episodeTheme(5)).toBe('oneWay');
  });

  it('эпизод-тема целиком играет свою механику и усложняется от уровня к уровню', () => {
    const config = GENERATED_EPISODES[0];
    const rows = generateEpisode(config.seed, config.levelCount, config.mechanics);
    expect(rows).toHaveLength(config.levelCount);

    const chars = MECHANIC_CHARS[config.mechanics[0]];
    const scores: number[] = [];
    rows.forEach((levelRows, index) => {
      const label = `уровень ${index + 1}`;
      // Клетка механики есть на карте.
      expect(chars.some((ch) => levelRows.join('').includes(ch)), label).toBe(true);
      const level = createLevelFromData(0, 0, levelRows);
      const solved = solveLevel(level);
      expect(solved, label).not.toBeNull();
      scores.push(measureLevel(level)?.score ?? 0);
    });

    // Сложность эпизода растёт: каждый следующий уровень не проще предыдущего.
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i], `уровень ${i + 1} проще предыдущего`).toBeGreaterThanOrEqual(
        scores[i - 1],
      );
    }
    expect(scores[scores.length - 1] - scores[0]).toBeGreaterThanOrEqual(25);
  }, 120_000);
});
