import { CellType } from './cell';
import { Position } from './position';

/**
 * 2D-сетка уровня (аналог `Array2D` — script/util/array_2d.gd).
 * Доступ по Position, границы: [0..width) × [0..height).
 */
export class LevelGrid {
  private cells: Int8Array;

  constructor(
    public readonly width: number,
    public readonly height: number,
    cells?: number[],
  ) {
    this.cells = new Int8Array(width * height);
    if (cells) {
      if (cells.length !== width * height) {
        throw new Error(
          `LevelGrid: ожидается ${width * height} элементов, получено ${cells.length}`,
        );
      }
      this.cells.set(cells);
    } else {
      this.cells.fill(CellType.UNKNOWN);
    }
  }

  get(pos: Position): CellType {
    if (!this.isValid(pos)) return CellType.UNKNOWN;
    return this.cells[pos.y * this.width + pos.x] as CellType;
  }

  set(pos: Position, val: CellType): void {
    if (!this.isValid(pos)) return;
    this.cells[pos.y * this.width + pos.x] = val;
  }

  isValid(pos: Position): boolean {
    return pos.x >= 0 && pos.x < this.width && pos.y >= 0 && pos.y < this.height;
  }

  /** Плоское представление построчно (для сериализации/парсинга). */
  toFlat(): number[] {
    return Array.from(this.cells);
  }

  duplicate(): LevelGrid {
    return new LevelGrid(this.width, this.height, this.toFlat());
  }

  /**
   * Округление до ближайшего чётного числа (аналог `Util.po2` — script/util/util.gd).
   * Используется для центрирования поля при отрисовке.
   */
  static nearestEven(n: number): number {
    return n % 2 === 0 ? n : n + 1;
  }
}
