import type { CellType } from '../../types/cell';

/**
 * Модуль механики — самостоятельное правило, которое можно подключить к
 * генератору. Модуль умеет только одно: разложить свои клетки по уже готовому
 * полу. Сами правила входа живут в `moveBoxes`, поэтому решатель, подсказка и
 * игра всегда используют одну и ту же семантику.
 */
export type MechanicId = 'portal' | 'trap' | 'rotator' | 'switch' | 'oneWay';

/** Черновик поля: маска пола плюс клетки, уже занятые другими механиками. */
export interface FieldDraft {
  size: number;
  floor: Uint8Array;
  /** Индекс y * size + x → тип клетки. */
  cells: Map<number, CellType>;
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

export function freeIndexes(draft: FieldDraft): number[] {
  const result: number[] = [];
  for (let y = 1; y < draft.size - 1; y++) {
    for (let x = 1; x < draft.size - 1; x++) {
      const index = y * draft.size + x;
      if (draft.floor[index] && !draft.cells.has(index)) result.push(index);
    }
  }
  return result;
}

export function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

export function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
