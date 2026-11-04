import type { ActorRefFrom } from 'xstate';
import type { EpisodeManager } from '../../core/services/episode-mng';
import { createGameMachine } from '../../core/state/game';
import type { Level } from '../../core/types/level';
import type { Box } from '../../core/types/entity';
import type { Position } from '../../core/types/position';
import type { IRenderer, MoveAnimation, RenderState } from '../../ports/IRenderer';
import type { IAudio } from '../../ports/IAudio';
import type { ISaveStorage } from '../../ports/ISaveStorage';
import type { Statistics } from '../../core/services/statistics';
import { InputAction } from '../../ports/IInput';

const SAVE_KEY = 'save';

/**
 * Контроллер игры (план 11.5): связывает игровой FSM, рендер, ввод,
 * статистику и диалоги. Ядро остаётся чистым — анимации запускаются
 * по переходам FSM-актора.
 */
export class GameController {
  private gameActor: ActorRefFrom<ReturnType<typeof createGameMachine>>;
  private renderer: IRenderer;
  private audio: IAudio;
  private episodes: EpisodeManager;
  private statistics: Statistics;
  private storage: ISaveStorage;
  private levelLabel: HTMLElement;
  private isDemo = false;
  private paused = false;

  private lastSeenBoxes: Box[] = [];
  private rafId = 0;
  private lastTime = 0;

  // Диалоги (подключаются позже)
  private showPause: (() => void) | null = null;
  private showCompleted: ((moves: number, time: number) => void) | null = null;
  private hideDialogs: (() => void) | null = null;

  constructor(
    renderer: IRenderer,
    audio: IAudio,
    episodes: EpisodeManager,
    statistics: Statistics,
    storage: ISaveStorage,
    levelLabel: HTMLElement,
    gameActor: ActorRefFrom<ReturnType<typeof createGameMachine>>,
  ) {
    this.renderer = renderer;
    this.audio = audio;
    this.episodes = episodes;
    this.statistics = statistics;
    this.storage = storage;
    this.levelLabel = levelLabel;
    this.gameActor = gameActor;

    this.gameActor.subscribe((snapshot) => this.onTransition(snapshot));
    this.startLoop();
  }

  attachDialogs(ui: {
    showPause: () => void;
    showCompleted: (moves: number, time: number) => void;
    hideDialogs: () => void;
  }): void {
    this.showPause = ui.showPause;
    this.showCompleted = ui.showCompleted;
    this.hideDialogs = ui.hideDialogs;
  }

  setDemo(demo: boolean): void {
    this.isDemo = demo;
  }

  /** Запуск уровня (NEXT_LEVEL/RESET/SELECT_LEVEL/RESUME). */
  startLevel(level: Level): void {
    this.hideDialogs?.();
    this.statistics.reset();
    this.statistics.start();
    this.paused = false;
    this.lastSeenBoxes = level.boxes.map((b) => ({ pos: b.pos.clone(), color: b.color }));
    this.levelLabel.textContent = `Level #${level.label}`;
    this.gameActor.send({ type: 'START', level });
  }

  /** Обработка ввода направления (в т.ч. из DemoInput). */
  handleDirection(dir: Position): void {
    if (this.paused) return;
    if (this.gameActor.getSnapshot().value !== 'input') return;
    this.gameActor.send({ type: 'MOVE', dir });
  }

  reset(): void {
    this.startLevel(this.episodes.getCurLevel());
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.statistics.stop();
    this.showPause?.();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.statistics.start();
  }

  private save(): void {
    this.storage.save(SAVE_KEY, this.episodes.serialize());
  }

  loadSave(): unknown {
    return this.storage.load(SAVE_KEY);
  }

  private onTransition(snapshot: ReturnType<typeof this.gameActor.getSnapshot>): void {
    const state = snapshot.value as string;
    const ctx = snapshot.context;

    if (state === 'create') {
      this.renderer.animateCreate(this.buildRenderState(ctx), () =>
        this.gameActor.send({ type: 'CREATE_DONE' }),
      );
      return;
    }

    if (state === 'move') {
      // Дифф кубиков: prev → new по индексам
      const moves: MoveAnimation[] = [];
      ctx.boxes.forEach((box, i) => {
        const prev = this.lastSeenBoxes[i];
        if (prev && !prev.pos.equals(box.pos)) {
          moves.push({ color: box.color, from: prev.pos, to: box.pos });
        }
      });
      this.lastSeenBoxes = ctx.boxes.map((b) => ({ pos: b.pos.clone(), color: b.color }));
      if (!this.isDemo) this.audio.playSfx('swipe');
      this.renderer.animateMove(moves, () => this.gameActor.send({ type: 'MOVE_DONE' }));
      return;
    }

    if (state === 'completed') {
      this.statistics.stop();
      this.episodes.unlockCurrent();
      this.save();
      this.showCompleted?.(ctx.moves, ctx.time);
    }
  }

  private buildRenderState(ctx: ReturnType<typeof this.gameActor.getSnapshot>['context']): RenderState {
    return {
      grid: ctx.level.grid.toFlat(),
      width: ctx.level.width,
      height: ctx.level.height,
      boxes: ctx.boxes.map((b) => ({ pos: b.pos, color: b.color })),
      ends: ctx.level.ends.map((e) => ({ pos: e.pos, color: e.color })),
    };
  }

  /** Игровой цикл: время (TICK/статистика) + отрисовка. */
  private startLoop(): void {
    this.lastTime = performance.now();
    const frame = (now: number) => {
      const dt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      if (!this.paused) {
        this.statistics.tick(dt);
        this.gameActor.send({ type: 'TICK', delta: dt });
        const snapshot = this.gameActor.getSnapshot();
        this.renderer.render(this.buildRenderState(snapshot.context));
      }
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stopLoop(): void {
    cancelAnimationFrame(this.rafId);
  }

  static readonly InputActionRef = InputAction; // для контроллеров диалогов
}
