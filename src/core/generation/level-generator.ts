/**
 * Публичный фасад генератора.
 *
 * Оркестрация уровня — `generate-level.ts`, рецепт эпизода — `episode.ts`,
 * демо и отладочные уровни — отдельные модули, кривая — `curve.ts`. Файл
 * оставлен точкой входа, чтобы вызывающие не зависели от внутренней
 * раскладки: `generateLevel`, `generateEpisode`, `rebuildEpisodeLevel` и
 * `episodeProfiles` импортируются отсюда, как раньше.
 */
export { generateLevel } from './generate-level';
export type { GeneratedLevel, GenerateLevelOptions } from './generate-level';

export {
  generateEpisode,
  generateEpisodeLevel,
  generateEpisodeLevelRecipe,
  rebuildEpisodeLevel,
} from './episode';
export type { EpisodeLevelRecipe } from './episode';

export { generateDemoLevel } from './demo';
export { generateTestLevel } from './debug-levels';
export type { TestLevelOptions } from './debug-levels';

export { episodeProfiles } from './curve';
export type { LevelProfile } from './curve';
