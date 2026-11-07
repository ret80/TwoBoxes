import { CellType } from '../types/cell';
import type { Level } from '../types/level';
import { Position } from '../types/position';
import { solveLevel } from './solver';

/**
 * Модель сложности уровня.
 *
 * Длина решения сама по себе плохо описывает сложность: у самого лёгкого
 * уровня эпизода пять ходов, но найти их труднее, чем десять ходов на открытой
 * площадке. Поэтому оценка собирается из четырёх измеримых величин:
 *
 * - длина кратчайшего решения — сколько ходов надо удержать в голове;
 * - размер пространства состояний — сколько «развилок» реально существует
 *   (открытая площадка даёт мало состояний, лабиринт — много);
 * - доля тупиков — цена ошибки (в исходном 1-4, теперь 1-11, их 48%);
 * - ветвление — плотность вариантов на ход.
 *
 * Веса подобраны так, чтобы ручные уровни эпизода 1 растянулись по всей шкале:
 * 1-1 ≈ 36, исходный 1-4 (теперь 1-11) ≈ 79, исходный 1-10 (теперь 1-12) ≈ 85.
 * По этой оценке уровни эпизода и отсортированы (см. data/episode-1.ts).
 */

export interface DifficultyMetrics {
  /** Длина кратчайшего решения. */
  moves: number;
  /** Размер достижимого пространства состояний. */
  states: number;
  /** Доля достижимых состояний, из которых победа недостижима (0..1). */
  deadEndRatio: number;
  /** Среднее число доступных ходов из состояния. */
  branching: number;
  /** Сколько разных клеток посещают кубики по всему графу. */
  boxCells: number;
  /** Сколько клеток пола на карте. */
  floorCells: number;
  /** Доля клеток пола ровно с двумя соседями — «коридорность» поля. */
  narrowRatio: number;
  /** Итоговая оценка 0..100. */
  score: number;
}

export interface ScoreInput {
  moves: number;
  states: number;
  deadEndRatio: number;
  branching: number;
}

/** Насыщающие точки нормировок: за ними рост метрики уже не влияет. */
const MOVES_CAP = 14;
const STATES_FLOOR = 20;
const STATES_CAP = 400;
const DEAD_END_CAP = 0.4;
const BRANCH_FLOOR = 2.2;
const BRANCH_CAP = 2.9;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Оценка сложности 0..100 по четырём метрикам. */
export function scoreDifficulty(input: ScoreInput): number {
  const moves = clamp01(input.moves / MOVES_CAP) * 55;
  const states =
    clamp01(
      Math.log2(Math.max(STATES_FLOOR, input.states) / STATES_FLOOR) /
        Math.log2(STATES_CAP / STATES_FLOOR),
    ) * 25;
  const deadEnds = clamp01(input.deadEndRatio / DEAD_END_CAP) * 12;
  const branching = clamp01((input.branching - BRANCH_FLOOR) / (BRANCH_CAP - BRANCH_FLOOR)) * 8;
  return Math.round(moves + states + deadEnds + branching);
}

const isFloor = (cell: CellType): boolean =>
  cell !== CellType.WALL && cell !== CellType.UNKNOWN;

/** Доля клеток пола ровно с двумя соседями: коридоры против открытых площадок. */
export function narrowRatio(level: Level): number {
  let floor = 0;
  let narrow = 0;
  const open = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= level.width || y >= level.height) return false;
    return isFloor(level.grid.get(new Position(x, y)));
  };
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (!open(x, y)) continue;
      floor++;
      const neighbors =
        (open(x + 1, y) ? 1 : 0) +
        (open(x - 1, y) ? 1 : 0) +
        (open(x, y + 1) ? 1 : 0) +
        (open(x, y - 1) ? 1 : 0);
      if (neighbors === 2) narrow++;
    }
  }
  return floor === 0 ? 0 : narrow / floor;
}

/**
 * Полный замер уровня. Возвращает null, если решения нет или обход упёрся в
 * предохранитель по числу состояний: такой уровень генератор не принимает.
 */
export function measureLevel(level: Level): DifficultyMetrics | null {
  const solved = solveLevel(level);
  if (!solved) return null;

  let floorCells = 0;
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (isFloor(level.grid.get(new Position(x, y)))) floorCells++;
    }
  }

  const deadEndRatio = solved.states > 0 ? solved.deadEnds / solved.states : 0;

  return {
    moves: solved.solution.length,
    states: solved.states,
    deadEndRatio,
    branching: solved.branching,
    boxCells: solved.boxCells,
    floorCells,
    narrowRatio: narrowRatio(level),
    score: scoreDifficulty({
      moves: solved.solution.length,
      states: solved.states,
      deadEndRatio,
      branching: solved.branching,
    }),
  };
}
