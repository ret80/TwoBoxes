import { createLevelFromData } from './create';
import { Level } from '../types/level';

/**
 * Полный сброс уровня — пересоздание из исходных данных
 * (аналог `reset()` в game.gd, раздел 5.1 документации).
 */
export function resetLevel(rows: string[], episodeId: number, levelId: number): Level {
  return createLevelFromData(episodeId, levelId, rows);
}
