import type { Level } from '../core/types/level';

/**
 * Обучение (туториал): короткий диалог, который впервые объясняет механику.
 *
 * Тема показывается один раз — на том уровне, где игрок впервые её встречает.
 * Механики открываются по эпизодам (см. `GENERATED_EPISODES`), поэтому
 * обучение привязано к первому уровню эпизода, а не к наличию конкретной клетки
 * на карте: генератор мог не поставить кнопку на первый уровень, а объяснить
 * механику всё равно нужно до того, как игрок на неё наткнётся.
 */
export type TutorialTopic = 'goal' | 'orbit' | 'portal' | 'trap' | 'rotator' | 'switch' | 'oneWay';

/** Первая механика каждого генерируемого эпизода (`episodeId` → тема). */
const EPISODE_INTRO: Record<number, TutorialTopic> = {
  1: 'portal',
  2: 'trap',
  3: 'rotator',
  4: 'switch',
  5: 'oneWay',
};

/**
 * Тема обучения для уровня; `null` — на этом уровне объяснять нечего.
 *
 * Первый уровень игры рассказывает о цели и о том, что кубики ходят парой,
 * третий уровень первого эпизода — о повороте уровня и компасе. Дальше тема
 * берётся из эпизода, в котором механика появляется впервые.
 */
export function tutorialForLevel(level: Level): TutorialTopic | null {
  if (level.episodeId === 0 && level.levelId === 0) return 'goal';
  // Поворот был доступен с самого начала, но на первых двух картах он не нужен:
  // третий уровень — первое место, где без него не обойтись.
  if (level.episodeId === 0 && level.levelId === 2) return 'orbit';
  if (level.levelId !== 0) return null;
  return EPISODE_INTRO[level.episodeId] ?? null;
}

/** Ключи строк: заголовок и текст темы. */
export function tutorialKey(topic: TutorialTopic): { title: string; body: string } {
  const id = topic.toUpperCase();
  return { title: `TUTORIAL_${id}_TITLE`, body: `TUTORIAL_${id}` };
}
