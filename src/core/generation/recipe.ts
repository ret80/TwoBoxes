/**
 * Протокол «сид ↔ рецепт».
 *
 * Раньше арифметика сида была размазана по `episodeLevelOptions`,
 * `rebuildEpisodeLevel`, демо- и тестовому уровням: константы жили в одном
 * месте, а литералы `104729`/`15485863` — ещё в двух. Здесь единственный
 * владелец: шаги, число попыток и версия рецепта.
 *
 * Версия повышается, когда меняется распределение `rng` или порядок
 * построения: карты под прежними сидами перестают совпадать. Сохранения игры
 * хранят только прогресс, а не карты и не сиды, поэтому прогресс игроков не
 * страдает; но снапшот карт (`recipe.test.ts`) ловит случайную правку кривой.
 */
export const RECIPE_VERSION = 3;

/** Сид следующего уровня внутри эпизода (номера идут арифметической прогрессией). */
export const LEVEL_SEED_STEP = 104729;

/** Шаг между попытками поиска карты для одного и того же уровня. */
export const ATTEMPT_SEED_STEP = 15485863;

/** Сколько попыток перебирает генерация уровня эпизода, прежде чем сдаться. */
export const EPISODE_ATTEMPTS = 24;

/** Детерминированный бюджет построений на один уровень. */
export const BUILD_ATTEMPTS = 140;

/** Сид попытки уровня: единственное число, из которого восстанавливается рецепт. */
export function levelSeedAt(seed: number, index: number, attempt: number): number {
  return seed + index * LEVEL_SEED_STEP + attempt * ATTEMPT_SEED_STEP;
}

/**
 * Номер попытки из сида уровня. `null` — сид не из этого эпизода/уровня или
 * выходит за число попыток.
 */
export function decodeAttempt(
  seed: number,
  index: number,
  levelSeed: number,
): number | null {
  const offset = levelSeed - seed - index * LEVEL_SEED_STEP;
  if (offset < 0 || offset % ATTEMPT_SEED_STEP !== 0) return null;
  const attempt = offset / ATTEMPT_SEED_STEP;
  if (!Number.isInteger(attempt) || attempt >= EPISODE_ATTEMPTS) return null;
  return attempt;
}
