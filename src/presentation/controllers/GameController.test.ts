import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { createGameMachine } from '../../core/state/game';
import { EpisodeManager } from '../../core/services/episode-mng';
import { Statistics } from '../../core/services/statistics';
import type { IAudio } from '../../ports/IAudio';
import type { IRenderer, MoveAnimation, RenderState } from '../../ports/IRenderer';
import type { ISaveStorage } from '../../ports/ISaveStorage';
import { GameController } from './GameController';
import { generateTestLevel } from '../../core/generation/level-generator';
import { formatLevelSeed } from '../../core/generation/level-seed';
import { createLevelFromData } from '../../core/rules/create';
import { DIRS } from '../../core/types/position';

/** Рендер-заглушка: анимации завершаются синхронно. */
class FakeRenderer implements IRenderer {
  moves: MoveAnimation[] = [];
  /** Слушатель телепорта: заглушка запоминает его, тест зовёт его сам. */
  portal: ((durationMs: number) => void) | null = null;

  init(): void {}
  resize(): void {}
  render(): void {}
  startLoop(): void {}
  stopLoop(): void {}
  orbit(): void {}
  getCameraAngles(): { yaw: number; pitch: number } {
    return { yaw: 0, pitch: 0 };
  }

  animateMove(moves: MoveAnimation[], onComplete: () => void): void {
    this.moves.push(...moves);
    onComplete();
  }

  animateCreate(_state: RenderState, onComplete: () => void): void {
    onComplete();
  }

  showHint(): void {}
  hideHint(): void {}
  fadeHintOut(): void {}
  setHintStyle(): void {}
  setTheme(): void {}
  setKeyGuideVisible(): void {}
  setProjection(): void {}
  setMoveSpeed(): void {}
  setFpsVisible(): void {}

  setPortalListener(listener: (durationMs: number) => void): void {
    this.portal = listener;
  }
}

const audio: IAudio = {
  init: async () => undefined,
  playSfx: () => undefined,
  playMusic: () => undefined,
  stopMusic: () => undefined,
  setSfxVolume: () => undefined,
  setMusicVolume: () => undefined,
  pause: () => undefined,
  resume: () => undefined,
};

function makeStorage(): ISaveStorage & { saved: unknown[] } {
  const saved: unknown[] = [];
  return {
    saved,
    save: (_key, data) => void saved.push(data),
    load: () => null,
    remove: () => undefined,
  };
}

function setup(demo: boolean) {
  const episodes = new EpisodeManager();
  const level = episodes.getLevel(0, 0);
  const actor = createActor(createGameMachine(level));
  actor.start();
  const label = document.createElement('div');
  const seed = document.createElement('div');
  seed.hidden = true;
  const showCompleted = vi.fn();
  const playSfx = vi.fn();
  const storage = makeStorage();
  const renderer = new FakeRenderer();
  const game = new GameController(
    renderer,
    { ...audio, playSfx },
    episodes,
    new Statistics(),
    storage,
    label,
    seed,
    actor,
  );
  game.attachDialogs({ showPause: vi.fn(), showCompleted, hideDialogs: vi.fn() });
  game.setDemo(demo);
  game.startLevel(level);
  return { game, actor, label, seed, showCompleted, storage, playSfx, renderer };
}

/** Проходить уровень по подсказкам, пока не выполнится `done`. */
function playUntil(game: GameController, done: () => boolean): void {
  for (let i = 0; i < 60 && !done(); i++) {
    const dir = game.hint();
    if (!dir) return;
    game.handleDirection(dir);
  }
}

