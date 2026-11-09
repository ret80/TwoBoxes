import { CellType } from '../types/cell';
import { ColorType } from '../types/color';
import type { Box, End } from '../types/entity';
import { Level } from '../types/level';
import { LevelGrid } from '../types/level-grid';
import { Position } from '../types/position';

/**
 * Создание уровня из данных карт (аналог `_create_level()` в episode.gd + `build()` в field.gd).
 * Ширина поля = максимальная длина строки; короткие строки добиваются ' ' (UNKNOWN),
 * поле не требует центрирования на уровне данных — центрирование выполняет рендер
 * через `LevelGrid.nearestEven`.
 */
export function createLevelFromData(
  episodeId: number,
  levelId: number,
  rows: string[],
): Level {
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const grid = new LevelGrid(width, height);
  const boxes: Box[] = [];
  const ends: End[] = [];

  for (let y = 0; y < height; y++) {
    const row = rows[y].padEnd(width, ' ');
    for (let x = 0; x < width; x++) {
      const pos = new Position(x, y);
      switch (row[x]) {
        case '#':
          grid.set(pos, CellType.WALL);
          break;
        case '.':
          grid.set(pos, CellType.EMPTY);
          break;
        case 'R':
          grid.set(pos, CellType.BOX);
          boxes.push({ pos, color: ColorType.ONE });
          break;
        case 'Y':
          grid.set(pos, CellType.BOX_TWO);
          boxes.push({ pos, color: ColorType.TWO });
          break;
        case 'r':
          grid.set(pos, CellType.END);
          ends.push({ pos, color: ColorType.ONE });
          break;
        case 'y':
          grid.set(pos, CellType.END_TWO);
          ends.push({ pos, color: ColorType.TWO });
          break;
        // Клетки механик: они проходимы, но меняют траекторию кубика.
        case 'a':
          grid.set(pos, CellType.PORTAL_A);
          break;
        case 'b':
          grid.set(pos, CellType.PORTAL_B);
          break;
        case 't':
          grid.set(pos, CellType.TRAP);
          break;
        case 'c':
          grid.set(pos, CellType.ROTOR_CW);
          break;
        case 'w':
          grid.set(pos, CellType.ROTOR_CCW);
          break;
        case 's':
          grid.set(pos, CellType.SWITCH);
          break;
        case '^':
          grid.set(pos, CellType.ONE_WAY_UP);
          break;
        case 'v':
          grid.set(pos, CellType.ONE_WAY_DOWN);
          break;
        case '<':
          grid.set(pos, CellType.ONE_WAY_LEFT);
          break;
        case '>':
          grid.set(pos, CellType.ONE_WAY_RIGHT);
          break;
        default:
          grid.set(pos, CellType.UNKNOWN);
          break;
      }
    }
  }

  return new Level(episodeId, levelId, grid, boxes, ends);
}

/**
 * Создать уровень напрямую из маски пола, стартов, целей и клеток механик.
 *
 * Генератору это нужно, чтобы не гонять каждую попытку через `render` →
 * `parse`: маска уже является внутренним представлением, а ASCII-карта —
 * только форматом вывода. Координаты маски и уровня совпадают, поэтому
 * пропадает ловушка «render обрезает края и координаты расходятся».
 */
export function createLevelFromMask(
  mask: Uint8Array,
  size: number,
  starts: Position[],
  ends: Position[],
  cells: Map<number, CellType> = new Map(),
): Level {
  const grid = new LevelGrid(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = y * size + x;
      grid.set(
        new Position(x, y),
        cells.get(index) ?? (mask[index] ? CellType.EMPTY : CellType.WALL),
      );
    }
  }

  // Порядок как у render: механики — фон, цели и старты — поверх них.
  const endsEntities: End[] = ends.map((pos, index) => ({
    pos: pos.clone(),
    color: index === 0 ? ColorType.ONE : ColorType.TWO,
  }));
  const boxes: Box[] = starts.map((pos, index) => ({
    pos: pos.clone(),
    color: index === 0 ? ColorType.ONE : ColorType.TWO,
  }));
  endsEntities.forEach((end, index) =>
    grid.set(end.pos, index === 0 ? CellType.END : CellType.END_TWO),
  );
  boxes.forEach((box, index) =>
    grid.set(box.pos, index === 0 ? CellType.BOX : CellType.BOX_TWO),
  );

  return new Level(0, 0, grid, boxes, endsEntities);
}
