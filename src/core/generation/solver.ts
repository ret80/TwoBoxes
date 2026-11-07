import type { Box } from '../types/entity';
import type { Level } from '../types/level';
import {
  createMechanicState,
  type MechanicState,
} from '../types/mechanic-state';
import { DIRS, Position } from '../types/position';
import { checkWin } from '../rules/check';
import { moveBoxes } from '../rules/move';

/**
 * Полный поиск решения по **тем же правилам**, что и `moveBoxes`:
 * состояние — позиции обоих кубиков плюс состояние механик (ловушки и
 * переключатель ротаторов), переход — один ход до упора.
 *
 * Механики добавляют вторую координату состояния. Без неё BFS склеивал бы
 * «кубик на той же клетке, но заперт ещё на ход» с «кубик свободен», и
 * находил бы несуществующие решения.
 */

export interface SolvedLevel {
  /** Кратчайшее решение от стартовой позиции. */
  solution: Position[];
  /** Сколько состояний достижимо из старта. */
  states: number;
  /** Сколько достижимых состояний уже не могут привести к победе. */
  deadEnds: number;
  /** Сколько раз в кратчайшем решении сдвинулся каждый кубик. */
  movesByBox: [number, number];
  /** Среднее число доступных ходов из достижимого состояния. */
  branching: number;
  /** Сколько разных клеток в сумме посещают кубики по всему графу. */
  boxCells: number;
  /** Сколько достижимых состояний уже являются победой. */
  winStates: number;
}

interface Node {
  boxes: Box[];
  state: MechanicState;
}

const DIRECTIONS = [DIRS.up, DIRS.down, DIRS.left, DIRS.right];
const DEFAULT_MAX_STATES = 200_000;

const boxesKey = (boxes: Box[]): string =>
  boxes.map((box) => `${box.pos.x},${box.pos.y}`).join('|');

const stateKey = (node: Node): string =>
  `${boxesKey(node.boxes)}#${node.state.locks.join(',')}#${node.state.rotorFlip ? 1 : 0}`;

function cloneBoxes(boxes: Box[]): Box[] {
  return boxes.map((box) => ({ pos: box.pos.clone(), color: box.color }));
}

function restorePath(
  parents: Map<string, { prev: string | null; dir: Position | null }>,
  goalKey: string,
): Position[] | null {
  const solution: Position[] = [];
  for (let key = goalKey; ; ) {
    const node = parents.get(key);
    if (!node) return null;
    if (node.prev === null) break;
    if (!node.dir) return null;
    solution.push(node.dir);
    key = node.prev;
  }
  return solution.reverse();
}

/**
 * Дешёвый предварительный поиск самого короткого решения. Обход
 * останавливается на первой победе, поэтому подходит для массовой
 * отбраковки кандидатов перед полным анализом тупиков.
 */
export function findShortestSolution(
  level: Level,
  initialState?: MechanicState,
  maxStates = DEFAULT_MAX_STATES,
): Position[] | null {
  const startBoxes = cloneBoxes(level.boxes);
  if (startBoxes.length === 0) return null;
  if (checkWin(startBoxes, level.ends)) return [];

  const start: Node = {
    boxes: startBoxes,
    state: initialState
      ? { locks: [...initialState.locks], rotorFlip: initialState.rotorFlip }
      : createMechanicState(startBoxes.length),
  };
  const startKey = stateKey(start);
  const parents = new Map<string, { prev: string | null; dir: Position | null }>();
  parents.set(startKey, { prev: null, dir: null });
  const queue: Node[] = [start];
  let head = 0;

  while (head < queue.length) {
    const node = queue[head++];
    const key = stateKey(node);

    for (const dir of DIRECTIONS) {
      const next = moveBoxes(level, node.boxes, dir, 0, 0, node.state);
      if (!next) continue;
      const nextNode: Node = {
        boxes: next.boxes,
        state: next.mechanicState ?? node.state,
      };
      const nextKey = stateKey(nextNode);
      if (parents.has(nextKey)) continue;
      if (parents.size >= maxStates) return null;
      parents.set(nextKey, { prev: key, dir });
      if (checkWin(next.boxes, level.ends)) return restorePath(parents, nextKey);
      queue.push(nextNode);
    }
  }

  return null;
}

