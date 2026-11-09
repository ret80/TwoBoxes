import type { Box } from '../../types/entity';
import type { Level } from '../../types/level';
import {
  createMechanicState,
  type MechanicState,
} from '../../types/mechanic-state';
import { DIRS, Position } from '../../types/position';
import { checkWin } from '../../rules/check';
import { stepBoxes } from './step';
import { stateKey } from './state';

/**
 * Один обход пространства состояний на все задачи генератора.
 *
 * Раньше BFS был продублирован трижды (`findShortestSolution`, `solveLevel`,
 * `hint.findHint`) с разными пределами и разными ключами состояния. Здесь три
 * режима одного обхода:
 *
 * - `shortest` — остановиться на первой победе: нужен для «есть ли обход»;
 * - `analyze` — обойти весь граф: решение, тупики, ветвление, метрики;
 * - `firstMove` — первое направление кратчайшего решения (подсказка).
 *
 * Результат различает три исхода (`Analysis`): решение, доказанное отсутствие
 * решения и «граф больше предохранителя». Последнее нельзя трактовать как
 * нерешаемость — именно на этом раньше строилось ложное «уровень проходится
 * только обменом».
 */

export interface GraphStats {
  /** Сколько состояний достижимо из старта. */
  states: number;
  /** Сколько рёбер обойдено (включая повторные). */
  edges: number;
  /** Сколько достижимых состояний уже не могут привести к победе. */
  deadEnds: number;
  /** Среднее число доступных ходов из достижимого состояния. */
  branching: number;
  /** Сколько достижимых состояний уже являются победой. */
  winStates: number;
  /** Сколько кратчайших решений существует. */
  shortestCount: number;
}

export interface SolvedAnalysis extends GraphStats {
  kind: 'solved';
  /** Кратчайшее решение от стартовой позиции. */
  solution: Position[];
  /** Сколько обменов местами через портал в кратчайшем решении. */
  swaps: number;
  /** Сколько раз в кратчайшем решении сдвинулся каждый кубик. */
  movesByBox: [number, number];
}

export interface UnsolvableAnalysis {
  kind: 'unsolvable';
  /** Сколько состояний успели обойти (для диагностики). */
  states: number;
}

export interface TooLargeAnalysis {
  kind: 'tooLarge';
  /** Сколько состояний успели обойти до предохранителя. */
  explored: number;
}

/**
 * Первое (кратчайшее) решение вышло за разрешённую полосу ходов. Дальше граф
 * можно не обходить: тупики и ветвление отбракованному кандидату не нужны.
 */
export interface OutOfRangeAnalysis {
  kind: 'tooShort' | 'tooLong';
  /** Длина найденного кратчайшего решения. */
  moves: number;
  states: number;
}

export type Analysis =
  | SolvedAnalysis
  | UnsolvableAnalysis
  | TooLargeAnalysis
  | OutOfRangeAnalysis;

/** Настройки поиска решения. */
export interface AnalysisOptions {
  /** Предохранитель от зависания на больших полях. */
  maxStates?: number;
  /**
   * Не разрешать ходы, в которых кубики меняются местами через портал. Так
   * проверяется, что уровень проходим только обменом.
   */
  forbidPortalSwaps?: boolean;
  /** Стартовое состояние механик (по умолчанию — чистое). */
  initialState?: MechanicState;
  /**
   * Нижняя граница длины решения. Кратчайшее решение короче — сразу
   * `tooShort`, полный обход не нужен.
   */
  minSolutionLength?: number;
  /** Верхняя граница длины решения: длиннее — сразу `tooLong`. */
  maxSolutionLength?: number;
}

const DIRECTIONS = [DIRS.up, DIRS.down, DIRS.left, DIRS.right];
const DEFAULT_MAX_STATES = 200_000;

interface Node {
  boxes: Box[];
  state: MechanicState;
  key: number;
  depth: number;
  parent: number;
  dir: Position | null;
  paths: number;
}

function cloneBoxes(boxes: readonly Box[]): Box[] {
  return boxes.map((box) => ({ pos: box.pos.clone(), color: box.color }));
}

function cloneState(state: MechanicState | undefined, boxCount: number): MechanicState {
  return state
    ? { locks: [...state.locks], rotorFlip: state.rotorFlip }
    : createMechanicState(boxCount);
}

