import { ColorType } from './color';

/**
 * Типы клеток уровня (аналог `Level.CellType`, раздел 4.1 документации).
 * Соответствует легенде карт уровней (раздел 14):
 * '#' → WALL, '.' → EMPTY, 'R' → BOX, 'r' → END, 'Y' → BOX_TWO, 'y' → END_TWO, ' ' → UNKNOWN
 * Механики: 'a'/'b' — парные порталы, 't'/'T' — ловушки на 1/2 хода,
 * '1'..'8' — направленные углы, 'c'/'w' — гироскопы,
 * 's' — переключатель, '^v<>' — односторонние клетки.
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
  TRAP_1 = 8,
  TRAP_2 = 9,
  GYRO_CW = 10,
  GYRO_CCW = 11,
  // Направленный угол: вход — сторона, с которой кубик заезжает.
  // Вход ↑ означает движение вверх (кубик заезжает снизу).
  ROTOR_ELBOW_UP_CW = 12,
  ROTOR_ELBOW_RIGHT_CW = 13,
  ROTOR_ELBOW_DOWN_CW = 14,
  ROTOR_ELBOW_LEFT_CW = 15,
  ROTOR_ELBOW_UP_CCW = 16,
  ROTOR_ELBOW_RIGHT_CCW = 17,
  ROTOR_ELBOW_DOWN_CCW = 18,
  ROTOR_ELBOW_LEFT_CCW = 19,
  SWITCH = 20,
  ONE_WAY_UP = 21,
  ONE_WAY_DOWN = 22,
  ONE_WAY_LEFT = 23,
  ONE_WAY_RIGHT = 24,
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
  switch (cell) {
    case CellType.PORTAL_A:
    case CellType.PORTAL_B:
    case CellType.TRAP_1:
    case CellType.TRAP_2:
    case CellType.GYRO_CW:
    case CellType.GYRO_CCW:
    case CellType.ROTOR_ELBOW_UP_CW:
    case CellType.ROTOR_ELBOW_RIGHT_CW:
    case CellType.ROTOR_ELBOW_DOWN_CW:
    case CellType.ROTOR_ELBOW_LEFT_CW:
    case CellType.ROTOR_ELBOW_UP_CCW:
    case CellType.ROTOR_ELBOW_RIGHT_CCW:
    case CellType.ROTOR_ELBOW_DOWN_CCW:
    case CellType.ROTOR_ELBOW_LEFT_CCW:
    case CellType.SWITCH:
    case CellType.ONE_WAY_UP:
    case CellType.ONE_WAY_DOWN:
    case CellType.ONE_WAY_LEFT:
    case CellType.ONE_WAY_RIGHT:
      return true;
    default:
      return false;
  }
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

/** Сколько ходов кубик пропустит после входа в ловушку. */
export function trapLockTurns(cell: CellType): number {
  if (cell === CellType.TRAP_1) return 1;
  if (cell === CellType.TRAP_2) return 2;
  return 0;
}

/** Направление входа/выхода направленного угла. */
export interface RotorElbow {
  /** Направление движения кубика при входе (например, {0,-1} — вверх). */
  entry: { x: number; y: number };
  /** Выход при базовой полярности; переключатель меняет его на противоположный. */
  exit: { x: number; y: number };
  /** Базовый поворот; `rotorFlip` меняет его на противоположный. */
  clockwise: boolean;
}

const ELBOWS: Partial<Record<CellType, RotorElbow>> = {
  [CellType.ROTOR_ELBOW_UP_CW]: {
    entry: { x: 0, y: -1 },
    exit: { x: 1, y: 0 },
    clockwise: true,
  },
  [CellType.ROTOR_ELBOW_RIGHT_CW]: {
    entry: { x: 1, y: 0 },
    exit: { x: 0, y: 1 },
    clockwise: true,
  },
  [CellType.ROTOR_ELBOW_DOWN_CW]: {
    entry: { x: 0, y: 1 },
    exit: { x: -1, y: 0 },
    clockwise: true,
  },
  [CellType.ROTOR_ELBOW_LEFT_CW]: {
    entry: { x: -1, y: 0 },
    exit: { x: 0, y: -1 },
    clockwise: true,
  },
  [CellType.ROTOR_ELBOW_UP_CCW]: {
    entry: { x: 0, y: -1 },
    exit: { x: -1, y: 0 },
    clockwise: false,
  },
  [CellType.ROTOR_ELBOW_RIGHT_CCW]: {
    entry: { x: 1, y: 0 },
    exit: { x: 0, y: -1 },
    clockwise: false,
  },
  [CellType.ROTOR_ELBOW_DOWN_CCW]: {
    entry: { x: 0, y: 1 },
    exit: { x: 1, y: 0 },
    clockwise: false,
  },
  [CellType.ROTOR_ELBOW_LEFT_CCW]: {
    entry: { x: -1, y: 0 },
    exit: { x: 0, y: 1 },
    clockwise: false,
  },
};

/** Описание направленного угла; null — клетка не угол. */
export function rotorElbow(cell: CellType): RotorElbow | null {
  return ELBOWS[cell] ?? null;
}

/** Выход угла с учётом переключателя. null — клетка не угол. */
export function rotorElbowExit(
  cell: CellType,
  flipped = false,
): { x: number; y: number } | null {
  const elbow = rotorElbow(cell);
  if (!elbow) return null;
  const clockwise = elbow.clockwise !== flipped;
  const x = clockwise ? -elbow.entry.y : elbow.entry.y;
  const y = clockwise ? elbow.entry.x : -elbow.entry.x;
  // Нормализуем -0: координаты не должны отличаться от нуля.
  return { x: x === 0 ? 0 : x, y: y === 0 ? 0 : y };
}

/** Символ карты для направленного угла. */
const ELBOW_SYMBOLS: ReadonlyArray<[CellType, string]> = [
  [CellType.ROTOR_ELBOW_UP_CW, '1'],
  [CellType.ROTOR_ELBOW_RIGHT_CW, '2'],
  [CellType.ROTOR_ELBOW_DOWN_CW, '3'],
  [CellType.ROTOR_ELBOW_LEFT_CW, '4'],
  [CellType.ROTOR_ELBOW_UP_CCW, '5'],
  [CellType.ROTOR_ELBOW_RIGHT_CCW, '6'],
  [CellType.ROTOR_ELBOW_DOWN_CCW, '7'],
  [CellType.ROTOR_ELBOW_LEFT_CCW, '8'],
];

export function rotorElbowChar(cell: CellType): string | null {
  return ELBOW_SYMBOLS.find(([type]) => type === cell)?.[1] ?? null;
}

export function rotorElbowFromChar(ch: string): CellType | null {
  return ELBOW_SYMBOLS.find(([, symbol]) => symbol === ch)?.[0] ?? null;
}
