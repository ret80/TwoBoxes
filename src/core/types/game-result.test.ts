import { describe, expect, it } from 'vitest';
import { starsForResult } from './game-result';

describe('starsForResult', () => {
  it('три звезды — только за прохождение в минимум ходов', () => {
    expect(starsForResult(5, 5)).toBe(3);
    expect(starsForResult(12, 12)).toBe(3);
  });

  it('две звезды — при запасе не больше половины минимума', () => {
    expect(starsForResult(6, 5)).toBe(2);
    expect(starsForResult(8, 5)).toBe(2);
    // На коротких уровнях прощается хотя бы один лишний ход.
    expect(starsForResult(4, 3)).toBe(2);
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
      expect(starsForResult(12, 12, 1)).toBe(2);
    });

    it('одна подсказка на длинном уровне ещё укладывается в две звезды', () => {
      // min 12: подсказка стоит 6 ходов, запас на две звезды — тоже 6.
      expect(starsForResult(12, 12, 1)).toBe(2);
      // А вместе с лишним ходом запаса уже не хватает.
      expect(starsForResult(13, 12, 1)).toBe(1);
    });

    it('несколько подсказок роняют оценку до одной звезды', () => {
      expect(starsForResult(12, 12, 2)).toBe(1);
      expect(starsForResult(5, 5, 5)).toBe(1);
    });

    it('подсказка на коротком уровне стоит не меньше двух ходов', () => {
      // min 3: подсказка стоит 2 хода, запас на две звезды — 2.
      expect(starsForResult(3, 3, 1)).toBe(2);
      expect(starsForResult(4, 3, 1)).toBe(1);
    });

    it('лишние ходы и подсказки складываются', () => {
      expect(starsForResult(6, 5, 1)).toBe(1);
    });
  });
});
