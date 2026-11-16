import { deadEndQuota, patternsForProgress } from './curve';
import { generateLevel, type GeneratedLevel } from './generate-level';
import type { MechanicId } from './mechanics';
import { levelSeedAt } from './recipe';

/** Параметры тестового уровня из отладочного меню. */
export interface TestLevelOptions {
  mechanics: MechanicId[];
  /**
   * Целевая сложность 0..100. Влияет только на выбор сида (см. `pickTestSeed`):
   * сам уровень целиком определяется сидом, иначе тот же сид с другим
   * положением ползунка давал бы другую карту.
   */
  difficulty: number;
  seed?: number;
}

/**
 * Перемешать число в 32 бита (финализатор вида murmur) и получить долю 0..1.
 * Нужен «разброс»: соседние сиды должны давать независимые сложности, а не
 * почти одинаковые уровни.
 */
function seedUnit(seed: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 0x100000000;
}

/**
 * Рабочий диапазон сложности тестовых уровней. Слишком простые наборы (три
 * хода на поле 8×8) часто не дают разместить выбранную механику, поэтому
 * крайние значения шкалы сжаты к середине.
 */
const TEST_PROGRESS_MIN = 0.25;
const TEST_PROGRESS_MAX = 0.95;

/**
 * Сложность, зашитая в сид: 0..1. Из неё выводятся размер поля, число ходов,
 * бюджет построек и профиль кривой, поэтому по одному сиду карта
 * восстанавливается целиком — независимо от того, где стоит ползунок.
 */
export function testLevelProgress(seed: number): number {
  return TEST_PROGRESS_MIN + (TEST_PROGRESS_MAX - TEST_PROGRESS_MIN) * seedUnit(seed);
}

/**
 * Случайный сид, у которого зашитая сложность близка к выбранной на ползунке:
 * перебираем кандидатов и берём ближайшего (обычно хватает пары десятков
 * розыгрышей, чтобы попасть в ±2 балла).
 */
export function pickTestSeed(difficulty: number, random: () => number = Math.random): number {
  const target = Math.min(1, Math.max(0, difficulty / 100));
  const draw = (): number => Math.floor(random() * 0x100000000) >>> 0;
  let best = draw();
  let bestError = Math.abs(testLevelProgress(best) - target);
  for (let i = 0; i < 63 && bestError > 0.02; i++) {
    const candidate = draw();
    const error = Math.abs(testLevelProgress(candidate) - target);
    if (error < bestError) {
      best = candidate;
      bestError = error;
    }
  }
  return best >>> 0;
}

/**
 * Уровень для отладочного меню. Тот же конвейер, что и у эпизода, плюс
 * выбранные механики; сложность и размеры берутся из сида, а не из ползунка —
 * так сид однозначно задаёт карту.
 */
export function generateTestLevel(options: TestLevelOptions): GeneratedLevel | null {
  const seed = options.seed ?? pickTestSeed(options.difficulty);
  const t = testLevelProgress(seed);
  const moves = Math.round(3 + 9 * t);
  const size = Math.round(8 + 5 * t);
  const target = Math.round(t * 100);

  // Независимые сиды попыток: при неудачной раскладке один кандидат может не
  // дать маршрута, но следующий обычно даёт. На верхнем краю шкалы (длинный
  // путь и большая карта с механикой) попыток нужно заметно больше.
  for (let attempt = 0; attempt < 16; attempt++) {
    const generated = generateLevel({
      seed: levelSeedAt(seed, 0, attempt),
      moves,
      maxMoves: moves + 2,
      size,
      budget: Math.round(34 + 70 * t),
      patterns: patternsForProgress(t),
      deadEnds: deadEndQuota(t),
      score: target,
      candidates: 4,
      buildAttempts: 100,
      mechanics: options.mechanics,
      progress: t,
    });
    if (generated) return generated;
  }
  return null;
}
