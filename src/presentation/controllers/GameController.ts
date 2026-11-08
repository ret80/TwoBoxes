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
import { createLevelFromData } from '../../core/rules/create';
import { formatLevelSeed, levelSeed } from '../../core/generation/level-seed';
import { findHint, planSlides, type HintSlide } from '../../core/rules/hint';
import { starsForResult, type GameResult } from '../../core/types/game-result';

const SAVE_KEY = 'save';

/**
 * Фон меню до прихода демо-уровней эпизода: первые две карты игры. Компьютер
 * проходит их по кругу; прогресс и сохранение игрока при этом не меняются.
 */
const FALLBACK_DEMO_LEVELS: readonly { episodeId: number; levelId: number }[] = [
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
  /** Сид уровня: показывается после десяти кликов по номеру уровня. */
  private seedLabel: HTMLElement;
  private levelLabelClicks = 0;
  /**
   * Настоящий сид генератора текущего уровня (`null` — карта ручная, и в
   * плашке лежит только отпечаток содержимого).
   */
  private seedValue: number | null = null;
  /** Подсказка плашки сида: показывается только у воспроизводимых карт. */
  private seedHint = '';
  private isDemo = false;
  /** Уровень из отладки: не трогаем прогресс, статистику и сохранение. */
  private testMode = false;
  private testLevel: Level | null = null;
  private testLabel = 'TEST';
  private paused = false;
  /** Индекс текущей карты демо-фона. */
  private demoIndex = 0;
  /**
   * Демо-уровни меню: лёгкие карты с механиками эпизода, в который игрок
   * играл последним. Пока они не пришли, фон играет первые карты игры.
   */
  private demoLevels: Level[] = [];

  private formatLevel: (level: Level) => string;
  private formatSeed: (seed: number) => string;
  private lastSeenBoxes: Box[] = [];
  private lastState = '';
  private rafId = 0;
  private lastTime = 0;

  // Диалоги (подключаются позже)
  private showPause: (() => void) | null = null;
  private showCompleted: ((result: GameResult) => void) | null = null;
  private hideDialogs: (() => void) | null = null;

  constructor(
    renderer: IRenderer,
    audio: IAudio,
    episodes: EpisodeManager,
    statistics: Statistics,
    storage: ISaveStorage,
    levelLabel: HTMLElement,
    seedLabel: HTMLElement,
    gameActor: ActorRefFrom<ReturnType<typeof createGameMachine>>,
    formatLevel?: (level: Level) => string,
    formatSeed?: (seed: number) => string,
  ) {
    this.renderer = renderer;
    this.audio = audio;
    this.episodes = episodes;
    this.statistics = statistics;
    this.storage = storage;
    this.levelLabel = levelLabel;
    this.seedLabel = seedLabel;
    this.gameActor = gameActor;
    this.formatLevel = formatLevel ?? ((level) => `Level #${level.label}`);
    this.formatSeed = formatSeed ?? formatLevelSeed;
    this.seedHint = this.seedLabel.title;
    this.seedLabel.removeAttribute('title');
    this.levelLabel.addEventListener('click', () => this.onLevelLabelClick());
    this.seedLabel.addEventListener('click', () => this.rebuildFromSeed());

    this.gameActor.subscribe((snapshot) => this.onTransition(snapshot));
    this.startLoop();
    // Подписка не вызывает колбэк для текущего состояния: без этого поле
    // появлялось сразу, без волновой анимации (create → input).
    this.onTransition(this.gameActor.getSnapshot());
  }

  attachDialogs(ui: {
    showPause: () => void;
    showCompleted: (result: GameResult) => void;
    hideDialogs: () => void;
  }): void {
    this.showPause = ui.showPause;
    this.showCompleted = ui.showCompleted;
    this.hideDialogs = ui.hideDialogs;
  }

  /**
   * Пасхалка на номере уровня: после десяти кликов под верхним баром
   * появляется сид карты. Дальше он остаётся и обновляется на каждом уровне.
   */
  private onLevelLabelClick(): void {
    if (!this.seedLabel.hidden) return;
    this.levelLabelClicks++;
    if (this.levelLabelClicks < 10) return;
    this.seedLabel.hidden = false;
  }

  /**
   * Собрать текущий уровень заново по его сиду. Рецепт генератора
   * восстанавливается в `EpisodeManager`, карта пересчитывается с нуля — если
   * она совпала с исходной, уровень запускается заново (с анимацией сборки).
   * Плашка подтверждает результат зелёным или красным.
   */
  private rebuildFromSeed(): void {
    if (this.seedValue === null) return;
    const level = this.gameActor.getSnapshot().context.level;
    const rows = this.episodes.rebuildLevel(level.episodeId, level.levelId);
    if (rows) {
      const rebuilt = createLevelFromData(level.episodeId, level.levelId, rows);
      // Сравниваем отпечатки: одинаковое содержимое — тот же уровень.
      if (levelSeed(rebuilt) === levelSeed(level)) {
        this.flashSeed(true);
        this.startLevel(rebuilt);
        return;
      }
    }
    this.flashSeed(false);
    console.warn(
      `Сид ${formatLevelSeed(this.seedValue)} не воспроизвёл уровень ${level.label}`,
    );
  }

  /** Короткая подсветка плашки сида: удалось собрать карту или нет. */
  private flashSeed(ok: boolean): void {
    this.seedLabel.classList.remove('game-seed--ok', 'game-seed--fail');
    this.seedLabel.classList.add(ok ? 'game-seed--ok' : 'game-seed--fail');
    window.setTimeout(() => {
      this.seedLabel.classList.remove('game-seed--ok', 'game-seed--fail');
    }, 1200);
  }

  setDemo(demo: boolean): void {
    if (demo === this.isDemo) return;
    this.isDemo = demo;
    // Возврат в меню всегда начинает демо с первой карты.
    if (demo) {
      this.demoIndex = 0;
      this.startDemoLevel();
    }
  }

  /**
   * Подменить фон меню демо-уровнями эпизода (приходят из воркера): короткие
   * лёгкие карты с его механиками. Если меню открыто — перезапускаем демо с
   * первой карты, если игра идёт — просто запоминаем на следующий возврат.
   */
  setDemoLevels(rows: string[][]): void {
    const levels = rows
      .filter((levelRows) => levelRows.length > 0)
      .map((levelRows) => createLevelFromData(0, 0, levelRows));
    if (levels.length === 0) return;
    this.demoLevels = levels;
    if (this.isDemo) {
      this.demoIndex = 0;
      this.startDemoLevel();
    }
  }

  /** Запуск уровня (NEXT_LEVEL/RESET/SELECT_LEVEL/RESUME). */
  startLevel(level: Level, testMode = false): void {
    this.testMode = testMode;
    this.testLevel = testMode ? level : null;
    this.hideDialogs?.();
    // Демо-фон не пишет статистику и не трогает сохранение игрока;
    // тестовый уровень тоже не должен портить прогресс.
    if (!this.isDemo) {
      this.statistics.reset();
      this.statistics.start();
    }
    this.paused = false;
    this.lastSeenBoxes = level.boxes.map((b) => ({ pos: b.pos.clone(), color: b.color }));
    this.levelLabel.textContent = testMode ? this.testLabel : this.formatLevel(level);
    this.levelLabelClicks = 0;
    // У сгенерированных карт сид настоящий (его можно ввести и получить ту же
    // карту), у ручных — отпечаток содержимого, который только опознаёт карту.
    this.seedValue = this.episodes.getLevelSeed(level.episodeId, level.levelId);
    this.seedLabel.textContent = this.formatSeed(this.seedValue ?? levelSeed(level));
    const rebuildable = this.seedValue !== null;
    this.seedLabel.classList.toggle('game-seed--actionable', rebuildable);
    if (rebuildable) this.seedLabel.title = this.seedHint;
    else this.seedLabel.removeAttribute('title');
    // Сброс уровня при уже активном create должен заново запустить анимацию
    this.lastState = '';
    this.gameActor.send({ type: 'START', level });
    // Игрок начал игру — теперь «Продолжить» есть что продолжать
    if (!this.isDemo && !this.testMode) this.save();
  }

  /** Тестовый уровень из отладки: играется как обычный, но без прогресса. */
  startTestLevel(level: Level, label = 'TEST'): void {
    this.testLabel = label;
    this.startLevel(level, true);
  }

  /** Идёт тестовый уровень из отладки: вход в игру заменён выходом в отладку. */
  get isTestLevel(): boolean {
    return this.testMode;
  }

  /** Обработка ввода направления (в т.ч. из DemoInput). */
  handleDirection(dir: Position): void {
    if (this.paused) return;
    if (this.gameActor.getSnapshot().value !== 'input') return;
    this.gameActor.send({ type: 'MOVE', dir });
  }

  reset(): void {
    if (this.testLevel) this.startTestLevel(this.testLevel, this.testLabel);
    else this.startLevel(this.episodes.getCurLevel());
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
    return findHint(
      snapshot.context.level,
      snapshot.context.boxes,
      snapshot.context.mechanicState,
    );
  }

  /**
   * Подсказка для кнопки «?»: считает использованные подсказки (для статистики
   * в диалоге победы) и возвращает план — направление и пути кубиков.
   */
  useHint(): { dir: Position; slides: HintSlide[] } | null {
    const plan = this.hintPlan();
    if (plan && !this.isDemo) this.statistics.incrementHints();
    return plan;
  }

  /**
   * Подсказка с путями кубиков: направление первого хода и то, до какой
   * клетки доедет каждый кубик — по этим путям на поле скользят стрелки.
   */
  hintPlan(): { dir: Position; slides: HintSlide[] } | null {
    const snapshot = this.gameActor.getSnapshot();
    if ((snapshot.value as string) === 'completed') return null;
    const dir = findHint(
      snapshot.context.level,
      snapshot.context.boxes,
      snapshot.context.mechanicState,
    );
    if (!dir) return null;
    return {
      dir,
      slides: planSlides(
        snapshot.context.level,
        snapshot.context.boxes,
        dir,
        snapshot.context.mechanicState,
      ),
    };
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

  /** Сохранить прогресс после внешних изменений (разблокировка в отладке). */
  saveProgress(): void {
    this.save();
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
          moves.push({
            color: box.color,
            from: prev.pos,
            to: box.pos,
            path: ctx.lastPaths[i]?.length ? ctx.lastPaths[i] : undefined,
          });
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
      // Игрок начал ход, пока стрелки подсказки ещё на поле: гасим их плавно,
      // не дожидаясь конца общего таймера подсказки.
      this.renderer.fadeHintOut();
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
      if (!this.testMode) {
        this.episodes.unlockCurrent();
        this.save();
      }
      // Минимальное число ходов уровня — база для звёзд в диалоге победы;
      // подсказки входят в оценку отдельным штрафом.
      const minMoves = this.testMode
        ? Math.max(1, ctx.moves)
        : this.episodes.minMoves(ctx.level.episodeId, ctx.level.levelId);
      const hints = this.statistics.getHints();
      this.showCompleted?.({
        moves: ctx.moves,
        time: ctx.time,
        completed: true,
        hints,
        minMoves,
        stars: starsForResult(ctx.moves, minMoves, hints),
      });
    }
  }

  /** Запуск текущей карты демо-фона. */
  private startDemoLevel(): void {
    if (this.demoLevels.length > 0) {
      this.startLevel(this.demoLevels[this.demoIndex % this.demoLevels.length]);
      return;
    }
    const demo = FALLBACK_DEMO_LEVELS[this.demoIndex % FALLBACK_DEMO_LEVELS.length];
    this.startLevel(this.episodes.getLevel(demo.episodeId, demo.levelId));
  }

  /** Следующая карта демо-фона (прогресс игрока не меняется). */
  private nextDemoLevel(): void {
    const count = this.demoLevels.length > 0 ? this.demoLevels.length : FALLBACK_DEMO_LEVELS.length;
    this.demoIndex = (this.demoIndex + 1) % count;
    this.startDemoLevel();
  }

  private buildRenderState(ctx: ReturnType<typeof this.gameActor.getSnapshot>['context']): RenderState {
    return {
      grid: ctx.level.grid.toFlat(),
      width: ctx.level.width,
      height: ctx.level.height,
      boxes: ctx.boxes.map((b) => ({ pos: b.pos, color: b.color })),
      ends: ctx.level.ends.map((e) => ({ pos: e.pos, color: e.color })),
      mechanicState: ctx.mechanicState,
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
