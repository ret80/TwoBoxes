import { CellType, rotorElbow, rotorElbowExit } from '../../types/cell';
import type { Position } from '../../types/position';
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

/** Останавливает кубик и заставляет пропустить один или два следующих хода. */
export const trapMechanic: MechanicModule = {
  id: 'trap',
  label: 'Ловушки',
  description: 'Кубик останавливается на клетке и пропускает один или два следующих хода.',
  expectedScore: 64,
  place(draft, rng) {
    const route = shuffle(routeIndexes(draft), rng);
    const free = route.length >= 2 ? route : shuffle(freeIndexes(draft), rng);
    if (free.length === 0) return false;
    const count = Math.min(free.length, 1 + (rng() < 0.35 ? 1 : 0));
    const progress = draft.progress ?? 0.5;
    for (let i = 0; i < count; i++) {
      // Ранние уровни щадят одним ходом, поздние всё чаще ставят сильную.
      const strong = rng() < 0.15 + progress * 0.7;
      draft.cells.set(free[i], strong ? CellType.TRAP_2 : CellType.TRAP_1);
    }
    return true;
  },
  owns(cell) {
    return cell === CellType.TRAP_1 || cell === CellType.TRAP_2;
  },
};

const ELBOW_BY_ENTRY: Record<string, Record<'cw' | 'ccw', CellType>> = {
  '0,-1': {
    cw: CellType.ROTOR_ELBOW_UP_CW,
    ccw: CellType.ROTOR_ELBOW_UP_CCW,
  },
  '1,0': {
    cw: CellType.ROTOR_ELBOW_RIGHT_CW,
    ccw: CellType.ROTOR_ELBOW_RIGHT_CCW,
  },
  '0,1': {
    cw: CellType.ROTOR_ELBOW_DOWN_CW,
    ccw: CellType.ROTOR_ELBOW_DOWN_CCW,
  },
  '-1,0': {
    cw: CellType.ROTOR_ELBOW_LEFT_CW,
    ccw: CellType.ROTOR_ELBOW_LEFT_CCW,
  },
};

function elbowCell(
  entry: { x: number; y: number },
  clockwise: boolean,
): CellType | null {
  return ELBOW_BY_ENTRY[`${entry.x},${entry.y}`]?.[clockwise ? 'cw' : 'ccw'] ?? null;
}

/** Направления, в которых кубик проезжал клетку маршрута. */
function routeDirections(draft: FieldDraft): Map<number, Position[]> {
  const result = new Map<number, Position[]>();
  for (const cell of draft.route ?? []) {
    const list = result.get(cell.index) ?? [];
    if (!list.some((dir) => dir.equals(cell.dir))) list.push(cell.dir);
    result.set(cell.index, list);
  }
  return result;
}

/**
 * Направленный угол. Ориентация берётся из направления входа на маршруте.
 * Если клетку проезжали с разных сторон, угол всё равно допустим: со стороны
 * входа он повернёт, с остальных кубик проедет прямо.
 */
export const rotatorMechanic: MechanicModule = {
  id: 'rotator',
  label: 'Ротаторы',
  description:
    'Угол поворачивает кубик только при въезде со стороны входа; с других сторон кубик едет прямо.',
  expectedScore: 86,
  place(draft, rng) {
    const dirs = routeDirections(draft);
    const route = shuffle(
      routeIndexes(draft).filter((index) => dirs.has(index)),
      rng,
    );
    if (route.length < 2) return false;

    const count = Math.min(route.length, 2 + Math.floor(rng() * 3));
    let placed = 0;
    for (const index of route) {
      if (placed >= count) break;
      const entry = dirs.get(index)?.[0];
      if (!entry) continue;

      // Предпочитаем выход, который ведёт на пол и не занят другой механикой.
      // Если оба выхода свободны, выбор случайный, но детерминированный rng.
      const options = ([true, false] as const).filter((clockwise) => {
        const cell = elbowCell(entry, clockwise);
        if (cell === null) return false;
        const exit = clockwise
          ? { x: -entry.y, y: entry.x }
          : { x: entry.y, y: -entry.x };
        const pos = indexPosition(index, draft.size);
        const next = (pos.y + exit.y) * draft.size + (pos.x + exit.x);
        return draft.floor[next] === 1 && !draft.cells.has(next);
      });
      if (options.length === 0) continue;

      const clockwise = options[Math.floor(rng() * options.length)];
      const cell = elbowCell(entry, clockwise);
      if (cell === null) continue;
      draft.cells.set(index, cell);
      placed++;
    }
    return placed >= 2;
  },
  owns(cell) {
    return cell >= CellType.ROTOR_ELBOW_UP_CW && cell <= CellType.ROTOR_ELBOW_LEFT_CCW;
  },
};

