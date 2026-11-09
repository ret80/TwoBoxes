import type { Position } from '../../types/position';
import type { Candidate } from '../build/types';
import { analyzeLevel } from '../check/analyzer';
import { scoreDifficulty } from '../difficulty';
import type { MechanicId } from '../mechanics';
import { mechanicsInSolution, stripMechanics, trapMetrics } from './mechanic-proof';

/**
 * Приёмка кандидата знает, **почему** отказала.
 *
 * Раньше отказ был просто `continue`: следующий кандидат строился с нуля и
 * вслепую. Причина и величина промаха (`delta`) — вход для политики попыток:
 * «не хватило ходов» увеличивает блуждание, «перебор» уменьшает.
 *
 * `score` здесь только считается и возвращается: это целевая функция выбора
 * между принятыми кандидатами, а не жёсткий фильтр. Прежний фильтр
 * `score ± tolerance` делал профиль невыполнимым, потому что оценка —
 * производная от длины решения, состояний и ветвления.
 */

export type RejectionReason =
  | 'too-large'
  | 'unsolvable'
  | 'moves-short'
  | 'moves-long'
  | 'dead-ends'
  | 'idle-box'
  | 'mechanic-untouched'
  | 'mechanic-not-required';

export interface AcceptedCandidate {
  ok: true;
  candidate: Candidate;
  solution: Position[];
  score: number;
  deadEndRatio: number;
  states: number;
  mechanics: MechanicId[];
  trapHits: number;
  trapWaits: number;
}

export interface RejectedCandidate {
  ok: false;
  reason: RejectionReason;
  /** Насколько мимо цели: ходы, доля тупиков, недостающие механики. */
  delta?: number;
}

export type Acceptance = AcceptedCandidate | RejectedCandidate;

export interface AcceptOptions {
  /** Нижняя граница кратчайшего решения. */
  moves: number;
  /** Верхняя граница кратчайшего решения. */
  maxMoves: number;
  /** Разрешённая доля тупиков. */
  allowedDeadEnds: number;
  /** Требуемая доля тупиков (хвост эпизода). */
  minDeadEnds?: number;
  /**
   * Требовать, чтобы каждая механика была необходима: уровень без неё не
   * должен решаться за то же число ходов. По умолчанию включено для
   * тематических уровней.
   */
  requireMechanics?: boolean;
}

export function acceptCandidate(
  candidate: Candidate,
  options: AcceptOptions,
): Acceptance {
  // Один обход: границы решения отсекают кандидата до полного анализа тупиков.
  const analysis = analyzeLevel(candidate.level, {
    minSolutionLength: options.moves,
    maxSolutionLength: options.maxMoves,
  });

  switch (analysis.kind) {
    case 'tooShort':
      return { ok: false, reason: 'moves-short', delta: options.moves - analysis.moves };
    case 'tooLong':
      return { ok: false, reason: 'moves-long', delta: analysis.moves - options.maxMoves };
    case 'tooLarge':
      return { ok: false, reason: 'too-large' };
    case 'unsolvable':
      return { ok: false, reason: 'unsolvable' };
  }

  const deadEndRatio = analysis.states > 0 ? analysis.deadEnds / analysis.states : 0;
  if (deadEndRatio > options.allowedDeadEnds) {
    return {
      ok: false,
      reason: 'dead-ends',
      delta: deadEndRatio - options.allowedDeadEnds,
    };
  }
  if (deadEndRatio < (options.minDeadEnds ?? 0)) {
    return {
      ok: false,
      reason: 'dead-ends',
      delta: deadEndRatio - (options.minDeadEnds ?? 0),
    };
  }

  // Оба кубика должны реально участвовать в решении.
  if (analysis.movesByBox[0] < 2 || analysis.movesByBox[1] < 2) {
    return { ok: false, reason: 'idle-box' };
  }

  // Каждая выбранная механика должна встречаться на траектории решения.
  const used = mechanicsInSolution(candidate.level, analysis.solution, candidate.modules);
  const traps = candidate.modules.some((module) => module.id === 'trap')
    ? trapMetrics(candidate.level, analysis.solution)
    : { hits: 0, waits: 0 };
  if (candidate.modules.length > 0 && used.length < candidate.modules.length) {
    return {
      ok: false,
      reason: 'mechanic-untouched',
      delta: candidate.modules.length - used.length,
    };
  }

  // «Механика нужна», а не «механику задели»: убираем клетки механики и
  // смотрим, не решается ли уровень без неё не длиннее. Это то же требование,
  // которое уровень-обмен уже выполнял через `forbidPortalSwaps`.
  if (options.requireMechanics !== false) {
    for (const module of candidate.modules) {
      const bare = stripMechanics(candidate.level, [module.id]);
      const proof = analyzeLevel(bare, {
        maxSolutionLength: analysis.solution.length,
      });
      if (proof.kind === 'solved') {
        return { ok: false, reason: 'mechanic-not-required' };
      }
      // «Граф слишком велик» — не доказательство необходимости.
      if (proof.kind === 'tooLarge') {
        return { ok: false, reason: 'mechanic-not-required' };
      }
    }
  }

  return {
    ok: true,
    candidate,
    solution: analysis.solution,
    score: scoreDifficulty({
      moves: analysis.solution.length,
      states: analysis.states,
      deadEndRatio,
      branching: analysis.branching,
    }),
    deadEndRatio,
    states: analysis.states,
    mechanics: used.map((module) => module.id),
    trapHits: traps.hits,
    trapWaits: traps.waits,
  };
}