describe('GameController: завершение уровня', () => {
  beforeAll(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });

  it('в обычной игре показывает диалог и остаётся на уровне', () => {
    const { game, actor, label, showCompleted, playSfx } = setup(false);
    playUntil(game, () => (actor.getSnapshot().value as string) === 'completed');
    expect(showCompleted).toHaveBeenCalledTimes(1);
    expect(label.textContent).toBe('Level #1-1');
    // Кубик встал на свою площадку — есть отдельный звук «щелчка».
    expect(playSfx.mock.calls.some(([name]) => name === 'place')).toBe(true);
  });

  it('в демо не показывает диалог, а листает первые две карты по кругу', () => {
    const { game, label, showCompleted, storage } = setup(true);
    playUntil(game, () => label.textContent === 'Level #1-2');
    expect(showCompleted).not.toHaveBeenCalled();
    expect(label.textContent).toBe('Level #1-2');
    // вторая карта пройдена — снова первая, без диалога
    playUntil(game, () => label.textContent === 'Level #1-1');
    expect(showCompleted).not.toHaveBeenCalled();
    expect(label.textContent).toBe('Level #1-1');
    // прогресс и сохранение игрока демо не трогает
    expect(storage.saved).toHaveLength(0);
  });

  it('телепорт озвучивается длительностью своей анимации, а в демо молчит', () => {
    const { renderer, playSfx } = setup(false);
    // Рендерер сообщает о въезде в портал: звук должен получить длительность,
    // чтобы его фазы совпали с кадрами анимации.
    renderer.portal?.(1290);
    expect(playSfx).toHaveBeenCalledWith('portal', undefined, 1290);

    const demo = setup(true);
    demo.renderer.portal?.(1290);
    expect(demo.playSfx.mock.calls.some(([name]) => name === 'portal')).toBe(false);
  });

  it('сид уровня появляется после десяти кликов по номеру', () => {
    const { label, seed } = setup(false);
    for (let i = 0; i < 9; i++) label.click();
    expect(seed.hidden).toBe(true);
    label.click();
    expect(seed.hidden).toBe(false);
    // По умолчанию (без i18n) сид показывается как hex из восьми цифр.
    expect(seed.textContent).toMatch(/^0x[0-9a-f]{8}$/);
  });

  it('тестовый уровень из отладки показывает настоящий сид и собирается заново', () => {
    const { game, label, seed } = setup(false);
    const recipe = { mechanics: ['portal' as const], difficulty: 20, seed: 0x1234 };
    const generated = generateTestLevel(recipe);
    expect(generated).not.toBeNull();
    game.startTestLevel(createLevelFromData(0, 0, generated!.rows), 'TEST', recipe);

    // Сид генератора, а не отпечаток карты, — значит, плашка кликабельна.
    expect(seed.textContent).toBe(formatLevelSeed(recipe.seed));
    expect(seed.classList.contains('game-seed--actionable')).toBe(true);

    for (let i = 0; i < 10; i++) label.click();
    seed.click();
    expect(seed.classList.contains('game-seed--ok')).toBe(true);
    expect(label.textContent).toBe('TEST');

    // «Дальше» на победе тестового уровня собирает новый сид с теми же
    // механиками и сложностью, а не переключает эпизод кампании.
    const nextSeed = game.nextTestLevel();
    expect(nextSeed).toBe((recipe.seed + 1) >>> 0);
    expect(seed.textContent).toBe(formatLevelSeed(nextSeed!));
  }, 20_000);

  it('минимум ходов тестового уровня считает решатель, а не ходы игрока', () => {
    const { game, actor, showCompleted } = setup(false);
    // Минимум — один ход вправо. Ход влево тоже возможен и стоит лишнего хода,
    // но минимумом уровня он не становится.
    game.startTestLevel(
      createLevelFromData(0, 0, ['######', '#.R.r#', '#.Y.y#', '######']),
      'TEST',
      { mechanics: [], difficulty: 50, seed: 1 },
    );
    game.handleDirection(DIRS.left);
    expect(actor.getSnapshot().context.moves).toBe(1);
    playUntil(game, () => (actor.getSnapshot().value as string) === 'completed');
    const result = showCompleted.mock.calls[0][0];
    expect(result.moves).toBe(2);
    expect(result.minMoves).toBe(1);
  });

  it('победа тестового уровня помечена как тестовая', () => {
    const { game, actor, showCompleted } = setup(false);
    game.startTestLevel(createLevelFromData(0, 0, ['#R.r#']), 'TEST', {
      mechanics: [],
      difficulty: 50,
      seed: 1,
    });
    playUntil(game, () => (actor.getSnapshot().value as string) === 'completed');
    expect(showCompleted).toHaveBeenCalledWith(expect.anything(), true);
  });
});
