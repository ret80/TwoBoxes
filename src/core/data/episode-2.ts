import { generateEpisode } from '../generation/level-generator';

/**
 * Данные уровней эпизода 2 (12 сгенерированных уровней).
 *
 * Карты строит процедурный генератор (`level-generator.ts`) — переработка
 * Godot-прототипа `script/game/levels/gen/generate_lvl*.gd`. Сид фиксирован,
 * поэтому эпизод одинаков между запусками, а сохранённый прогресс и подсказки
 * остаются согласованными. Сложность растёт от 5 до 10 ходов.
 */
export const EPISODE_2: string[][] = generateEpisode(0x2b0b2, 12);
