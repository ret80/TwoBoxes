import { describe, expect, it } from 'vitest';
import { ColorType } from '../types/color';
import { DIRS, Position } from '../types/position';
import { createLevelFromData } from './create';
import { moveBoxes } from './move';

function makeLevel(rows: string[]) {
  return createLevelFromData(0, 0, rows);
}

describe('moveBoxes', () => {
  it('скользит до упора (стена)', () => {
    const level = makeLevel(['#R..#']);
    const state = moveBoxes(level, level.boxes, DIRS.right, 0, 0);
    expect(state).not.toBeNull();
    expect(state!.boxes[0].pos).toEqual(new Position(3, 0));
    expect(state!.moves).toBe(1);
  });

  it('скользит до края поля (не-UNKNOWN останавливает)', () => {
    // UNKNOWN блокирует, поэтому поле окружено пустыми клетками
    const level = makeLevel(['.....', '.R...', '.....']);
    const state = moveBoxes(level, level.boxes, DIRS.up, 0, 0);
    expect(state!.boxes[0].pos).toEqual(new Position(1, 0));
  });

  it('ход в UNKNOWN невозможен → null', () => {
    const level = makeLevel(['R.']);
    expect(moveBoxes(level, level.boxes, DIRS.up, 0, 0)).toBeNull();
  });

  it('кубик останавливается на целевой площадке', () => {
    const level = makeLevel(['#Rr#']);
    const state = moveBoxes(level, level.boxes, DIRS.right, 0, 0);
    expect(state!.boxes[0].pos).toEqual(new Position(2, 0));
  });

  it('кубики блокируют друг друга (порядок «ведущий первым»)', () => {
    // оба едут вправо: ведущий (жёлтый, x=4) упирается в стену и не двигается,
    // красный скользит и останавливается прямо перед жёлтым (x=3)
    const level = makeLevel(['#R..Y#']);
    const state = moveBoxes(level, level.boxes, DIRS.right, 0, 0)!;
    const red = state.boxes.find((b) => b.color === ColorType.ONE)!;
    const yellow = state.boxes.find((b) => b.color === ColorType.TWO)!;
    expect(yellow.pos).toEqual(new Position(4, 0));
    expect(red.pos).toEqual(new Position(3, 0));
  });

  it('полный ход невозможен (обе стены) → null', () => {
    const level = makeLevel(['#R#']);
    expect(moveBoxes(level, level.boxes, DIRS.right, 0, 0)).toBeNull();
    expect(moveBoxes(level, level.boxes, DIRS.left, 0, 0)).toBeNull();
  });

  it('движение по всем четырём направлениям', () => {
    const level = makeLevel(['...', '.R.', '...']);
    const down = moveBoxes(level, level.boxes, DIRS.down, 0, 0)!;
    expect(down.boxes[0].pos).toEqual(new Position(1, 2));
    const up = moveBoxes(level, level.boxes, DIRS.up, 0, 0)!;
    expect(up.boxes[0].pos).toEqual(new Position(1, 0));
    const left = moveBoxes(level, level.boxes, DIRS.left, 0, 0)!;
    expect(left.boxes[0].pos).toEqual(new Position(0, 1));
    const right = moveBoxes(level, level.boxes, DIRS.right, 0, 0)!;
    expect(right.boxes[0].pos).toEqual(new Position(2, 1));
  });
});