function restoreSolution(nodes: Node[], goal: number): Position[] {
  const solution: Position[] = [];
  for (let index = goal; index >= 0; index = nodes[index].parent) {
    const dir = nodes[index].dir;
    if (!dir) break;
    solution.push(dir);
  }
  return solution.reverse();
}

interface SearchResult {
  analysis: Analysis;
  nodes: Node[];
}

/**
 * Общий BFS. `full` обходит весь достижимый граф и считает тупики; иначе
 * останавливается на первой победе.
 */
function search(
  level: Level,
  startBoxes: Box[],
  initialState: MechanicState,
  options: AnalysisOptions,
  full: boolean,
): SearchResult {
  const maxStates = options.maxStates ?? DEFAULT_MAX_STATES;
  const width = level.width;
  const cells = level.width * level.height;
  const keyOf = (boxes: readonly Box[], state: MechanicState): number =>
    stateKey(boxes, state, width, cells);

  const start: Node = {
    boxes: cloneBoxes(startBoxes),
    state: cloneState(initialState, startBoxes.length),
    key: 0,
    depth: 0,
    parent: -1,
    dir: null,
    paths: 1,
  };
  start.key = keyOf(start.boxes, start.state);

  const nodes: Node[] = [start];
  const visited = new Map<number, number>([[start.key, 0]]);
  // Все рёбра графа нужны для честного обратного обхода тупиков: путь к
  // победе может идти не только по дереву BFS.
  const outgoing: number[][] | null = full ? [] : null;
  let head = 0;
  let edges = 0;
  let firstWin = -1;
  let firstWinDepth = -1;
  let winStates = 0;
  let shortestCount = 0;

  while (head < nodes.length) {
    const nodeIndex = head;
    const node = nodes[head++];

    if (checkWin(node.boxes, level.ends)) {
      winStates++;
      if (firstWin < 0) {
        firstWin = head - 1;
        firstWinDepth = node.depth;
      }
      if (node.depth === firstWinDepth) shortestCount += node.paths;
      if (full && firstWin === nodeIndex) {
        // BFS нашёл кратчайшее решение. Если оно вне полосы профиля — это
        // окончательный отказ, и весь граф обходить незачем.
        if (
          options.maxSolutionLength !== undefined &&
          node.depth > options.maxSolutionLength
        ) {
          return {
            analysis: { kind: 'tooLong', moves: node.depth, states: visited.size },
            nodes,
          };
        }
        if (
          options.minSolutionLength !== undefined &&
          node.depth < options.minSolutionLength
        ) {
          return {
            analysis: { kind: 'tooShort', moves: node.depth, states: visited.size },
            nodes,
          };
        }
      }
      if (!full) {
        return {
          analysis: solved(nodes, nodeIndex, visited.size, edges, 1, 1, level, false, null),
          nodes,
        };
      }
    }

    for (const dir of DIRECTIONS) {
      const next = stepBoxes(level, node.boxes, dir, node.state);
      if (!next) continue;
      if (options.forbidPortalSwaps && next.portalSwaps) continue;

      const nextState = next.mechanicState ?? node.state;
      const nextKey = keyOf(next.boxes, nextState);
      const known = visited.get(nextKey);

      edges++;
      if (known !== undefined) {
        if (outgoing) (outgoing[nodeIndex] ??= []).push(known);
        // Пути считаем только кратчайшие: ребро из глубины d в состояние
        // глубины d+1 — часть кратчайшего маршрута, остальные — обходные.
        if (full && nodes[known].depth === node.depth + 1) {
          nodes[known].paths += node.paths;
        }
        continue;
      }
      if (visited.size >= maxStates) {
        return {
          analysis: { kind: 'tooLarge', explored: visited.size },
          nodes,
        };
      }

      const index = nodes.length;
      if (outgoing) (outgoing[nodeIndex] ??= []).push(index);
      const child: Node = {
        boxes: next.boxes,
        state: nextState,
        key: nextKey,
        depth: node.depth + 1,
        parent: nodeIndex,
        dir,
        paths: node.paths,
      };
      visited.set(nextKey, index);
      nodes.push(child);

      if (!full && checkWin(child.boxes, level.ends)) {
        return {
          analysis: solved(nodes, index, visited.size, edges, 1, 1, level, false, null),
          nodes,
        };
      }
    }
  }

  if (firstWin < 0) {
    return {
      analysis: { kind: 'unsolvable', states: visited.size },
      nodes,
    };
  }

  return {
    analysis: solved(
      nodes,
      firstWin,
      visited.size,
      edges,
      winStates,
      shortestCount,
      level,
      true,
      outgoing,
    ),
    nodes,
  };
}

