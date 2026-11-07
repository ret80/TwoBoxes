import {
  CellType,
  isBoxCell,
  isEndCell,
  isMechanicCell,
  oneWayDir,
  portalPartner,
} from '../types/cell';
import type { Box } from '../types/entity';
import type { GameState, PathPoint } from '../types/game-state';
import type { Level } from '../types/level';
import {
  cloneMechanicState,
  createMechanicState,
  type MechanicState,
} from '../types/mechanic-state';
import { Position } from '../types/position';

/**
 * Клетка проходима для скольжения. Клетки кубиков тоже проходимы: карта
 * хранит их стартовые позиции, а актуальные препятствия считает `occupied`.
 * Иначе кубик навсегда упирался бы в собственную стартовую клетку.
 */
function isPassable(cell: CellType): boolean {
  return cell === CellType.EMPTY || isEndCell(cell) || isBoxCell(cell) || isMechanicCell(cell);
}

/** Поворот направления на 90°: по часовой стрелке (экранная ось Y вниз) или против. */
function rotate(dir: Position, clockwise: boolean): Position {
  return clockwise
    ? new Position(-dir.y, dir.x)
    : new Position(dir.y, -dir.x);
}

/** Найти вторую клетку портала. Пара в уровне одна, но поиск не зависит от неё. */
function findPortalExit(level: Level, from: Position, partner: CellType): Position | null {
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const pos = new Position(x, y);
      if (pos.equals(from)) continue;
      if (level.grid.get(pos) === partner) return pos;
    }
  }
  return null;
}

interface Trace {
  pos: Position;
  points: PathPoint[];
  /** Кубик вообще сдвинулся (а не только пропустил ход из-за ловушки). */
  moved: boolean;
}

/**
 * Провести один кубик до упора с учётом механик. Возвращает фактический путь:
 * по нему анимация рисует повороты на ротаторах и прыжок через портал.
 */
function traceBox(
  level: Level,
  start: Position,
  dir: Position,
  occupied: Uint8Array,
  state: MechanicState,
  index: number,
): Trace {
  const points: PathPoint[] = [{ pos: start.clone() }];
  let cur = start.clone();
  let heading = dir;
  let step = 0;
  const maxSteps = level.width * level.height * 4 + 16;

  while (step++ < maxSteps) {
    const next = cur.add(heading);
    const cell = level.grid.get(next);
    if (!isPassable(cell)) break;
    // Односторонняя клетка пускает только по своему направлению.
    const oneWay = oneWayDir(cell);
    if (oneWay && (oneWay.x !== heading.x || oneWay.y !== heading.y)) break;
    if (occupied[next.y * level.width + next.x]) break;

    cur = next;
    points.push({ pos: cur.clone() });

    const partner = portalPartner(cell);
    if (partner) {
      const exit = findPortalExit(level, cur, partner);
      if (!exit || occupied[exit.y * level.width + exit.x]) break;
      cur = exit;
      points.push({ pos: cur.clone(), teleport: true });
      continue;
    }

    if (cell === CellType.TRAP) {
      // Ловушка останавливает кубик и держит его два следующих хода.
      state.locks[index] = 2;
      break;
    }

    if (cell === CellType.SWITCH) {
      // Переключатель срабатывает в момент проезда и переворачивает ротаторы.
      state.rotorFlip = !state.rotorFlip;
      continue;
    }

    if (cell === CellType.ROTOR_CW || cell === CellType.ROTOR_CCW) {
      const clockwise = (cell === CellType.ROTOR_CW) !== state.rotorFlip;
      heading = rotate(heading, clockwise);
    }
  }

  return { pos: cur, points, moved: points.length > 1 };
}

/**
 * Попытка хода: **все кубики** одновременно скользят в `dir` до упора.
 *
 * Механики — это расширения того же скольжения:
 * - портал переносит кубик на парную клетку и отпускает дальше в том же
 *   направлении;
 * - ловушка останавливает кубик и отнимает два следующих хода;
 * - ротатор поворачивает движение на 90°;
 * - переключатель переворачивает все ротаторы;
 * - односторонняя клетка пропускает только по стрелке.
 *
 * Если все кубики в ловушках, ход всё равно засчитывается как пропуск: иначе
 * счётчики никогда бы не уменьшились и уровень стал бы мёртвым.
 *
 * @returns новый GameState или null, если движение невозможно.
 */
export function moveBoxes(
  level: Level,
  boxes: Box[],
  dir: Position,
  curMoves: number,
  curTime: number,
  state: MechanicState = createMechanicState(boxes.length),
): GameState | null {
  const nextState = cloneMechanicState(state);
  nextState.locks.length = boxes.length;
  for (let i = 0; i < boxes.length; i++) nextState.locks[i] ??= 0;

  // Списать пропущенный ход у запертых кубиков. Они остаются препятствиями
  // для остальных и не участвуют в выборе порядка движения.
  const locked: boolean[] = boxes.map((_, index) => {
    if (nextState.locks[index] <= 0) return false;
    nextState.locks[index]--;
    return true;
  });

  const occupied = new Uint8Array(level.width * level.height);
  boxes.forEach((box) => {
    occupied[box.pos.y * level.width + box.pos.x] = 1;
  });

  const proj = (box: Box): number => box.pos.x * dir.x + box.pos.y * dir.y;
  const indexed = boxes
    .map((box, index) => ({ box, index }))
    .filter(({ index }) => !locked[index])
    .sort((a, b) => proj(b.box) - proj(a.box));

  const newBoxes: Box[] = boxes.map((box) => ({
    pos: box.pos.clone(),
    color: box.color,
  }));
  const paths: PathPoint[][] = boxes.map(() => []);
  let moved = false;

  for (const { box, index } of indexed) {
    // Кубик освобождает старую клетку, чтобы не блокировать сам себя.
    occupied[box.pos.y * level.width + box.pos.x] = 0;
    const trace = traceBox(level, box.pos, dir, occupied, nextState, index);
    newBoxes[index] = { pos: trace.pos, color: box.color };
    occupied[trace.pos.y * level.width + trace.pos.x] = 1;
    if (trace.moved) {
      moved = true;
      paths[index] = trace.points;
    }
  }

  // Все кубики были заперты: ход-пропуск нужен, чтобы ловушки истекли.
  const waited = locked.some(Boolean) && !moved;
  if (!moved && !waited) return null;

  return {
    level,
    boxes: newBoxes,
    moves: curMoves + 1,
    time: curTime,
    mechanicState: nextState,
    paths,
  };
}

/** Может ли быть совершён хотя бы один ход. */
export function canMoveAny(
  level: Level,
  boxes: Box[],
  dir: Position,
  state?: MechanicState,
): boolean {
  return moveBoxes(level, boxes, dir, 0, 0, state) !== null;
}
