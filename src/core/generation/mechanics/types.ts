import type { CellType } from '../../types/cell';
import type { Position } from '../../types/position';

/**
 * Модуль механики — самостоятельное правило, которое можно подключить к
 * генератору. Модуль умеет только одно: разложить свои клетки по уже готовому
 * полу. Сами правила входа живут в `moveBoxes`, поэтому решатель, подсказка и
 * игра всегда используют одну и ту же семантику.
 */
export type MechanicId = 'portal' | 'trap' | 'rotator' | 'switch' | 'oneWay';

/** Клетка, по которой прошёл кубик, и направление входа в неё. */
export interface RouteCell {
  index: number;
  dir: Position;
}

/** Черновик поля: маска пола плюс клетки, уже занятые другими механиками. */
export interface FieldDraft {
  size: number;
  floor: Uint8Array;
  /** Индекс y * size + x → тип клетки. */
  cells: Map<number, CellType>;
  /**
   * Маршрут блуждания: клетки, по которым реально проехали кубики. Модуль
   * сначала пробует их, и только потом — свободные клетки поля. Иначе
   * механику приходится «ловить» случайной клеткой на маршруте.
   */
  route?: RouteCell[];
  /** Клетки, которые нельзя занимать: старты, цели. */
  reserved?: Set<number>;
}

export interface MechanicModule {
  id: MechanicId;
  label: string;
  /** Короткое описание для отладочного меню и документа. */
  description: string;
  /** Предварительная оценка влияния на геймплей, 0..100. */
  expectedScore: number;
  /** Механики, без которых эта не имеет смысла (например, переключатель). */
  requires?: MechanicId[];
  /** Разложить клетки. false — подходящего места нет, кандидат отбрасывается. */
  place(draft: FieldDraft, rng: () => number): boolean;
  /** Принадлежит ли клетка этой механике. */
  owns(cell: CellType): boolean;
}

/** Свободные клетки поля (пол, без механик и зарезервированных клеток). */
export function freeIndexes(draft: FieldDraft): number[] {
  const result: number[] = [];
  for (let y = 1; y < draft.size - 1; y++) {
    for (let x = 1; x < draft.size - 1; x++) {
      const index = y * draft.size + x;
      if (!draft.floor[index] || draft.cells.has(index)) continue;
      if (draft.reserved?.has(index)) continue;
      result.push(index);
    }
  }
  return result;
}

/**
 * Уникальные клетки маршрута, пригодные для механики: пол, не занято, не
 * зарезервировано. Порядок — порядок первого проезда (детерминирован).
 */
export function routeIndexes(draft: FieldDraft): number[] {
  if (!draft.route || draft.route.length === 0) return [];
  const seen = new Set<number>();
  const result: number[] = [];
  for (const cell of draft.route) {
    if (seen.has(cell.index)) continue;
    seen.add(cell.index);
    if (!draft.floor[cell.index]) continue;
    if (draft.cells.has(cell.index)) continue;
    if (draft.reserved?.has(cell.index)) continue;
    result.push(cell.index);
  }
  return result;
}

export function indexPosition(index: number, size: number): { x: number; y: number } {
  return { x: index % size, y: Math.floor(index / size) };
}

export { pick, shuffle } from '../rng';
export type { Rng } from '../rng';
