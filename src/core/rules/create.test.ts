import { describe, expect, it } from 'vitest';
import { CellType } from '../types/cell';
import { ColorType } from '../types/color';
import { Position } from '../types/position';
import { createLevelFromData } from './create';

describe('createLevelFromData', () => {
  it('парсит все типы клеток и сущности', () => {
    const rows = [' R.y# ', '  .Yr '];
    const level = createLevelFromData(0, 0, rows);
    expect(level.width).toBe(6);
    expect(level.height).toBe(2);
    expect(level.boxes).toHaveLength(2);
    expect(level.boxes[0]).toEqual({ pos: { x: 1, y: 0 }, color: ColorType.ONE });
    expect(level.boxes[1]).toEqual({ pos: { x: 3, y: 1 }, color: ColorType.TWO });
    expect(level.ends).toHaveLength(2);
    expect(level.ends[0]).toEqual({ pos: { x: 3, y: 0 }, color: ColorType.TWO });
    expect(level.ends[1]).toEqual({ pos: { x: 4, y: 1 }, color: ColorType.ONE });
    expect(level.grid.get({ x: 4, y: 0 } as never)).toBe(CellType.WALL);
    expect(level.grid.get({ x: 2, y: 1 } as never)).toBe(CellType.EMPTY);
  });

  it('пробелы за пределами карты → UNKNOWN', () => {
    const level = createLevelFromData(0, 0, ['R.', ' # ']);
    expect(level.grid.get(new Position(2, 0))).toBe(CellType.UNKNOWN);
    expect(level.grid.get(new Position(2, 1))).toBe(CellType.UNKNOWN);
    expect(level.grid.get(new Position(1, 1))).toBe(CellType.WALL);
  });

  it('уровень 1-1 из данных эпизода содержит 2 кубика и 2 цели', async () => {
    const { EPISODE_1 } = await import('../data/episode-1');
    const level = createLevelFromData(0, 0, EPISODE_1[0]);
    expect(level.boxes).toHaveLength(2);
    expect(level.ends).toHaveLength(2);
  });
});
