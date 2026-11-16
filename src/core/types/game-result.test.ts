import { describe, expect, it } from 'vitest';
import { starsForResult } from './game-result';

describe('starsForResult', () => {
  it('три звезды прощают ошибку в пределах 10% минимума', () => {
    expect(starsForResult(5, 5)).toBe(3);
    expect(starsForResult(6, 5)).toBe(3);
    expect(starsForResult(10, 10)).toBe(3);
    expect(starsForResult(11, 10)).toBe(3);
  });

  it('две звезды — запас до 60% минимума', () => {
    // Минимум 10: 12..16 ходов ещё дают две звезды, 17 — уже одна.
    expect(starsForResult(12, 10)).toBe(2);
    expect(starsForResult(14, 10)).toBe(2);
    expect(starsForResult(16, 10)).toBe(2);
    expect(starsForResult(17, 10)).toBe(1);
  });

  it('на коротких уровнях ступени не схлопываются', () => {
    // Минимум 3: допуск на три звезды — ход, на две — два хода.
    expect(starsForResult(4, 3)).toBe(3);
    expect(starsForResult(5, 3)).toBe(2);
    expect(starsForResult(6, 3)).toBe(1);
  });

  it('одна звезда — за заметно большее число ходов', () => {
    expect(starsForResult(9, 5)).toBe(1);
    expect(starsForResult(30, 4)).toBe(1);
  });

  it('без известного минимума оценка не падает', () => {
    expect(starsForResult(7, 0)).toBe(3);
  });

  describe('подсказки', () => {
    it('даже идеальное прохождение с подсказкой не даёт трёх звёзд', () => {
      expect(starsForResult(5, 5, 1)).toBe(2);
      expect(starsForResult(10, 10, 1)).toBe(2);
    });

    it('подсказка занимает больше половины запаса второй ступени', () => {
      // Минимум 10: подсказка стоит 4 хода, запас на две звезды — 6.
      expect(starsForResult(10, 10, 1)).toBe(2);
      expect(starsForResult(12, 10, 1)).toBe(2);
      // 3 лишних хода плюс подсказка — уже за пределами 16.
      expect(starsForResult(13, 10, 1)).toBe(1);
    });

    it('несколько подсказок роняют оценку до одной звезды', () => {
      expect(starsForResult(10, 10, 2)).toBe(1);
      expect(starsForResult(5, 5, 5)).toBe(1);
    });

    it('подсказка на коротком уровне стоит не меньше двух ходов', () => {
      // Минимум 3: подсказка стоит 2 хода, запас на две звезды — тоже 2.
      expect(starsForResult(3, 3, 1)).toBe(2);
      expect(starsForResult(4, 3, 1)).toBe(1);
    });

    it('лишние ходы и подсказки складываются', () => {
      // Минимум 5: подсказка стоит 2, запас на две звезды — 3.
      expect(starsForResult(6, 5, 1)).toBe(2);
      expect(starsForResult(7, 5, 1)).toBe(1);
    });
  });
});
