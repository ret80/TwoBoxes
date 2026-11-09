import { CellType } from '../../types/cell';
import { Position } from '../../types/position';
import { analyzeLevel, analyzeShortest } from '../check/analyzer';
import { scoreDifficulty } from '../difficulty';
import { largestFloorComponent } from '../field/mask';
import { parse, render } from '../field/render';
import type { MechanicId } from '../mechanics';
import { createRng, mixSeed, shuffle } from '../rng';
import { buildPlantedSwap } from './planted-swap';

/**
 * Уровень, который проходится **только** обменом кубиков через портал.
 *
 * Случайное блуждание таких уровней почти не даёт: порталы должны стоять
 * вплотную к маршруту, а кубики — мешать друг другу. Поэтому здесь
 * перебираются маленькие комнаты с парой порталов, стартами и целями, и каждый
 * кандидат проверяется решателем:
 * - в кратчайшем решении есть обмен местами;
 * - поиск без обменов (`forbidPortalSwaps`) победу не находит.
 *
 * «Граф слишком велик» не считается доказательством: такой кандидат
 * отбрасывается, а не помечается «только обменом».
 */

export interface SwapBuildOptions {
  seed: number;
  moves: number;
  size?: number;
  maxMoves?: number;
  deadEnds?: number;
}

export interface SwapLevel {
  rows: string[];
  solution: Position[];
  score: number;
  deadEndRatio: number;
  mechanics: MechanicId[];
}

/**
 * Компактная комната для уровня-обмена: небольшой прямоугольник с парой
 * внутренних стенок. Кубики должны мешать друг другу, поэтому комната тесная:
 * в большом зале они расходятся по разным сторонам и обмен не нужен.
 */
function createSwapField(size: number, rng: () => number): Uint8Array | null {
  const inner = Math.min(5, Math.max(4, size - 4));
  const originX = Math.floor((size - inner) / 2);
  const originY = Math.floor((size - inner) / 2);
  const floor = new Uint8Array(size * size);
  for (let y = originY; y < originY + inner; y++) {
    for (let x = originX; x < originX + inner; x++) floor[y * size + x] = 1;
  }
  const walls = Math.floor(rng() * 3);
  for (let i = 0; i < walls; i++) {
    const x = originX + Math.floor(rng() * inner);
    const y = originY + Math.floor(rng() * inner);
    floor[y * size + x] = 0;
  }
  return largestFloorComponent(floor, size, 4 * 4 - 2);
}

/**
 * Кандидат уровня-обмена: комната, пара порталов, два старта и две цели в
 * случайных свободных клетках. Что из этого получилось — решает решатель.
 */
function buildSwapCandidate(size: number, rng: () => number): string[] | null {
  const floor = createSwapField(size, rng);
  if (!floor) return null;

  const free: Position[] = [];
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      if (floor[y * size + x]) free.push(new Position(x, y));
    }
  }
  if (free.length < 6) return null;
  shuffle(free, rng);

  const [pa, pb, startA, startB, endA, endB] = free;
  if (!endB) return null;
  // Портал рядом с парным порталом выглядит как один широкий портал, а не как пара.
  if (Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y) < 2) return null;

  const cells = new Map<number, CellType>([
    [pa.y * size + pa.x, CellType.PORTAL_A],
    [pb.y * size + pb.x, CellType.PORTAL_B],
  ]);
  return render(floor, size, [startA, startB], [endA, endB], cells);
}

function buildRandomSwap(options: SwapBuildOptions): SwapLevel | null {
  const size = Math.max(8, options.size ?? 8);
  const maxMoves = Math.max(2, options.maxMoves ?? options.moves + 3);
  const minMoves = Math.max(2, Math.min(options.moves, 4));
  const allowedDeadEnds = options.deadEnds ?? 1;

  for (let attempt = 0; attempt < 400; attempt++) {
    const rng = createRng(mixSeed(options.seed, attempt, 0x5a17));
    const rows = buildSwapCandidate(size, rng);
    if (!rows) continue;

    const level = parse(rows);
    if (level.boxes.length !== 2 || level.ends.length !== 2) continue;

    const solved = analyzeLevel(level);
    if (solved.kind !== 'solved') continue;
    if (solved.solution.length < minMoves || solved.solution.length > maxMoves) continue;
    if (solved.swaps === 0) continue;
    if (solved.movesByBox[0] < 1 || solved.movesByBox[1] < 1) continue;

    const deadEndRatio = solved.states > 0 ? solved.deadEnds / solved.states : 0;
    if (deadEndRatio > allowedDeadEnds) continue;

    const bypass = analyzeShortest(level, { forbidPortalSwaps: true });
    if (bypass.kind !== 'unsolvable') continue;

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

/**
 * Посадка обмена — основной способ, случайная комната — запасной.
 * Посадка даёт пригодный уровень в 13–22% кандидатов против ~0.25%, поэтому
 * сначала пробуем её; перебор остаётся для случаев, когда геометрия посадки
 * не сложилась.
 */
export function buildSwapLevel(options: SwapBuildOptions): SwapLevel | null {
  return buildPlantedSwap(options) ?? buildRandomSwap(options);
}
