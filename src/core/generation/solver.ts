import type { Box } from '../types/entity';
import type { Level } from '../types/level';
import { DIRS, Position } from '../types/position';
import { checkWin } from '../rules/check';
import { moveBoxes } from '../rules/move';

/**
 * Полный поиск решения по **тем же правилам**, что и `moveBoxes`:
 * состояние — позиции обоих кубиков, переход — один ход до упора.
 *
 * В отличие от подсказки (`findHint`), здесь граф обходится целиком:
 * это нужно генератору, чтобы отличить просто решаемый уровень от уровня,
 * в котором игрок может сделать ход и навсегда застрять.
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
}

const DIRECTIONS = [DIRS.up, DIRS.down, DIRS.left, DIRS.right];
const DEFAULT_MAX_STATES = 200_000;

const stateKey = (boxes: Box[]): string =>
  boxes.map((box) => `${box.pos.x},${box.pos.y}`).join('|');

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
  maxStates = DEFAULT_MAX_STATES,
): Position[] | null {
  const start = cloneBoxes(level.boxes);
  if (start.length === 0) return null;
  if (checkWin(start, level.ends)) return [];

  const startKey = stateKey(start);
  const parents = new Map<string, { prev: string | null; dir: Position | null }>();
  parents.set(startKey, { prev: null, dir: null });
  const queue: Box[][] = [start];
  let head = 0;

  while (head < queue.length) {
    const boxes = queue[head++];
    const key = stateKey(boxes);

    for (const dir of DIRECTIONS) {
      const next = moveBoxes(level, boxes, dir, 0, 0);
      if (!next) continue;
      const nextKey = stateKey(next.boxes);
      if (parents.has(nextKey)) continue;
      if (parents.size >= maxStates) return null;
      parents.set(nextKey, { prev: key, dir });
      if (checkWin(next.boxes, level.ends)) return restorePath(parents, nextKey);
      queue.push(next.boxes);
    }
  }

  return null;
}

/**
 * Обойти всё пространство состояний. Возвращает null, если решения нет,
 * либо если поиск упёрся в предохранитель `maxStates` (тогда нельзя
 * гарантировать отсутствие тупиков).
 */
export function solveLevel(
  level: Level,
  maxStates = DEFAULT_MAX_STATES,
): SolvedLevel | null {
  const start = cloneBoxes(level.boxes);
  if (start.length === 0) return null;

  const startKey = stateKey(start);
  const parents = new Map<string, { prev: string | null; dir: Position | null }>();
  const edges = new Map<string, string[]>();
  const winKeys = new Set<string>();
  const queue: Box[][] = [start];
  let head = 0;
  let firstWin: string | null = null;

  parents.set(startKey, { prev: null, dir: null });

  while (head < queue.length) {
    const boxes = queue[head++];
    const key = stateKey(boxes);

    if (checkWin(boxes, level.ends)) {
      winKeys.add(key);
      if (firstWin === null) firstWin = key;
    }

    const nextKeys: string[] = [];
    for (const dir of DIRECTIONS) {
      const next = moveBoxes(level, boxes, dir, 0, 0);
      if (!next) continue;
      const nextKey = stateKey(next.boxes);
      nextKeys.push(nextKey);

      if (!parents.has(nextKey)) {
        if (parents.size >= maxStates) return null;
        parents.set(nextKey, { prev: key, dir });
        queue.push(next.boxes);
      }
    }
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
  let replay = cloneBoxes(level.boxes);
  for (const dir of solution) {
    const next = moveBoxes(level, replay, dir, 0, 0);
    if (!next) return null;
    next.boxes.forEach((box, index) => {
      if (!box.pos.equals(replay[index].pos)) movesByBox[index]++;
    });
    replay = next.boxes;
  }

  return {
    solution,
    states: parents.size,
    deadEnds: parents.size - canStillWin.size,
    movesByBox,
  };
}
