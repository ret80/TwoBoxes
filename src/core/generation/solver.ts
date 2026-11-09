import type { Level } from '../types/level';
import type { MechanicState } from '../types/mechanic-state';
import { Position } from '../types/position';
import {
  analyzeLevel,
  analyzeShortestFrom,
  type Analysis,
} from './check/analyzer';

/**
 * Публичные обёртки над единым анализатором.
 *
 * Когда-то здесь жил собственный BFS, а `level-generator.ts` и `hint.ts`
 * держали ещё две его копии. Теперь обход один (`check/analyzer.ts`), а этот
 * модуль сохраняет прежние имена для вызывающих: `findShortestSolution` и
 * `solveLevel` возвращают `null` там, где старый контракт не различал
 * «нерешаемо» и «слишком большой граф». Новый код должен использовать
 * `analyzeLevel`/`analyzeShortest` и различать исходы.
 */

export type { Analysis, AnalysisOptions, GraphStats } from './check/analyzer';

export interface SolvedLevel {
  /** Кратчайшее решение от стартовой позиции. */
  solution: Position[];
  /** Сколько обменов местами через портал в кратчайшем решении. */
  swaps: number;
  /** Сколько состояний достижимо из старта. */
  states: number;
  /** Сколько достижимых состояний уже не могут привести к победе. */
  deadEnds: number;
  /** Сколько раз в кратчайшем решении сдвинулся каждый кубик. */
  movesByBox: [number, number];
  /** Среднее число доступных ходов из достижимого состояния. */
  branching: number;
  /** Сколько достижимых состояний уже являются победой. */
  winStates: number;
  /** Сколько кратчайших решений существует. */
  shortestCount: number;
}

/** Настройки поиска решения (прежний контракт). */
export interface SearchOptions {
  /** Предохранитель от зависания на больших полях. */
  maxStates?: number;
  /**
   * Не разрешать ходы, в которых кубики меняются местами через портал. Так
   * генератор проверяет, что уровень проходим только обменом.
   */
  forbidPortalSwaps?: boolean;
}

function toSolved(analysis: Analysis): SolvedLevel | null {
  if (analysis.kind !== 'solved') return null;
  return {
    solution: analysis.solution,
    swaps: analysis.swaps,
    states: analysis.states,
    deadEnds: analysis.deadEnds,
    movesByBox: analysis.movesByBox,
    branching: analysis.branching,
    winStates: analysis.winStates,
    shortestCount: analysis.shortestCount,
  };
}

/**
 * Дешёвый поиск самого короткого решения с ранним выходом. `null` — решения
 * нет **или** обход упёрся в предохранитель; для различимых исходов
 * используйте `analyzeShortest`.
 */
export function findShortestSolution(
  level: Level,
  initialState?: MechanicState,
  options: SearchOptions = {},
): Position[] | null {
  const analysis = analyzeShortestFrom(level, level.boxes, initialState, options);
  return analysis.kind === 'solved' ? analysis.solution : null;
}

/**
 * Полный обход пространства состояний. `null` — решения нет **или** поиск
 * упёрся в предохранитель `maxStates`.
 */
export function solveLevel(
  level: Level,
  maxStates?: number,
): SolvedLevel | null {
  return toSolved(analyzeLevel(level, { maxStates }));
}

export { analyzeLevel, analyzeShortestFrom };
