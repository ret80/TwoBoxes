import { episodeProfiles, progressAt } from './curve';
import {
  generateLevel,
  type GeneratedLevel,
  type GenerateLevelOptions,
} from './generate-level';
import type { MechanicId } from './mechanics';
import { EPISODE_ATTEMPTS, decodeAttempt, levelSeedAt } from './recipe';

/* ------------------------------------------------------------------------- */
/* Эпизод: рецепт и кривая                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Параметры генерации уровня эпизода. Сид попытки плюс профиль — весь рецепт:
 * повторный `generateLevel` с этими же опциями даёт ту же карту.
 */
function episodeLevelOptions(
  seed: number,
  index: number,
  count: number,
  mechanics: MechanicId[],
  attempt: number,
): GenerateLevelOptions {
  const profile = episodeProfiles(count)[index];
  if (!profile) throw new Error(`Профиль уровня ${index + 1} не найден`);
  return {
    seed: levelSeedAt(seed, index, attempt),
    moves: profile.moves,
    maxMoves: profile.moves + (profile.moves <= 5 ? 1 : 3),
    size: profile.size,
    budget: profile.budget,
    patterns: profile.patterns,
    deadEnds: profile.deadEnds,
    score: profile.score,
    candidates: 4,
    mechanics,
    progress: progressAt(index, count),
  };
}

/**
 * Сид уровня вместе с рецептом: `seed` — тот самый сид, с которым карта
 * получилась, по нему уровень собирается заново (`rebuildEpisodeLevel`).
 */
export interface EpisodeLevelRecipe {
  rows: string[];
  seed: number;
}

/**
 * Сгенерировать уровень эпизода и вернуть его настоящий сид — для показа
 * игроку и повторной сборки карты.
 */
export function generateEpisodeLevelRecipe(
  seed: number,
  index: number,
  count: number,
  mechanics: MechanicId[] = [],
): EpisodeLevelRecipe {
  let generated: GeneratedLevel | null = null;
  let options: GenerateLevelOptions | null = null;
  for (let attempt = 0; attempt < EPISODE_ATTEMPTS && !generated; attempt++) {
    options = episodeLevelOptions(seed, index, count, mechanics, attempt);
    generated = generateLevel(options);
  }
  if (!generated) {
    const profile = episodeProfiles(count)[index];
    throw new Error(
      `Не удалось сгенерировать уровень ${index + 1} ` +
        `(${profile.moves} ходов, ${profile.size}×${profile.size}, ` +
        `тупики ≤ ${profile.deadEnds}, оценка ≈ ${profile.score}` +
        (mechanics.length > 0 ? `, механики: ${mechanics.join(', ')}` : '') +
        ')',
    );
  }
  return { rows: generated.rows, seed: options?.seed ?? seed };
}

/**
 * Сгенерировать один уровень эпизода по его профилю. Воркер вызывает эту
 * функцию поштучно, поэтому приоритетный уровень можно посчитать первым, а
 * очередь остальных продолжить после него.
 */
export function generateEpisodeLevel(
  seed: number,
  index: number,
  count: number,
  mechanics: MechanicId[] = [],
): string[] {
  return generateEpisodeLevelRecipe(seed, index, count, mechanics).rows;
}

/**
 * Собрать уровень эпизода заново по его сиду: рецепт (профиль уровня, номер
 * попытки, механики) восстанавливается из сида, поэтому генератор выдаёт ту же
 * самую карту. `null` — сид не из этого эпизода.
 */
export function rebuildEpisodeLevel(
  seed: number,
  index: number,
  count: number,
  mechanics: MechanicId[],
  levelSeed: number,
): string[] | null {
  const attempt = decodeAttempt(seed, index, levelSeed);
  if (attempt === null) return null;
  return generateLevel(episodeLevelOptions(seed, index, count, mechanics, attempt))?.rows ?? null;
}

/**
 * Сгенерировать эпизод по кривой сложности. Сид фиксирован, поэтому эпизод
 * детерминирован.
 */
export function generateEpisode(
  seed: number,
  count: number,
  mechanics: MechanicId[] = [],
): string[][] {
  const levels: string[][] = [];
  for (let i = 0; i < count; i++) levels.push(generateEpisodeLevel(seed, i, count, mechanics));
  return levels;
}