/**
 * Обойти всё пространство состояний. Возвращает null, если решения нет,
 * либо если поиск упёрся в предохранитель `maxStates`.
 */
export function solveLevel(
  level: Level,
  maxStates = DEFAULT_MAX_STATES,
): SolvedLevel | null {
  const startBoxes = cloneBoxes(level.boxes);
  if (startBoxes.length === 0) return null;

  const start: Node = {
    boxes: startBoxes,
    state: createMechanicState(startBoxes.length),
  };
  const startKey = stateKey(start);
  const parents = new Map<string, { prev: string | null; dir: Position | null }>();
  const edges = new Map<string, string[]>();
  const winKeys = new Set<string>();
  const boxCells = new Set<string>();
  const queue: Node[] = [start];
  let head = 0;
  let firstWin: string | null = null;
  let edgeCount = 0;

  parents.set(startKey, { prev: null, dir: null });

  while (head < queue.length) {
    const node = queue[head++];
    const key = stateKey(node);
    for (const box of node.boxes) boxCells.add(`${box.pos.x},${box.pos.y}`);

    if (checkWin(node.boxes, level.ends)) {
      winKeys.add(key);
      if (firstWin === null) firstWin = key;
    }

    const nextKeys: string[] = [];
    for (const dir of DIRECTIONS) {
      const next = moveBoxes(level, node.boxes, dir, 0, 0, node.state);
      if (!next) continue;
      const nextNode: Node = {
        boxes: next.boxes,
        state: next.mechanicState ?? node.state,
      };
      const nextKey = stateKey(nextNode);
      nextKeys.push(nextKey);

      if (!parents.has(nextKey)) {
        if (parents.size >= maxStates) return null;
        parents.set(nextKey, { prev: key, dir });
        queue.push(nextNode);
      }
    }
    edgeCount += nextKeys.length;
    edges.set(key, nextKeys);
  }

  if (firstWin === null) return null;

  // Кратчайший путь восстанавливаем по родителям из BFS.
  const solution = restorePath(parents, firstWin);
  if (!solution) return null;

  // Обратный обход: отмечаем состояния, из которых победа всё ещё достижима.
  const reverse = new Map<string, string[]>();
  for (const [from, tos] of edges) {
    for (const to of tos) {
      const list = reverse.get(to) ?? [];
      list.push(from);
      reverse.set(to, list);
    }
  }

  const canStillWin = new Set<string>(winKeys);
  const reverseQueue = [...winKeys];
  let reverseHead = 0;
  while (reverseHead < reverseQueue.length) {
    const key = reverseQueue[reverseHead++];
    for (const prev of reverse.get(key) ?? []) {
      if (canStillWin.has(prev)) continue;
      canStillWin.add(prev);
      reverseQueue.push(prev);
    }
  }

  const movesByBox: [number, number] = [0, 0];
  let replayBoxes = cloneBoxes(level.boxes);
  let replayState = createMechanicState(replayBoxes.length);
  for (const dir of solution) {
    const next = moveBoxes(level, replayBoxes, dir, 0, 0, replayState);
    if (!next) return null;
    next.boxes.forEach((box, index) => {
      if (!box.pos.equals(replayBoxes[index].pos)) movesByBox[index]++;
    });
    replayBoxes = next.boxes;
    replayState = next.mechanicState ?? replayState;
  }

  return {
    solution,
    states: parents.size,
    deadEnds: parents.size - canStillWin.size,
    movesByBox,
    branching: parents.size > 0 ? edgeCount / parents.size : 0,
    boxCells: boxCells.size,
    winStates: winKeys.size,
  };
}
