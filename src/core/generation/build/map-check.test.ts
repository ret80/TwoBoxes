import { describe, expect, it } from 'vitest';
import { CellType } from '../../types/cell';
import { Position } from '../../types/position';
import { createLevelFromMask } from '../../rules/create';
import { render } from '../field/render';
import { sameMap } from './map-check';

const SIZE = 7;

/** Маска: пол 5×5 внутри стен, механизмы и кубики с целями. */
function sample() {
  const floor = new Uint8Array(SIZE * SIZE);
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) floor[y * SIZE + x] = 1;
  }
  const starts = [new Position(2, 2), new Position(4, 4)];
  const ends = [new Position(5, 2), new Position(2, 5)];
  const cells = new Map<number, CellType>([
    [3 * SIZE + 3, CellType.PORTAL_A],
    [1 * SIZE + 1, CellType.TRAP_2],
  ]);
  return { floor, starts, ends, cells };
}

describe('sameMap', () => {
  it('карта, отрисованная из уровня, описывает тот же уровень', () => {
    const { floor, starts, ends, cells } = sample();
    const level = createLevelFromMask(floor, SIZE, starts, ends, cells);
    expect(sameMap(level, render(floor, SIZE, starts, ends, cells))).toBe(true);
  });

  it('сдвиг карты не считается расхождением: render обрезает края', () => {
    const { floor, starts, ends, cells } = sample();
    const level = createLevelFromMask(floor, SIZE, starts, ends, cells);
    const rows = render(floor, SIZE, starts, ends, cells);
    const shifted = ['###', ...rows.map((row) => `#${row}#`)];
    expect(sameMap(level, shifted)).toBe(true);
  });

  it('потерянная цель на карте — расхождение', () => {
    const { floor, starts, ends, cells } = sample();
    const level = createLevelFromMask(floor, SIZE, starts, ends, cells);
    const rows = render(floor, SIZE, starts, ends, cells);
    // Цель красного кубика стёрта: игрок получил бы другой уровень.
    const broken = rows.map((row) => row.replace('r', '.'));
    expect(sameMap(level, broken)).toBe(false);
  });

  it('механика, затёртая сущностью, — тоже расхождение', () => {
    const { floor, starts, ends, cells } = sample();
    const level = createLevelFromMask(floor, SIZE, starts, ends, cells);
    const rows = render(floor, SIZE, starts, ends, cells);
    // Портала нет: на его месте просто пол.
    const broken = rows.map((row) => row.replace('a', '.'));
    expect(sameMap(level, broken)).toBe(false);
  });
});
