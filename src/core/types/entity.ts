import { ColorType } from './color';
import { Position } from './position';

/**
 * Кубик на поле (⚠️ исправление плана: хранит цвет — проверка победы
 * требует совпадения цветов, раздел 4.3 документации).
 */
export interface Box {
  pos: Position;
  color: ColorType;
}

/** Целевая площадка на поле. */
export interface End {
  pos: Position;
  color: ColorType;
}

export function boxAt(boxes: Box[], pos: Position): Box | null {
  return boxes.find((b) => b.pos.equals(pos)) ?? null;
}

export function boxPositionEquals(a: Box, b: Box): boolean {
  return a.pos.equals(b.pos);
}
