import { CellType } from '../../types/cell';
import { ColorType } from '../../types/color';
import type { Position } from '../../types/position';
import { createMechanicState } from '../../types/mechanic-state';
import { createLevelFromMask } from '../../rules/create';
import { createRng, mixSeed } from '../rng';
import type { RouteCell } from '../mechanics';
import { render } from '../field/render';
import type { BuildContext, BuildOutcome, Candidate } from './types';
import {
  buildField,
  continueWalk,
  freePositions,
  pickStarts,
  type Walk,
} from './walk-builder';

const positionKey = (pos: Position): string => `${pos.x},${pos.y}`;
const indexOf = (pos: Position, size: number): number => pos.y * size + pos.x;

function boxesAt(starts: Position[]) {
  return starts.map((pos, index) => ({
    pos: pos.clone(),
    color: index === 0 ? ColorType.ONE : ColorType.TWO,
  }));
}

interface TrapGateChoice {
  index: number;
  cell: CellType;
  /** Есть ли на будущем пути запертого кубика клетка, которую посещает другой. */
  crosses: boolean;
}

/**
 * Выбрать клетку для «ворот».
 *
 * Кандидат должен лежать на пути ровно одного кубика. Приоритет — клетка,
 * после которой путь этого кубика пересекается с путём второго: задержка
 * меняет их относительный порядок, а не просто добавляет два пустых хода.
 */
function chooseGate(
  route: RouteCell[],
  floor: Uint8Array,
  progress: number,
  rng: () => number,
): TrapGateChoice | null {
  const entries = new Map<number, RouteCell[]>();
  for (const cell of route) {
    const list = entries.get(cell.index) ?? [];
    list.push(cell);
    entries.set(cell.index, list);
  }

  const candidates: TrapGateChoice[] = [];
  for (const [index, visits] of entries) {
    if (floor[index] !== 1) continue;
    const boxes = new Set(visits.map((visit) => visit.box ?? 0));
    if (boxes.size !== 1) continue;
    const box = [...boxes][0];
    const step = Math.min(...visits.map((visit) => visit.step ?? 0));

    const future = new Set(
      route
        .filter((visit) => (visit.box ?? 0) === box && (visit.step ?? 0) > step)
        .map((visit) => visit.index),
    );
    const crosses = route.some(
      (visit) => (visit.box ?? 0) !== box && future.has(visit.index),
    );
    candidates.push({
      index,
      // На ранних уровнях даже ворота щадят одним ходом; к концу эпизода
      // пересечение путей требует уже двухходовой задержки.
      cell: crosses && progress >= 0.35 ? CellType.TRAP_2 : CellType.TRAP_1,
      crosses,
    });
  }

  if (candidates.length === 0) return null;
  // Сначала настоящие пересечения, внутри группы — детерминированный выбор.
  const crossing = candidates.filter((candidate) => candidate.crosses);
  const pool = crossing.length > 0 ? crossing : candidates;
  return pool[Math.floor(rng() * pool.length)] ?? null;
}

/**
 * Строитель «ловушка как ворота».
 *
 * Отличие от обычной раскладки: ловушка ставится не на случайную клетку
 * маршрута, а в точку, где задержка может изменить порядок кубиков. Кандидат
 * всё равно проходит общую приёмку, включая `stripMechanics`: если без
 * ловушки уровень решается не длиннее, он будет отброшен.
 */
export function buildTrapGateCandidate(ctx: BuildContext): BuildOutcome {
  const rng = createRng(mixSeed(ctx.seed, ctx.attempt, 0x7a9e));
  const field = buildField(ctx, rng);
  if (!field) return { ok: false, reason: 'no-field' };
  const { floor, size } = field;

  const free = freePositions(floor, size);
  if (free.length < 4) return { ok: false, reason: 'no-starts' };
  const starts = pickStarts(free, rng);
  if (!starts) return { ok: false, reason: 'no-starts' };

  const clean = createLevelFromMask(floor, size, starts, [], new Map());
  const cleanWalk: Walk | null = continueWalk(
    clean,
    boxesAt(starts),
    createMechanicState(starts.length),
    ctx.walkMoves,
    rng,
    false,
  );
  if (!cleanWalk || cleanWalk.dirs.length !== ctx.walkMoves) {
    return { ok: false, reason: 'walk-failed' };
  }

  const cleanEnds = cleanWalk.boxes.map((box) => box.pos.clone());
  const reserved = new Set([...starts, ...cleanEnds].map((pos) => indexOf(pos, size)));
  const draft = {
    size,
    floor,
    cells: new Map<number, CellType>(),
    route: cleanWalk.route,
    reserved,
    progress: ctx.progress,
    switchGate: ctx.switchGate,
  };

  // Сначала остальные механики: они не должны занять выбранные ворота.
  for (const module of ctx.modules) {
    if (module.id === 'trap') continue;
    if (!module.place(draft, rng)) return { ok: false, reason: 'mechanic-space' };
  }

  const gate = chooseGate(
    cleanWalk.route.filter(
      (cell) =>
        draft.floor[cell.index] === 1 &&
        !draft.cells.has(cell.index) &&
        !reserved.has(cell.index),
    ),
    floor,
    ctx.progress,
    rng,
  );
  if (!gate) return { ok: false, reason: 'mechanic-space' };

  const cells = new Map(draft.cells);
  cells.set(gate.index, gate.cell);

  const staged = createLevelFromMask(floor, size, starts, [], cells);
  const walked = continueWalk(
    staged,
    boxesAt(starts),
    createMechanicState(starts.length),
    ctx.walkMoves,
    rng,
    true,
  );
  if (!walked || walked.dirs.length !== ctx.walkMoves) {
    return { ok: false, reason: 'walk-failed' };
  }
  if (!walked.route.some((cell) => cell.index === gate.index)) {
    return { ok: false, reason: 'mechanic-space' };
  }

  const ends = walked.boxes.map((box) => box.pos.clone());
  const all = [...starts, ...ends];
  if (new Set(all.map(positionKey)).size !== all.length) {
    return { ok: false, reason: 'walk-failed' };
  }
  if (ends.some((end) => cells.has(indexOf(end, size)))) {
    return { ok: false, reason: 'end-on-mechanic' };
  }

  const level = createLevelFromMask(floor, size, starts, ends, cells);
  const rows = render(floor, size, starts, ends, cells);
  const candidate: Candidate = {
    level,
    rows,
    floor,
    size,
    starts,
    ends,
    cells,
    modules: ctx.modules,
    walkMoves: ctx.walkMoves,
  };
  return { ok: true, candidate };
}
