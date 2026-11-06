import { CellType, isBoxCell, isEndCell } from '../types/cell';
import { ColorType } from '../types/color';
import type { Box } from '../types/entity';
import type { Level } from '../types/level';
import { DIRS, Position } from '../types/position';

/**
 * Подсказка (кнопка-лампочка на нижней панели): первое направление
 * кратчайшего решения из текущей позиции.
 *
 * Поиск в ширину по позициям кубиков; каждый шаг повторяет правила
 * `moveBoxes` — все кубики скользят одновременно до упора, ведущий (с
 * наибольшей проекцией на направление) движется первым и становится
 * препятствием для остальных. Цель засчитывается только своему цвету.
 */

const DIRS_ORDER = [DIRS.up, DIRS.down, DIRS.left, DIRS.right];
const MAX_STATES = 60000; // предохранитель от зависания на больших полях

/**
 * Проходима ли клетка для скольжения. Кроме EMPTY/целей сюда входят клетки
 * кубиков: в рабочей карте `moveBoxes` они превращаются в EMPTY, поэтому
 * после сдвига кубика старая клетка обязана остаться проходимой.
 */
function isWalkable(cell: CellType): boolean {
  return cell === CellType.EMPTY || isEndCell(cell) || isBoxCell(cell);
}

/** Стоит ли кубик на своей цели. */
function onOwnGoal(level: Level, pos: Position, color: ColorType): boolean {
  const cell = level.grid.get(pos);
  return color === ColorType.ONE ? cell === CellType.END : cell === CellType.END_TWO;
}

export function findHint(level: Level, boxes: Box[]): Position | null {
  if (boxes.length === 0 || boxes.length > 3) return null;

  const w = level.width;
  const h = level.height;
  const blocked = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      blocked[y * w + x] = isWalkable(level.grid.get(new Position(x, y))) ? 0 : 1;
    }
  }

  const colors = boxes.map((b) => b.color);
  const start = boxes.map((b) => b.pos.y * w + b.pos.x);
  const solved = (cells: number[]): boolean =>
    cells.every((c, i) => onOwnGoal(level, new Position(c % w, Math.floor(c / w)), colors[i]));

  if (solved(start)) return null;

  const startKey = start.join(',');
  const parents = new Map<string, { prev: string | null; dir: Position | null }>();
  parents.set(startKey, { prev: null, dir: null });

  const queue: number[][] = [start];
  let head = 0;

  while (head < queue.length && parents.size < MAX_STATES) {
    const cells = queue[head++];
    const key = cells.join(',');
    for (const dir of DIRS_ORDER) {
      const next = slideAll(cells, dir, blocked, w, h);
      if (!next) continue;
      const nextKey = next.join(',');
      if (parents.has(nextKey)) continue;
      parents.set(nextKey, { prev: key, dir });
      if (solved(next)) return firstDir(parents, nextKey);
      queue.push(next);
    }
  }
  return null;
}

/** Первое направление пути от старта к найденному решению. */
function firstDir(
  parents: Map<string, { prev: string | null; dir: Position | null }>,
  goalKey: string,
): Position | null {
  let key = goalKey;
  let dir: Position | null = null;
  for (;;) {
    const node = parents.get(key);
    if (!node || node.prev === null) break;
    dir = node.dir;
    key = node.prev;
  }
  return dir;
}

/** Куда доедет кубик при ходе в `dir` (для стрелок-подсказок на полу). */
export interface HintSlide {
  color: ColorType;
  from: Position;
  to: Position;
}

/**
 * План хода для визуальной подсказки: путь каждого кубика при сдвиге в `dir`.
 * Правила те же, что в `slideAll`: ведущий (с наибольшей проекцией на
 * направление) едет первым и становится препятствием для остальных.
 */
export function planSlides(level: Level, boxes: Box[], dir: Position): HintSlide[] {
  const w = level.width;
  const h = level.height;
  const occupied = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      occupied[y * w + x] = isWalkable(level.grid.get(new Position(x, y))) ? 0 : 1;
    }
  }
  for (const box of boxes) occupied[box.pos.y * w + box.pos.x] = 1;

  const order = boxes
    .map((box, index) => ({
      index,
      proj: box.pos.x * dir.x + box.pos.y * dir.y,
    }))
    .sort((a, b) => b.proj - a.proj);

  const result: HintSlide[] = boxes.map((box) => ({
    color: box.color,
    from: box.pos.clone(),
    to: box.pos.clone(),
  }));

  for (const { index } of order) {
    const box = boxes[index];
    let cx = box.pos.x;
    let cy = box.pos.y;
    occupied[cy * w + cx] = 0; // кубик освобождает свою клетку
    for (;;) {
      const nx = cx + dir.x;
      const ny = cy + dir.y;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) break;
      if (occupied[ny * w + nx]) break;
      cx = nx;
      cy = ny;
    }
    occupied[cy * w + cx] = 1;
    result[index].to = new Position(cx, cy);
  }

  return result;
}

/**
 * Один ход: все кубики скользят в `dir`. Возвращает новые индексы клеток
 * или null, если сдвинуться не смог никто.
 */
function slideAll(
  cells: number[],
  dir: Position,
  blocked: Uint8Array,
  w: number,
  h: number,
): number[] | null {
  const occupied = new Uint8Array(blocked); // локальная копия: кубики как препятствия
  for (const c of cells) occupied[c] = 1;

  const order = cells
    .map((c, index) => ({ c, index, proj: (c % w) * dir.x + Math.floor(c / w) * dir.y }))
    .sort((a, b) => b.proj - a.proj);

  const result = cells.slice();
  let moved = false;

  for (const { c, index } of order) {
    let cx = c % w;
    let cy = Math.floor(c / w);
    occupied[cy * w + cx] = 0; // кубик освобождает свою клетку
    for (;;) {
      const nx = cx + dir.x;
      const ny = cy + dir.y;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) break;
      if (occupied[ny * w + nx]) break;
      cx = nx;
      cy = ny;
    }
    occupied[cy * w + cx] = 1;
    const target = cy * w + cx;
    result[index] = target;
    if (target !== c) moved = true;
  }

  return moved ? result : null;
}
