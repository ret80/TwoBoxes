import { describe, expect, it } from 'vitest';
import { createLevelFromData } from '../../rules/create';
import { moveBoxes } from '../../rules/move';
import { checkWin } from '../../rules/check';
import { createMechanicState } from '../../types/mechanic-state';
import { generateTestLevel } from '../level-generator';
import { solveLevel } from '../solver';
import { analyzeLevel } from '../check/analyzer';
import { stripMechanics } from '../accept/mechanic-proof';
import { resolveMechanics } from '.';
import type { MechanicId } from './types';

/**
 * Проверка модулей на сгенерированных уровнях: каждый кандидат обязан быть
 * решаемым, а его кратчайшее решение — воспроизводиться теми же правилами,
 * что и в игре.
 */
const CASES: { id: MechanicId; difficulty: number; label: string }[] = [
  { id: 'portal', difficulty: 55, label: 'Порталы' },
  { id: 'trap', difficulty: 55, label: 'Ловушки' },
  { id: 'rotator', difficulty: 55, label: 'Ротаторы' },
  { id: 'gyro', difficulty: 55, label: 'Гироскопы' },
  { id: 'switch', difficulty: 55, label: 'Переключатель' },
  { id: 'oneWay', difficulty: 55, label: 'Односторонние' },
];

describe('mechanics pipeline', () => {
  it('resolves dependencies and changes the generated field', () => {
    expect(resolveMechanics(['switch']).map((m) => m.id)).toEqual([
      'rotator',
      'switch',
    ]);

    const classic = generateTestLevel({ mechanics: [], difficulty: 55, seed: 123 });
    const withPortal = generateTestLevel({
      mechanics: ['portal'],
      difficulty: 55,
      seed: 123,
    });
    expect(classic).not.toBeNull();
    expect(withPortal).not.toBeNull();
    expect(withPortal?.rows).not.toEqual(classic?.rows);
  }, 120_000);

  for (const testCase of CASES) {
    it(`${testCase.label}: generates a solvable level that uses the mechanic`, () => {
      const generated = generateTestLevel({
        mechanics: [testCase.id],
        difficulty: testCase.difficulty,
        seed: 0x51ce + testCase.id.length * 7919,
      });

      expect(generated, `${testCase.id} must generate`).not.toBeNull();
      if (!generated) return;

      const level = createLevelFromData(0, 0, generated.rows);
      const solved = solveLevel(level);
      expect(solved, `${testCase.id} must be solvable`).not.toBeNull();
      if (!solved) return;

      let boxes = level.boxes;
      let state = createMechanicState(boxes.length);
      for (const dir of solved.solution) {
        const next = moveBoxes(level, boxes, dir, 0, 0, state);
        expect(next, `${testCase.id} move must be legal`).not.toBeNull();
        if (!next) return;
        boxes = next.boxes;
        state = next.mechanicState ?? state;
      }
      expect(checkWin(boxes, level.ends), `${testCase.id} replay must win`).toBe(true);
      expect(generated.mechanics).toContain(testCase.id);

      const map = generated.rows.join('');
      if (testCase.id === 'trap') {
        expect(generated.trapHits, 'trap must actually fire').toBeGreaterThan(0);
        expect(map).toMatch(/[tT]/);
      }
      if (testCase.id === 'rotator') {
        expect(map).toMatch(/[1-8]/);
        expect(map).not.toMatch(/[cw]/);
      }
      if (testCase.id === 'gyro') {
        expect(map).toMatch(/[cw]/);
      }

      // eslint-disable-next-line no-console
      console.log(
        `[mechanics] ${testCase.id}: score=${generated.score}, ` +
          `moves=${solved.solution.length}, states=${solved.states}, ` +
          `deadEnds=${(generated.deadEndRatio * 100).toFixed(1)}%, ` +
          `traps=${generated.trapHits}/${generated.trapWaits}, ` +
          `used=${generated.mechanics.join('+')}, rows=${generated.rows.length}`,
      );
    }, 120_000);
  }

  it('switch + oneWay: кнопка обязательна, а не декорация', () => {
    for (const seed of [0x00013012, 0x0001aa39]) {
      const generated = generateTestLevel({
        mechanics: ['switch', 'oneWay'],
        difficulty: 50,
        seed,
      });
      expect(generated, `seed ${seed.toString(16)}`).not.toBeNull();
      if (!generated) continue;

      const level = createLevelFromData(0, 0, generated.rows);
      for (const id of ['switch', 'oneWay'] as const) {
        const without = analyzeLevel(stripMechanics(level, [id]), {
          maxSolutionLength: generated.solution.length,
        });
        expect(without.kind, `${id} ${seed.toString(16)} must not be decorative`).not.toBe(
          'solved',
        );
      }
    }
  }, 120_000);
});
