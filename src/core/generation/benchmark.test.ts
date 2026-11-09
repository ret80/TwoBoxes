import { describe, expect, it } from 'vitest';
import { GENERATED_EPISODES } from '../data/generated-episodes';
import { createLevelFromData } from '../rules/create';
import { generateEpisodeLevelRecipe, generateLevel } from './level-generator';
import { findShortestSolution, solveLevel } from './solver';
import type { MechanicId } from './mechanics';

/**
 * Замеры генератора. Запуск: `BENCH=1 npx vitest run src/core/generation/benchmark.test.ts`.
 *
 * Цифры не входят в обычный прогон `npm test`: время зависит от машины, а тест
 * с порогами был бы нестабильным. Задача файла — сравнивать «до/после» одного
 * и того же прогона, а не ловить миллисекунды в CI.
 */

const RUN = process.env.BENCH === '1';
const timed = (fn: () => void): number => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};

const timedValue = <T>(fn: () => T): { value: T; ms: number } => {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
};

describe.skipIf(!RUN)('generator benchmark', () => {
  it('episode timings', () => {
    for (const config of GENERATED_EPISODES) {
      let worst = 0;
      const total = timed(() => {
        for (let index = 0; index < config.levelCount; index++) {
          const ms = timed(() =>
            generateEpisodeLevelRecipe(config.seed, index, config.levelCount, config.mechanics),
          );
          worst = Math.max(worst, ms);
        }
      });
      // eslint-disable-next-line no-console
      console.log(
        `[bench] ${config.mechanics.join('+')}: total ${total.toFixed(0)} ms, ` +
          `avg ${(total / config.levelCount).toFixed(0)} ms, worst ${worst.toFixed(0)} ms`,
      );
    }
  }, 900_000);

  it('classic episode timings', () => {
    let worst = 0;
    let states = 0;
    let deadEnds = 0;
    const total = timed(() => {
      for (let index = 0; index < 12; index++) {
        const ms = timed(() => {
          const { rows } = generateEpisodeLevelRecipe(0x2b0b2, index, 12);
          const solved = solveLevel(createLevelFromData(0, 0, rows));
          if (solved) {
            states += solved.states;
            deadEnds += solved.deadEnds;
          }
        });
        worst = Math.max(worst, ms);
      }
    });
    // eslint-disable-next-line no-console
    console.log(
      `[bench] classic: total ${total.toFixed(0)} ms, worst ${worst.toFixed(0)} ms, ` +
        `states ${states}, deadEnds ${deadEnds}`,
    );
  }, 900_000);

  it('solver costs on an accepted level', () => {
    const { rows } = generateEpisodeLevelRecipe(0x2b0b2, 8, 12);
    const level = createLevelFromData(0, 0, rows);
    const shortest = timedValue(() => findShortestSolution(level));
    const full = timedValue(() => solveLevel(level));
    // eslint-disable-next-line no-console
    console.log(
      `[bench] shortest ${shortest.ms.toFixed(2)} ms, full ${full.ms.toFixed(2)} ms, ` +
        `len ${shortest.value?.length}, states ${full.value?.states}`,
    );
    expect(full.value).not.toBeNull();
  }, 900_000);

  it('swap level success rate', () => {
    let ok = 0;
    let ms = 0;
    for (let seed = 1; seed <= 10; seed++) {
      let generated = null;
      ms += timed(() => {
        generated = generateLevel({ seed, moves: 3, size: 8, requirePortalSwap: true });
      });
      if (generated) ok++;
    }
    // eslint-disable-next-line no-console
    console.log(`[bench] swap levels: ${ok}/10, ${ms.toFixed(0)} ms total`);
  }, 900_000);

  it('mechanic episodes in isolation', () => {
    const cases: MechanicId[][] = [['portal'], ['trap'], ['rotator'], ['switch'], ['oneWay']];
    for (const mechanics of cases) {
      const total = timed(() => {
        for (let index = 0; index < 8; index++) {
          generateLevel({
            seed: 0x51ce + index * 7919,
            moves: 8,
            maxMoves: 11,
            size: 12,
            budget: 70,
            patterns: ['room', 'corridor', 'chamber', 'comb'],
            deadEnds: 0.35,
            mechanics,
            score: 55,
            candidates: 4,
          });
        }
      });
      // eslint-disable-next-line no-console
      console.log(`[bench] mechanics ${mechanics.join('+')}: ${total.toFixed(0)} ms`);
    }
  }, 900_000);
});
