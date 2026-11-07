import { ColorType } from './color';

/**
 * Типы клеток уровня (аналог `Level.CellType`, раздел 4.1 документации).
 * Соответствует легенде карт уровней (раздел 14):
 * '#' → WALL, '.' → EMPTY, 'R' → BOX, 'r' → END, 'Y' → BOX_TWO, 'y' → END_TWO, ' ' → UNKNOWN
 * Механики: 'a'/'b' — парные порталы, 't' — ловушка, 'c'/'w' — ротаторы
 * по/против часовой, 's' — переключатель, '^v<>' — односторонние клетки.
 */
export enum CellType {
  UNKNOWN = -1, // пустое пространство за пределами поля (не рендерится, блокирует движение)
  EMPTY = 0, // свободная клетка (рендерится пол)
  WALL = 1, // стена (непроходимый блок)
  BOX = 2, // кубик цвета ONE (красный)
  END = 3, // целевая площадка цвета ONE (красная)
  BOX_TWO = 4, // кубик цвета TWO (жёлтый)
  END_TWO = 5, // целевая площадка цвета TWO (жёлтая)
  // Механические клетки. Все они проходимы, но меняют движение кубика.
  PORTAL_A = 6,
  PORTAL_B = 7,
  TRAP = 8,
  ROTOR_CW = 9,
  ROTOR_CCW = 10,
  SWITCH = 11,
  ONE_WAY_UP = 12,
  ONE_WAY_DOWN = 13,
  ONE_WAY_LEFT = 14,
  ONE_WAY_RIGHT = 15,
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

/** Клетка механики: пол с особым правилом входа. */
export function isMechanicCell(cell: CellType): boolean {
  return cell >= CellType.PORTAL_A && cell <= CellType.ONE_WAY_RIGHT;
}

/** Обратная пара портала. */
export function portalPartner(cell: CellType): CellType | null {
  if (cell === CellType.PORTAL_A) return CellType.PORTAL_B;
  if (cell === CellType.PORTAL_B) return CellType.PORTAL_A;
  return null;
}

/** Направление, разрешённое односторонней клеткой (null — клетка не односторонняя). */
export function oneWayDir(cell: CellType): { x: number; y: number } | null {
  switch (cell) {
    case CellType.ONE_WAY_UP:
      return { x: 0, y: -1 };
    case CellType.ONE_WAY_DOWN:
      return { x: 0, y: 1 };
    case CellType.ONE_WAY_LEFT:
      return { x: -1, y: 0 };
    case CellType.ONE_WAY_RIGHT:
      return { x: 1, y: 0 };
    default:
      return null;
  }
}
