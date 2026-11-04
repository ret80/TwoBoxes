import { Position } from '../../core/types/position';

/**
 * Волновая анимация появления уровня (план 7.4, док. раздел 8.1).
 * Аналог `_create_mask()` / `_fill_mask()` в create_state.gd:
 * BFS от точки старта, волна каждые WAVE_INTERVAL_MS.
 *
 * ⚠️ Правки порта:
 * - источник волны один — центр поля (поле «прорастает» из точки наружу,
 *   а не появляется сразу в трёх случайных местах);
 * - интервал волны 25 мс был слишком быстрым, уровень «выскакивал» целиком;
 *   теперь волна идёт заметно, а каждая клетка ещё и подрастает (CREATE_GROW_MS).
 */
export const WAVE_INTERVAL_MS = 70;
export const CREATE_GROW_MS = 260;

/**
 * Вычислить маску волн: для каждой клетки — номер волны (BFS-расстояние
 * до ближайшего seed). Клетки вне поля (UNKNOWN) не участвуют.
 */
export function createWaveMask(
  width: number,
  height: number,
  isRenderable: (x: number, y: number) => boolean,
): number[][] {
  const mask: number[][] = Array.from({ length: height }, () => new Array<number>(width).fill(-1));

  // Источник — ближайшая к центру отрисовываемая клетка
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  let seed: Position | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isRenderable(x, y)) continue;
      const dist = (x - centerX) ** 2 + (y - centerY) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        seed = new Position(x, y);
      }
    }
  }
  if (!seed) return mask;

  const queue: Position[] = [seed];
  mask[seed.y][seed.x] = 0;

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

  // Клетки, недостижимые из seed (isolated), получали mask = -1 и никогда
  // не появлялись. Назначаем им волны после максимальной — уровень
  // гарантированно собирается целиком.
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
