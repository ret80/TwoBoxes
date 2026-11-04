import { ColorType } from './color';

/**
 * Типы клеток уровня (аналог `Level.CellType`, раздел 4.1 документации).
 * Соответствует легенде карт уровней (раздел 14):
 * '#' → WALL, '.' → EMPTY, 'R' → BOX, 'r' → END, 'Y' → BOX_TWO, 'y' → END_TWO, ' ' → UNKNOWN
 */
export enum CellType {
  UNKNOWN = -1, // пустое пространство за пределами поля (не рендерится, блокирует движение)
  EMPTY = 0, // свободная клетка (рендерится пол)
  WALL = 1, // стена (непроходимый блок)
  BOX = 2, // кубик цвета ONE (красный)
  END = 3, // целевая площадка цвета ONE (красная)
  BOX_TWO = 4, // кубик цвета TWO (жёлтый)
  END_TWO = 5, // целевая площадка цвета TWO (жёлтая)
}

/** Извлечь цвет из клеточного типа; для нецветных клеток возвращает null. */
export function cellColor(cell: CellType): ColorType | null {
  switch (cell) {
    case CellType.BOX:
    case CellType.END:
      return ColorType.ONE;
    case CellType.BOX_TWO:
    case CellType.END_TWO:
      return ColorType.TWO;
    default:
      return null;
  }
}

/** Является ли клетка кубиком (любого цвета). */
export function isBoxCell(cell: CellType): boolean {
  return cell === CellType.BOX || cell === CellType.BOX_TWO;
}

/** Является ли клетка целевой площадкой (любого цвета). */
export function isEndCell(cell: CellType): boolean {
  return cell === CellType.END || cell === CellType.END_TWO;
}
