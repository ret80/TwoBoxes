import type { Box } from '../../types/entity';
import type { MechanicState } from '../../types/mechanic-state';

/**
 * Числовой ключ состояния поиска.
 *
 * Раньше ключ собирался строкой (`x,y|x,y#0,0#1`), а `join` был самой горячей
 * аллокацией BFS. Здесь то же состояние кодируется числом без коллизий:
 * позиция кубика — индекс клетки, затем счётчики ловушек (0..2) и флаг
 * ротаторов. Для поля 20×20 и трёх кубиков ключ остаётся точным целым
 * (< 2^53), поэтому `Map<number, …>` работает быстрее строкового.
 *
 * Порядок кубиков входит в ключ: кубики цветные, и «красный слева, жёлтый
 * справа» — не то же состояние, что наоборот.
 */
export function stateKey(
  boxes: readonly Box[],
  state: MechanicState,
  width: number,
  cells: number,
): number {
  let key = 0;
  for (const box of boxes) key = key * cells + (box.pos.y * width + box.pos.x);
  for (let i = 0; i < boxes.length; i++) {
    const lock = state.locks[i] ?? 0;
    key = key * 3 + (lock > 2 ? 2 : lock);
  }
  return key * 2 + (state.rotorFlip ? 1 : 0);
}
