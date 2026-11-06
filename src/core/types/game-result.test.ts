import { describe, expect, it } from 'vitest';
import { starsForMoves } from './game-result';

describe('starsForMoves', () => {
  it('три звезды — только за прохождение в минимум ходов', () => {
    expect(starsForMoves(5, 5)).toBe(3);
    expect(starsForMoves(12, 12)).toBe(3);
  });

  it('две звезды — при запасе не больше половины минимума', () => {
    expect(starsForMoves(6, 5)).toBe(2);
    expect(starsForMoves(8, 5)).toBe(2);
    // На коротких уровнях прощается хотя бы один лишний ход.
    expect(starsForMoves(4, 3)).toBe(2);
  });

  it('одна звезда — за заметно большее число ходов', () => {
    expect(starsForMoves(9, 5)).toBe(1);
    expect(starsForMoves(30, 4)).toBe(1);
  });

  it('без известного минимума оценка не падает', () => {
    expect(starsForMoves(7, 0)).toBe(3);
  });
});
