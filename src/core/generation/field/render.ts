import { CellType } from '../../types/cell';
import type { Level } from '../../types/level';
import { Position } from '../../types/position';
import { createLevelFromData } from '../../rules/create';
import { mechanicChar } from '../mechanics';

/** Восемь направлений: фон карты рисуется с учётом диагональных стен. */
const NEIGHBORS_8: readonly Position[] = [
  new Position(-1, -1),
  new Position(0, -1),
  new Position(1, -1),
  new Position(-1, 0),
  new Position(1, 0),
  new Position(-1, 1),
  new Position(0, 1),
  new Position(1, 1),
];

function adjacentToFloor(
  floor: Uint8Array,
  size: number,
  x: number,
  y: number,
): boolean {
  for (const d of NEIGHBORS_8) {
    const nx = x + d.x;
    const ny = y + d.y;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
    if (floor[ny * size + nx]) return true;
  }
  return false;
}

/**
 * Карта уровня в ASCII. Это **формат вывода**, а не внутреннее представление:
 * генератор ходит по маске через `createLevelFromMask`, а render вызывается
 * один раз на принятом кандидате.
 *
 * Пустые края обрезаются — поле компактное, как в ручных уровнях.
 */
export function render(
  floor: Uint8Array,
  size: number,
  starts: Position[],
  ends: Position[],
  cells: Map<number, CellType>,
): string[] {
  const grid: string[][] = [];
  for (let y = 0; y < size; y++) {
    const row: string[] = [];
    for (let x = 0; x < size; x++) {
      const isFloor = floor[y * size + x] === 1;
      row.push(isFloor ? '.' : adjacentToFloor(floor, size, x, y) ? '#' : ' ');
    }
    grid.push(row);
  }

  const put = (pos: Position, ch: string): void => {
    grid[pos.y][pos.x] = ch;
  };
  // Сначала механики, затем старты/цели: сущности всегда главнее фона.
  for (const [index, cell] of cells) {
    const ch = mechanicChar(cell);
    if (!ch) continue;
    put(new Position(index % size, Math.floor(index / size)), ch);
  }
  ends.forEach((pos, i) => put(pos, i === 0 ? 'r' : 'y'));
  starts.forEach((pos, i) => put(pos, i === 0 ? 'R' : 'Y'));

  const filled: boolean[] = grid.map((row) => row.some((c) => c !== ' '));
  const top = filled.indexOf(true);
  let bottom = filled.length - 1;
  while (bottom > top && !filled[bottom]) bottom--;

  let left = size;
  let right = -1;
  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < size; x++) {
      if (grid[y][x] === ' ') continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }

  return grid.slice(top, bottom + 1).map((row) => row.slice(left, right + 1).join(''));
}

/** Разобрать карту ровно теми же правилами, что и игра. */
export function parse(rows: string[]): Level {
  return createLevelFromData(0, 0, rows);
}
