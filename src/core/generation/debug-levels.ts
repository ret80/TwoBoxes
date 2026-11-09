import { deadEndQuota, patternsForProgress } from './curve';
import { generateLevel, type GeneratedLevel } from './generate-level';
import type { MechanicId } from './mechanics';
import { levelSeedAt } from './recipe';

/** Параметры тестового уровня из отладочного меню. */
export interface TestLevelOptions {
  mechanics: MechanicId[];
  /** Целевая сложность 0..100. */
  difficulty: number;
  seed?: number;
}

/**
 * Уровень для отладочного меню: сложность задаётся ползунком, а не местом в
 * эпизоде. Тот же конвейер, что и у эпизода, плюс выбранные механики.
 */
export function generateTestLevel(options: TestLevelOptions): GeneratedLevel | null {
  const t = Math.min(1, Math.max(0, options.difficulty / 100));
  const moves = Math.round(3 + 9 * t);
  const size = Math.round(8 + 5 * t);
  const seed = options.seed ?? 0x7e57;
  const target = Math.round(options.difficulty);

  // Несколько независимых сидов: при неудачной раскладке один кандидат может
  // не дать маршрута, но следующий обычно даёт.
  for (let attempt = 0; attempt < 8; attempt++) {
    const generated = generateLevel({
      seed: levelSeedAt(seed, 0, attempt),
      moves,
      maxMoves: moves + 2,
      size,
      budget: Math.round(34 + 70 * t),
      patterns: patternsForProgress(t),
      deadEnds: deadEndQuota(t),
      score: target,
      candidates: 4,
      buildAttempts: 100,
      mechanics: options.mechanics,
      progress: t,
    });
    if (generated) return generated;
  }
  return null;
}
