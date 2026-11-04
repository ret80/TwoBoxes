import { describe, expect, it } from 'vitest';
import { CellType } from './cell';
import { LevelGrid } from './level-grid';
import { Position } from './position';

describe('LevelGrid', () => {
  it('создаёт сетку с UNKNOWN по умолчанию', () => {
    const g = new LevelGrid(3, 2);
    expect(g.get(new Position(1, 1))).toBe(CellType.UNKNOWN);
    expect(g.isValid(new Position(2, 1))).toBe(true);
  });

  it('get/set и границы', () => {
    const g = new LevelGrid(2, 2);
    g.set(new Position(0, 0), CellType.WALL);
    expect(g.get(new Position(0, 0))).toBe(CellType.WALL);
    expect(g.isValid(new Position(-1, 0))).toBe(false);
    expect(g.isValid(new Position(0, 2))).toBe(false);
    expect(g.get(new Position(-1, 0))).toBe(CellType.UNKNOWN);
  });

  it('toFlat/duplicate независимы', () => {
    const g = new LevelGrid(2, 2, [1, 0, 0, 1]);
    expect(g.toFlat()).toEqual([1, 0, 0, 1]);
    const copy = g.duplicate();
    copy.set(new Position(0, 0), CellType.EMPTY);
    expect(g.get(new Position(0, 0))).toBe(CellType.WALL);
  });

  it('nearestEven округляет до чётного (аналог Util.po2)', () => {
    expect(LevelGrid.nearestEven(3)).toBe(4);
    expect(LevelGrid.nearestEven(4)).toBe(4);
    expect(LevelGrid.nearestEven(7)).toBe(8);
  });

  it('бросает исключение при неверном размере данных', () => {
    expect(() => new LevelGrid(2, 2, [1, 0])).toThrow();
  });
});
