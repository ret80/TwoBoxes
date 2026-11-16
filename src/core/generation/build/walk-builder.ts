import { createRng, mixSeed } from '../rng';
import type { BuildContext, BuildOutcome } from './types';
import { finishCandidate, prepareStage } from './stage';

/**
 * Строитель «от решения»: выбираем старты, блуждаем кубиками и ставим цели
 * там, где они остановились.
 *
 * Отличие от прежнего конвейера — порядок механик. Раньше они раскладывались
 * по случайным клеткам **до** маршрута, а приёмка требовала, чтобы маршрут их
 * задел. Это лотерея: для переключателя и ловушки вероятность попадания мала,
 * и генератор сотни раз платил полный BFS за проигранный билет. Теперь:
 *
 * 1. чистое блуждание даёт маршрут;
 * 2. механики ставятся **на клетки маршрута** (с ограничениями модуля);
 * 3. блуждание повторяется уже с механиками — цели снова стоят там, где
 *    кубики реально остановились.
 *
 * Приёмка не ослабляется: решатель по-прежнему независимо проверяет уровень.
 * Общие шаги (поле, старты, блуждания, проверка карты) — в `stage.ts`.
 */
export function buildWalkCandidate(ctx: BuildContext): BuildOutcome {
  const rng = createRng(mixSeed(ctx.seed, ctx.attempt, 0x51ed));

  const prepared = prepareStage(ctx, rng);
  if (!prepared.ok) return prepared;
  const { stage } = prepared;

  for (const module of ctx.modules) {
    if (!module.place(stage.draft, rng)) return { ok: false, reason: 'mechanic-space' };
  }

  return finishCandidate({ ctx, rng, stage });
}

export { continueWalk, boxesAt, type Walk } from './stage';
