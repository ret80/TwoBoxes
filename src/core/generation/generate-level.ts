import { Position } from '../types/position';
import { buildSwapLevel } from './build/swap-builder';
import { buildTrapGateCandidate } from './build/trap-gate';
import { buildWalkCandidate } from './build/walk-builder';
import { acceptCandidate, type AcceptedCandidate } from './accept/criteria';
import type { PatternKind } from './patterns';
import { resolveMechanics, type MechanicId } from './mechanics';
import { BUILD_ATTEMPTS } from './recipe';

/**
 * Генератор уровней для эпизода 2 — переработанный прототип
 * `script/game/level/generate_lvl*.gd` из Godot-версии.
 *
 * Идея прототипа сохранена: уровень строится «от решения» — выбираются
 * случайные старты, затем кубики серией случайных ходов доводятся до финиша,
 * а цели ставятся в конечные позиции. В отличие от прототипа:
 * - ходы считаются по точным правилам игры (все кубики скользят до упора,
 *   ведущий первым), поэтому записанная последовательность действительно
 *   проходит уровень;
 * - поле — комната или паттерновая сборка, а не пустой квадрат;
 * - механики ставятся **на маршрут** кубиков, а не в случайные клетки;
 * - каждый кандидат проверяется одним независимым обходом пространства
 *   состояний: длина решения, тупики и метрики берутся из одного графа;
 * - отказ приёмки возвращает причину, и следующая попытка строится с
 *   поправкой, а не с нуля вслепую.
 *
 * Сложность задаётся профилем (`curve.ts`). Из нескольких подходящих
 * кандидатов выбирается тот, чья оценка сложности ближе к цели профиля.
 * Генерация детерминирована сидом.
 */

export interface GeneratedLevel {
  rows: string[];
  /** Проверенная последовательность ходов от стартов до целей. */
  solution: Position[];
  /** Оценка сложности 0..100 (см. `difficulty.ts`). */
  score: number;
  /** Доля достижимых состояний, из которых победа недостижима. */
  deadEndRatio: number;
  /** Механики, которые реально встречаются в решении. */
  mechanics: MechanicId[];
  /** Сколько раз на решении сработали ловушки. */
  trapHits: number;
  /** Суммарная задержка ловушек на решении, в ходах. */
  trapWaits: number;
}

export interface GenerateLevelOptions {
  seed: number;
  /** Сколько ходов должно быть в решении. */
  moves: number;
  /** Сторона квадратного поля (включая стены по краям). */
  size?: number;
  /** Допустимая доля тупиков: 0 — уровень прощает любую ошибку. */
  deadEnds?: number;
  /** Требуемая доля тупиков: поздние уровни должны наказывать за ошибку. */
  minDeadEnds?: number;
  /** Паттерны поля; пусто — случайные стенки в комнате, как раньше. */
  patterns?: PatternKind[];
  /** Потолок клеток пола при паттерновой сборке. */
  budget?: number;
  /** Целевая оценка сложности: из кандидатов выбирается ближайший. */
  score?: number;
  /** Верхняя граница длины решения (по умолчанию `moves + 3`). */
  maxMoves?: number;
  /** Сколько подходящих кандидатов сравнивать (по умолчанию 1). */
  candidates?: number;
  /** Подключённые механики; пусто — классический уровень. */
  mechanics?: MechanicId[];
  /** Прогресс эпизода 0..1: ранние уровни получают слабые ловушки. */
  progress?: number;
  /**
   * Детерминированный бюджет построений на один уровень. В отличие от
   * wall-clock ограничения, он не ломает воспроизводимость по сиду.
   */
  buildAttempts?: number;
  /**
   * Уровень «только обменом»: кратчайшее решение обязано использовать обмен
   * кубиков местами через портал, и маршрута без обмена быть не должно.
   */
  requirePortalSwap?: boolean;
}

/**
 * Сгенерировать один уровень. Возвращает null, если за отведённый бюджет не
 * удалось получить корректную карту.
 */
