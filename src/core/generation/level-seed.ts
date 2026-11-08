import type { Level } from '../types/level';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Замешать байт в FNV-1a-хэш (32 бита). */
function mix(hash: number, value: number): number {
  return (Math.imul(hash ^ (value & 0xff), FNV_PRIME) >>> 0) as number;
}

/**
 * Сид уровня — 32-битный отпечаток карты: размеры поля и типы всех клеток
 * (стены, порталы, ловушки, ротаторы, кубики, цели).
 *
 * Считается по содержимому, а не берётся из конфигурации генератора, поэтому
 * есть и у ручных карт первого эпизода, и у уровней из отладочного меню. Одна
 * и та же карта всегда даёт одно и то же число, разные карты — разные (с
 * точностью до коллизии).
 */
export function levelSeed(level: Level): number {
  let hash = FNV_OFFSET;
  hash = mix(hash, level.width);
  hash = mix(hash, level.height);
  for (const cell of level.grid.toFlat()) hash = mix(hash, cell);
  return hash >>> 0;
}

/** Сид для показа игроку: `0x` и восемь hex-цифр, как у констант в коде. */
export function formatLevelSeed(seed: number): string {
  return `0x${seed.toString(16).padStart(8, '0')}`;
}
