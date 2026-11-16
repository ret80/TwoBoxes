import { CellType } from '../../types/cell';
import { Position } from '../../types/position';
import type { Level } from '../../types/level';
import { parse } from '../field/render';

/**
 * Совпадает ли карта, которую получит игрок, с тем, что проверял решатель.
 *
 * Генератор ходит по маске (`createLevelFromMask`), а наружу отдаёт строки
 * `rows`: если `render` и `parse` где-то разойдутся — символ механики
 * перекроет цель, старт ляжет на механику, — проверенный уровень перестанет
 * быть тем уровнем, в который играет человек. Такое расхождение дешевле
 * поймать здесь, чем в отчёте игрока.
 *
 * Сравнение идёт по подписи, а не по координатам: `render` обрезает пустые
 * края, поэтому координаты строк и маски сдвинуты. Стены и «пространство за
 * полем» считаются одним и тем же препятствием, а внешние стены срезаются с
 * обеих сторон одинаковым правилом.
 */
export function sameMap(level: Level, rows: string[]): boolean {
  return signature(level) === signature(parse(rows));
}

/** Один символ на клетку: препятствия, пол и точный тип механики/сущности. */
function cellChar(cell: CellType): string {
  if (cell === CellType.WALL || cell === CellType.UNKNOWN) return '#';
  if (cell === CellType.EMPTY) return '.';
  return String(cell);
}

/** Карта без внешних стен и пустых краёв: устойчивая подпись содержимого. */
function signature(level: Level): string {
  const chars: string[][] = [];
  for (let y = 0; y < level.height; y++) {
    const row: string[] = [];
    for (let x = 0; x < level.width; x++) {
      row.push(cellChar(level.grid.get(new Position(x, y))));
    }
    chars.push(row);
  }

  let top = level.height;
  let bottom = -1;
  let left = level.width;
  let right = -1;
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (chars[y][x] === '#') continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (bottom < 0) return '';

  const trimmed: string[] = [];
  for (let y = top; y <= bottom; y++) {
    trimmed.push(chars[y].slice(left, right + 1).join(''));
  }
  return trimmed.join('\n');
}
