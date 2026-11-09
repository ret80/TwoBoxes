import { generateLevel } from './generate-level';
import type { MechanicId } from './mechanics';
import { levelSeedAt } from './recipe';

/**
 * Уровень демо-фона главного меню: короткое решение и простая комната без
 * тупиков. Механики эпизода при этом обязательные — иначе демо показывает не ту
 * игру, в которую игрок только что играл.
 *
 * Профиль нарочно лёгкий: компьютер в меню переставляет кубики сам, и уровень
 * должен проходиться за несколько ходов, пока игрок выбирает пункт меню.
 */
export function generateDemoLevel(
  seed: number,
  index: number,
  mechanics: MechanicId[] = [],
): string[] {
  for (let attempt = 0; attempt < 12; attempt++) {
    const generated = generateLevel({
      seed: levelSeedAt(seed, index, attempt),
      moves: 3,
      maxMoves: 4,
      size: 8,
      budget: 34,
      patterns: ['room'],
      deadEnds: 0,
      score: 24,
      candidates: 2,
      buildAttempts: 60,
      mechanics,
    });
    if (generated) return generated.rows;
  }
  throw new Error(
    `Не удалось сгенерировать демо-уровень ${index + 1}` +
      (mechanics.length > 0 ? ` (механики: ${mechanics.join(', ')})` : ''),
  );
}

