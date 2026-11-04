/** Результат прохождения уровня (диалог `lvl_completed`). */
export interface GameResult {
  moves: number;
  time: number; // секунды
  completed: boolean;
}
