import type { CellType } from '../../types/cell';
import { ColorType } from '../../types/color';
import type { Box } from '../../types/entity';
import type { PathPoint } from '../../types/game-state';
import type { Level } from '../../types/level';
import {
  createMechanicState,
  type MechanicState,
} from '../../types/mechanic-state';
import { DIRS, Position } from '../../types/position';
import { createLevelFromMask } from '../../rules/create';
import { moveBoxes } from '../../rules/move';
import { createField } from '../field/room';
import { render } from '../field/render';
import { assembleField } from '../patterns';
import { createRng, mixSeed, shuffle } from '../rng';
import type { RouteCell } from '../mechanics';
import type { BuildContext, BuildOutcome, Candidate } from './types';

/**
 * Строитель «от решения»: выбираем старты, блуждаем кубиками и ставим цели
 * там, где они остановились.
 *
 * Отличие от прежнего конвейера — порядок механик. Раньше они раскладывались
 * по случайным клеткам **до** маршрута, а приёмка требовала, чтобы маршрут их
 * задел. Это лотерея: для переключателя и ловушки вероятность попадания мала,
 * и генератор сотни раз платил полный BFS за проигранный билет. Теперь:
 *
 * 1. чистое блуждание даёт маршрут;
 * 2. механики ставятся **на клетки маршрута** (с ограничениями модуля);
 * 3. блуждание повторяется уже с механиками — цели снова стоят там, где
 *    кубики реально остановились.
 *
 * Приёмка не ослабляется: решатель по-прежнему независимо проверяет уровень.
 */

const OPPOSITE: Record<string, string> = {
  '0,-1': '0,1',
  '0,1': '0,-1',
  '-1,0': '1,0',
  '1,0': '-1,0',
};

const positionKey = (pos: Position): string => `${pos.x},${pos.y}`;

const walkKey = (boxes: Box[], state: MechanicState): string =>
  `${boxes.map((box) => positionKey(box.pos)).join('|')}#` +
  `${state.locks.join(',')}#${state.rotorFlip ? 1 : 0}`;

const indexOf = (pos: Position, size: number): number => pos.y * size + pos.x;

function stateChanged(before: MechanicState, after: MechanicState): boolean {
  if (before.rotorFlip !== after.rotorFlip) return true;
  if (before.locks.length !== after.locks.length) return true;
  for (let i = 0; i < before.locks.length; i++) {
    if (before.locks[i] !== after.locks[i]) return true;
  }
  return false;
}

export interface Walk {
  dirs: Position[];
  boxes: Box[];
  route: RouteCell[];
}

interface WalkCandidate {
  dir: Position;
  distance: number;
  boxes: Box[];
  state: MechanicState;
  moved: boolean;
  paths: PathPoint[][];
}

/**
 * Продолжить блуждание из готовой позиции. Нужно и обычному строителю, и
 * посадке обмена: там первый ход уже сделан вручную, а маршрут растёт дальше.
 */
export function continueWalk(
  level: Level,
  startBoxes: Box[],
  startState: MechanicState,
  steps: number,
  rng: () => number,
  allowWait: boolean,
): Walk | null {
  let boxes: Box[] = startBoxes.map((box) => ({
    pos: box.pos.clone(),
    color: box.color,
  }));
  let state = {
    locks: [...startState.locks],
    rotorFlip: startState.rotorFlip,
  };
  const dirs: Position[] = [];
  const route: RouteCell[] = [];
  const visited = new Set<string>([walkKey(boxes, state)]);
  let last: Position | null = null;

  const candidatesFor = (allowRepeat: boolean): WalkCandidate[] => {
    const result: WalkCandidate[] = [];
    for (const dir of [DIRS.up, DIRS.down, DIRS.left, DIRS.right]) {
      if (last && !allowRepeat && positionKey(dir) === positionKey(last)) continue;
      if (last && positionKey(dir) === OPPOSITE[positionKey(last)]) continue;
      const next = moveBoxes(level, boxes, dir, 0, 0, state);
      if (!next) continue;

      const moved = next.paths?.some((path) => path.length > 1) ?? false;
      const nextState = next.mechanicState ?? state;
      if (!moved) {
        // Ход-пропуск полезен только когда он реально меняет состояние
        // (истекла ловушка/переключатель); иначе это пустой цикл.
        if (!allowWait || !stateChanged(state, nextState)) continue;
      }
      if (visited.has(walkKey(next.boxes, nextState))) continue;

      let distance = 0;
      next.boxes.forEach((box, index) => {
        distance +=
          Math.abs(box.pos.x - boxes[index].pos.x) +
          Math.abs(box.pos.y - boxes[index].pos.y);
      });
      result.push({
        dir,
        distance,
        boxes: next.boxes,
        state: nextState,
        moved,
        paths: next.paths ?? [],
      });
    }
    return result;
  };

  for (let step = 0; step < steps; step++) {
    let candidates = candidatesFor(false);
    // Если все направления исключены — разрешаем повтор, но не разворот.
    if (candidates.length === 0 && last) candidates = candidatesFor(true);
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.distance - a.distance);
    const found = candidates[Math.floor(rng() * Math.min(3, candidates.length))];

    if (found.moved) {
      // Маршрут — все клетки, которые проехали кубики, с направлением входа.
      // Вторая механика ставится именно сюда, а не в случайную клетку.
      for (let box = 0; box < found.paths.length; box++) {
        const path = found.paths[box];
        for (let i = 1; i < path.length; i++) {
          const pos = path[i].pos;
          route.push({
            index: pos.y * level.width + pos.x,
            dir: found.dir,
            box,
            step: dirs.length,
          });
        }
      }
    }

    boxes = found.boxes;
    state = found.state;
    visited.add(walkKey(boxes, state));
    last = found.dir;
    dirs.push(found.dir);
  }

  return { dirs, boxes, route };
}

