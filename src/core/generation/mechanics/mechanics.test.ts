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
/**
 * Сиды фикстур: сложность теперь выводится из сида, поэтому у каждой механики
 * свой — иначе две механики с одинаковой длиной имени делили бы один уровень.
 */
const CASES: { id: MechanicId; label: string; seed: number }[] = [
  { id: 'portal', label: 'Порталы', seed: 0x10b68 },
  { id: 'trap', label: 'Ловушки', seed: 0xcdaa },
  { id: 'rotator', label: 'Ротаторы', seed: 0x12a57 },
  // Гироскоп на чрезмерно большой карте не всегда раскладывается, поэтому
  // у него сид с умеренной сложностью.
  { id: 'gyro', label: 'Гироскопы', seed: 0x50e79d9b },
  { id: 'switch', label: 'Переключатель', seed: 0x10b68 },
  { id: 'oneWay', label: 'Односторонние', seed: 0x10b68 },
];

describe('mechanics pipeline', () => {
  it('resolves dependencies and changes the generated field', () => {
    expect(resolveMechanics(['switch']).map((m) => m.id)).toEqual([
      'rotator',
      'switch',
    ]);

    const classic = generateTestLevel({ mechanics: [], seed: 123 });
    const withPortal = generateTestLevel({ mechanics: ['portal'], seed: 123 });
    expect(classic).not.toBeNull();
    expect(withPortal).not.toBeNull();
    expect(withPortal?.rows).not.toEqual(classic?.rows);
  }, 120_000);

  for (const testCase of CASES) {
    it(`${testCase.label}: generates a solvable level that uses the mechanic`, () => {
      const generated = generateTestLevel({
        mechanics: [testCase.id],
        seed: testCase.seed,
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
    for (const seed of [0xfcba6ade, 0x497f99f2]) {
      const generated = generateTestLevel({
        mechanics: ['switch', 'oneWay'],
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
