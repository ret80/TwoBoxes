import type { Box, End } from '../types/entity';
import { ColorType } from '../types/color';
import { Position } from '../types/position';

/** Найти кубик на позиции (или null). */
export function getBoxAt(pos: Position, boxes: Box[]): Box | null {
  return boxes.find((b) => b.pos.equals(pos)) ?? null;
}

/** Соответствие цветов кубика и целевой площадки. */
export function matchColors(boxColor: ColorType, endColor: ColorType): boolean {
  return boxColor === endColor;
}

/**
 * Условие победы (раздел 4.3 документации, аналог `_is_completed()`
 * в check_state.gd): **каждая** целевая площадка содержит кубик того же цвета.
 */
export function checkWin(boxes: Box[], ends: End[]): boolean {
  return ends.every((end) => {
    const box = getBoxAt(end.pos, boxes);
    return box !== null && matchColors(box.color, end.color);
  });
}
