import { ColorType } from '../types/color';
import type { Box } from '../types/entity';
import type { PathPoint } from '../types/game-state';
import type { Level } from '../types/level';
import {
  createMechanicState,
  type MechanicState,
} from '../types/mechanic-state';
import { DIRS, Position } from '../types/position';
import { checkWin } from './check';
import { moveBoxes } from './move';

/**
 * Подсказка (кнопка-лампочка): первое направление кратчайшего решения из
 * текущей позиции. Поиск использует те же `moveBoxes`, что и игра, поэтому
 * порталы, ловушки и ротаторы учитываются автоматически.
 */

const DIRS_ORDER = [DIRS.up, DIRS.down, DIRS.left, DIRS.right];
const MAX_STATES = 60000; // предохранитель от зависания на больших полях

interface HintNode {
  boxes: Box[];
  state: MechanicState;
}

const nodeKey = (node: HintNode): string =>
  `${node.boxes.map((b) => `${b.pos.x},${b.pos.y}`).join('|')}#` +
  `${node.state.locks.join(',')}#${node.state.rotorFlip ? 1 : 0}`;

export function findHint(
  level: Level,
  boxes: Box[],
  initialState?: MechanicState,
): Position | null {
  if (boxes.length === 0 || boxes.length > 3) return null;
  if (checkWin(boxes, level.ends)) return null;

  const start: HintNode = {
    boxes: boxes.map((box) => ({ pos: box.pos.clone(), color: box.color })),
    state: initialState
      ? { locks: [...initialState.locks], rotorFlip: initialState.rotorFlip }
      : createMechanicState(boxes.length),
  };
  const startKey = nodeKey(start);
  const parents = new Map<string, { prev: string | null; dir: Position | null }>();
  parents.set(startKey, { prev: null, dir: null });

  const queue: HintNode[] = [start];
  let head = 0;

  while (head < queue.length && parents.size < MAX_STATES) {
    const node = queue[head++];
    const key = nodeKey(node);
    for (const dir of DIRS_ORDER) {
      const next = moveBoxes(level, node.boxes, dir, 0, 0, node.state);
      if (!next) continue;
      const nextNode: HintNode = {
        boxes: next.boxes,
        state: next.mechanicState ?? node.state,
      };
      const nextKey = nodeKey(nextNode);
      if (parents.has(nextKey)) continue;
      parents.set(nextKey, { prev: key, dir });
      if (checkWin(next.boxes, level.ends)) return firstDir(parents, nextKey);
      queue.push(nextNode);
    }
  }
  return null;
}

/** Первое направление пути от старта к найденному решению. */
function firstDir(
  parents: Map<string, { prev: string | null; dir: Position | null }>,
  goalKey: string,
): Position | null {
  let key = goalKey;
  let dir: Position | null = null;
  for (;;) {
    const node = parents.get(key);
    if (!node || node.prev === null) break;
    dir = node.dir;
    key = node.prev;
  }
  return dir;
}

/** Как и куда проедет кубик при ходе в `dir` (для визуальной подсказки). */
export interface HintSlide {
  color: ColorType;
  /** Фактический путь: повороты на ротаторах и прыжок через портал. */
  path: PathPoint[];
}

/**
 * План хода для визуальной подсказки: путь каждого кубика при сдвиге в `dir`.
 * Пути берутся из того же `moveBoxes`, что и настоящий ход (поле `paths`),
 * поэтому подсказка идёт по реальному маршруту, а не по прямой: она огибает
 * ротаторы, упирается в односторонние клетки и телепортируется через портал.
 */
export function planSlides(
  level: Level,
  boxes: Box[],
  dir: Position,
  state?: MechanicState,
): HintSlide[] {
  const next = moveBoxes(level, boxes, dir, 0, 0, state);
  return boxes.map((box, index) => ({
    color: box.color,
    // Кубик, которому некуда ехать, остаётся точкой-стартом: стрелки не будет.
    path: next?.paths?.[index]?.length
      ? next.paths[index]
      : [{ pos: box.pos.clone() }],
  }));
}
