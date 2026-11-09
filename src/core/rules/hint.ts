import { ColorType } from '../types/color';
import type { Box } from '../types/entity';
import type { PathPoint } from '../types/game-state';
import type { Level } from '../types/level';
import type { MechanicState } from '../types/mechanic-state';
import type { Position } from '../types/position';
import { firstMoveOfSolution } from '../generation/check/analyzer';
import { checkWin } from './check';
import { moveBoxes } from './move';

/**
 * Подсказка (кнопка-лампочка): первое направление кратчайшего решения из
 * текущей позиции. Поиск — тот же обход, что у решателя и генератора
 * (`check/analyzer.ts`), поэтому подсказка физически не может разойтись с
 * проверкой уровня.
 */

const MAX_STATES = 60_000; // предохранитель от зависания на больших полях

export function findHint(
  level: Level,
  boxes: Box[],
  initialState?: MechanicState,
): Position | null {
  if (boxes.length === 0 || boxes.length > 3) return null;
  if (checkWin(boxes, level.ends)) return null;
  return firstMoveOfSolution(level, boxes, initialState, { maxStates: MAX_STATES });
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
