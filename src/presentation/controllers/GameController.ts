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
import { findHint } from '../../core/rules/hint';

const SAVE_KEY = 'save';

/**
 * Уровни демо-фона в главном меню: первые две карты игры. Компьютер проходит
 * их по кругу; прогресс и сохранение игрока при этом не меняются.
 */
const DEMO_LEVELS: readonly { episodeId: number; levelId: number }[] = [
  { episodeId: 0, levelId: 0 },
  { episodeId: 0, levelId: 1 },
];

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
  /** Индекс текущей карты демо-фона в DEMO_LEVELS. */
  private demoIndex = 0;

  private formatLevel: (level: Level) => string;
  private lastSeenBoxes: Box[] = [];
  private lastState = '';
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
    formatLevel?: (level: Level) => string,
  ) {
    this.renderer = renderer;
    this.audio = audio;
    this.episodes = episodes;
    this.statistics = statistics;
    this.storage = storage;
    this.levelLabel = levelLabel;
    this.gameActor = gameActor;
    this.formatLevel = formatLevel ?? ((level) => `Level #${level.label}`);

    this.gameActor.subscribe((snapshot) => this.onTransition(snapshot));
    this.startLoop();
    // Подписка не вызывает колбэк для текущего состояния: без этого поле
    // появлялось сразу, без волновой анимации (create → input).
    this.onTransition(this.gameActor.getSnapshot());
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
    if (demo === this.isDemo) return;
    this.isDemo = demo;
    // Возврат в меню всегда начинает демо с первой карты (1-1).
    if (demo) {
      this.demoIndex = 0;
      this.startDemoLevel();
    }
  }

  /** Запуск уровня (NEXT_LEVEL/RESET/SELECT_LEVEL/RESUME). */
  startLevel(level: Level): void {
    this.hideDialogs?.();
    // Демо-фон не пишет статистику и не трогает сохранение игрока
    if (!this.isDemo) {
      this.statistics.reset();
      this.statistics.start();
    }
    this.paused = false;
    this.lastSeenBoxes = level.boxes.map((b) => ({ pos: b.pos.clone(), color: b.color }));
    this.levelLabel.textContent = this.formatLevel(level);
    // Сброс уровня при уже активном create должен заново запустить анимацию
    this.lastState = '';
    this.gameActor.send({ type: 'START', level });
    // Игрок начал игру — теперь «Продолжить» есть что продолжать
    if (!this.isDemo) this.save();
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

  /** Откат последнего хода (кнопка undo в нижней панели). */
  undo(): void {
    if (this.paused) return;
    if ((this.gameActor.getSnapshot().value as string) !== 'input') return;
    this.gameActor.send({ type: 'UNDO' });
  }

  /** Есть ли что откатывать — для состояния кнопки undo. */
  canUndo(): boolean {
    const snapshot = this.gameActor.getSnapshot();
    return (
      (snapshot.value as string) === 'input' && snapshot.context.history.length > 0
    );
  }

  /** Подсказка: первое направление кратчайшего решения (null — решения нет). */
  hint(): Position | null {
    const snapshot = this.gameActor.getSnapshot();
    if ((snapshot.value as string) === 'completed') return null;
    return findHint(snapshot.context.level, snapshot.context.boxes);
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
    // После первого старта уровня «Продолжить» уже есть что продолжать
    this.episodes.markStarted();
    this.storage.save(SAVE_KEY, this.episodes.serialize());
  }

  loadSave(): unknown {
    return this.storage.load(SAVE_KEY);
  }

  private onTransition(snapshot: ReturnType<typeof this.gameActor.getSnapshot>): void {
    const state = snapshot.value as string;
    const ctx = snapshot.context;

    // ⚠️ XState уведомляет подписчиков на КАЖДЫЙ event, включая TICK без
    // перехода. Анимации (create/move) и диалог завершения запускаем только
    // при входе в состояние: иначе create перезапускается каждый кадр,
    // маска обнуляется и уровень так и не появляется.
    const entered = state !== this.lastState;
    this.lastState = state;
    if (!entered) return;

    if (state === 'create') {
      this.lastSeenBoxes = ctx.boxes.map((b) => ({ pos: b.pos.clone(), color: b.color }));
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
      // Кубик встал на свою площадку именно этим ходом — отдельный звук
      // «щелчка», когда анимация движения доедет до места.
      const goalKeys = new Set(ctx.level.ends.map((e) => `${e.pos.x},${e.pos.y},${e.color}`));
      const boxKey = (b: Box): string => `${b.pos.x},${b.pos.y},${b.color}`;
      const justPlaced = ctx.boxes.some((box, i) => {
        const prev = this.lastSeenBoxes[i];
        return !!prev && goalKeys.has(boxKey(box)) && !goalKeys.has(boxKey(prev));
      });
      this.lastSeenBoxes = ctx.boxes.map((b) => ({ pos: b.pos.clone(), color: b.color }));
      if (!this.isDemo) this.audio.playSfx('swipe');
      this.renderer.animateMove(moves, () => {
        if (justPlaced && !this.isDemo) this.audio.playSfx('place', 0.8);
        this.gameActor.send({ type: 'MOVE_DONE' });
      });
      return;
    }

    if (state === 'completed') {
      // В демо диалог не показываем: под меню просто появляется следующая
      // карта, и автоигра продолжает переставлять кубики.
      if (this.isDemo) {
        this.nextDemoLevel();
        return;
      }
      this.statistics.stop();
      this.episodes.unlockCurrent();
      this.save();
      this.showCompleted?.(ctx.moves, ctx.time);
    }
  }

  /** Запуск текущей карты демо-фона. */
  private startDemoLevel(): void {
    const demo = DEMO_LEVELS[this.demoIndex];
    this.startLevel(this.episodes.getLevel(demo.episodeId, demo.levelId));
  }

  /** Следующая карта демо-фона (1-1 ↔ 1-2, прогресс игрока не меняется). */
  private nextDemoLevel(): void {
    this.demoIndex = (this.demoIndex + 1) % DEMO_LEVELS.length;
    this.startDemoLevel();
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
    this.lastTime = performance.now();      const frame = (now: number) => {
        // Клампим dt, иначе после паузы вкладки время и TICK скачут
        const dt = Math.min(Math.max((now - this.lastTime) / 1000, 0), 0.05);
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
