import {
  CellType,
  isBoxCell,
  isEndCell,
  isMechanicCell,
  oneWayDir,
  rotorElbow,
  rotorElbowExit,
  trapLockTurns,
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
import { CellEffect, cellEffect } from './cell-effects';
import {
  PortalRule,
  portalRuleFor,
  type PortalArrival,
  type PortalRun,
} from './portal';

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

/** Состояние одного кубика в пределах одного хода. */
interface BoxRun extends PortalRun {
  heading: Position;
}

/** Результат симуляции хода без игровой обвязки. */
export interface StepResult {
  boxes: Box[];
  mechanicState: MechanicState;
  portalSwaps: number;
}

interface Simulation extends StepResult {
  paths: PathPoint[][];
}

/**
 * Один переход по правилам игры.
 *
 * `recordPaths` — единственное отличие решателя от игры. Игра и анимация
 * просят траектории (`paths`), поиску нужны только позиции кубиков и состояние
 * механик. Раньше запись `points`/`paths` шла всегда, и BFS оплачивал сотни
 * тысяч ненужных объектов. Правила при этом не дублируются: обе обёртки
 * вызывают эту функцию.
 */
function simulate(
  level: Level,
  boxes: Box[],
  dir: Position,
  state: MechanicState,
  recordPaths: boolean,
): Simulation | null {
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
    points: recordPaths ? [{ pos: box.pos.clone() }] : undefined,
    teleported: false,
  }));

  // Все правила телепорта — в `PortalRule`: здесь только сбор входов шага.
  const portal = portalRuleFor(level);
  const cellKey = (pos: Position): number => portal.cellKey(pos);

  /** Кто стоит на клетке: индекс кубика по `y * width + x`. */
  const occupied = new Map<number, number>();
  boxes.forEach((box, index) => occupied.set(cellKey(box.pos), index));

  const maxTicks = level.width * level.height * 4 + 16;
  let moved = false;
  let swaps = 0;

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
      run.points?.push({ pos: run.pos.clone() });
      occupied.set(cellKey(run.pos), want.index);
      moved = true;
    }

    // Эффекты клеток — после того как все сдвинулись: переключатели и ловушки
    // обрабатываются в порядке кубиков, чтобы ход был детерминированным.
    // Портал — исключение: входы копятся и решаются одним проходом, потому что
    // два кубика на парных порталах меняются местами.
    const arrivals: PortalArrival[] = [];
    for (const want of advancing) {
      const run = runs[want.index];
      if (PortalRule.isEntrance(want.cell)) {
        arrivals.push({ index: want.index, cell: want.cell });
        continue;
      }
      switch (cellEffect(want.cell)) {
        case CellEffect.TRAP:
          nextState.locks[want.index] = trapLockTurns(want.cell);
          run.moving = false;
          break;
        case CellEffect.SWITCH:
          nextState.rotorFlip = !nextState.rotorFlip;
          break;
        case CellEffect.GYRO_CW:
          run.heading = rotate(run.heading, !nextState.rotorFlip);
          break;
        case CellEffect.GYRO_CCW:
          run.heading = rotate(run.heading, nextState.rotorFlip);
          break;
        case CellEffect.ROTOR_ELBOW: {
          const elbow = rotorElbow(want.cell);
          if (
            elbow &&
            elbow.entry.x === run.heading.x &&
            elbow.entry.y === run.heading.y
          ) {
            const exit = rotorElbowExit(want.cell, nextState.rotorFlip);
            if (exit) run.heading = new Position(exit.x, exit.y);
          }
          break;
        }
        case CellEffect.NONE:
          break;
      }
    }
    swaps += portal.resolve(runs, occupied, arrivals, locked);

    // Упёршиеся кубики больше не поедут: стена, односторонняя клетка и стоящий
    // сосед за ход не сдвинутся.
    for (const index of blocked) runs[index].moving = false;
  }

  const newBoxes: Box[] = runs.map((run, index) => ({
    pos: run.pos,
    color: boxes[index].color,
  }));
  const paths: PathPoint[][] = recordPaths
    ? runs.map((run) => (run.points && run.points.length > 1 ? run.points : []))
    : [];

  // Если хотя бы один кубик был свободен, но не сдвинулся (стена, сосед,
  // односторонняя клетка), это не ход: ловушка не должна тикать от нажатия
  // в стену. Ждать можно только когда заперты все кубики.
  const allLocked = boxes.length > 0 && locked.every(Boolean);
  if (!moved && !allLocked) return null;

  return {
    boxes: newBoxes,
    mechanicState: nextState,
    portalSwaps: swaps,
    paths,
  };
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
 *   направлении, а если на выходе стоит другой кубик — они меняются местами
 *   (все правила телепорта — в `rules/portal.ts`);
 * - ловушка останавливает кубик и отнимает один или два следующих хода;
 * - направленный угол поворачивает движение, только если кубик въехал со
 *   стороны входа; с других сторон клетка работает как обычный пол;
 * - гироскоп всегда поворачивает движение на 90°;
 * - переключатель переворачивает все углы и гироскопы;
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
  const simulation = simulate(level, boxes, dir, state, true);
  if (!simulation) return null;

  return {
    level,
    boxes: simulation.boxes,
    moves: curMoves + 1,
    time: curTime,
    mechanicState: simulation.mechanicState,
    paths: simulation.paths,
    portalSwaps: simulation.portalSwaps,
  };
}

/**
 * Тот же ход без игровой обвязки: только позиции кубиков, состояние механик и
 * признак обмена. Ни `moves`/`time`, ни траектории для анимации не создаются.
 * Решатель, подсказка и генератор ходят через эту функцию.
 */
export function stepBoxes(
  level: Level,
  boxes: Box[],
  dir: Position,
  state: MechanicState = createMechanicState(boxes.length),
): StepResult | null {
  const simulation = simulate(level, boxes, dir, state, false);
  if (!simulation) return null;
  return {
    boxes: simulation.boxes,
    mechanicState: simulation.mechanicState,
    portalSwaps: simulation.portalSwaps,
  };
}

/** Может ли быть совершён хотя бы один ход. */
export function canMoveAny(
  level: Level,
  boxes: Box[],
  dir: Position,
  state?: MechanicState,
): boolean {
  return stepBoxes(level, boxes, dir, state) !== null;
}
