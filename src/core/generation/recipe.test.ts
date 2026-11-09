import { describe, expect, it } from 'vitest';
import type { MechanicId } from './mechanics';
import {
  EPISODE_ATTEMPTS,
  RECIPE_VERSION,
  decodeAttempt,
  levelSeedAt,
} from './recipe';
import { generateEpisodeLevelRecipe } from './level-generator';

const hash = (rows: string[]): string => {
  let h = 0x811c9dc5;
  for (const ch of rows.join('\n')) {
    h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

describe('рецепт уровня', () => {
  it('сид кодирует и декодирует номер попытки', () => {
    expect(RECIPE_VERSION).toBeGreaterThanOrEqual(2);
    for (const attempt of [0, 1, 7, EPISODE_ATTEMPTS - 1]) {
      const seed = levelSeedAt(0x2b0b2, 5, attempt);
      expect(decodeAttempt(0x2b0b2, 5, seed)).toBe(attempt);
    }
    expect(decodeAttempt(0x2b0b2, 5, 12345)).toBeNull();
    expect(decodeAttempt(0x2b0b2, 5, levelSeedAt(0x2b0b2, 6, 0))).toBeNull();
  });

  it('не меняет карты фиксированных сидов незаметно', () => {
    // Снапшот карт: если правка кривой/`rng` меняет уровень, тест падает и
    // требует осознанного повышения RECIPE_VERSION. Иначе игрок по старому
    // сиду получил бы другую карту.
    const cases: {
      seed: number;
      count: number;
      mechanics: MechanicId[];
      levels: Record<number, string>;
    }[] = [
      {
        seed: 0x2b0b2,
        count: 12,
        mechanics: [],
        levels: { 0: '4764a2b7', 4: 'cc299acf', 8: 'ad0db292', 11: '615a5a87' },
      },
      {
        seed: 0x2b0b2,
        count: 8,
        mechanics: ['portal'],
        levels: { 0: '79eb4d65', 7: 'c6257bec' },
      },
      {
        seed: 0x5e3e5,
        count: 8,
        mechanics: ['switch'],
        levels: { 0: '75ce2e08', 7: 'bea2acb0' },
      },
    ];

    for (const testCase of cases) {
      for (const [indexText, expected] of Object.entries(testCase.levels)) {
        const index = Number(indexText);
        const { rows, seed } = generateEpisodeLevelRecipe(
          testCase.seed,
          index,
          testCase.count,
          testCase.mechanics,
        );
        const label = `${testCase.mechanics.join('+') || 'classic'} ${index}`;
        expect(hash(rows), label).toBe(expected);
        expect(decodeAttempt(testCase.seed, index, seed), `${label} attempt`).not.toBeNull();
      }
    }
  }, 120_000);
});
