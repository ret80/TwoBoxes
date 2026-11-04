/**
 * 2D-позиция (аналог Vector2i в оригинале).
 * Ось Y направлена вниз (экранные координаты): UP = (0, -1).
 */
export class Position {
  constructor(
    public x: number = 0,
    public y: number = 0,
  ) {}

  add(other: Position): Position {
    return new Position(this.x + other.x, this.y + other.y);
  }

  sub(other: Position): Position {
    return new Position(this.x - other.x, this.y - other.y);
  }

  equals(other: Position): boolean {
    return this.x === other.x && this.y === other.y;
  }

  clone(): Position {
    return new Position(this.x, this.y);
  }

  toString(): string {
    return `(${this.x}, ${this.y})`;
  }
}

/** Единичные направления движения (эквивалент ui_up/ui_down/ui_left/ui_right). */
export const DIRS = {
  up: new Position(0, -1),
  down: new Position(0, 1),
  left: new Position(-1, 0),
  right: new Position(1, 0),
} as const;
