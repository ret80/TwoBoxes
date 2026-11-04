import { CellType, isEndCell } from '../types/cell';
import { ColorType } from '../types/color';
import type { Box } from '../types/entity';
import type { GameState } from '../types/game-state';
import { Level } from '../types/level';
import { LevelGrid } from '../types/level-grid';
import { Position } from '../types/position';

/**
 * Клетка проходима для скольжения: EMPTY или любая целевая площадка
 * (раздел 4.4 документации; WALL и UNKNOWN блокируют движение).
 */
function isPassable(cell: CellType): boolean {
  return cell === CellType.EMPTY || isEndCell(cell);
}

/**
 * Длина пути скольжения кубика из `pos` в `dir` по рабочей карте
 * (аналог `_get_len_path()` в move_state.gd).
 */
export function getLenPath(pos: Position, dir: Position, grid: LevelGrid): number {
  let len = 0;
  let cur = pos;
  for (;;) {
    const next = cur.add(dir);
    if (!grid.isValid(next) || !isPassable(grid.get(next))) break;
    cur = next;
    len++;
  }
  return len;
}

/**
 * Попытка хода: **все кубики** одновременно скользят в `dir` до упора
 * (раздел 4.4 документации, аналог `move_state.gd`).
 *
 * Алгоритм:
 * 1. Рабочая карта = копия grid уровня (кубики уже на ней), кубики последовательно
 *    «перезаписываются» — аналог `Util.create_lvl` (script/util/util.gd).
 * 2. Кубики обрабатываются в порядке «ведущий первым» (сортировка по проекции
 *    на направление): после вычисления пути переднего кубика его новая позиция
 *    становится препятствием для следующего — кубики не «склеиваются».
 * 3. Если ни один кубик не может сдвинуться — возвращается null (ход «в стену»
 *    игнорируется, guard `canMove` игрового FSM).
 *
 * @returns новый GameState или null, если движение невозможно.
 */
export function moveBoxes(
  level: Level,
  boxes: Box[],
  dir: Position,
  curMoves: number,
  curTime: number,
): GameState | null {
  const work = level.grid.duplicate();

  // Очистить клетки кубиков и выставить кубики по актуальным позициям.
  for (let y = 0; y < work.height; y++) {
    for (let x = 0; x < work.width; x++) {
      if (work.get(new Position(x, y)) === CellType.BOX || work.get(new Position(x, y)) === CellType.BOX_TWO) {
        work.set(new Position(x, y), CellType.EMPTY);
      }
    }
  }
  for (const b of boxes) {
    work.set(b.pos, b.color === ColorType.ONE ? CellType.BOX : CellType.BOX_TWO);
  }

  // «Ведущий первым»: кубик с большей проекцией на направление движется раньше.
  const proj = (b: Box): number => b.pos.x * dir.x + b.pos.y * dir.y;
  const indexed = boxes.map((box, index) => ({ box, index }));
  indexed.sort((a, b) => proj(b.box) - proj(a.box));

  const newBoxes: Box[] = new Array(boxes.length);
  let moved = false;

  for (const { box, index } of indexed) {
    const len = getLenPath(box.pos, dir, work);
    if (len > 0) {
      moved = true;
      work.set(box.pos, CellType.EMPTY);
      const target = new Position(box.pos.x + dir.x * len, box.pos.y + dir.y * len);
      work.set(target, box.color === ColorType.ONE ? CellType.BOX : CellType.BOX_TWO);
      newBoxes[index] = { pos: target, color: box.color };
    } else {
      newBoxes[index] = { pos: box.pos.clone(), color: box.color };
    }
  }

  if (!moved) return null;

  return { level, boxes: newBoxes, moves: curMoves + 1, time: curTime };
}

/**
 * Может ли быть совершён хотя бы один ход (guard `canMove` игрового FSM).
 */
export function canMoveAny(level: Level, boxes: Box[], dir: Position): boolean {
  return moveBoxes(level, boxes, dir, 0, 0) !== null;
}
