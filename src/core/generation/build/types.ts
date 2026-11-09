import type { CellType } from '../../types/cell';
import type { Level } from '../../types/level';
import type { Position } from '../../types/position';
import type { MechanicModule } from '../mechanics';
import type { PatternKind } from '../patterns';

/**
 * Способ построить кандидата уровня.
 *
 * Новый способ (посадка обмена, строитель тупиков) не должен требовать правки
 * оркестратора: он получает контекст и возвращает кандидата либо причину
 * отказа. Приёмка у всех способов общая (`accept/criteria.ts`).
 */
export interface BuildContext {
  seed: number;
  attempt: number;
  /** Сторона поля. */
  size: number;
  /** Сколько ходов делает блуждание (включая запас). */
  walkMoves: number;
  /** Верхняя граница кратчайшего решения. */
  maxMoves: number;
  modules: MechanicModule[];
  patterns: PatternKind[];
  budget: number;
  /** Прогресс эпизода 0..1: сила ловушек и агрессивность раскладки. */
  progress: number;
  /** Как переключатель закрывает обход: один выход угла или все сразу. */
  switchGate?: 'single' | 'all';
}

/** Готовый кандидат: поле, сущности и механики до проверки решателем. */
export interface Candidate {
  level: Level;
  rows: string[];
  floor: Uint8Array;
  size: number;
  starts: Position[];
  ends: Position[];
  cells: Map<number, CellType>;
  modules: MechanicModule[];
  /** Сколько ходов прошло блуждание (вход для steer). */
  walkMoves: number;
}

export type BuildFailure =
  | 'no-field'
  | 'no-starts'
  | 'walk-failed'
  | 'mechanic-space'
  | 'end-on-mechanic';

export type BuildOutcome =
  | { ok: true; candidate: Candidate }
  | { ok: false; reason: BuildFailure };

export interface LevelBuilder {
  readonly id: string;
  build(ctx: BuildContext): BuildOutcome;
}
