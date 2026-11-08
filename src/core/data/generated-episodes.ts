import type { MechanicId } from '../generation/mechanics';

/**
 * Эпизоды, которые строит генератор (второй и далее).
 *
 * Первый эпизод — ручной (12 карт, `episode-1.ts`). Остальные собираются в
 * фоне по одной теме на эпизод: эпизод 2 — только порталы, 3 — ловушки,
 * 4 — ротаторы, 5 — переключатели, 6 — односторонние клетки. Внутри эпизода
 * сложность растёт от первого уровня к последнему (см. `episodeProfiles`).
 *
 * Механики задаются списком: зависимости подключаются сами (`resolveMechanics`),
 * поэтому эпизод с переключателями получает и ротаторы — без них кнопка
 * бессмысленна.
 */
export interface GeneratedEpisodeConfig {
  /** Номер эпизода в общем списке (0 — ручной первый). */
  episodeId: number;
  /** Сид генерации: эпизод одинаков между запусками. */
  seed: number;
  levelCount: number;
  /** Темообразующие механики эпизода. */
  mechanics: MechanicId[];
}

/** В ручном первом эпизоде 12 уровней, в генерируемых — по 8. */
export const GENERATED_EPISODE_LEVELS = 8;

export const GENERATED_EPISODES: GeneratedEpisodeConfig[] = [
  { episodeId: 1, seed: 0x2b0b2, levelCount: GENERATED_EPISODE_LEVELS, mechanics: ['portal'] },
  { episodeId: 2, seed: 0x3c1c3, levelCount: GENERATED_EPISODE_LEVELS, mechanics: ['trap'] },
  { episodeId: 3, seed: 0x4d2d4, levelCount: GENERATED_EPISODE_LEVELS, mechanics: ['rotator'] },
  { episodeId: 4, seed: 0x5e3e5, levelCount: GENERATED_EPISODE_LEVELS, mechanics: ['switch'] },
  { episodeId: 5, seed: 0x6f4f6, levelCount: GENERATED_EPISODE_LEVELS, mechanics: ['oneWay'] },
];

/**
 * Пустые слоты генерируемых эпизодов. Список уровней в селекторе виден сразу,
 * а карту конкретного слота заполняет воркер (`EPISODES_DATA` в `./index.ts`).
 */
export const GENERATED_EPISODES_DATA: string[][][] = GENERATED_EPISODES.map((config) =>
  Array.from({ length: config.levelCount }, () => [] as string[]),
);

/** Тема эпизода (для заголовка в селекторе): первая заявленная механика. */
export function episodeTheme(episodeId: number): MechanicId | null {
  return GENERATED_EPISODES.find((config) => config.episodeId === episodeId)?.mechanics[0] ?? null;
}
