import { Box } from './entity';
import { Level } from './level';

/** Изменяемое состояние игрового процесса текущего уровня. */
export interface GameState {
  level: Level;
  boxes: Box[];
  moves: number;
  time: number; // секунды с начала уровня
}
