import { CellType } from '../../types/cell';
import {
  oneWayMechanic,
  portalMechanic,
  rotatorMechanic,
  switchMechanic,
  trapMechanic,
} from './modules';
import type { MechanicId, MechanicModule } from './types';

export type { FieldDraft, MechanicId, MechanicModule } from './types';
export { freeIndexes } from './types';

/** Все механики в порядке применения. */
export const ALL_MECHANICS: MechanicModule[] = [
  portalMechanic,
  trapMechanic,
  rotatorMechanic,
  switchMechanic,
  oneWayMechanic,
];

const BY_ID = new Map<MechanicId, MechanicModule>(
  ALL_MECHANICS.map((mechanic) => [mechanic.id, mechanic]),
);

export function getMechanic(id: MechanicId): MechanicModule {
  const mechanic = BY_ID.get(id);
  if (!mechanic) throw new Error(`Механика ${id} не найдена`);
  return mechanic;
}

/** Подключить зависимости: переключатель невозможен без ротаторов. */
export function resolveMechanics(ids: MechanicId[]): MechanicModule[] {
  const wanted = new Set<MechanicId>();
  const visit = (id: MechanicId): void => {
    if (wanted.has(id)) return;
    wanted.add(id);
    for (const dependency of getMechanic(id).requires ?? []) visit(dependency);
  };
  for (const id of ids) visit(id);
  return ALL_MECHANICS.filter((mechanic) => wanted.has(mechanic.id));
}

/** Символ карты для клетки механики (парсер `createLevelFromData`). */
export function mechanicChar(cell: CellType): string | null {
  switch (cell) {
    case CellType.PORTAL_A:
      return 'a';
    case CellType.PORTAL_B:
      return 'b';
    case CellType.TRAP:
      return 't';
    case CellType.ROTOR_CW:
      return 'c';
    case CellType.ROTOR_CCW:
      return 'w';
    case CellType.SWITCH:
      return 's';
    case CellType.ONE_WAY_UP:
      return '^';
    case CellType.ONE_WAY_DOWN:
      return 'v';
    case CellType.ONE_WAY_LEFT:
      return '<';
    case CellType.ONE_WAY_RIGHT:
      return '>';
    default:
      return null;
  }
}