/** Собрать результат решения: воспроизвести путь и посчитать тупики. */
function solved(
  nodes: Node[],
  goal: number,
  states: number,
  edges: number,
  winStates: number,
  shortestCount: number,
  level: Level,
  full: boolean,
  outgoing: number[][] | null,
): SolvedAnalysis {
  const solution = restoreSolution(nodes, goal);

  // Тупики: состояния, из которых победа недостижима. Обратный обход от
  // победных состояний по тем же рёбрам. Для режима `shortest` граф неполный,
  // поэтому тупики не считаются (0).
  let deadEnds = 0;
  if (full && outgoing) {
    const reverse: number[][] = Array.from({ length: nodes.length }, () => []);
    for (let index = 0; index < outgoing.length; index++) {
      for (const to of outgoing[index] ?? []) reverse[to].push(index);
    }
    const canWin = new Set<number>();
    const queue: number[] = [];
    for (let index = 0; index < nodes.length; index++) {
      if (checkWin(nodes[index].boxes, level.ends)) {
        canWin.add(index);
        queue.push(index);
      }
    }
    for (let head = 0; head < queue.length; head++) {
      for (const parent of reverse[queue[head]]) {
        if (canWin.has(parent)) continue;
        canWin.add(parent);
        queue.push(parent);
      }
    }
    deadEnds = states - canWin.size;
  }

  const { swaps, movesByBox } = replay(level, nodes[0].boxes, solution);

  return {
    kind: 'solved',
    solution,
    swaps,
    movesByBox,
    states,
    edges,
    deadEnds,
    branching: states > 0 ? edges / states : 0,
    winStates,
    shortestCount,
  };
}

/** Пройти решение теми же правилами и собрать метрики хода. */
function replay(
  level: Level,
  startBoxes: Box[],
  solution: Position[],
): { swaps: number; movesByBox: [number, number] } {
  let boxes = cloneBoxes(startBoxes);
  let state = createMechanicState(boxes.length);
  let swaps = 0;
  const movesByBox: [number, number] = [0, 0];

  for (const dir of solution) {
    const next = stepBoxes(level, boxes, dir, state);
    if (!next) break;
    swaps += next.portalSwaps ?? 0;
    next.boxes.forEach((box, index) => {
      if (!boxes[index].pos.equals(box.pos)) movesByBox[index]++;
    });
    boxes = next.boxes;
    state = next.mechanicState ?? state;
  }

  return { swaps, movesByBox };
}

/**
 * Кратчайшее решение с ранним выходом. `tooLarge` означает, что обход не
 * доказал нерешаемость.
 */
export function analyzeShortest(level: Level, options: AnalysisOptions = {}): Analysis {
  return analyzeShortestFrom(level, level.boxes, undefined, options);
}

/** Кратчайшее решение из произвольной позиции (подсказка, обходы механик). */
export function analyzeShortestFrom(
  level: Level,
  boxes: readonly Box[],
  initialState?: MechanicState,
  options: AnalysisOptions = {},
): Analysis {
  if (boxes.length === 0) return { kind: 'unsolvable', states: 0 };
  return search(level, [...boxes], cloneState(initialState, boxes.length), options, false)
    .analysis;
}

/** Полный обход: решение, тупики и метрики графа. */
export function analyzeLevel(level: Level, options: AnalysisOptions = {}): Analysis {
  if (level.boxes.length === 0) return { kind: 'unsolvable', states: 0 };
  return search(level, level.boxes, createMechanicState(level.boxes.length), options, true)
    .analysis;
}

/**
 * Первое направление кратчайшего решения из произвольной позиции — для
 * подсказки. `null`, если решения нет или граф слишком велик.
 */
export function firstMoveOfSolution(
  level: Level,
  boxes: Box[],
  initialState?: MechanicState,
  options: AnalysisOptions = {},
): Position | null {
  if (boxes.length === 0) return null;
  const result = search(level, boxes, cloneState(initialState, boxes.length), options, false)
    .analysis;
  if (result.kind !== 'solved') return null;
  return result.solution[0] ?? null;
}
