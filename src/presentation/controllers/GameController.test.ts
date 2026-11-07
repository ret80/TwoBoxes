import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { createGameMachine } from '../../core/state/game';
import { EpisodeManager } from '../../core/services/episode-mng';
import { Statistics } from '../../core/services/statistics';
import type { IAudio } from '../../ports/IAudio';
import type { IRenderer, MoveAnimation, RenderState } from '../../ports/IRenderer';
import type { ISaveStorage } from '../../ports/ISaveStorage';
import { GameController } from './GameController';

/** Рендер-заглушка: анимации завершаются синхронно. */
class FakeRenderer implements IRenderer {
  moves: MoveAnimation[] = [];

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
  setKeyGuideVisible(): void {}
  setProjection(): void {}
  setMoveSpeed(): void {}
  setFpsVisible(): void {}
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
  const showCompleted = vi.fn();
  const playSfx = vi.fn();
  const storage = makeStorage();
  const game = new GameController(
    new FakeRenderer(),
    { ...audio, playSfx },
    episodes,
    new Statistics(),
    storage,
    label,
    actor,
  );
  game.attachDialogs({ showPause: vi.fn(), showCompleted, hideDialogs: vi.fn() });
  game.setDemo(demo);
  game.startLevel(level);
  return { game, actor, label, showCompleted, storage, playSfx };
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
});
