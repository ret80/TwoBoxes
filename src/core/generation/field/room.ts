import type { Rng } from '../rng';
import { largestFloorComponent } from './mask';

/**
 * Случайная комната: стены по краям и несколько коротких внутренних стенок.
 * В отличие от пустого прямоугольника, такие стенки дают кубикам промежуточные
 * упоры — цели получаются не только по периметру.
 *
 * Возвращает маску пола (1 — пол, 0 — стена) или null, если комната распалась.
 */
export function createField(size: number, rng: Rng): Uint8Array | null {
  const floor = new Uint8Array(size * size);
  floor.fill(1);

  for (let i = 0; i < size; i++) {
    floor[i] = 0;
    floor[(size - 1) * size + i] = 0;
    floor[i * size] = 0;
    floor[i * size + size - 1] = 0;
  }

  const segments = 5 + Math.floor(rng() * 4);
  for (let s = 0; s < segments; s++) {
    const horizontal = rng() < 0.5;
    const length = 2 + Math.floor(rng() * 3);
    if (horizontal) {
      const x = 1 + Math.floor(rng() * (size - 1 - length));
      const y = 1 + Math.floor(rng() * (size - 2));
      for (let i = 0; i < length; i++) floor[y * size + x + i] = 0;
    } else {
      const y = 1 + Math.floor(rng() * (size - 1 - length));
      const x = 1 + Math.floor(rng() * (size - 2));
      for (let i = 0; i < length; i++) floor[(y + i) * size + x] = 0;
    }
  }

  return largestFloorComponent(floor, size, 30);
}
