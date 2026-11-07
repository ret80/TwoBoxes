import { App, DrawCall, Program, VertexArray, VertexBuffer, PicoGL } from 'picogl';
import { mat4 } from 'gl-matrix';
import { ColorType } from '../../core/types/color';
import { CellType, isBoxCell, isEndCell } from '../../core/types/cell';
import type {
  HintArrow,
  IRenderer,
  MoveAnimation,
  ProjectionMode,
  RenderState,
} from '../../ports/IRenderer';
import {
  buildGridLines,
  CUBE_NORMALS,
  CUBE_VERTICES,
  QUAD_NORMALS,
  QUAD_UVS,
  QUAD_XY_NORMALS,
  QUAD_XY_VERTICES,
  QUAD_XZ_VERTICES,
} from './geometry';
import {
  FRAGMENT_SHADER,
  GLOW_FRAGMENT_SHADER,
  GLOW_VERTEX_SHADER,
  LINE_FRAGMENT_SHADER,
  LINE_VERTEX_SHADER,
  VERTEX_SHADER,
} from './shaders';
import { Camera } from './camera';
import { TweenManager } from './tween-manager';
import {
  CREATE_GROW_MS,
  createWaveMask,
  maxWave,
  WAVE_INTERVAL_MS,
} from './create-animation';

// Палитра атласа: тёплый крем, бирюзовые плиты, коралловый и золотой кубики.
// Цвета заданы «базовыми»: шейдер умножает их на 0.78 + 0.30·diff, поэтому
// верхние грани выходят светлее, боковые — темнее (мягкий свет как в оригинале).
const COLOR_PLATFORM = [0.594, 0.727, 0.697]; // бирюзовая плита пути
const COLOR_BOX = [0.898, 0.596, 0.482]; // куб mat_color_one (коралл)
const COLOR_BOX_TWO = [0.914, 0.786, 0.462]; // куб mat_color_two (золото)
const COLOR_GOAL_ONE = [0.933, 0.541, 0.404]; // контур цели красного кубика
const COLOR_GOAL_TWO = [0.925, 0.788, 0.404]; // контур цели жёлтого кубика
const COLOR_RECESS = [0.404, 0.529, 0.51]; // углубление целевой площадки
const COLOR_GRID = [0.9, 0.96, 0.94]; // светлая сетка на плитах
const COLOR_BG = [0.933, 0.906, 0.843]; // тёплый желтоватый фон сцены

// Свечение кубика на своей площадке — насыщенный цвет кубика (не белый).
const GLOW_ONE = [1.0, 0.42, 0.17]; // коралловый ореол
const GLOW_TWO = [1.0, 0.66, 0.18]; // золотой ореол
// Стрелки-подсказки на полу: чуть светлее кубиков, чтобы читались на плитах.
const ARROW_ONE = [0.93, 0.44, 0.26];
const ARROW_TWO = [0.93, 0.71, 0.24];
// Кофейный цвет текста и иконок интерфейса (--color-coffee).
// Компас: оси — им же, но с прозрачностью недоступной кнопки отката (45%),
// буквы «L»/«D» — полным цветом активной кнопки отката.
const COLOR_INK = [0.29, 0.208, 0.153];
const KEY_GUIDE_DIM_ALPHA = 0.32;

/** Стрелки подсказки: доехали до упора → держатся → гаснут (как плашка HUD). */
const HINT_SLIDE_MS = 560;
const HINT_FADE_START_MS = 1750;
const HINT_TOTAL_MS = 2200;
/** Ход игрока прерывает показ подсказки: стрелки гаснут коротким плавным затуханием. */
const HINT_FADE_OUT_MS = 240;

/** Полосы, резервируемые под плавающие панели HUD (CSS-пиксели). */
const HUD_INSET_TOP = 76;
const HUD_INSET_BOTTOM = 76;

/** Высота плиты пути: кубики катаются по возвышению, а не по низкому полу. */
const PLATFORM_TOP = 0.34;
/** Центр кубика по высоте: стоит на верхней грани плиты. */
const BOX_Y = PLATFORM_TOP + 0.5;

/**
 * Плиты есть там, где может оказаться кубик: EMPTY, целевые клетки и сами
 * кубики (их клетки в карте уровня помечены BOX/BOX_TWO). WALL — обрыв.
 */
const isWalkableCell = (cell: CellType): boolean =>
  cell === CellType.EMPTY || isEndCell(cell) || isBoxCell(cell);

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/** Позиция кубика для анимации: координаты уровня (центр клетки) + мировая высота. */
interface RenderBoxPos {
  x: number; // level coords center (pos.x + 0.5)
  z: number; // level coords center (pos.y + 0.5)
  y: number; // мировая высота
  color: ColorType;
}

/**
 * Рендер-адаптер на picogl (WebGL2). Реализация IRenderer.
 * Стиль оригинала: изометрическая ортокамера, простые примитивы, flat-цвета
 * с мягким направленным светом (верхние грани светлее боковых).
 */