/** Старое поведение ротатора: поворот на 90° независимо от стороны входа. */
export const gyroMechanic: MechanicModule = {
  id: 'gyro',
  label: 'Гироскопы',
  description: 'Клетка всегда поворачивает движение кубика на 90° по или против часовой стрелки.',
  expectedScore: 84,
  place(draft, rng) {
    const route = shuffle(routeIndexes(draft), rng);
    const free = route.length >= 2 ? route : shuffle(freeIndexes(draft), rng);
    if (free.length < 2) return false;
    const count = Math.min(free.length, 2 + Math.floor(rng() * 3));
    for (let i = 0; i < count; i++) {
      draft.cells.set(
        free[i],
        rng() < 0.5 ? CellType.GYRO_CW : CellType.GYRO_CCW,
      );
    }
    return true;
  },
  owns(cell) {
    return cell === CellType.GYRO_CW || cell === CellType.GYRO_CCW;
  },
};

/** Переворачивает все углы и гироскопы; сам по себе бесполезен. */
export const switchMechanic: MechanicModule = {
  id: 'switch',
  label: 'Переключатель',
  description:
    'Проезд по кнопке переворачивает все углы и гироскопы: направление поворота меняется.',
  expectedScore: 83,
  requires: ['rotator'],
  place(draft, rng) {
    const route = [...(draft.route ?? [])].sort(
      (a, b) => (a.step ?? 0) - (b.step ?? 0),
    );
    // Переключатель ставим перед углом, у которого можно закрыть
    // «неперевёрнутый» выход. Так кнопка меняет не только картинку: без неё
    // кубик упирается в стену на выходе угла. Кандидатов может быть много;
    // разные попытки выбирают разные, иначе одна неудачная геометрия
    // повторялась бы сотню раз.
    const gates: { switchIndex: number; blockers: number[] }[] = [];
    for (const candidate of route) {
      if (draft.cells.has(candidate.index)) continue;
      if (draft.reserved?.has(candidate.index)) continue;
      if (!draft.floor[candidate.index]) continue;

      const blockers = new Set<number>();
      for (const later of route) {
        if ((later.step ?? 0) <= (candidate.step ?? 0)) continue;
        const elbowCellAt = draft.cells.get(later.index) ?? CellType.EMPTY;
        const elbow = rotorElbow(elbowCellAt);
        if (!elbow) continue;
        if (elbow.entry.x !== later.dir.x || elbow.entry.y !== later.dir.y) continue;
        const plainExit = rotorElbowExit(elbowCellAt, false);
        if (!plainExit) continue;
        const pos = indexPosition(later.index, draft.size);
        const nx = pos.x + plainExit.x;
        const ny = pos.y + plainExit.y;
        if (nx < 1 || ny < 1 || nx >= draft.size - 1 || ny >= draft.size - 1) continue;
        const blockerIndex = ny * draft.size + nx;
        if (!draft.floor[blockerIndex]) continue;
        if (draft.cells.has(blockerIndex) || draft.reserved?.has(blockerIndex)) continue;
        blockers.add(blockerIndex);
      }
      if (blockers.size > 0) {
        // Пробуем и минимальные ворота (один закрытый выход), и все сразу:
        // одним уровням хватает одного упора, другим нужен полный запрет
        // обхода через остальные углы. Режим задаёт генератор, чтобы обе
        // стратегии были проверены детерминированно, а не по случайности.
        const mode = draft.switchGate ?? 'single';
        if (mode === 'all') {
          gates.push({ switchIndex: candidate.index, blockers: [...blockers] });
          continue;
        }
        gates.push({ switchIndex: candidate.index, blockers: [...blockers].slice(0, 1) });
      }
    }
    if (gates.length > 0) {
      // Для полного запрета обхода берём самые ранние ворота: их выбор не
      // должен зависеть от случайного перебора, иначе редкая строгая
      // раскладка теряется среди вариантов.
      const gate = draft.switchGate === 'all' ? gates[0] : pick(gates, rng);
      for (const blocker of gate.blockers) draft.floor[blocker] = 0;
      draft.cells.set(gate.switchIndex, CellType.SWITCH);
      return true;
    }

    // Запасной вариант: обычная кнопка на маршруте. Приёмка предпочтёт
    // строгий уровень; расслабленный останется только на крайний случай.
    const free = routeIndexes(draft);
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
