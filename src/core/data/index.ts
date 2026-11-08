import { EPISODE_1 } from './episode-1';
import { GENERATED_EPISODES_DATA } from './generated-episodes';

/**
 * Все эпизоды игры: ручной первый (12 уровней) и пять генерируемых по 8
 * уровней с собственной механикой (см. `generated-episodes.ts`).
 */
export const EPISODES_DATA: string[][][] = [EPISODE_1, ...GENERATED_EPISODES_DATA];

/** Сколько эпизодов в игре — для проверок и сохранения прогресса. */
export const EPISODE_COUNT = EPISODES_DATA.length;
