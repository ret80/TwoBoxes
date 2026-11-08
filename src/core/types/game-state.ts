import { Box } from './entity';
import { Level } from './level';
import type { MechanicState } from './mechanic-state';
import type { Position } from './position';

/** Одна точка фактического пути кубика (порталы помечены `teleport`). */
export interface PathPoint {
  pos: Position;
  /** Кубик мгновенно оказался здесь (выход портала), а не проехал по прямой. */
  teleport?: boolean;
}

/** Изменяемое состояние игрового процесса текущего уровня. */
export interface GameState {
  level: Level;
  boxes: Box[];
  moves: number;
  time: number; // секунды с начала уровня
  /** Ловушки, переключатели и прочие состояния, переживающие ход. */
  mechanicState?: MechanicState;
  /** Фактические пути кубиков за этот ход — для анимации через порталы/ротаторы. */
  paths?: PathPoint[][];
  /** Сколько раз кубики поменялись местами через портал в этом ходу (0 или 1). */
  portalSwaps?: number;
}
