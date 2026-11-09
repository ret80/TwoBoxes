import type { PatternKind } from './patterns';

/**
 * Кривая сложности эпизода — данные, а не код конвейера.
 *
 * Профиль уровня и формула квоты тупиков раньше жили внутри
 * `level-generator.ts`, а отладочное меню повторяло ту же формулу литералами.
 * Теперь одно место: `episodeProfiles` и `deadEndQuota`.
 */

/** Профиль одного уровня эпизода: чем он сложнее, тем больше ходов,
 * пространства, тупиков и структурных элементов поля. */
export interface LevelProfile {
  moves: number;
  size: number;
  budget: number;
  patterns: PatternKind[];
  deadEnds: number;
  score: number;
}

/**
 * Набор паттернов по месту уровня в эпизоде: сначала простая комната, затем
 * коридоры с карманами, в конце — гребёнки, змейки и кресты.
 */
export function patternsForProgress(t: number): PatternKind[] {
  if (t < 0.2) return ['room'];
  if (t < 0.45) return ['room', 'room', 'corridor', 'chamber'];
  if (t < 0.7) return ['room', 'corridor', 'chamber', 'snake', 'room'];
  // В конце — лабиринт, но с комнатами и перекрёстками: одни коридоры дают
  // тонкую «змейку» без единой развилки.
  return ['room', 'corridor', 'comb', 'chamber', 'cross', 'snake'];
}

/**
 * Разрешённая доля тупиков на прогрессе `t` (0..1). Тупики появляются только
 * после первой трети эпизода: ранние уровни должны прощать ошибку.
 */
export function deadEndQuota(t: number): number {
  if (t < 0.34) return 0;
  return Math.round(((0.35 * (t - 0.34)) / 0.66) * 100) / 100;
}

/**
 * Кривая сложности эпизода: от простых уровней к сложным.
 *
 * Первая треть — комната без тупиков и короткое решение: игрок осваивает
 * механику и ничем не наказывается. Дальше включаются коридоры и карманы,
 * разрешённая доля тупиков растёт с 0 до 0.35, длина решения — с 3 до 13,
 * поле — с 8 до 13 клеток.
 */
export function episodeProfiles(count: number): LevelProfile[] {
  const profiles: LevelProfile[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 1 : i / (count - 1);
    profiles.push({
      moves: Math.round(3 + 8 * t),
      size: Math.round(8 + 5 * t),
      budget: Math.round(34 + 70 * t),
      patterns: patternsForProgress(t),
      deadEnds: deadEndQuota(t),
      score: Math.round(28 + 40 * t),
    });
  }
  return profiles;
}

/** Прогресс уровня в эпизоде: 0 — первый, 1 — последний. */
export function progressAt(index: number, count: number): number {
  return count === 1 ? 1 : index / (count - 1);
}
