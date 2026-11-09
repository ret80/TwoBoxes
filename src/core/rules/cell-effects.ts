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
  ROTOR_CW = 3,
  ROTOR_CCW = 4,
}

const EFFECT_BY_CELL: Record<number, CellEffect> = {
  [CellType.TRAP]: CellEffect.TRAP,
  [CellType.SWITCH]: CellEffect.SWITCH,
  [CellType.ROTOR_CW]: CellEffect.ROTOR_CW,
  [CellType.ROTOR_CCW]: CellEffect.ROTOR_CCW,
};

/** Прямой lookup по числу клетки: без колбэков на каждом шаге. */
export function cellEffect(cell: CellType): CellEffect {
  return EFFECT_BY_CELL[cell] ?? CellEffect.NONE;
}