export function generateLevel(options: GenerateLevelOptions): GeneratedLevel | null {
  // Уровень «только обменом» собирается другим способом: перебором маленьких
  // комнат, а не случайным блужданием по полю. На этапе строителей это станет
  // отдельным `LevelBuilder`, а не веткой конвейера.
  if (options.requirePortalSwap) return buildSwapLevel(options);

  const size = options.size ?? 10;
  if (size < 7 || options.moves < 2) return null;
  const maxMoves = Math.max(options.moves, options.maxMoves ?? options.moves + 3);
  const modules = resolveMechanics(options.mechanics ?? []);
  const patterns = options.patterns ?? [];
  const budget = options.budget ?? Math.round(size * size * 0.55);
  const progress = Math.min(1, Math.max(0, options.progress ?? 0.5));
  const hasTrap = modules.some((module) => module.id === 'trap');
  const targetCandidates = Math.max(1, options.candidates ?? 1);
  const attempts = Math.max(1, options.buildAttempts ?? BUILD_ATTEMPTS);

  // Запас пути генератора: BFS должен иметь место найти короткий обход.
  let walkMoves = maxMoves + 1;
  const accepted: AcceptedCandidate[] = [];

  /** Один проход построений; останавливается, когда набрано `targetCandidates`. */
  const collect = (from: number, to: number, requireMechanics: boolean): void => {
    for (let attempt = from; attempt < to; attempt++) {
      const context = {
        seed: options.seed,
        attempt,
        size,
        walkMoves,
        maxMoves,
        modules,
        patterns,
        budget,
        progress,
      };
      // Ловушки строим через «ворота»: они дают осмысленную задержку чаще,
      // чем случайная клетка на маршруте. Если геометрия не сложилась — тот
      // же attempt повторяем обычным способом.
      let outcome = hasTrap
        ? buildTrapGateCandidate(context)
        : buildWalkCandidate(context);
      if (!outcome.ok && hasTrap) outcome = buildWalkCandidate(context);
      if (!outcome.ok) continue;

      const verdict = acceptCandidate(outcome.candidate, {
        moves: options.moves,
        maxMoves,
        allowedDeadEnds: options.deadEnds ?? 0,
        minDeadEnds: options.minDeadEnds,
        requireMechanics,
      });

      if (!verdict.ok) {
        // Обратная связь приёмки: «коротко» — удлинить блуждание, «длинно» —
        // укоротить. Это и есть настройка вместо перезапуска лотереи.
        if (verdict.reason === 'moves-short') {
          walkMoves = Math.min(maxMoves + 3, walkMoves + Math.min(3, verdict.delta ?? 1));
        } else if (verdict.reason === 'moves-long') {
          walkMoves = Math.max(options.moves + 1, walkMoves - Math.min(3, verdict.delta ?? 1));
        }
        continue;
      }

      accepted.push(verdict);
      if (accepted.length >= targetCandidates) return;
    }
  };

  // Сначала строгая приёмка: механика обязана быть необходимой. Для
  // переключателя это редкое свойство — если за отведённую долю бюджета
  // строгих кандидатов нет, добираем расслабленных, иначе эпизод не соберётся.
  const strictEnd = Math.min(attempts, Math.max(20, Math.round(attempts * 0.45)));
  collect(0, strictEnd, modules.length > 0);
  if (accepted.length === 0 && attempts > strictEnd) {
    collect(strictEnd, attempts, false);
  }

  if (accepted.length === 0) return null;

  const chosen = chooseCandidate(accepted, options.score);
  return {
    rows: chosen.candidate.rows,
    solution: chosen.solution,
    score: chosen.score,
    deadEndRatio: chosen.deadEndRatio,
    mechanics: chosen.mechanics,
    trapHits: chosen.trapHits,
    trapWaits: chosen.trapWaits,
  };
}

/** Без цели по сложности подходит первый; с целью — ближайший к ней. */
function chooseCandidate(
  accepted: AcceptedCandidate[],
  target: number | undefined,
): AcceptedCandidate {
  if (target === undefined) return accepted[0];
  return accepted.reduce((best, candidate) =>
    Math.abs(candidate.score - target) < Math.abs(best.score - target)
      ? candidate
      : best,
  );
}