export class PicoglRenderer implements IRenderer {
  private app: App | null = null;
  /** Канвас и обработчики потери контекста: WebGL-ресурсы переживают только до restore. */
  private canvas: HTMLCanvasElement | null = null;
  private contextLost = false;
  private contextListenersAttached = false;
  /** Цикл должен продолжить рисовать после восстановления контекста. */
  private wantsLoop = false;
  private program: Program | null = null;
  private lineProgram: Program | null = null;
  private glowProgram: Program | null = null;
  private cubeVao: VertexArray | null = null;
  private quadVao: VertexArray | null = null;
  private quadXYVao: VertexArray | null = null;
  private glowVao: VertexArray | null = null;
  private gridVao: VertexArray | null = null;

  private cubeDraw: DrawCall | null = null;
  private quadDraw: DrawCall | null = null;
  private quadXYDraw: DrawCall | null = null;
  private glowDraw: DrawCall | null = null;
  private gridDraw: DrawCall | null = null;

  private camera = new Camera();
  private tweens = new TweenManager();
  /** Множитель скорости хода: 1 — штатная плавность, >1 — быстрее (настройка). */
  private moveSpeed = 1;

  // Матрицы-скретч: декали (стрелки, буквы) собираются из них каждый кадр.
  private viewProj: mat4 = mat4.create();
  private gizmoViewProj: mat4 = mat4.create();
  private readonly gizmoProj = mat4.create();
  private readonly basisMatrix = mat4.create();
  private readonly decalModel = mat4.create();
  private readonly scratchRot = mat4.create();

  // Стрелки подсказки и компас клавиатуры (плоскость L/D)
  private hint: {
    arrows: HintArrow[];
    start: number;
    /** Начало досрочного затухания (ход игрока) или null — обычный таймер. */
    fadeAt: number | null;
    /** Прозрачность в момент старта досрочного затухания. */
    fadeFrom: number;
  } | null = null;
  private keyGuide = true;
  /** Сила «обратной перспективы» в шейдерах (носится в uniform uWarp). */
  private warp = 0;

  // Счётчик кадров (отладочное меню)
  private fpsVisible = false;
  private fpsEl: HTMLElement | null = null;
  private fpsFrames = 0;
  private fpsSince = 0;

  private state: RenderState | null = null;
  private boxPos: RenderBoxPos[] = [];
  private gridBuf: VertexBuffer | null = null;
  private gridWave = Number.NaN;

  // CSS-размер окна (канвас рендерится в device-пикселях)
  private viewportW = 1;
  private viewportH = 1;

  // Волновая анимация появления
  private createMask: number[][] | null = null;
  private createStartedAt = 0;
  private createElapsed = 0;
  private createMaxWave = 0;
  private createDone: (() => void) | null = null;

  // Активные tween движения
  private movingCount = 0;
  private moveDone: (() => void) | null = null;

