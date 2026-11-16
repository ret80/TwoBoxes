import { CellType } from '../../types/cell';
import { createRng, mixSeed } from '../rng';
import type { RouteCell } from '../mechanics';
import type { BuildContext, BuildOutcome } from './types';
import { finishCandidate, prepareStage } from './stage';

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
    const crosses = route.some((visit) => (visit.box ?? 0) !== box && future.has(visit.index));
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

  const prepared = prepareStage(ctx, rng);
  if (!prepared.ok) return prepared;
  const { stage } = prepared;

  // Сначала остальные механики: они не должны занять выбранные ворота.
  for (const module of ctx.modules) {
    if (module.id === 'trap') continue;
    if (!module.place(stage.draft, rng)) return { ok: false, reason: 'mechanic-space' };
  }

  const free = stage.draft.route?.filter(
    (cell) =>
      stage.floor[cell.index] === 1 &&
      !stage.draft.cells.has(cell.index) &&
      !stage.draft.reserved?.has(cell.index),
  );
  const gate = chooseGate(free ?? [], stage.floor, ctx.progress, rng);
  if (!gate) return { ok: false, reason: 'mechanic-space' };
  stage.draft.cells.set(gate.index, gate.cell);

  return finishCandidate({
    ctx,
    rng,
    stage,
    // Ворота бесполезны, если новое блуждание их не задело.
    requireRoute: {
      test: (walk) => walk.route.some((cell) => cell.index === gate.index),
      reason: 'mechanic-space',
    },
  });
}
