import { describe, expect, it } from 'vitest';
import { resetLevel } from './reset';

describe('resetLevel', () => {
  it('пересоздаёт уровень из исходных данных', () => {
    const rows = ['#R..r#'];
    const level = resetLevel(rows, 0, 3);
    expect(level.episodeId).toBe(0);
    expect(level.levelId).toBe(3);
    expect(level.boxes[0].pos).toEqual({ x: 1, y: 0 });
  });
});
