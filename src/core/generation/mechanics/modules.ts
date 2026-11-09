import { CellType } from '../../types/cell';
import {
  freeIndexes,
  indexPosition,
  pick,
  routeIndexes,
  shuffle,
  type FieldDraft,
  type MechanicModule,
} from './types';

/** Пара клеток не должна стоять вплотную — иначе это «широкий портал». */
const PORTAL_MIN_DISTANCE = 4;

function placePortalPair(
  a: number,
  b: number,
  size: number,
  draft: FieldDraft,
): boolean {
  const pa = indexPosition(a, size);
  const pb = indexPosition(b, size);
  if (Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y) < PORTAL_MIN_DISTANCE) return false;
  draft.cells.set(a, CellType.PORTAL_A);
  draft.cells.set(b, CellType.PORTAL_B);
  return true;
}

/** Перетаскивает кубик на парную клетку и продолжает движение. */
export const portalMechanic: MechanicModule = {
  id: 'portal',
  label: 'Порталы',
  description: 'Вход переносит кубик на парный выход, движение продолжается в ту же сторону.',
  expectedScore: 78,
  place(draft, rng) {
    const size = draft.size;
    // Сначала маршрут: портал на пути кубика почти всегда будет использован.
    const route = shuffle(routeIndexes(draft), rng);
    for (let i = 0; i < route.length; i++) {
      for (let j = i + 1; j < route.length; j++) {
        if (placePortalPair(route[i], route[j], size, draft)) return true;
      }
    }
    // Запасной путь: пара свободных клеток вдалеке друг от друга.
    const free = shuffle(freeIndexes(draft), rng);
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        if (placePortalPair(free[i], free[j], size, draft)) return true;
      }
    }
    return false;
  },
  owns(cell) {
    return cell === CellType.PORTAL_A || cell === CellType.PORTAL_B;
  },
};

/** Останавливает кубик и заставляет пропустить два следующих хода. */
export const trapMechanic: MechanicModule = {
  id: 'trap',
  label: 'Ловушки',
  description: 'Кубик останавливается на клетке и пропускает два следующих хода.',
  expectedScore: 64,
  place(draft, rng) {
    const route = shuffle(routeIndexes(draft), rng);
    const free = route.length >= 2 ? route : shuffle(freeIndexes(draft), rng);
    if (free.length === 0) return false;
    const count = Math.min(free.length, 1 + (rng() < 0.35 ? 1 : 0));
    for (let i = 0; i < count; i++) draft.cells.set(free[i], CellType.TRAP);
    return true;
  },
  owns(cell) {
    return cell === CellType.TRAP;
  },
};

/** Поворачивает движение кубика на 90°. */
export const rotatorMechanic: MechanicModule = {
  id: 'rotator',
  label: 'Ротаторы',
  description: 'Клетка поворачивает движение кубика на 90° по или против часовой стрелки.',
  expectedScore: 86,
  place(draft, rng) {
    const route = shuffle(routeIndexes(draft), rng);
    const free = route.length >= 2 ? route : shuffle(freeIndexes(draft), rng);
    if (free.length < 2) return false;
    const count = Math.min(free.length, 2 + Math.floor(rng() * 3));
    for (let i = 0; i < count; i++) {
      draft.cells.set(
        free[i],
        rng() < 0.5 ? CellType.ROTOR_CW : CellType.ROTOR_CCW,
      );
    }
    return true;
  },
  owns(cell) {
    return cell === CellType.ROTOR_CW || cell === CellType.ROTOR_CCW;
  },
};

/** Переворачивает все ротаторы; сам по себе бесполезен. */
export const switchMechanic: MechanicModule = {
  id: 'switch',
  label: 'Переключатель',
  description: 'Проезд по кнопке переворачивает все ротаторы: направление поворота меняется.',
  expectedScore: 83,
  requires: ['rotator'],
  place(draft, rng) {
    const route = shuffle(routeIndexes(draft), rng);
    const free = route.length > 0 ? route : shuffle(freeIndexes(draft), rng);
    if (free.length === 0) return false;
    draft.cells.set(pick(free, rng), CellType.SWITCH);
    return true;
  },
  owns(cell) {
    return cell === CellType.SWITCH;
  },
};

function oneWayCell(dir: { x: number; y: number }): CellType {
  if (dir.y < 0) return CellType.ONE_WAY_UP;
  if (dir.y > 0) return CellType.ONE_WAY_DOWN;
  if (dir.x < 0) return CellType.ONE_WAY_LEFT;
  return CellType.ONE_WAY_RIGHT;
}

/** Односторонняя клетка: пропускает только по стрелке. */
export const oneWayMechanic: MechanicModule = {
  id: 'oneWay',
  label: 'Односторонние клетки',
  description: 'Кубик может войти только по направлению стрелки; иначе клетка работает как стена.',
  expectedScore: 46,
  place(draft, rng) {
    const route = routeIndexes(draft);
    const dirs = new Map<number, { x: number; y: number }>();
    for (const cell of draft.route ?? []) {
      if (!dirs.has(cell.index)) dirs.set(cell.index, cell.dir);
    }

    const onRoute = shuffle(
      route.filter((index) => dirs.has(index)),
      rng,
    );
    const free = onRoute.length >= 2 ? onRoute : shuffle(freeIndexes(draft), rng);
    if (free.length < 2) return false;

    const count = Math.min(free.length, 2 + Math.floor(rng() * 2));
    for (let i = 0; i < count; i++) {
      const index = free[i];
      // На маршруте стрелка совпадает с направлением проезда: клетка не ломает
      // пройденный путь, но закрывает обход с других сторон.
      const dir = dirs.get(index) ?? { x: 1, y: 0 };
      draft.cells.set(index, oneWayCell(dir));
    }
    return true;
  },
  owns(cell) {
    return cell >= CellType.ONE_WAY_UP && cell <= CellType.ONE_WAY_RIGHT;
  },
};
