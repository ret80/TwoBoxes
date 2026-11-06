/** Результат прохождения уровня (диалог `lvl_completed`). */
export interface GameResult {
  moves: number;
  time: number; // секунды
  completed: boolean;
  /** Сколько раз игрок пользовался подсказкой на этом прохождении. */
  hints: number;
  /** Минимальное число ходов, за которое уровень проходится. */
  minMoves: number;
  /** Звёзды за прохождение: 3 — идеально, 2 — близко к минимуму, 1 — остальное. */
  stars: number;
}

/**
 * Звёзды за прохождение.
 *
 * Минимум ходов — это уже идеальное решение, поэтому 3 звезды даются строго за
 * него. Вторая ступень — «почти идеально»: не больше половины лишних ходов
 * сверх минимума (минимум один запасной ход, иначе одна ошибка на коротком
 * уровне сразу роняла бы оценку). Всё остальное — одна звезда: уровень всё
 * равно пройден.
 */
export function starsForMoves(moves: number, minMoves: number): number {
  if (minMoves <= 0) return 3;
  if (moves <= minMoves) return 3;
  const slack = Math.max(1, Math.ceil(minMoves * 0.5));
  if (moves <= minMoves + slack) return 2;
  return 1;
}