/** Случайное блуждание «от решения» из стартов. */
function walk(
  level: Level,
  starts: Position[],
  steps: number,
  rng: () => number,
  allowWait: boolean,
): Walk | null {
  const boxes: Box[] = starts.map((pos, index) => ({
    pos: pos.clone(),
    color: index === 0 ? ColorType.ONE : ColorType.TWO,
  }));
  return continueWalk(level, boxes, createMechanicState(boxes.length), steps, rng, allowWait);
}

/** Свободные клетки поля, не занятые механиками. */
export function freePositions(floor: Uint8Array, size: number): Position[] {
  const result: Position[] = [];
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      if (floor[y * size + x]) result.push(new Position(x, y));
    }
  }
  return result;
}

export function pickStarts(free: Position[], rng: () => number): Position[] | null {
  shuffle(free, rng);
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      if (free[i].equals(free[j])) continue;
      const distance =
        Math.abs(free[i].x - free[j].x) + Math.abs(free[i].y - free[j].y);
      if (distance < 2) continue;
      return [free[i].clone(), free[j].clone()];
    }
  }
  return null;
}

/** Собрать поле: паттерны эпизода или случайная комната. */
export function buildField(
  ctx: BuildContext,
  rng: () => number,
): { floor: Uint8Array; size: number } | null {
  if (ctx.patterns.length === 0) {
    const floor = createField(ctx.size, rng);
    return floor ? { floor, size: ctx.size } : null;
  }
  const assembled = assembleField({
    size: ctx.size,
    budget: ctx.budget,
    patterns: ctx.patterns,
    rng,
  });
  return assembled ? { floor: assembled.mask, size: assembled.size } : null;
}

/** Построить кандидата обычным блужданием с механиками на маршруте. */
export function buildWalkCandidate(ctx: BuildContext): BuildOutcome {
  const rng = createRng(mixSeed(ctx.seed, ctx.attempt, 0x51ed));

  const field = buildField(ctx, rng);
  if (!field) return { ok: false, reason: 'no-field' };
  const { floor, size } = field;

  const free = freePositions(floor, size);
  if (free.length < 4) return { ok: false, reason: 'no-starts' };
  const starts = pickStarts(free, rng);
  if (!starts) return { ok: false, reason: 'no-starts' };

  // Первое блуждание — по чистому полю: нужно узнать, где вообще ходят кубики,
  // и только потом ставить туда механики.
  const clean = createLevelFromMask(floor, size, starts, [], new Map());
  const cleanWalk = walk(clean, starts, ctx.walkMoves, rng, false);
  if (!cleanWalk || cleanWalk.dirs.length !== ctx.walkMoves) {
    return { ok: false, reason: 'walk-failed' };
  }

  const cleanEnds = cleanWalk.boxes.map((box) => box.pos.clone());
  const reserved = new Set(
    [...starts, ...cleanEnds].map((pos) => indexOf(pos, size)),
  );

  const draft = {
    size,
    floor,
    cells: new Map<number, CellType>(),
    route: cleanWalk.route,
    reserved,
    progress: ctx.progress,
    switchGate: ctx.switchGate,
  };

  for (const module of ctx.modules) {
    if (!module.place(draft, rng)) return { ok: false, reason: 'mechanic-space' };
  }

  // Второе блуждание — уже с механиками: цели снова там, где кубики встали,
  // поэтому записанный путь действительно проходит уровень.
  const staged = createLevelFromMask(floor, size, starts, [], draft.cells);
  const walked = walk(staged, starts, ctx.walkMoves, rng, true);
  if (!walked || walked.dirs.length !== ctx.walkMoves) {
    return { ok: false, reason: 'walk-failed' };
  }

  const ends = walked.boxes.map((box) => box.pos.clone());
  const all = [...starts, ...ends];
  if (new Set(all.map(positionKey)).size !== all.length) {
    return { ok: false, reason: 'walk-failed' };
  }
  // Маркер цели затирает клетку механики: такой кандидат не годится.
  if (ends.some((end) => draft.cells.has(indexOf(end, size)))) {
    return { ok: false, reason: 'end-on-mechanic' };
  }

  const level = createLevelFromMask(floor, size, starts, ends, draft.cells);
  const rows = render(floor, size, starts, ends, draft.cells);

  const candidate: Candidate = {
    level,
    rows,
    floor,
    size,
    starts,
    ends,
    cells: draft.cells,
    modules: ctx.modules,
    walkMoves: ctx.walkMoves,
  };
  return { ok: true, candidate };
}
