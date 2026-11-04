import { describe, expect, it } from 'vitest';
import { ColorType } from '../types/color';
import { Position } from '../types/position';
import { checkWin, getBoxAt, matchColors } from './check';

describe('checkWin (раздел 4.3)', () => {
  const boxRed = { pos: new Position(1, 1), color: ColorType.ONE };
  const boxYellow = { pos: new Position(2, 2), color: ColorType.TWO };

  it('полное совпадение цветов и позиций → победа', () => {
    expect(
      checkWin(
        [boxRed, boxYellow],
        [
          { pos: new Position(1, 1), color: ColorType.ONE },
          { pos: new Position(2, 2), color: ColorType.TWO },
        ],
      ),
    ).toBe(true);
  });

  it('одна цель не закрыта → нет победы', () => {
    expect(
      checkWin(
        [boxRed],
        [
          { pos: new Position(1, 1), color: ColorType.ONE },
          { pos: new Position(2, 2), color: ColorType.TWO },
        ],
      ),
    ).toBe(false);
  });

  it('цвета не совпадают → нет победы', () => {
    expect(
      checkWin(
        [boxYellow, boxRed],
        [
          { pos: new Position(1, 1), color: ColorType.TWO },
          { pos: new Position(2, 2), color: ColorType.ONE },
        ],
      ),
    ).toBe(false);
  });

  it('getBoxAt находит кубик по позиции', () => {
    expect(getBoxAt(new Position(1, 1), [boxRed])).toBe(boxRed);
    expect(getBoxAt(new Position(9, 9), [boxRed])).toBeNull();
  });

  it('matchColors сравнивает цвета', () => {
    expect(matchColors(ColorType.ONE, ColorType.ONE)).toBe(true);
    expect(matchColors(ColorType.ONE, ColorType.TWO)).toBe(false);
  });
});
