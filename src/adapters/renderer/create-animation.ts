import { Position } from '../../core/types/position';

/**
 * Волновая анимация появления уровня (план 7.4, док. раздел 8.1).
 * Аналог `_create_mask()` / `_fill_mask()` в create_state.gd:
 * BFS от 1–3 случайных точек, волна каждые 25 мс.
 */
export const WAVE_INTERVAL_MS = 25;
export const SEED_COUNT = 3;

/**
 * Вычислить маску волн: для каждой клетки — номер волны (BFS-расстояние
 * до ближайшего seed). Клетки вне поля (UNKNOWN) не участвуют.
 */
export function createWaveMask(
  width: number,
  height: number,
  isRenderable: (x: number, y: number) => boolean,
  rand: () => number = Math.random,
): number[][] {
  const mask: number[][] = Array.from({ length: height }, () => new Array<number>(width).fill(-1));

  // 1–3 случайных seed среди отрисовываемых клеток
  const renderable: Position[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isRenderable(x, y)) renderable.push(new Position(x, y));
    }
  }
  if (renderable.length === 0) return mask;

  const seedCount = 1 + Math.floor(rand() * SEED_COUNT);
  const queue: Position[] = [];
  for (let i = 0; i < Math.min(seedCount, renderable.length); i++) {
    const seed = renderable[Math.floor(rand() * renderable.length)];
    if (mask[seed.y][seed.x] === -1) {
      mask[seed.y][seed.x] = 0;
      queue.push(seed);
    }
  }

  let head = 0;
  const dirs = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];
  while (head < queue.length) {
    const cur = queue[head++];
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (!isRenderable(nx, ny) || mask[ny][nx] !== -1) continue;
      mask[ny][nx] = mask[cur.y][cur.x] + 1;
      queue.push(new Position(nx, ny));
    }
  }

  // ⚠️ Фикс «поле не собирается»: клетки, недостижимые из seed (isolated),
  // получали mask = -1 и никогда не появлялись. Назначаем им волны
  // после максимальной — уровень гарантированно собирается целиком.
  let max = 0;
  for (const row of mask) for (const v of row) if (v > max) max = v;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isRenderable(x, y) && mask[y][x] === -1) mask[y][x] = ++max;
    }
  }

  return mask;
}

/** Количество волн в маске. */
export function maxWave(mask: number[][]): number {
  let max = 0;
  for (const row of mask) for (const v of row) if (v > max) max = v;
  return max;
}
