import { CellType } from '../../types/cell';
import {
  freeIndexes,
  pick,
  shuffle,
  type MechanicModule,
} from './types';

/** Перетаскивает кубик на парную клетку и продолжает движение. */
export const portalMechanic: MechanicModule = {
  id: 'portal',
  label: 'Порталы',
  description: 'Вход переносит кубик на парный выход, движение продолжается в ту же сторону.',
  expectedScore: 78,
  place(draft, rng) {
    const free = shuffle(freeIndexes(draft), rng);
    const size = draft.size;
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        const a = free[i];
        const b = free[j];
        const ax = a % size;
        const ay = Math.floor(a / size);
        const bx = b % size;
        const by = Math.floor(b / size);
        if (Math.abs(ax - bx) + Math.abs(ay - by) < 4) continue;
        draft.cells.set(a, CellType.PORTAL_A);
        draft.cells.set(b, CellType.PORTAL_B);
        return true;
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
    const free = shuffle(freeIndexes(draft), rng);
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
    const free = shuffle(freeIndexes(draft), rng);
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
    const free = shuffle(freeIndexes(draft), rng);
    if (free.length === 0) return false;
    draft.cells.set(pick(free, rng), CellType.SWITCH);
    return true;
  },
  owns(cell) {
    return cell === CellType.SWITCH;
  },
};

/** Односторонняя клетка: пропускает только по стрелке. */
export const oneWayMechanic: MechanicModule = {
  id: 'oneWay',
  label: 'Односторонние клетки',
  description: 'Кубик может войти только по направлению стрелки; иначе клетка работает как стена.',
  expectedScore: 46,
  place(draft, rng) {
    const free = shuffle(freeIndexes(draft), rng);
    if (free.length < 2) return false;
    const count = Math.min(free.length, 2 + Math.floor(rng() * 2));
    const cells = [
      CellType.ONE_WAY_UP,
      CellType.ONE_WAY_DOWN,
      CellType.ONE_WAY_LEFT,
      CellType.ONE_WAY_RIGHT,
    ];
    for (let i = 0; i < count; i++) draft.cells.set(free[i], pick(cells, rng));
    return true;
  },
  owns(cell) {
    return cell >= CellType.ONE_WAY_UP && cell <= CellType.ONE_WAY_RIGHT;
  },
};
