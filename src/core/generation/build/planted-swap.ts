import { CellType } from '../../types/cell';
import type { Box } from '../../types/entity';
import { createMechanicState } from '../../types/mechanic-state';
import { DIRS, Position } from '../../types/position';
import { createLevelFromMask } from '../../rules/create';
import { moveBoxes } from '../../rules/move';
import { analyzeLevel, analyzeShortest } from '../check/analyzer';
import { scoreDifficulty } from '../difficulty';
import { render } from '../field/render';
import { createRng, mixSeed } from '../rng';
import { continueWalk } from './walk-builder';
import type { SwapBuildOptions, SwapLevel } from './swap-builder';

/**
 * Посадка обмена: уровень строится не перебором случайных комнат, а от точной
 * позиционной идеи (исследование 08.11, §4).
 *
 * Два кубика стоят в колонке над входом `a`; выход `b` — на нижней строке
 * комнаты, за ним стена. Первый ход вниз:
 * 1. верхний кубик въезжает в `a`, переносится на `b` и паркуется там;
 * 2. второй доезжает до `a`, выход занят — кубики меняются местами.
 *
 * Обмен гарантирован в решении за один ход. Обязательность обмена всё равно
 * проверяет решатель (`forbidPortalSwaps`), но доля пригодных кандидатов на
 * порядки выше случайной комнаты: 13–22% против ~0.25%.
 */

interface PlantedCandidate {
  mask: Uint8Array;
  cells: Map<number, CellType>;
  starts: Position[];
  level: ReturnType<typeof createLevelFromMask>;
}

/** Комната без внутренних стенок: важна геометрия вокруг выхода, а не стены. */
function plantedRoom(
  size: number,
): { mask: Uint8Array; inner: number; originX: number; originY: number } | null {
  const inner = Math.min(5, Math.max(4, size - 4));
  if (size < inner + 2) return null;
  const originX = Math.floor((size - inner) / 2);
  const originY = Math.floor((size - inner) / 2);
  const mask = new Uint8Array(size * size);
  for (let y = originY; y < originY + inner; y++) {
    for (let x = originX; x < originX + inner; x++) mask[y * size + x] = 1;
  }
  return { mask, inner, originX, originY };
}

function buildPlantedCandidate(size: number, rng: () => number): PlantedCandidate | null {
  const room = plantedRoom(size);
  if (!room) return null;
  const { mask, inner, originX, originY } = room;
  if (inner < 4) return null;

  const colA = Math.floor(rng() * inner);
  let colB = Math.floor(rng() * inner);
  if (colB === colA) colB = (colB + 1) % inner;
  // Вход не на верхней строке: над ним должны поместиться два кубика.
  const rowA = 2 + Math.floor(rng() * (inner - 2));
  const rowB = inner - 1;

  const ax = originX + colA;
  const ay = originY + rowA;
  const bx = originX + colB;
  const by = originY + rowB;
  // Портал вплотную к парному выглядит как один широкий портал.
  if (Math.abs(ax - bx) + Math.abs(ay - by) < 2) return null;

  const starts = [new Position(ax, ay - 1), new Position(ax, ay - 2)];
  const cells = new Map<number, CellType>([
    [ay * size + ax, CellType.PORTAL_A],
    [by * size + bx, CellType.PORTAL_B],
  ]);

  return {
    mask,
    cells,
    starts,
    level: createLevelFromMask(mask, size, starts, [], cells),
  };
}

function portalCell(level: ReturnType<typeof createLevelFromMask>, pos: Position): boolean {
  const cell = level.grid.get(pos);
  return cell === CellType.PORTAL_A || cell === CellType.PORTAL_B;
}

export function buildPlantedSwap(options: SwapBuildOptions): SwapLevel | null {
  const size = Math.max(8, options.size ?? 8);
  const maxMoves = Math.max(2, options.maxMoves ?? options.moves + 3);
  const minMoves = Math.max(2, Math.min(options.moves, 4));
  const allowedDeadEnds = options.deadEnds ?? 0;

  for (let attempt = 0; attempt < 300; attempt++) {
    const rng = createRng(mixSeed(options.seed, attempt, 0x9a71));
    const planted = buildPlantedCandidate(size, rng);
    if (!planted) continue;

    // Первый ход — сама посадка обмена. Если движок его не подтвердил,
    // кандидат бесполезен: остальное построение ничего не гарантирует.
    const boxes: Box[] = planted.level.boxes.map((box) => ({
      pos: box.pos.clone(),
      color: box.color,
    }));
    const first = moveBoxes(planted.level, boxes, DIRS.down, 0, 0);
    if (!first || (first.portalSwaps ?? 0) < 1) continue;

    // После посадки растём вперёд тем же блужданием: цели ставим там, где
    // кубики остановились. Длина 1..3 хода после обмена.
    const forward = 1 + Math.floor(rng() * 3);
    const walk = continueWalk(
      planted.level,
      first.boxes,
      first.mechanicState ?? createMechanicState(2),
      forward,
      rng,
      true,
    );
    if (!walk || walk.dirs.length !== forward) continue;

    const ends = walk.boxes.map((box) => box.pos.clone());
    const all = [...planted.starts, ...ends];
    if (new Set(all.map((pos) => `${pos.x},${pos.y}`)).size !== all.length) continue;
    // Цель на портале затирает механику в карте — такой уровень не годится.
    if (ends.some((end) => portalCell(planted.level, end))) continue;

    const finalLevel = createLevelFromMask(
      planted.mask,
      planted.level.width,
      planted.starts,
      ends,
      planted.cells,
    );

    const solved = analyzeLevel(finalLevel);
    if (solved.kind !== 'solved') continue;
    if (solved.solution.length < minMoves || solved.solution.length > maxMoves) continue;
    if (solved.swaps === 0) continue;
    if (solved.movesByBox[0] < 1 || solved.movesByBox[1] < 1) continue;

    const deadEndRatio = solved.states > 0 ? solved.deadEnds / solved.states : 0;
    if (deadEndRatio > allowedDeadEnds) continue;

    const bypass = analyzeShortest(finalLevel, { forbidPortalSwaps: true });
    if (bypass.kind !== 'unsolvable') continue;

    const rows = render(planted.mask, planted.level.width, planted.starts, ends, planted.cells);
    const score = scoreDifficulty({
      moves: solved.solution.length,
      states: solved.states,
      deadEndRatio,
      branching: solved.branching,
    });

    return {
      rows,
      solution: solved.solution,
      score,
      deadEndRatio,
      mechanics: ['portal'],
    };
  }

  return null;
}
