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

/** Состояние одного кубика в пределах одного хода. */
interface BoxRun {
  pos: Position;
  heading: Position;
  /** Кубик ещё едет: не упёрся, не застрял в ловушке, не заперт. */
  moving: boolean;
  points: PathPoint[];
}

/**
 * Попытка хода: **все кубики** одновременно скользят в `dir` до упора.
 *
 * Ход считается пошагово: за один шаг каждый свободный кубик пробует сдвинуться
 * на клетку по своему направлению, и клетка, которую сосед покидает в этом же
 * шаге, считается свободной. Порядок «сначала ведущий до упора» здесь не
 * годится: ротатор и портал заворачивают кубик в чужую полосу, и кубик,
 * проехавший весь путь первым, оказывался там, где на самом деле уже стоит
 * другой. Пошаговая схема даёт то же самое, что видит игрок: кто ближе — тот и
 * упрётся первым, а остальные встанут за ним.
 *
 * Механики — это расширения того же скольжения:
 * - портал переносит кубик на парную клетку и отпускает дальше в том же
 *   направлении (занятый выход останавливает кубик на входе);
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
  // для остальных и в этом ходе не двигаются.
  const locked: boolean[] = boxes.map((_, index) => {
    if (nextState.locks[index] <= 0) return false;
    nextState.locks[index]--;
    return true;
  });

  const runs: BoxRun[] = boxes.map((box, index) => ({
    pos: box.pos.clone(),
    heading: new Position(dir.x, dir.y),
    moving: !locked[index],
    points: [{ pos: box.pos.clone() }],
  }));

  /** Кто стоит на клетке: индекс кубика по `y * width + x`. */
  const occupied = new Map<number, number>();
  boxes.forEach((box, index) => occupied.set(box.pos.y * level.width + box.pos.x, index));

  const cellKey = (pos: Position): number => pos.y * level.width + pos.x;
  const maxTicks = level.width * level.height * 4 + 16;
  let moved = false;

  for (let tick = 0; tick < maxTicks; tick++) {
    const active = runs
      .map((run, index) => ({ run, index }))
      .filter(({ run }) => run.moving);
    if (active.length === 0) break;

    // Куда хочет шагнуть каждый кубик и что мешает шагу.
    const wants = new Map<number, { index: number; next: Position; cell: CellType }>();
    const blocked = new Set<number>();
    for (const { run, index } of active) {
      const next = run.pos.add(run.heading);
      const cell = level.grid.get(next);
      if (!isPassable(cell)) {
        blocked.add(index);
        continue;
      }
      // Односторонняя клетка пускает только по своему направлению.
      const oneWay = oneWayDir(cell);
      if (oneWay && (oneWay.x !== run.heading.x || oneWay.y !== run.heading.y)) {
        blocked.add(index);
        continue;
      }
      wants.set(index, { index, next, cell });
    }

    // Двое в одну клетку и обмен клетками невозможны — оба встают.
    const targets = new Map<number, number[]>();
    for (const want of wants.values()) {
      const key = cellKey(want.next);
      const list = targets.get(key) ?? [];
      list.push(want.index);
      targets.set(key, list);
    }
    for (const list of targets.values()) {
      if (list.length > 1) list.forEach((index) => blocked.add(index));
    }
    for (const want of wants.values()) {
      if (blocked.has(want.index)) continue;
      const occupant = occupied.get(cellKey(want.next));
      if (occupant === undefined) continue;
      const other = wants.get(occupant);
      if (other && other.next.equals(runs[want.index].pos)) {
        blocked.add(want.index);
        blocked.add(occupant);
      }
    }

    // Кубик, который стоит на пути и сам в этом шаге не сдвинется, останавливает
    // соседа. Цепочка «все едут» разрешается, поэтому цикл идёт до устойчивого
    // состояния: остановка одного может остановить следующего.
    let changed = true;
    while (changed) {
      changed = false;
      for (const want of wants.values()) {
        if (blocked.has(want.index)) continue;
        const occupant = occupied.get(cellKey(want.next));
        if (occupant === undefined || occupant === want.index) continue;
        const advances = wants.has(occupant) && !blocked.has(occupant);
        if (!advances) {
          blocked.add(want.index);
          changed = true;
        }
      }
    }

    const advancing = [...wants.values()].filter((want) => !blocked.has(want.index));
    for (const want of advancing.sort((a, b) => a.index - b.index)) {
      const run = runs[want.index];
      occupied.delete(cellKey(run.pos));
      run.pos = want.next.clone();
      run.points.push({ pos: run.pos.clone() });
      occupied.set(cellKey(run.pos), want.index);
      moved = true;
    }

    // Эффекты клеток — после того как все сдвинулись: переключатели и ловушки
    // обрабатываются в порядке кубиков, чтобы ход был детерминированным.
    for (const want of advancing) {
      const run = runs[want.index];
      const partner = portalPartner(want.cell);
      if (partner) {
        const exit = findPortalExit(level, run.pos, partner);
        if (exit && !occupied.has(cellKey(exit))) {
          occupied.delete(cellKey(run.pos));
          run.pos = exit.clone();
          run.points.push({ pos: run.pos.clone(), teleport: true });
          occupied.set(cellKey(run.pos), want.index);
        } else {
          // Выход занят — кубик остаётся на входе.
          run.moving = false;
        }
        continue;
      }
      if (want.cell === CellType.TRAP) {
        nextState.locks[want.index] = 2;
        run.moving = false;
        continue;
      }
      if (want.cell === CellType.SWITCH) {
        nextState.rotorFlip = !nextState.rotorFlip;
        continue;
      }
      if (want.cell === CellType.ROTOR_CW || want.cell === CellType.ROTOR_CCW) {
        const clockwise = (want.cell === CellType.ROTOR_CW) !== nextState.rotorFlip;
        run.heading = rotate(run.heading, clockwise);
      }
    }

    // Упёршиеся кубики больше не поедут: стена, односторонняя клетка и стоящий
    // сосед за ход не сдвинутся.
    for (const index of blocked) runs[index].moving = false;
  }

  const newBoxes: Box[] = runs.map((run, index) => ({
    pos: run.pos,
    color: boxes[index].color,
  }));
  const paths: PathPoint[][] = runs.map((run) => (run.points.length > 1 ? run.points : []));

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