  private lastFrameTime = 0;
  private rafId = 0;
  private loopRunning = false;

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    if (!this.contextListenersAttached) {
      this.contextListenersAttached = true;
      canvas.addEventListener('webglcontextlost', this.onContextLost);
      canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    }
    this.setupGL();
  }

  /**
   * Потеря контекста (вкладка ушла в фон, драйвер перезагрузился): без
   * preventDefault браузер не пришлёт `webglcontextrestored`, и канвас
   * оставался пустым до перезагрузки страницы.
   */
  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    cancelAnimationFrame(this.rafId);
    this.loopRunning = false;
  };

  /**
   * Контекст вернулся: все GL-объекты (шейдеры, буферы, VAO) стали невалидны,
   * поэтому создаём их заново и продолжаем цикл. Состояние уровня, камера и
   * tween-анимации живут в JS и переживают потерю контекста.
   */
  private readonly onContextRestored = (): void => {
    this.contextLost = false;
    this.setupGL();
    this.resize(this.viewportW, this.viewportH);
    if (this.fpsEl) this.fpsEl.hidden = !this.fpsVisible;
    if (this.wantsLoop) this.startLoop();
  };

  private setupGL(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    // Старые GL-объекты после потери контекста уже невалидны — просто забываем их.
    this.gridBuf = null;
    this.gridVao = null;
    this.gridDraw = null;
    this.gridWave = Number.NaN;
    // Canvas без альфа-канала: полупрозрачные пиксели (ореолы, стрелки) не
    // смешиваются с фоном страницы. Иначе premultiplied-композитинг браузера
    // подмешивал кремовый фон поверх и свечение выгорало в белое.
    this.app = PicoGL.createApp(canvas, { alpha: false, antialias: true })
      .enable(PicoGL.DEPTH_TEST)
      // Отсечение задних граней: без него совпадающие грани соседних клеток
      // (пол/стена, стена/стена) дают z-fighting с мерцающими швами.
      .enable(PicoGL.CULL_FACE)
      .clearColor(COLOR_BG[0], COLOR_BG[1], COLOR_BG[2], 1);
    // Грани куба/квада обходятся по часовой стрелке снаружи.
    this.app.gl.frontFace(this.app.gl.CW);
    // Синхронная компиляция — программ три, источник мал
    this.program = this.app.createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
    this.lineProgram = this.app.createProgram(LINE_VERTEX_SHADER, LINE_FRAGMENT_SHADER);
    this.glowProgram = this.app.createProgram(GLOW_VERTEX_SHADER, GLOW_FRAGMENT_SHADER);

    const cubePositions = this.app.createVertexBuffer(PicoGL.FLOAT, 3, CUBE_VERTICES);
    const cubeNormals = this.app.createVertexBuffer(PicoGL.FLOAT, 3, CUBE_NORMALS);
    this.cubeVao = this.app
      .createVertexArray()
      .vertexAttributeBuffer(0, cubePositions)
      .vertexAttributeBuffer(1, cubeNormals);

    const quadPositions = this.app.createVertexBuffer(PicoGL.FLOAT, 3, QUAD_XZ_VERTICES);
    const quadNormals = this.app.createVertexBuffer(PicoGL.FLOAT, 3, QUAD_NORMALS);
    this.quadVao = this.app
      .createVertexArray()
      .vertexAttributeBuffer(0, quadPositions)
      .vertexAttributeBuffer(1, quadNormals);

    this.cubeDraw = this.app.createDrawCall(this.program, this.cubeVao);
    this.quadDraw = this.app.createDrawCall(this.program, this.quadVao);

    // Декали (стрелки подсказки, буквы L/D): плоский квад в плоскости XY.
    const quadXYPositions = this.app.createVertexBuffer(PicoGL.FLOAT, 3, QUAD_XY_VERTICES);
    const quadXYNormals = this.app.createVertexBuffer(PicoGL.FLOAT, 3, QUAD_XY_NORMALS);
    this.quadXYVao = this.app
      .createVertexArray()
      .vertexAttributeBuffer(0, quadXYPositions)
      .vertexAttributeBuffer(1, quadXYNormals);
    this.quadXYDraw = this.app.createDrawCall(this.program, this.quadXYVao);

    // Ореол-свечение: тот же квад, но с UV вместо нормалей (радиальное затухание).
    const glowUvs = this.app.createVertexBuffer(PicoGL.FLOAT, 2, QUAD_UVS);
    const glowPositions = this.app.createVertexBuffer(PicoGL.FLOAT, 3, QUAD_XY_VERTICES);
    this.glowVao = this.app
      .createVertexArray()
      .vertexAttributeBuffer(0, glowPositions)
      .vertexAttributeBuffer(2, glowUvs);
    this.glowDraw = this.app.createDrawCall(this.glowProgram, this.glowVao);
  }

  resize(width: number, height: number): void {
    this.viewportW = Math.max(1, width);
    this.viewportH = Math.max(1, height);
    if (!this.app) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.app.resize(
      Math.round(this.viewportW * dpr),
      Math.round(this.viewportH * dpr),
    );
    // PicoGL меняет только атрибуты canvas — держим CSS-размер прежним
    const canvas = this.app.gl.canvas as HTMLCanvasElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    this.updateCamera();
  }

  render(state: RenderState): void {
    this.updateCamera();
    // Синхронизировать позиции кубиков, если движение не анимируется
    if (this.movingCount === 0) {
      this.boxPos = state.boxes.map((b) => ({
        x: b.pos.x + 0.5,
        z: b.pos.y + 0.5,
        y: BOX_Y,
        color: b.color,
      }));
    }
    this.state = state;
  }

  /**
   * Кадр фиксируется на старте уровня: дальность считается по опорному ракурсу
   * и больше не меняется. Под панели HUD постоянно резервируется полоса, поэтому
   * поле не уезжает под них и не дёргается при анимации панелей.
   */
  private updateCamera(): void {
    this.warp = this.camera.getWarp();
    if (!this.state) return;
    this.camera.frame(
      this.visibleBounds(this.state),
      this.viewportW,
      this.viewportH,
      HUD_INSET_TOP,
      HUD_INSET_BOTTOM,
    );
  }

  /** Общие матрица камеры и сила искажения — один вызов на любой draw call. */
  private applyViewProj(draw: DrawCall): DrawCall {
    return draw.uniform('uViewProj', this.viewProj).uniform('uWarp', this.warp);
  }

  /**
   * Габариты видимых плит в мировых координатах. Рамка строится по реальной
   * форме пути, а не по всей карте: иначе невидимые стены по краям съедают
   * половину экрана и поле выглядит мелким.
   */
  private visibleBounds(state: RenderState): {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  } {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        if (!isWalkableCell(state.grid[y * state.width + x] as CellType)) continue;
        const wx = x - state.width / 2;
        const wz = y - state.height / 2;
        if (wx < minX) minX = wx;
        if (wx + 1 > maxX) maxX = wx + 1;
        if (wz < minZ) minZ = wz;
        if (wz + 1 > maxZ) maxZ = wz + 1;
      }
    }
    if (!Number.isFinite(minX)) {
      return {
        minX: -state.width / 2,
        maxX: state.width / 2,
        minZ: -state.height / 2,
        maxZ: state.height / 2,
      };
    }
    return { minX, maxX, minZ, maxZ };
  }

  /** Перестроить сетку для данной волны create-анимации. */
  private rebuildGrid(state: RenderState, wave: number): void {
    if (!this.app || !this.lineProgram) return;
    this.gridWave = wave;
    // Сетка только по клеткам поля: после окончания create маска снята и
    // без проверки UNKNOWN линии рисовались по всему прямоугольнику уровня,
    // выходя тонкими штрихами за пределы платформы.
    const cellVisible = (x: number, y: number): boolean => {
      if (x < 0 || x >= state.width || y < 0 || y >= state.height) return false;
      if (!isWalkableCell(state.grid[y * state.width + x] as CellType)) return false;
      return this.cellVisibleAt(x, y, wave);
    };
    const lines = buildGridLines(state.width, state.height, cellVisible, PLATFORM_TOP + 0.02);
    // Пересоздать буфер (VAO/DrawCall) — число рёбер меняется на каждой волне
    this.gridBuf?.delete();
    this.gridVao?.delete();
    if (lines.length === 0) {
      this.gridBuf = null;
      this.gridVao = null;
      this.gridDraw = null;
      return;
    }
    this.gridBuf = this.app.createVertexBuffer(PicoGL.FLOAT, 3, lines);
    this.gridVao = this.app.createVertexArray().vertexAttributeBuffer(0, this.gridBuf);
    this.gridDraw = this.app
      .createDrawCall(this.lineProgram, this.gridVao)
      .primitive(PicoGL.LINES);
  }

  animateMove(moves: MoveAnimation[], onComplete: () => void): void {
    if (!this.state || moves.length === 0) {
      onComplete();
      return;
    }
    this.movingCount = moves.length;
    this.moveDone = onComplete;
    for (const m of moves) {
      const item = this.boxPos.find(
        (b) => b.color === m.color && b.x === m.from.x + 0.5 && b.z === m.from.y + 0.5,
      );
      if (!item) {
        this.finishMove();
        continue;
      }
      const distance = Math.abs(m.to.x - m.from.x) + Math.abs(m.to.y - m.from.y);
      this.tweens.add(
        item as unknown as Record<string, number>,
        { x: m.to.x + 0.5, z: m.to.y + 0.5, y: BOX_Y },
        TweenManager.moveDuration(distance, this.moveSpeed),
        () => this.finishMove(),
      );
    }
  }

  private finishMove(): void {
    this.movingCount--;
    if (this.movingCount <= 0) {
      this.movingCount = 0;
      const cb = this.moveDone;
      this.moveDone = null;
      cb?.();
    }
  }

  animateCreate(state: RenderState, onComplete: () => void): void {
    this.render(state);
    // Новый уровень — старые стрелки подсказки больше не применимы.
    this.hint = null;
    const { width, height } = state;
    const cellAt = (x: number, y: number) => state.grid[y * width + x];
    this.createMask = createWaveMask(width, height, (x, y) => cellAt(x, y) !== CellType.UNKNOWN);
    this.createMaxWave = maxWave(this.createMask);
    // Отсчёт по «стенным» часам, а не по сумме кадровых дельт: иначе на слабом
    // устройстве/в фоновой вкладке анимация почти не продвигается.
    this.createStartedAt = performance.now();
    this.createElapsed = 0;
    this.createDone = onComplete;
  }

  /** Орбита: рыскание вокруг Y уровня и наклон вокруг X (радианы). */
  orbit(dYaw: number, dPitch: number): void {
    this.camera.orbit(dYaw, dPitch);
    this.updateCamera();
  }

  /** Текущие углы камеры: по ним тач переводит свайп в локальные оси уровня. */
  getCameraAngles(): { yaw: number; pitch: number } {
    return this.camera.getAngles();
  }

  /** Стрелки подсказки: от кубиков по свободным клеткам до упора. */
  showHint(arrows: HintArrow[]): void {
    if (arrows.length === 0) {
      this.hint = null;
      return;
    }
    this.hint = {
      arrows: arrows.map((a) => ({ ...a })),
      start: performance.now(),
      fadeAt: null,
      fadeFrom: 1,
    };
  }

  hideHint(): void {
    this.hint = null;
  }

  /**
   * Игрок уже сделал ход, пока стрелки ещё видны: не ждём конца их таймера,
   * а плавно гасим с текущей прозрачности.
   */
  fadeHintOut(): void {
    if (!this.hint || this.hint.fadeAt !== null) return;
    const now = performance.now();
    this.hint.fadeFrom = this.hintAlpha(now - this.hint.start);
    this.hint.fadeAt = now;
  }

  /** Прозрачность стрелок по обычному таймеру (скольжение → пауза → затухание). */
  private hintAlpha(elapsed: number): number {
    if (elapsed <= HINT_FADE_START_MS) return 1;
    return Math.max(0, 1 - (elapsed - HINT_FADE_START_MS) / (HINT_TOTAL_MS - HINT_FADE_START_MS));
  }

  /** Компас клавиатуры (плоскость с осями L/D) нужен только в самой игре. */
  setKeyGuideVisible(visible: boolean): void {
    this.keyGuide = visible;
  }

  /** Скорость хода кубиков (настройка «Плавно / Быстро»). */
  setMoveSpeed(multiplier: number): void {
    this.moveSpeed = multiplier > 0 ? multiplier : 1;
  }

  /** Проекция сцены: ортогональная, изометрическая или обратная изометрическая. */
  setProjection(mode: ProjectionMode): void {
    this.camera.setProjection(mode);
    this.warp = this.camera.getWarp();
    this.updateCamera();
  }

  /** Счётчик кадров: маленькая плашка в левом нижнем углу. */
  setFpsVisible(visible: boolean): void {
    this.fpsVisible = visible;
    if (!this.fpsEl) {
      const el = document.createElement('div');
      el.className = 'fps-counter';
      el.hidden = true;
      document.body.appendChild(el);
      this.fpsEl = el;
    }
    this.fpsEl.hidden = !visible;
    this.fpsFrames = 0;
    this.fpsSince = performance.now();
  }

  /** Пересчёт FPS раз в полсекунды — чаще цифры дёргаются и не читаются. */
  private updateFps(now: number): void {
    if (!this.fpsEl) return;
    this.fpsFrames++;
    const elapsed = now - this.fpsSince;
    if (elapsed < 500) return;
    const fps = Math.round((this.fpsFrames * 1000) / elapsed);
    this.fpsEl.textContent = `${fps} FPS`;
    this.fpsFrames = 0;
    this.fpsSince = now;
  }

  startLoop(): void {
    this.wantsLoop = true;
    if (this.loopRunning || this.contextLost) return;
    this.loopRunning = true;
    this.lastFrameTime = performance.now();
    const frame = (now: number) => {
      if (!this.loopRunning) return;
      // Клампим dt: если вкладка/панель была неактивна, rAF не вызывался
      // и огромный dt мгновенно «проглатывал» анимацию появления уровня.
      const dt = Math.min(Math.max((now - this.lastFrameTime) / 1000, 0), 0.05);
      this.lastFrameTime = now;
      this.tweens.update();
      this.updateCreateAnim(dt);
      this.drawFrame();
      if (this.fpsVisible) this.updateFps(now);
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stopLoop(): void {
    this.wantsLoop = false;
    this.loopRunning = false;
    cancelAnimationFrame(this.rafId);
  }

  /** Прогресс появления клетки (0 — ещё нет, 1 — полностью выросла). */
  private cellProgress(x: number, y: number): number {
    if (!this.createMask) return 1;
    const wave = this.createMask[y]?.[x] ?? -1;
    if (wave < 0) return 0;
    const local = (this.createElapsed - wave * WAVE_INTERVAL_MS) / CREATE_GROW_MS;
    return local <= 0 ? 0 : local >= 1 ? 1 : local;
  }

  private updateCreateAnim(_dt: number): void {
    if (!this.createMask) return;
    this.createElapsed = performance.now() - this.createStartedAt;
    const duration = this.createMaxWave * WAVE_INTERVAL_MS + CREATE_GROW_MS;
    if (this.createElapsed >= duration) {
      this.createMask = null;
      const cb = this.createDone;
      this.createDone = null;
      cb?.();
    }
  }

  /** Волна, полностью «прибывшие» клетки которой уже рисуют линии сетки. */
  private gridRevealWave(): number {
    if (!this.createMask) return Number.MAX_SAFE_INTEGER;
    return Math.floor((this.createElapsed - CREATE_GROW_MS) / WAVE_INTERVAL_MS);
  }

  private cellVisibleAt(x: number, y: number, wave: number): boolean {
    if (!this.createMask) return true;
    const v = this.createMask[y]?.[x] ?? -1;
    if (v < 0) return false;
    return v <= wave;
  }

  private drawFrame(): void {
    const app = this.app;
    const state = this.state;
    if (!app || this.contextLost || !state || !this.cubeDraw || !this.quadDraw) return;

    app.clear();
    // Обычные грани рисуются непрозрачно; режим смешивания включается только
    // на время прохода ореола-подсветки (см. ниже).
    app.disable(PicoGL.BLEND);
    this.viewProj = this.camera.getViewProj();
    const model = mat4.create();
    const animating = this.createMask !== null;

    const drawCube = (
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      color: number[],
      glow = 0,
      alpha = 1,
    ) => {
      mat4.fromTranslation(model, [x, y, z]);
      mat4.scale(model, model, [sx, sy, sz]);
      this.applyViewProj(this.cubeDraw!.uniform('uModel', model))
        .uniform('uColor', color)
        .uniform('uAlpha', alpha)
        .uniform('uGlow', glow);
      this.cubeDraw!.draw();
    };

    const worldX = (x: number) => x - state.width / 2 + 0.5;
    const worldZ = (y: number) => y - state.height / 2 + 0.5;

    /** Плоский квад на клетке: размер, поворот вокруг Y (ромб цели), прозрачность. */
    const drawQuad = (
      x: number,
      y: number,
      z: number,
      size: number,
      color: number[],
      rotY = 0,
      alpha = 1,
    ) => {
      // Порядок важен: сначала перенос в центр клетки, потом поворот, потом масштаб.
      mat4.fromTranslation(model, [x, y, z]);
      mat4.rotateY(model, model, rotY);
      mat4.scale(model, model, [size, 1, size]);
      this.applyViewProj(this.quadDraw!.uniform('uModel', model))
        .uniform('uColor', color)
        .uniform('uAlpha', alpha)
        .uniform('uGlow', 0);
      this.quadDraw!.draw();
    };

    // Стены и пол инвертированы: проходимые клетки — приподнятые плиты, по которым
    // катаются кубики (WALL больше не рисуется — на его месте обрыв и фон сцены).
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        const cell = state.grid[y * state.width + x] as CellType;
        if (!isWalkableCell(cell)) continue;
        const progress = this.cellProgress(x, y);
        if (progress <= 0) continue;

        const eased = easeOutCubic(progress);
        const scale = animating ? 0.05 + 0.95 * eased : 1;
        const lift = animating ? (1 - eased) * 1.2 : 0;

        drawCube(
          worldX(x),
          (PLATFORM_TOP / 2) * scale + lift,
          worldZ(y),
          scale,
          PLATFORM_TOP * scale,
          scale,
          COLOR_PLATFORM,
        );

        if (isEndCell(cell)) {
          const goalColor = cell === CellType.END ? COLOR_GOAL_ONE : COLOR_GOAL_TWO;
          const surface = PLATFORM_TOP + lift;
          // Углубление и контур цели. Квады без поворота: в изометрии
          // осевой квадрат проецируется ромбом — как в атласе.
          // Отступы по Y — не меньше шага depth-буфера (16 бит на 200 единиц
          // ≈ 0.003): при 0.002 контур цели дрожал и мерцал (уровень 1-2).
          // Плашка цели растёт вместе с плитой: конец уровня появляется
          // одновременно с площадкой, а не следом за ней.
          drawQuad(worldX(x), surface + 0.012, worldZ(y), 0.82 * scale, COLOR_RECESS);
          drawQuad(worldX(x), surface + 0.024, worldZ(y), 0.68 * scale, goalColor);
          drawQuad(worldX(x), surface + 0.036, worldZ(y), 0.48 * scale, COLOR_RECESS);
        }
      }
    }

    // Линии сетки: перестраивать только при изменении волны
    const wave = this.gridRevealWave();
    if (wave !== this.gridWave) {
      this.rebuildGrid(state, wave);
    }
    if (this.gridDraw) {
      mat4.identity(model);
      this.applyViewProj(this.gridDraw.uniform('uModel', model)).uniform(
        'uColor',
        COLOR_GRID,
      );
      this.gridDraw.draw();
    }

    // Кубики на своих площадках светятся ровным ореолом своего цвета
    // (без пульсации — мигание читалось как мерцание) и лёгкой подсветкой
    // самого кубика (uGlow). Ключ площадки — позиция и цвет, поэтому чужой
    // кубик не подсвечивается.
    const goals = new Set(state.ends.map((e) => `${e.pos.x},${e.pos.y},${e.color}`));
    const onGoal = (b: RenderBoxPos): boolean =>
      goals.has(`${Math.round(b.x - 0.5)},${Math.round(b.z - 0.5)},${b.color}`);

    const glowing = this.boxPos.filter(onGoal);
    if (glowing.length > 0 && !animating) {
      const gl = app.gl;
      app.enable(PicoGL.BLEND);
      // Обычное альфа-смешивание: ореол остаётся цвета кубика. Альфа приёмника
      // принудительно держится на 1 — иначе прозрачные пиксели попадают в canvas.
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE);
      // Ореолы рисуются друг поверх друга на одной высоте — глубина не пишется.
      gl.depthMask(false);
      const { yaw, pitch } = this.camera.getAngles();
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);
      const sinPitch = Math.sin(pitch);
      const cosPitch = Math.cos(pitch);
      for (const b of glowing) {
        const bx = Math.round(b.x - 0.5);
        const bz = Math.round(b.z - 0.5);
        const color = b.color === ColorType.ONE ? GLOW_ONE : GLOW_TWO;
        // Мягкое пятно на самой площадке вокруг кубика.
        this.floorBasis(this.basisMatrix, worldX(bx), worldZ(bz), PLATFORM_TOP + 0.03, 0);
        mat4.scale(this.decalModel, this.basisMatrix, [2.1, 2.1, 1]);
        this.drawGlow(this.decalModel, color, 0.55);
        // Объёмный ореол: билборд к камере вокруг центра кубика. Так свечение
        // мягко расходится во все стороны и не читается как «раздутый куб».
        PicoglRenderer.setBasis(
          this.basisMatrix,
          [b.x - state.width / 2, b.y, b.z - state.height / 2],
          [cosYaw, 0, sinYaw],
          [sinPitch * sinYaw, cosPitch, -sinPitch * cosYaw],
        );
        mat4.scale(this.decalModel, this.basisMatrix, [2.7, 2.7, 1]);
        this.drawGlow(this.decalModel, color, 1.0);
      }
      gl.depthMask(true);
      app.disable(PicoGL.BLEND);
    }

    // Кубики: скрывать до появления клетки (аналог скрытых узлов в create_state.gd)
    for (const b of this.boxPos) {
      const bx = Math.round(b.x - 0.5);
      const bz = Math.round(b.z - 0.5);
      const progress = this.cellProgress(bx, bz);
      if (progress <= 0) continue;
      const eased = easeOutCubic(progress);
      const scale = animating ? 0.05 + 0.95 * eased : 1;
      const lift = animating ? (1 - eased) * 1.2 : 0;
      drawCube(
        b.x - state.width / 2,
        BOX_Y * scale + lift,
        b.z - state.height / 2,
        0.9 * scale,
        scale,
        0.9 * scale,
        b.color === ColorType.ONE ? COLOR_BOX : COLOR_BOX_TWO,
        onGoal(b) ? 1 : 0,
      );
    }

    // Стрелки подсказки — поверх сцены: кубик закрывает собой клетку упора,
    // и без этого половина стрелок оставалась за ним.
    this.drawHintArrows(state);

    // Компас клавиатуры — в своём маленьком вьюпорте, поверх сцены.
    this.drawKeyGuide();
  }

  /** Матрица базиса декали: локальные +X/+Y кладутся на `right`/`up`, нормаль вверх. */
  private static setBasis(
    out: mat4,
    origin: [number, number, number],
    right: [number, number, number],
    up: [number, number, number],
  ): void {
    out[0] = right[0];
    out[1] = right[1];
    out[2] = right[2];
    out[3] = 0;
    out[4] = up[0];
    out[5] = up[1];
    out[6] = up[2];
    out[7] = 0;
    // Третья колонка — нормаль (right × up): декаль должна смотреть вверх,
    // иначе при включённом CULL_FACE её грани отсекаются как задние.
    out[8] = right[1] * up[2] - right[2] * up[1];
    out[9] = right[2] * up[0] - right[0] * up[2];
    out[10] = right[0] * up[1] - right[1] * up[0];
    out[11] = 0;
    out[12] = origin[0];
    out[13] = origin[1];
    out[14] = origin[2];
    out[15] = 1;
  }

  /**
   * Базис декали на полу уровня: локальный +X — направление `angle` в плоскости
   * XZ, локальный +Y — перпендикуляр к нему, нормаль — строго вверх.
   */
  private floorBasis(out: mat4, wx: number, wz: number, y: number, angle: number): void {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    PicoglRenderer.setBasis(out, [wx, y, wz], [c, 0, s], [s, 0, -c]);
  }

  /** Штрих внутри базиса: отрезок (x0,y0)→(x1,y1) толщиной `thick`. */
  private drawBar(
    base: mat4,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    thick: number,
    color: number[],
    alpha = 1,
  ): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len <= 0.0001 || !this.quadXYDraw) return;
    mat4.fromTranslation(this.decalModel, [(x0 + x1) / 2, (y0 + y1) / 2, 0]);
    mat4.rotateZ(this.decalModel, this.decalModel, Math.atan2(dy, dx));
    mat4.scale(this.decalModel, this.decalModel, [len, thick, 1]);
    mat4.multiply(this.decalModel, base, this.decalModel);
    this.drawDecal(this.decalModel, color, alpha);
  }

  private drawDecal(model: mat4, color: number[], alpha = 1): void {
    if (!this.quadXYDraw) return;
    this.applyViewProj(this.quadXYDraw.uniform('uModel', model))
      .uniform('uColor', color)
      .uniform('uAlpha', alpha)
      .uniform('uGlow', 0)
      .draw();
  }

  private drawGlow(model: mat4, color: number[], intensity: number): void {
    if (!this.glowDraw) return;
    this.applyViewProj(this.glowDraw.uniform('uModel', model))
      .uniform('uColor', color)
      .uniform('uIntensity', intensity)
      .draw();
  }

  /**
   * Стрелки подсказки: двойной шеврон «»» на полу, который скользит от клетки
   * кубика до клетки упора, а затем плавно гаснет.
   */
  private drawHintArrows(state: RenderState): void {
    const hint = this.hint;
    const app = this.app;
    if (!hint || !app || !this.quadXYDraw) return;
    const now = performance.now();
    const elapsed = now - hint.start;
    if (hint.fadeAt === null && elapsed >= HINT_TOTAL_MS) {
      this.hint = null;
      return;
    }
    const slide = easeOutCubic(Math.min(1, elapsed / HINT_SLIDE_MS));
    const fade =
      hint.fadeAt === null
        ? this.hintAlpha(elapsed)
        : hint.fadeFrom * Math.max(0, 1 - (now - hint.fadeAt) / HINT_FADE_OUT_MS);
    if (fade <= 0) {
      this.hint = null;
      return;
    }

    const gl = app.gl;
    app.enable(PicoGL.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE);
    gl.depthMask(false);
    app.disable(PicoGL.DEPTH_TEST);
    for (const arrow of hint.arrows) {
      const dx = arrow.to.x - arrow.from.x;
      const dz = arrow.to.y - arrow.from.y;
      // Кубик, которому некуда ехать, стрелку не показывает.
      if (dx === 0 && dz === 0) continue;
      // Стрелка доезжает до самой клетки упора — там, куда встанет кубик.
      const cx = arrow.from.x + dx * slide + 0.5 - state.width / 2;
      const cz = arrow.from.y + dz * slide + 0.5 - state.height / 2;
      const color = arrow.color === ColorType.ONE ? ARROW_ONE : ARROW_TWO;
      this.floorBasis(this.basisMatrix, cx, cz, PLATFORM_TOP + 0.035, Math.atan2(dz, dx));
      for (const tip of [0.16, -0.14]) {
        this.drawBar(this.basisMatrix, tip - 0.26, -0.26, tip, 0, 0.1, color, fade);
        this.drawBar(this.basisMatrix, tip - 0.26, 0.26, tip, 0, 0.1, color, fade);
      }
    }
    gl.depthMask(true);
    app.enable(PicoGL.DEPTH_TEST);
    app.disable(PicoGL.BLEND);
  }

  /**
   * Компас клавиатуры: две оси в плоскости пола уровня. Стержень компаса —
   * **начало координат**: оси выходят из него и вся фигура вращается вокруг
   * него же. «L» — мировая −X, «D» — мировая +Z.
   *
   * Оси блёклые (цвет недоступной кнопки отката), буквы — билборды цветом
   * активной кнопки, поэтому подписи читаются и при сильном наклоне.
   */
  private drawKeyGuide(): void {
    const app = this.app;
    if (!app || !this.keyGuide || !this.quadXYDraw) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sizeCss = Math.round(
      Math.max(84, Math.min(168, Math.min(this.viewportW, this.viewportH) * 0.32)),
    );
    // Над нижней панелью HUD, у правого края — как в макете.
    const left = Math.round(this.viewportW - sizeCss - 14);
    const bottom = Math.round(96);
    if (left < 0 || bottom + sizeCss > this.viewportH) return;

    app.viewport(Math.round(left * dpr), Math.round(bottom * dpr), Math.round(sizeCss * dpr), Math.round(sizeCss * dpr));
    const { yaw, pitch } = this.camera.getAngles();
    mat4.fromXRotation(this.scratchRot, pitch);
    mat4.multiply(this.scratchRot, this.scratchRot, mat4.fromYRotation(mat4.create(), yaw));
    // Кадр компаса симметричен относительно начала координат: при вращении
    // стрелки ходят по кругу, и такой кадр их никогда не обрезает.
    const half = 1;
    mat4.ortho(this.gizmoProj, -half, half, -half, half, -20, 20);
    mat4.multiply(this.gizmoViewProj, this.gizmoProj, this.scratchRot);
    this.viewProj = this.gizmoViewProj;

    app.disable(PicoGL.DEPTH_TEST);
    const gl = app.gl;
    app.enable(PicoGL.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE);

    // Компас не часть уровня: искажение глубины к нему не применяется.
    const warp = this.warp;
    this.warp = 0;

    // Плоскость XZ: локальные +X/+Y — мировые X/−Z, нормаль вверх. Подложки нет:
    // только штрихи, чтобы компас не закрывал поле цветной плашкой.
    PicoglRenderer.setBasis(this.basisMatrix, [0, 0, 0], [1, 0, 0], [0, 0, -1]);

    // Короткие и блёклые оси: подсказка не должна спорить с полем по акценту.
    const reach = 0.61;
    const thick = 0.058;
    const alpha = KEY_GUIDE_DIM_ALPHA;
    this.drawBar(this.basisMatrix, 0, 0, -reach, 0, thick, COLOR_INK, alpha);
    this.drawBar(this.basisMatrix, 0, 0, 0, -reach, thick, COLOR_INK, alpha);
    // Наконечники осей.
    // Стержень компаса: точка, вокруг которой вся фигура вращается.
    this.drawBar(this.basisMatrix, -0.045, 0, 0.045, 0, 0.09, COLOR_INK, alpha);
    const head = 0.095;
    const spread = 0.058;
    this.drawBar(this.basisMatrix, -reach, 0, -reach + head, spread, thick, COLOR_INK, alpha);
    this.drawBar(this.basisMatrix, -reach, 0, -reach + head, -spread, thick, COLOR_INK, alpha);
    this.drawBar(this.basisMatrix, 0, -reach, spread, -reach + head, thick, COLOR_INK, alpha);
    this.drawBar(this.basisMatrix, 0, -reach, -spread, -reach + head, thick, COLOR_INK, alpha);

    // Буквы — билборды: точку кончика переносим в пространство взгляда тем же
    // поворотом, а саму надпись кладём уже в экранной плоскости (без поворота),
    // иначе при наклоне буквы заваливались бы вместе с полом.
    this.viewProj = this.gizmoProj;
    PicoglRenderer.setBasis(this.basisMatrix, [0, 0, 0], [1, 0, 0], [0, 1, 0]);
    const tipL = this.viewPoint(-reach - 0.16, 0.02, 0);
    const tipD = this.viewPoint(0, 0.02, reach + 0.16);
    this.drawGlyphL(tipL[0], tipL[1], COLOR_INK);
    this.drawGlyphD(tipD[0], tipD[1], COLOR_INK);

    this.warp = warp;
    app.disable(PicoGL.BLEND);
    app.enable(PicoGL.DEPTH_TEST);
    app.defaultViewport();
    this.viewProj = this.camera.getViewProj();
  }

  /** Мировая точка → пространство взгляда (только поворот камеры, без сдвига). */
  private viewPoint(x: number, y: number, z: number): [number, number] {
    const m = this.scratchRot;
    return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z];
  }

  /** Буква «L»: подпись оси левой стрелки. */
  private drawGlyphL(cx: number, cy: number, color: number[]): void {
    const h = 0.115;
    const w = 0.1;
    const t = 0.04;
    const x0 = cx - w / 2;
    this.drawBar(this.basisMatrix, x0, cy - h, x0, cy + h, t, color);
    this.drawBar(this.basisMatrix, x0, cy - h, x0 + w, cy - h, t, color);
  }

  /** Буква «D»: подпись оси нижней стрелки. */
  private drawGlyphD(cx: number, cy: number, color: number[]): void {
    const h = 0.115;
    const r = 0.115;
    const t = 0.04;
    const x0 = cx - r * 0.45;
    this.drawBar(this.basisMatrix, x0, cy - h, x0, cy + h, t, color);
    const steps = 6;
    let px = x0;
    let py = cy + h;
    for (let i = 1; i <= steps; i++) {
      const a = Math.PI / 2 - (Math.PI * i) / steps;
      const nx = x0 + r * Math.cos(a);
      const ny = cy + h * Math.sin(a);
      this.drawBar(this.basisMatrix, px, py, nx, ny, t, color);
      px = nx;
      py = ny;
    }
  }
}
