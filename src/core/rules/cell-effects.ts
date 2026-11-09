import { CellType } from '../types/cell';

/**
 * Эффект клетки после того, как кубик на неё встал.
 *
 * Раньше `moveBoxes` знал про каждую механику цепочкой `if (cell === TRAP) …
 * if (cell === SWITCH) …`. Новая клетка требовала правки общего хода. Теперь
 * соответствие «клетка → эффект» — данные, а ход умеет исполнять эффекты.
 * Портал остаётся отдельным правилом (`PortalRule`): у него коллективная
 * семантика на шаг, а не эффект одного кубика.
 */
export enum CellEffect {
  NONE = 0,
  TRAP = 1,
  SWITCH = 2,
  GYRO_CW = 3,
  GYRO_CCW = 4,
  ROTOR_ELBOW = 5,
}

const EFFECT_BY_CELL: Record<number, CellEffect> = {
  [CellType.TRAP_1]: CellEffect.TRAP,
  [CellType.TRAP_2]: CellEffect.TRAP,
  [CellType.SWITCH]: CellEffect.SWITCH,
  [CellType.GYRO_CW]: CellEffect.GYRO_CW,
  [CellType.GYRO_CCW]: CellEffect.GYRO_CCW,
  [CellType.ROTOR_ELBOW_UP_CW]: CellEffect.ROTOR_ELBOW,
  [CellType.ROTOR_ELBOW_RIGHT_CW]: CellEffect.ROTOR_ELBOW,
  [CellType.ROTOR_ELBOW_DOWN_CW]: CellEffect.ROTOR_ELBOW,
  [CellType.ROTOR_ELBOW_LEFT_CW]: CellEffect.ROTOR_ELBOW,
  [CellType.ROTOR_ELBOW_UP_CCW]: CellEffect.ROTOR_ELBOW,
  [CellType.ROTOR_ELBOW_RIGHT_CCW]: CellEffect.ROTOR_ELBOW,
  [CellType.ROTOR_ELBOW_DOWN_CCW]: CellEffect.ROTOR_ELBOW,
  [CellType.ROTOR_ELBOW_LEFT_CCW]: CellEffect.ROTOR_ELBOW,
};

/** Прямой lookup по числу клетки: без колбэков на каждом шаге. */
export function cellEffect(cell: CellType): CellEffect {
  return EFFECT_BY_CELL[cell] ?? CellEffect.NONE;
}
