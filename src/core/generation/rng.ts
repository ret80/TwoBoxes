/**
 * Детерминированный ГПСЧ и общие операции над массивами.
 *
 * Раньше `createRng`/`shuffle` жили в генераторе, а `shuffle` и `pick` были
 * переписаны ещё в двух местах. Одна копия — одно поведение: перестановка
 * массива не может незаметно разойтись между сборкой поля, механиками и
 * паттернами.
 */

export type Rng = () => number;

/** Быстрый детерминированный ГПСЧ (mulberry32). */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Перемешать сид с номером попытки. Без этого попытки шли арифметической
 * прогрессией (`seed + attempt * 7919`), и разные стартовые сиды попадали в ту
 * же самую последовательность — то есть разные уровни получали одинаковые карты.
 */
export function mixSeed(seed: number, attempt: number, salt: number): number {
  // Каждый вход смешивается и прибавляется отдельно. Простое `h ^ number`
  // склеивает пары: (сид 1, попытка 3) и (сид 2, попытка 0) дают одно число.
  let h = (seed >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = (h + Math.imul(attempt | 0, 0x27d4eb2d)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h + Math.imul(salt | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

/** Перемешать массив на месте (Фишер—Йетс) и вернуть его же. */
export function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** Случайный элемент непустого массива. */
export function pick<T>(items: T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}
