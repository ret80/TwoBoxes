import { App, DrawCall, Program, VertexArray, VertexBuffer, PicoGL } from 'picogl';
import { mat4 } from 'gl-matrix';
import { ColorType } from '../../core/types/color';
import {
  CellType,
  isBoxCell,
  isEndCell,
  isMechanicCell,
  oneWayDir,
  rotorElbow,
  rotorElbowExit,
} from '../../core/types/cell';
import type { PathPoint } from '../../core/types/game-state';
import { firstTeleport, planRoute, routeCells, type RouteSegment } from './route';
import type { Position } from '../../core/types/position';
import { PortalRule } from '../../core/rules/portal';
import type {
  HintPath,
  IRenderer,
  MoveAnimation,
  ProjectionMode,
  RenderState,
} from '../../ports/IRenderer';
import type { HintStyle, Theme } from '../../core/services/config';
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
import { portalDurationMs, portalPose, type PortalPose } from './portal-animation';
import {
  CREATE_GROW_MS,
  createWaveMask,
  maxWave,
  WAVE_INTERVAL_MS,
} from './create-animation';

/**
 * Цвета сцены — та же палитра атласа, что и в CSS: тёплый крем, бирюзовые
 * плиты, коралловый и золотой кубики. Цвета заданы «базовыми»: шейдер умножает
 * их на 0.78 + 0.30·diff, поэтому верхние грани выходят светлее, боковые —
 * темнее (мягкий свет как в оригинале).
 *
 * Тёмная палитра собрана по мотивам светлой: поверхности тёмные и тёплые (не
 * чёрные), плиты светлее фона, акценты чуть светлее и мягче — так они читаются
 * на тёмном, не вибрируя.
 */
interface ScenePalette {
  platform: number[];
  boxOne: number[];
  boxTwo: number[];
  goalOne: number[];
  goalTwo: number[];
  recess: number[];
  grid: number[];
  background: number[];
  portalA: number[];
  portalB: number[];
  trap: number[];
  trapMark: number[];
  rotor: number[];
  rotorMark: number[];
  gyro: number[];
  gyroMark: number[];
  switchColor: number[];
  switchMark: number[];
  oneway: number[];
  onewayMark: number[];
  arrowOne: number[];
  arrowTwo: number[];
  ink: number[];
}

const PALETTE_LIGHT: ScenePalette = {
  platform: [0.594, 0.727, 0.697], // бирюзовая плита пути
  boxOne: [0.898, 0.596, 0.482], // куб mat_color_one (коралл)
  boxTwo: [0.914, 0.786, 0.462], // куб mat_color_two (золото)
  goalOne: [0.933, 0.541, 0.404], // контур цели красного кубика
  goalTwo: [0.925, 0.788, 0.404], // контур цели жёлтого кубика
  recess: [0.404, 0.529, 0.51], // углубление целевой площадки
  grid: [0.9, 0.96, 0.94], // светлая сетка на плитах
  background: [0.933, 0.906, 0.843], // тёплый желтоватый фон сцены
  // Механики: цветные вставки на плитах, чтобы тип клетки читался без легенды.
  portalA: [0.36, 0.62, 0.88],
  portalB: [0.74, 0.45, 0.84],
  trap: [0.38, 0.3, 0.27],
  trapMark: [0.82, 0.42, 0.34],
  rotor: [0.34, 0.57, 0.55],
  rotorMark: [0.94, 0.86, 0.62],
  gyro: [0.38, 0.5, 0.64],
  gyroMark: [0.9, 0.94, 1.0],
  switchColor: [0.72, 0.58, 0.32],
  switchMark: [1.0, 0.92, 0.72],
  oneway: [0.5, 0.63, 0.58],
  onewayMark: [0.95, 0.97, 0.9],
  // Стрелки-подсказки на полу: чуть светлее кубиков, чтобы читались на плитах.
  arrowOne: [0.93, 0.44, 0.26],
  arrowTwo: [0.93, 0.71, 0.24],
  // Кофейный цвет текста и иконок интерфейса (--color-coffee).
  ink: [0.29, 0.208, 0.153],
};

const PALETTE_DARK: ScenePalette = {
  platform: [0.21, 0.31, 0.3], // плита светлее фона — «приподнятая» поверхность
  boxOne: [0.93, 0.62, 0.5],
  boxTwo: [0.94, 0.81, 0.48],
  goalOne: [0.98, 0.6, 0.45],
  goalTwo: [0.97, 0.82, 0.45],
  recess: [0.1, 0.16, 0.155], // углубление остаётся темнее плиты
  grid: [0.42, 0.53, 0.51],
  background: [0.102, 0.09, 0.082], // тёплый уголь вместо чисто чёрного
  portalA: [0.42, 0.67, 0.95],
  portalB: [0.78, 0.52, 0.9],
  trap: [0.13, 0.12, 0.11],
  trapMark: [0.9, 0.5, 0.42],
  rotor: [0.24, 0.42, 0.4],
  rotorMark: [0.94, 0.86, 0.62],
  gyro: [0.3, 0.42, 0.56],
  gyroMark: [0.86, 0.92, 1.0],
  switchColor: [0.62, 0.5, 0.28],
  switchMark: [1.0, 0.92, 0.72],
  oneway: [0.3, 0.42, 0.39],
  onewayMark: [0.95, 0.97, 0.9],
  arrowOne: [1.0, 0.55, 0.34],
  arrowTwo: [1.0, 0.79, 0.32],
  ink: [0.92, 0.88, 0.83], // компас: кремовые оси и буквы
};

// Свечение кубика на своей площадке — насыщенный цвет кубика (не белый).
const GLOW_ONE = [1.0, 0.42, 0.17]; // коралловый ореол
const GLOW_TWO = [1.0, 0.66, 0.18]; // золотой ореол

/**
 * Геометрия свечения. Свет рисуется двумя квадами: свет на самой площадке
 * (квадрат по размеру клетки) и ореол вокруг кубика (силуэт кубика, снятый с
 * текущего ракурса камеры). Расстояния — в UV квада, поэтому связаны с его
 * размером: клетка 1.0 мира при кваде 1.9 — половина 0.263, кубик 0.9 мира в
 * кваде 3.6 — половина 0.125.
 */
const GLOW_POOL_SIZE = 1.9;
/** Половина клетки в UV квада площадки. */
const GLOW_POOL_HALF = 0.5 / GLOW_POOL_SIZE;
const GLOW_POOL_CORE = 0.04;
const GLOW_POOL_WIDE = 0.045;
const GLOW_POOL_ALPHA = 0.34;
/** Силуэт площадки — квадрат клетки: две полосы (третья дублирует вторую). */
const GLOW_POOL_SLABS = [
  1, 0, GLOW_POOL_HALF,
  0, 1, GLOW_POOL_HALF,
  0, 1, GLOW_POOL_HALF,
];
const GLOW_HALO_SIZE = 3.6;
/** Половина кубика (0.9 мира) в UV квада ореола. */
const GLOW_HALO_HALF = 0.45 / GLOW_HALO_SIZE;
/** Ядро и мягкий хвост: свечение почти не уходит дальше пятой части кубика. */
const GLOW_HALO_CORE = 0.01;
const GLOW_HALO_WIDE = 0.026;
const GLOW_HALO_ALPHA = 0.8;
/** Компас: оси — цветом текста, но с прозрачностью недоступной кнопки отката. */
const KEY_GUIDE_DIM_ALPHA = 0.32;

/** Подсказка: проехали путь → держатся → гаснут (как плашка HUD). */
const HINT_SLIDE_MS = 560;
/** Время проезда одной клетки: длинный путь читается дольше короткого. */
const HINT_MS_PER_CELL = 130;
/** Потолок проезда: совсем длинные пути не должны тянуть подсказку. */
const HINT_MAX_SLIDE_MS = 1600;
/** Прозрачность блёклого следа из стрелок по клеткам пройденного пути. */
const HINT_TRAIL_ALPHA = 0.3;
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
/** Низ кубика в обычной позе — отсюда считаются подъёмы анимации телепорта. */
const BOX_FLOOR = BOX_Y - 0.5;

/**
 * Плиты есть там, где может оказаться кубик: EMPTY, целевые клетки и сами
 * кубики (их клетки в карте уровня помечены BOX/BOX_TWO). WALL — обрыв.
 */
const isWalkableCell = (cell: CellType): boolean =>
  cell === CellType.EMPTY || isEndCell(cell) || isBoxCell(cell) || isMechanicCell(cell);

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/** Позиция кубика для анимации: координаты уровня (центр клетки) + мировая высота. */
interface RenderBoxPos {
  x: number; // level coords center (pos.x + 0.5)
  z: number; // level coords center (pos.y + 0.5)
  y: number; // мировая высота центра
  color: ColorType;
  /** Множитель сечения (X и Z) и высоты: телепорт меняет форму кубика. */
  sxz: number;
  sy: number;
  /** Кубик в анимации телепорта: форму и высоту ведёт рендерер, а не tween. */
  inPortal: boolean;
}

/** План анимации одного кубика за ход: отрезки маршрута и их тайминги. */
interface MovePlan {
  item: RenderBoxPos;
  /** Проезды и прыжки через портал в порядке хода. */
  segments: RouteSegment[];
  /** Сколько клеток кубик проезжает (прыжки не в счёт). */
  total: number;
  /** Длительность маршрута без прыжков, мс. */
  totalMs: number;
  /** Клетка входа в портал; null — кубик в этом ходу не телепортируется. */
  entry: Position | null;
  /** Клетка выхода из портала; null — без телепорта. */
  exit: Position | null;
  /** Второй участник обмена через портал (индекс в списке планов), -1 — нет. */
  pair: number;
}

/** Активная анимация телепорта одного кубика. */
interface PortalAnim {
  item: RenderBoxPos;
  /** Клетки входа и выхода в координатах сцены (центр клетки). */
  from: { x: number; z: number };
  to: { x: number; z: number };
  startedAt: number;
  /** Длительность этой анимации: у быстрого варианта она своя. */
  durationMs: number;
  /** Ускоренная анимация хода: кубик просто сжимается и переносится. */
  snappy: boolean;
  /** Продолжение пути: кубик появился на выходе и едет дальше. */
  done: () => void;
}

/** Телепорт, ждущий своей очереди: портал занят предыдущей анимацией. */
interface PendingPortalHop {
  item: RenderBoxPos;
  to: Position;
  done: () => void;
  /** Общий ключ у пары обмена: такие прыжки стартуют вдвоём. */
  group: number | null;
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
  /** Палитра сцены выбранной темы (см. PALETTE_LIGHT / PALETTE_DARK). */
  private palette: ScenePalette = PALETTE_LIGHT;
  /** Вид подсказки: стрелки на полу или проволочный кубик. */
  private hintStyle: HintStyle = 'arrows';

  // Матрицы-скретч: декали (стрелки, буквы) собираются из них каждый кадр.
  private viewProj: mat4 = mat4.create();
  private gizmoViewProj: mat4 = mat4.create();
  private readonly gizmoProj = mat4.create();
  private readonly basisMatrix = mat4.create();
  private readonly decalModel = mat4.create();
  private readonly scratchRot = mat4.create();
  /** Полосы силуэта кубика для шейдера ореола (9 чисел, см. `cubeHull`). */
  private readonly hullSlabs = new Array<number>(9).fill(0);

  // Подсказка и компас клавиатуры (плоскость L/D)
  private hint: {
    paths: HintPath[];
    start: number;
    /** Длительность проезда по самому длинному пути, мс. */
    duration: number;
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

  /** Анимации телепорта: кадрами управляет таймер цикла, а не tween. */
  private portals: PortalAnim[] = [];
  /** Сколько телепортов держат остальные кубики на паузе (вложенных быть не может). */
  private portalBlocks = 0;
  /**
   * Пауза отложена на следующий кадр: кубик, который въезжает в портал в этом
   * же кадре, успевает начать свою анимацию — два портала играют разом, а не
   * по очереди.
   */
  private portalPausePending = false;
  /** Прыжки, ждущие партнёра по обмену: оба стартуют одновременно. */
  private parkedHops = new Map<number, { index: number; step: number }>();
  /** Очередь телепортов: не больше одной анимации портала за раз. */
  private portalQueue: PendingPortalHop[] = [];
  /** Подписчик на старт телепорта: озвучка идёт по фазам анимации. */
  private portalListener: ((durationMs: number) => void) | null = null;
  /** Когда последний раз было событие телепорта — чтобы два разом дали один звук. */
  private lastPortalAt = Number.NEGATIVE_INFINITY;

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
      .clearColor(this.palette.background[0], this.palette.background[1], this.palette.background[2], 1);
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
      // Новая расстановка (старт уровня, сброс): телепорт-анимации больше
      // не относятся к делу, их позы не должны пережить смену состояния.
      this.portals = [];
      this.portalQueue = [];
      this.parkedHops.clear();
      this.portalBlocks = 0;
      this.portalPausePending = false;
      this.lastPortalAt = Number.NEGATIVE_INFINITY;
      this.tweens.resumeAll();
      this.boxPos = state.boxes.map((b) => ({
        x: b.pos.x + 0.5,
        z: b.pos.y + 0.5,
        y: BOX_Y,
        color: b.color,
        sxz: 1,
        sy: 1,
        inPortal: false,
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
    this.parkedHops.clear();

    const plans: MovePlan[] = [];
    for (const m of moves) {
      const item = this.boxPos.find(
        (b) => b.color === m.color && b.x === m.from.x + 0.5 && b.z === m.from.y + 0.5,
      );
      if (!item) {
        this.finishMove();
        continue;
      }

      // Фактический путь из правил: повороты на ротаторах и выход из
      // портала. Без него кубик срезал бы через стены по прямой.
      const path: PathPoint[] =
        m.path && m.path.length > 1
          ? m.path
          : [
              { pos: m.from },
              { pos: m.to },
            ];
      // Путь склеивается в отрезки «столько-то клеток в одном направлении»:
      // tween ведётся на отрезок, а не на клетку. Иначе кубик доскакивает до
      // границы каждой клетки и замирает — движение выглядит рваным.
      const segments = planRoute(path);
      const total = routeCells(segments);
      const jump = firstTeleport(segments);
      plans.push({
        item,
        segments,
        total,
        totalMs: TweenManager.moveDuration(Math.max(1, total), this.moveSpeed),
        entry: jump ? jump.entry : null,
        exit: jump ? jump.exit : null,
        pair: -1,
      });
    }

    // Обмен через портал: кубики меняются клетками. Их прыжки должны начаться
    // вместе — иначе один уже стоит на выходе, пока второй ещё едет к входу.
    for (let i = 0; i < plans.length; i++) {
      const a = plans[i];
      if (!a.entry || !a.exit || a.pair >= 0) continue;
      for (let j = i + 1; j < plans.length; j++) {
        const b = plans[j];
        if (!b.entry || !b.exit || b.pair >= 0) continue;
        if (PortalRule.isSwapPair({ entry: a.entry, exit: a.exit }, { entry: b.entry, exit: b.exit })) {
          a.pair = j;
          b.pair = i;
          break;
        }
      }
    }

    const play = (index: number, step: number): void => {
      const plan = plans[index];
      const segment = plan.segments[step];
      if (!segment) {
        this.finishMove();
        return;
      }
      if (segment.kind === 'slide') {
        // Один tween на весь прямой проезд: кубик едет ровно, без остановок
        // на границах клеток.
        const duration =
          plan.total > 0 ? (plan.totalMs * segment.cells) / plan.total : plan.totalMs;
        this.tweens.add(
          plan.item as unknown as Record<string, number>,
          {
            x: plan.item.x + segment.dir.x * segment.cells,
            z: plan.item.z + segment.dir.y * segment.cells,
            y: BOX_Y,
          },
          duration,
          () => play(index, step + 1),
        );
        return;
      }
      // Прыжок через портал: вместо мгновенного переноса кубик поднимается,
      // вытягивается в палку и уходит в точку, а на выходе собирается
      // обратно той же анимацией. Пока она идёт, остальные кубики стоят.
      if (plan.pair < 0) {
        this.startPortalHop(plan.item, segment.exit, () => play(index, step + 1));
        return;
      }
      const key = Math.min(index, plan.pair);
      const parked = this.parkedHops.get(key);
      if (!parked) {
        // Второй кубик ещё едет к своему порталу: ждём его и прыгаем вдвоём.
        this.parkedHops.set(key, { index, step });
        return;
      }
      this.parkedHops.delete(key);
      const parkedPlan = plans[parked.index];
      const parkedSegment = parkedPlan.segments[parked.step];
      if (parkedSegment && parkedSegment.kind === 'teleport') {
        this.startPortalHop(
          parkedPlan.item,
          parkedSegment.exit,
          () => play(parked.index, parked.step + 1),
          key,
        );
      } else {
        play(parked.index, parked.step + 1);
      }
      this.startPortalHop(plan.item, segment.exit, () => play(index, step + 1), key);
    };

    plans.forEach((_, index) => play(index, 0));
  }

  /**
   * Телепорт: кубик въехал на клетку портала. Анимация ведётся отдельным
   * таймером (см. `portalPose`), а не tween'ом — у неё свои фазы (подъём,
   * вытягивание, сужение, исчезновение) и обратный ход на выходе. Остальные
   * кубики на это время встают: их tween'ы уходят в паузу и продолжают с того
   * же места, когда анимация проиграет.
   */
  private startPortalHop(
    item: RenderBoxPos,
    to: Position,
    done: () => void,
    group: number | null = null,
  ): void {
    this.portalQueue.push({ item, to, done, group });
    this.drainPortalQueue();
  }

  /**
   * Запустить телепорт, если портал свободен. Обычные прыжки идут строго по
   * одному: второй кубик ждёт, пока первый не закончит анимацию. Пара обмена
   * стартует вдвоём, иначе один кубик успел бы уехать с выхода до партнёра.
   */
  private drainPortalQueue(): void {
    if (this.portals.length > 0 || this.portalQueue.length === 0) return;

    let group: number | null = null;
    for (const hop of this.portalQueue) {
      if (hop.group === null) continue;
      if (this.portalQueue.filter((other) => other.group === hop.group).length > 1) {
        group = hop.group;
        break;
      }
    }

    // Одинокий участник пары ждёт второго: иначе он стартует раньше партнёра
    // и обмен перестаёт быть одновременным.
    if (
      group === null &&
      this.portalQueue.some(
        (hop) =>
          hop.group !== null &&
          this.portalQueue.filter((other) => other.group === hop.group).length === 1,
      )
    ) {
      return;
    }

    const batch =
      group === null
        ? [this.portalQueue.shift()!]
        : (() => {
            const pair = this.portalQueue.filter((hop) => hop.group === group);
            this.portalQueue = this.portalQueue.filter((hop) => hop.group !== group);
            return pair;
          })();
    for (const hop of batch) this.beginPortalHop(hop, batch.length > 1);
  }

  /** Начать одну анимацию телепорта (или пару обмена) из очереди. */
  private beginPortalHop(hop: PendingPortalHop, paired: boolean): void {
    const { item, to, done } = hop;
    // На ускоренном ходе телепорт упрощён и короче: кубик сжимается в
    // маленький и переносится, без подъёма и вытягивания в палку.
    const snappy = this.moveSpeed > 1;
    const durationMs = portalDurationMs(snappy);
    this.portals.push({
      item,
      from: { x: item.x, z: item.z },
      to: { x: to.x + 0.5, z: to.y + 0.5 },
      startedAt: performance.now(),
      durationMs,
      snappy,
      done,
    });
    item.inPortal = true;
    this.portalBlocks++;
    // Обычный прыжок сразу останавливает остальные кубики: второй не должен
    // въезжать в занятый портал. Паре обмена даём кадр, чтобы второй участник
    // успел дойти до своего входа и стартовал одновременно.
    if (paired) this.portalPausePending = true;
    else this.tweens.pauseAll();
    // Звук начинается здесь, вместе с анимацией, и получает её длительность —
    // даже у короткого быстрого варианта его фазы ложатся на те же кадры.
    const now = performance.now();
    if (this.portalListener && now - this.lastPortalAt > 60) {
      this.lastPortalAt = now;
      this.portalListener(durationMs);
    }
  }

  /** Кадр анимаций телепорта: поза по времени, завершение и продолжение пути. */
  private updatePortals(): void {
    if (this.portals.length === 0) return;
    const now = performance.now();
    // По копии: `done()` может добавить новый телепорт (две пары порталов в
    // одном ходе или вторая клетка той же пары).
    for (const anim of [...this.portals]) {
      const elapsed = now - anim.startedAt;
      if (elapsed < anim.durationMs) {
        this.applyPortalPose(anim, portalPose(elapsed, anim.snappy));
        continue;
      }
      // Кубик собрался на выходе — обычная поза, дальше его ведёт tween пути.
      anim.item.x = anim.to.x;
      anim.item.z = anim.to.z;
      anim.item.y = BOX_Y;
      anim.item.sxz = 1;
      anim.item.sy = 1;
      anim.item.inPortal = false;
      this.portals.splice(this.portals.indexOf(anim), 1);
      if (this.portalBlocks > 0) this.portalBlocks--;
      if (this.portalBlocks === 0) {
        this.drainPortalQueue();
        if (this.portals.length === 0) {
          this.portalPausePending = false;
          this.tweens.resumeAll();
        }
      }
      anim.done();
    }
  }

  /** Поза телепорта: клетка (вход или выход), форма кубика и высота центра. */
  private applyPortalPose(anim: PortalAnim, pose: PortalPose): void {
    const cell = pose.atExit ? anim.to : anim.from;
    const item = anim.item;
    item.x = cell.x;
    item.z = cell.z;
    item.sxz = pose.sxz;
    item.sy = pose.sy;
    // Низ кубика стоит на подъёме, поэтому растянутый кубик висит в воздухе,
    // а не прорастает сквозь плиту.
    item.y = BOX_FLOOR + pose.lift + 0.5 * pose.sy;
    item.inPortal = true;
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
    // Новый уровень мог начаться посреди старой анимации (например, из
    // отладочного меню): её tween/телепорт нельзя переносить на новую карту.
    this.resetTransient();
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

  /** Сбросить всё, что относится к анимации предыдущего уровня. */
  private resetTransient(): void {
    this.tweens.removeAll();
    this.portals = [];
    this.portalQueue = [];
    this.parkedHops.clear();
    this.portalBlocks = 0;
    this.portalPausePending = false;
    this.lastPortalAt = Number.NEGATIVE_INFINITY;
    this.movingCount = 0;
    this.moveDone = null;
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

  /**
   * Подсказка: путь каждого кубика при подсказанном ходе. Пути приходят из
   * правил (`moveBoxes`), поэтому подсказка едет по реальному маршруту:
   * поворачивает на ротаторах, упирается в односторонние клетки и прыгает
   * через портал так же, как это сделал бы кубик.
   */
  showHint(paths: HintPath[]): void {
    const drawable = paths
      .map((item) => ({
        color: item.color,
        path: item.path.map((point) => ({ ...point, pos: point.pos.clone() })),
      }))
      .filter((item) => PicoglRenderer.pathDistance(item.path) > 0);
    if (drawable.length === 0) {
      this.hint = null;
      return;
    }
    const cells = Math.max(...drawable.map((item) => PicoglRenderer.pathDistance(item.path)));
    this.hint = {
      paths: drawable,
      start: performance.now(),
      duration: Math.min(
        HINT_MAX_SLIDE_MS,
        Math.max(HINT_SLIDE_MS, cells * HINT_MS_PER_CELL),
      ),
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

  /**
   * Скорость анимации хода (настройка «Плавно / Быстро»). На ускоренном ходе
   * телепорт упрощается: кубик сжимается и переносится, без вытягивания.
   */
  setMoveSpeed(multiplier: number): void {
    this.moveSpeed = multiplier > 0 ? multiplier : 1;
  }

  setPortalListener(listener: (durationMs: number) => void): void {
    this.portalListener = listener;
  }

  /** Вид подсказки: стрелки на полу или проволочный кубик (настройка). */
  setHintStyle(style: HintStyle): void {
    this.hintStyle = style;
  }

  /** Тема сцены: фон, плиты, механики и цвет иконок компаса. */
  setTheme(theme: Theme): void {
    this.palette = theme === 'dark' ? PALETTE_DARK : PALETTE_LIGHT;
    if (this.app) {
      const [r, g, b] = this.palette.background;
      this.app.clearColor(r, g, b, 1);
    }
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
      // Пауза остальных кубиков включается кадром позже старта телепорта.
      if (this.portalPausePending && this.portalBlocks > 0) {
        this.portalPausePending = false;
        this.tweens.pauseAll();
      }
      this.tweens.update();
      this.updatePortals();
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
          this.palette.platform,
        );

        if (isEndCell(cell)) {
          const goalColor = cell === CellType.END ? this.palette.goalOne : this.palette.goalTwo;
          const surface = PLATFORM_TOP + lift;
          // Углубление и контур цели. Квады без поворота: в изометрии
          // осевой квадрат проецируется ромбом — как в атласе.
          // Отступы по Y — не меньше шага depth-буфера (16 бит на 200 единиц
          // ≈ 0.003): при 0.002 контур цели дрожал и мерцал (уровень 1-2).
          // Плашка цели растёт вместе с плитой: конец уровня появляется
          // одновременно с площадкой, а не следом за ней.
          drawQuad(worldX(x), surface + 0.012, worldZ(y), 0.82 * scale, this.palette.recess);
          drawQuad(worldX(x), surface + 0.024, worldZ(y), 0.68 * scale, goalColor);
          drawQuad(worldX(x), surface + 0.036, worldZ(y), 0.48 * scale, this.palette.recess);
        }

        // Клетки механик: цветная вставка и простой знак. Рисуются после
        // цели, чтобы не спорить с её контуром.
        if (isMechanicCell(cell)) {
          const surface = PLATFORM_TOP + lift + 0.045;
          if (cell === CellType.PORTAL_A || cell === CellType.PORTAL_B) {
            const color = cell === CellType.PORTAL_A ? this.palette.portalA : this.palette.portalB;
            drawQuad(worldX(x), surface, worldZ(y), 0.72 * scale, color);
            drawQuad(worldX(x), surface + 0.012, worldZ(y), 0.38 * scale, this.palette.grid);
          } else if (cell === CellType.TRAP_1 || cell === CellType.TRAP_2) {
            drawQuad(worldX(x), surface, worldZ(y), 0.68 * scale, this.palette.trap);
            this.floorBasis(this.basisMatrix, worldX(x), worldZ(y), surface + 0.012, 0);
            // Одна или две точки — сила ловушки. Крест убран: он одинаково
            // читался у обоих вариантов и не показывал, сколько ждать.
            const dots = cell === CellType.TRAP_1 ? 1 : 2;
            for (let dot = 0; dot < dots; dot++) {
              const offset = dots === 1 ? 0 : (dot === 0 ? -0.1 : 0.1);
              drawQuad(
                worldX(x) + offset,
                surface + 0.02,
                worldZ(y),
                0.11 * scale,
                this.palette.trapMark,
              );
            }
          } else if (cell === CellType.GYRO_CW || cell === CellType.GYRO_CCW) {
            drawQuad(worldX(x), surface, worldZ(y), 0.72 * scale, this.palette.gyro);
            this.floorBasis(this.basisMatrix, worldX(x), worldZ(y), surface + 0.012, 0);
            // Круговой значок: квадратная «рамка» с разрывом и наконечник.
            this.drawBar(this.basisMatrix, -0.17, -0.17, 0.17, -0.17, 0.06, this.palette.gyroMark);
            this.drawBar(this.basisMatrix, 0.17, -0.17, 0.17, 0.17, 0.06, this.palette.gyroMark);
            this.drawBar(this.basisMatrix, 0.17, 0.17, -0.17, 0.17, 0.06, this.palette.gyroMark);
            this.drawBar(this.basisMatrix, -0.17, 0.17, -0.17, -0.05, 0.06, this.palette.gyroMark);
            const side = cell === CellType.GYRO_CW ? 1 : -1;
            this.drawBar(this.basisMatrix, -0.17, 0.05, -0.17 + 0.12 * side, 0.14, 0.06, this.palette.gyroMark);
          } else if (cell >= CellType.ROTOR_ELBOW_UP_CW && cell <= CellType.ROTOR_ELBOW_LEFT_CCW) {
            drawQuad(worldX(x), surface, worldZ(y), 0.72 * scale, this.palette.rotor);
            this.floorBasis(this.basisMatrix, worldX(x), worldZ(y), surface + 0.012, 0);
            const elbow = rotorElbow(cell);
            const exit = rotorElbowExit(cell, !!state.mechanicState?.rotorFlip);
            if (elbow && exit) {
              // world → local: local +Y смотрит вверх (в мир −Z).
              const ex = elbow.entry.x;
              const ey = -elbow.entry.y;
              const ox = exit.x;
              const oy = -exit.y;
              this.drawBar(this.basisMatrix, -ex * 0.26, -ey * 0.26, 0, 0, 0.06, this.palette.rotorMark);
              this.drawBar(this.basisMatrix, 0, 0, ox * 0.24, oy * 0.24, 0.06, this.palette.rotorMark);
              // Наконечник на выходе: две короткие линии от базы к концу.
              const px = -oy;
              const py = ox;
              this.drawBar(this.basisMatrix, ox * 0.14 + px * 0.08, oy * 0.14 + py * 0.08, ox * 0.26, oy * 0.26, 0.055, this.palette.rotorMark);
              this.drawBar(this.basisMatrix, ox * 0.14 - px * 0.08, oy * 0.14 - py * 0.08, ox * 0.26, oy * 0.26, 0.055, this.palette.rotorMark);
            }
          } else if (cell === CellType.SWITCH) {
            drawQuad(worldX(x), surface, worldZ(y), 0.72 * scale, this.palette.switchColor);
            this.floorBasis(this.basisMatrix, worldX(x), worldZ(y), surface + 0.012, 0);
            this.drawBar(this.basisMatrix, -0.13, 0, 0.13, 0, 0.06, this.palette.switchMark);
            this.drawBar(this.basisMatrix, 0, -0.13, 0, 0.13, 0.06, this.palette.switchMark);
          } else {
            const dir = oneWayDir(cell);
            if (!dir) continue;
            drawQuad(worldX(x), surface, worldZ(y), 0.68 * scale, this.palette.oneway);
            const angle = Math.atan2(dir.y, dir.x);
            this.floorBasis(this.basisMatrix, worldX(x), worldZ(y), surface + 0.012, angle);
            this.drawBar(this.basisMatrix, -0.2, 0, 0.16, 0, 0.06, this.palette.onewayMark);
            this.drawBar(this.basisMatrix, 0.16, 0, 0.02, -0.11, 0.06, this.palette.onewayMark);
            this.drawBar(this.basisMatrix, 0.16, 0, 0.02, 0.11, 0.06, this.palette.onewayMark);
          }
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
        this.palette.grid,
      );
      this.gridDraw.draw();
    }

    // Кубики на своих площадках светятся своим цветом (без пульсации —
    // мигание читалось как мерцание): свет на площадке, ореол вокруг силуэта
    // и подсветка рёбер самого кубика (uGlow). Ключ площадки — позиция и цвет,
    // поэтому чужой кубик не подсвечивается.
    const goals = new Set(state.ends.map((e) => `${e.pos.x},${e.pos.y},${e.color}`));
    const onGoal = (b: RenderBoxPos): boolean =>
      goals.has(`${Math.round(b.x - 0.5)},${Math.round(b.z - 0.5)},${b.color}`);

    const { yaw: camYaw, pitch: camPitch } = this.camera.getAngles();

    const glowing = this.boxPos.filter(onGoal);
    if (glowing.length > 0 && !animating) {
      const gl = app.gl;
      app.enable(PicoGL.BLEND);
      // Обычное альфа-смешивание: ореол остаётся цвета кубика. Альфа приёмника
      // принудительно держится на 1 — иначе прозрачные пиксели попадают в canvas.
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE);
      // Ореолы рисуются друг поверх друга на одной высоте — глубина не пишется.
      gl.depthMask(false);
      const cosYaw = Math.cos(camYaw);
      const sinYaw = Math.sin(camYaw);
      const sinPitch = Math.sin(camPitch);
      const cosPitch = Math.cos(camPitch);
      for (const b of glowing) {
        const bx = Math.round(b.x - 0.5);
        const bz = Math.round(b.z - 0.5);
        const color = b.color === ColorType.ONE ? GLOW_ONE : GLOW_TWO;
        // Свет на площадке: силуэт — квадрат клетки, поэтому подсветка не
        // выходит за край базы и читается как зажжённая плита.
        this.floorBasis(this.basisMatrix, worldX(bx), worldZ(bz), PLATFORM_TOP + 0.03, 0);
        mat4.scale(this.decalModel, this.basisMatrix, [GLOW_POOL_SIZE, GLOW_POOL_SIZE, 1]);
        this.drawGlow(this.decalModel, color, GLOW_POOL_ALPHA, {
          slabs: GLOW_POOL_SLABS,
          core: GLOW_POOL_CORE,
          wide: GLOW_POOL_WIDE,
        });
        // Объёмный ореол: билборд к камере, силуэт — сама проекция кубика с
        // текущего ракурса. Поэтому свечение облегает кубик целиком (включая
        // нижние рёбра) с любого угла, а квад заметно больше ореола и гаснет
        // задолго до своей границы — краёв текстуры не видно.
        PicoglRenderer.setBasis(
          this.basisMatrix,
          [b.x - state.width / 2, b.y, b.z - state.height / 2],
          [cosYaw, 0, sinYaw],
          [sinPitch * sinYaw, cosPitch, -sinPitch * cosYaw],
        );
        mat4.scale(this.decalModel, this.basisMatrix, [GLOW_HALO_SIZE, GLOW_HALO_SIZE, 1]);        PicoglRenderer.cubeHull(
          GLOW_HALO_HALF,
          cosYaw,
          sinYaw,
          sinPitch,
          cosPitch,
          this.hullSlabs,
        );
        this.drawGlow(this.decalModel, color, GLOW_HALO_ALPHA, {
          slabs: this.hullSlabs,
          core: GLOW_HALO_CORE,
          wide: GLOW_HALO_WIDE,
        });
      }
      gl.depthMask(true);
      app.disable(PicoGL.BLEND);
    }

    // Кубики: скрывать до появления клетки (аналог скрытых узлов в create_state.gd)
    this.boxPos.forEach((b, index) => {
      const bx = Math.round(b.x - 0.5);
      const bz = Math.round(b.z - 0.5);
      const progress = this.cellProgress(bx, bz);
      if (progress <= 0) return;
      const eased = easeOutCubic(progress);
      const scale = animating ? 0.05 + 0.95 * eased : 1;
      const lift = animating ? (1 - eased) * 1.2 : 0;
      // Запертый ловушкой кубик чуть меньше и темнее: видно, что он пропустит
      // следующий ход, не открывая отдельной иконки.
      const lock = state.mechanicState?.locks[index] ?? 0;
      const locked = lock > 0;
      const boxScale = locked ? 0.76 : 0.9;
      const baseColor = b.color === ColorType.ONE ? this.palette.boxOne : this.palette.boxTwo;
      const color = locked ? baseColor.map((c) => c * 0.7) : baseColor;
      // Телепорт меняет форму кубика: множители сечения и высоты из анимации.
      // В момент исчерпания кубика не рисуем вовсе: дальше он уже на выходе.
      if (b.inPortal && (b.sxz <= 0.001 || b.sy <= 0.001)) return;
      const centerX = b.x - state.width / 2;
      const centerY = b.inPortal ? b.y : BOX_Y * scale + lift;
      const centerZ = b.z - state.height / 2;
      const width = boxScale * scale * b.sxz;
      const height = (locked ? 0.82 : 1) * scale * b.sy;
      drawCube(
        centerX,
        centerY,
        centerZ,
        width,
        height,
        width,
        color,
        locked ? 0 : onGoal(b) ? 1 : 0,
      );
      // Стороны света на боковых гранях: кубик сам работает компасом. На
      // вытянутой палке буквы превратились бы в полосы — они возвращаются,
      // когда кубик на выходе снова обычной формы.
      if (b.sxz > 0.999 && b.sy > 0.999) {
        this.drawBoxLetters(centerX, centerY, centerZ, width / 2, height / 2, width / 2, color);
      }
      // Остаток ловушки — точки на верхней грани: игрок видит, сколько ходов
      // кубик ещё пропустит, а не просто «затемнён».
      if (lock > 0) {
        for (let dot = 0; dot < lock; dot++) {
          const offset = lock === 1 ? 0 : (dot === 0 ? -0.13 : 0.13) * width;
          drawQuad(
            centerX + offset,
            centerY + height / 2 + 0.012,
            centerZ,
            0.12 * width,
            this.palette.trapMark,
          );
        }
      }
    });

    // Стрелки подсказки — поверх сцены: кубик закрывает собой клетку упора,
    // и без этого половина стрелок оставалась за ним.
    this.drawHint(state);

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

  /**
   * Квад ореола. `slabs` — три полосы силуэта `(nᵢx, nᵢy, rᵢ)` в UV квада (их
   * пересечение и есть силуэт), `core` и `wide` — радиусы яркого ядра и
   * мягкого ореола.
   */
  private drawGlow(
    model: mat4,
    color: number[],
    intensity: number,
    shape: { slabs: number[]; core: number; wide: number },
  ): void {
    if (!this.glowDraw) return;
    const s = shape.slabs;
    this.applyViewProj(this.glowDraw.uniform('uModel', model))
      .uniform('uColor', color)
      .uniform('uIntensity', intensity)
      .uniform('uN0', [s[0], s[1]])
      .uniform('uR0', s[2])
      .uniform('uN1', [s[3], s[4]])
      .uniform('uR1', s[5])
      .uniform('uN2', [s[6], s[7]])
      .uniform('uR2', s[8])
      .uniform('uCore', shape.core)
      .uniform('uWide', shape.wide)
      .draw();
  }

  /**
   * Полосы силуэта кубика в UV билборда: тройки `(nᵢx, nᵢy, rᵢ)`.
   *
   * Ортокамера проецирует параллелепипед в центрально-симметричный
   * шестиугольник — зонотоп трёх отрезков (проекций осей кубика). Его рёбра
   * параллельны этим проекциям, значит нормали полос — перпендикуляры к ним, а
   * радиус полосы — опорная функция зонотопа `Σ|n·aⱼ|` в этом направлении.
   * Расстояние до силуэта — максимум по трём полосам. Вырожденная ось (взгляд
   * вдоль неё) даёт нулевую нормаль и на максимум не влияет.
   */
  private static cubeHull(
    halfUv: number,
    cosYaw: number,
    sinYaw: number,
    sinPitch: number,
    cosPitch: number,
    out: number[],
  ): void {
    // Проекции мировых осей на правый и верхний векторы билборда.
    const axes: [number, number][] = [
      [cosYaw, sinPitch * sinYaw],
      [0, cosPitch],
      [sinYaw, -sinPitch * cosYaw],
    ];
    for (let i = 0; i < 3; i++) {
      const a = axes[i] as [number, number];
      const len = Math.hypot(a[0], a[1]) || 1;
      // Нормаль ребра силуэта — перпендикуляр к проекции оси.
      const nx = -a[1] / len;
      const ny = a[0] / len;
      let support = 0;
      for (const b of axes) support += Math.abs(nx * b[0] + ny * b[1]);
      out[i * 3] = nx;
      out[i * 3 + 1] = ny;
      out[i * 3 + 2] = halfUv * support;
    }
  }

  /** Дистанция пути в клетках: прыжок через портал не проезжается (0 клеток). */
  private static pathDistance(path: PathPoint[]): number {
    let total = 0;
    for (let i = 1; i < path.length; i++) {
      if (path[i].teleport) continue;
      total +=
        Math.abs(path[i].pos.x - path[i - 1].pos.x) +
        Math.abs(path[i].pos.y - path[i - 1].pos.y);
    }
    return total;
  }

  /**
   * Точка пути на расстоянии `travelled` клеток от старта. Телепорт кубик
   * проходит мгновенно, поэтому голова подсказки исчезает на входе в портал
   * и появляется на выходе — точно так же, как прыгает сам кубик.
   */
  private static samplePath(
    path: PathPoint[],
    travelled: number,
  ): { x: number; z: number; dx: number; dz: number } {
    let left = travelled;
    let cur = path[0].pos;
    let dx = 0;
    let dz = 0;
    for (let i = 1; i < path.length; i++) {
      const to = path[i].pos;
      dx = to.x - cur.x;
      dz = to.y - cur.y;
      if (path[i].teleport) {
        cur = to;
        continue;
      }
      const len = Math.abs(dx) + Math.abs(dz);
      if (len === 0) continue;
      if (left <= len) {
        const t = left / len;
        return { x: cur.x + dx * t, z: cur.y + dz * t, dx, dz };
      }
      left -= len;
      cur = to;
    }
    return { x: cur.x, z: cur.y, dx, dz };
  }

  /** Направление от точки `index` к следующей клетке (для следа подсказки). */
  private static outgoing(path: PathPoint[], index: number): { dx: number; dz: number } | null {
    const next = path[index + 1];
    // Из клетки входа в портал стрелка не рисуется: дальше прыжок, а не проезд.
    if (!next || next.teleport) return null;
    const dx = next.pos.x - path[index].pos.x;
    const dz = next.pos.y - path[index].pos.y;
    return dx === 0 && dz === 0 ? null : { dx, dz };
  }

  /** Направление, с которым кубик пришёл в точку `index`. */
  private static incoming(path: PathPoint[], index: number): { dx: number; dz: number } | null {
    const cur = path[index];
    const prev = path[index - 1];
    if (!prev || cur.teleport) return null;
    const dx = cur.pos.x - prev.pos.x;
    const dz = cur.pos.y - prev.pos.y;
    return dx === 0 && dz === 0 ? null : { dx, dz };
  }

  /**
   * Подсказка: голова (шевроны или проволочный кубик) едет по фактическому
   * пути от старта до упора, а по клеткам пути остаётся блёклый след стрелок —
   * так видно, что маршрут идёт через ротатор или портал, а не по прямой.
   */
  private drawHint(state: RenderState): void {
    const hint = this.hint;
    const app = this.app;
    if (!hint || !app || !this.quadXYDraw) return;
    const now = performance.now();
    const elapsed = now - hint.start;
    if (hint.fadeAt === null && elapsed >= HINT_TOTAL_MS) {
      this.hint = null;
      return;
    }
    const slide = easeOutCubic(Math.min(1, elapsed / hint.duration));
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

    const offsetX = 0.5 - state.width / 2;
    const offsetZ = 0.5 - state.height / 2;
    for (const item of hint.paths) {
      const total = PicoglRenderer.pathDistance(item.path);
      if (total <= 0) continue;
      const color = item.color === ColorType.ONE ? this.palette.arrowOne : this.palette.arrowTwo;
      // След маршрута: стрелка на каждой клетке пути, блёклая, чтобы не
      // перебивать голову подсказки.
      for (let i = 1; i < item.path.length; i++) {
        const heading =
          PicoglRenderer.outgoing(item.path, i) ?? PicoglRenderer.incoming(item.path, i);
        if (!heading) continue;
        const pos = item.path[i].pos;
        this.drawChevrons(
          pos.x + offsetX,
          pos.y + offsetZ,
          Math.atan2(heading.dz, heading.dx),
          color,
          fade * HINT_TRAIL_ALPHA,
        );
      }
      // Голова доезжает до самой клетки упора — там, куда встанет кубик.
      const at = PicoglRenderer.samplePath(item.path, total * slide);
      if (this.hintStyle === 'cube') {
        this.drawHintCube(at.x + offsetX, at.z + offsetZ, color, fade);
      } else {
        this.drawChevrons(
          at.x + offsetX,
          at.z + offsetZ,
          Math.atan2(at.dz, at.dx),
          color,
          fade,
        );
      }
    }

    gl.depthMask(true);
    app.enable(PicoGL.DEPTH_TEST);
    app.disable(PicoGL.BLEND);
  }

  /** Двойной шеврон на полу клетки; `angle` — направление движения. */
  private drawChevrons(
    wx: number,
    wz: number,
    angle: number,
    color: number[],
    alpha: number,
  ): void {
    this.floorBasis(this.basisMatrix, wx, wz, PLATFORM_TOP + 0.035, angle);
    for (const tip of [0.16, -0.14]) {
      this.drawBar(this.basisMatrix, tip - 0.26, -0.26, tip, 0, 0.1, color, alpha);
      this.drawBar(this.basisMatrix, tip - 0.26, 0.26, tip, 0, 0.1, color, alpha);
    }
  }

  /**
   * Проволочный кубик подсказки: 12 рёбер того же объёма, что и настоящий
   * кубик. Рёбра — плоские полоски, развёрнутые к камере, поэтому контур
   * одинаково читается при любом ракурсе орбиты.
   */
  private drawHintCube(wx: number, wz: number, color: number[], alpha: number): void {
    const { yaw, pitch } = this.camera.getAngles();
    const right: [number, number, number] = [Math.cos(yaw), 0, Math.sin(yaw)];
    const up: [number, number, number] = [
      Math.sin(pitch) * Math.sin(yaw),
      Math.cos(pitch),
      -Math.sin(pitch) * Math.cos(yaw),
    ];
    // Нормаль к экрану: по ней видно, какие рёбра дальние — их рисуем бледнее,
    // чтобы каркас читался объёмным, а не плоской сеткой линий.
    const normal: [number, number, number] = [
      right[1] * up[2] - right[2] * up[1],
      right[2] * up[0] - right[0] * up[2],
      right[0] * up[1] - right[1] * up[0],
    ];
    const half = 0.45;
    const halfHeight = 0.5;
    // Углы куба: младшие три бита индекса — знаки по x, z и y.
    const corners: [number, number, number][] = [];
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        for (const sx of [-1, 1]) {
          corners.push([wx + sx * half, BOX_Y + sy * halfHeight, wz + sz * half]);
        }
      }
    }
    for (let a = 0; a < corners.length; a++) {
      for (let b = a + 1; b < corners.length; b++) {
        // Ребро соединяет углы, различающиеся ровно одной координатой.
        const diff = a ^ b;
        if (diff !== 1 && diff !== 2 && diff !== 4) continue;
        const ca = corners[a];
        const cb = corners[b];
        const depth =
          ((ca[0] + cb[0]) / 2 - wx) * normal[0] +
          ((ca[1] + cb[1]) / 2 - BOX_Y) * normal[1] +
          ((ca[2] + cb[2]) / 2 - wz) * normal[2];
        this.drawScreenBar(ca, cb, 0.05, color, depth < 0 ? alpha * 0.4 : alpha, right, up);
      }
    }
  }

  /** Полоска между двумя мировыми точками: квад, развёрнутый к камере. */
  private drawScreenBar(
    a: [number, number, number],
    b: [number, number, number],
    thick: number,
    color: number[],
    alpha: number,
    right: [number, number, number],
    up: [number, number, number],
  ): void {
    const dx = (b[0] - a[0]) * right[0] + (b[1] - a[1]) * right[1] + (b[2] - a[2]) * right[2];
    const dy = (b[0] - a[0]) * up[0] + (b[1] - a[1]) * up[1] + (b[2] - a[2]) * up[2];
    const len = Math.hypot(dx, dy);
    if (len <= 0.001 || !this.quadXYDraw) return;
    const mid: [number, number, number] = [
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2,
      (a[2] + b[2]) / 2,
    ];
    PicoglRenderer.setBasis(this.basisMatrix, mid, right, up);
    mat4.identity(this.decalModel);
    mat4.rotateZ(this.decalModel, this.decalModel, Math.atan2(dy, dx));
    mat4.scale(this.decalModel, this.decalModel, [len, thick, 1]);
    mat4.multiply(this.decalModel, this.basisMatrix, this.decalModel);
    this.drawDecal(this.decalModel, color, alpha);
  }

  /**
   * Компас клавиатуры: две оси в плоскости пола уровня. Стержень компаса —
   * **начало координат**: оси выходят из него и вся фигура вращается вокруг
   * него же. Подписи — клавиши WASD: «W» на одной оси, «S» на другой.
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
    this.drawBar(this.basisMatrix, 0, 0, -reach, 0, thick, this.palette.ink, alpha);
    this.drawBar(this.basisMatrix, 0, 0, 0, -reach, thick, this.palette.ink, alpha);
    // Наконечники осей.
    // Стержень компаса: точка, вокруг которой вся фигура вращается.
    this.drawBar(this.basisMatrix, -0.045, 0, 0.045, 0, 0.09, this.palette.ink, alpha);
    const head = 0.095;
    const spread = 0.058;
    this.drawBar(this.basisMatrix, -reach, 0, -reach + head, spread, thick, this.palette.ink, alpha);
    this.drawBar(this.basisMatrix, -reach, 0, -reach + head, -spread, thick, this.palette.ink, alpha);
    this.drawBar(this.basisMatrix, 0, -reach, spread, -reach + head, thick, this.palette.ink, alpha);
    this.drawBar(this.basisMatrix, 0, -reach, -spread, -reach + head, thick, this.palette.ink, alpha);

    // Буквы — билборды: точку кончика переносим в пространство взгляда тем же
    // поворотом, а саму надпись кладём уже в экранной плоскости (без поворота),
    // иначе при наклоне буквы заваливались бы вместе с полом.
    this.viewProj = this.gizmoProj;
    PicoglRenderer.setBasis(this.basisMatrix, [0, 0, 0], [1, 0, 0], [0, 1, 0]);
    const tipW = this.viewPoint(-reach - 0.16, 0.02, 0);
    const tipS = this.viewPoint(0, 0.02, reach + 0.16);
    this.drawLetter('W', tipW[0], tipW[1], 0.0625, 0.115, 0.04, this.palette.ink);
    this.drawLetter('S', tipS[0], tipS[1], 0.0525, 0.115, 0.04, this.palette.ink);

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

  /**
   * Буква из штрихов в заданном базисе: `w`/`h` — половина ширины и высоты,
   * `t` — толщина штриха. Литеры блочные, из прямых отрезков: на гранях кубика
   * они занимают всего пару десятков пикселей, и закругления в этом размере
   * превращаются в кашу.
   */
  private drawLetter(
    letter: 'W' | 'S' | 'N' | 'E',
    cx: number,
    cy: number,
    w: number,
    h: number,
    t: number,
    color: number[],
    base: mat4 = this.basisMatrix,
  ): void {
    // Каждая литера — набор отдельных штрихов. Непрерывная ломаная здесь не
    // годится: соединительные отрезки между перекладинами рисовались бы по
    // грани и оставляли лишние диагонали (так «E» получала косую черту).
    let strokes: [number, number, number, number][];
    if (letter === 'W') {
      // Вниз-вверх-вниз-вверх.
      strokes = [
        [cx - w, cy + h, cx - w / 2, cy - h],
        [cx - w / 2, cy - h, cx, cy + h * 0.12],
        [cx, cy + h * 0.12, cx + w / 2, cy - h],
        [cx + w / 2, cy - h, cx + w, cy + h],
      ];
    } else if (letter === 'S') {
      // Верхняя перекладина, спуск слева, середина по диагонали, спуск справа,
      // нижняя перекладина.
      strokes = [
        [cx + w, cy + h, cx - w, cy + h],
        [cx - w, cy + h, cx - w, cy + h * 0.12],
        [cx - w, cy + h * 0.12, cx + w, cy - h * 0.12],
        [cx + w, cy - h * 0.12, cx + w, cy - h],
        [cx + w, cy - h, cx - w, cy - h],
      ];
    } else if (letter === 'N') {
      strokes = [
        [cx - w, cy - h, cx - w, cy + h],
        [cx - w, cy + h, cx + w, cy - h],
        [cx + w, cy - h, cx + w, cy + h],
      ];
    } else {
      // «E»: стойка и три перекладины; средняя короче, как у наборной литеры.
      strokes = [
        [cx - w, cy - h, cx - w, cy + h],
        [cx - w, cy + h, cx + w, cy + h],
        [cx - w, cy, cx + w * 0.7, cy],
        [cx - w, cy - h, cx + w, cy - h],
      ];
    }
    for (const [x0, y0, x1, y1] of strokes) {
      this.drawBar(base, x0, y0, x1, y1, t, color);
    }
  }

  /**
   * Буквы-стороны света на четырёх боковых гранях кубика: сам кубик работает
   * компасом. Верх и низ не подписаны.
   *
   * Соответствие то же, что у подсказки клавиатуры: W — мировая −X,
   * E — +X, N — −Z, S — +Z. Буква каждой грани нарисована так, чтобы читаться
   * снаружи: локальный +X базиса совпадает с экранным «вправо» для наблюдателя
   * с этой стороны, а нормаль базиса смотрит наружу (иначе грань отсекается как
   * задняя). Цвет чуть темнее грани — подпись видна, но не спорит с кубиком.
   */
  private drawBoxLetters(
    cx: number,
    cy: number,
    cz: number,
    halfW: number,
    halfH: number,
    halfD: number,
    color: number[],
  ): void {
    if (!this.quadXYDraw) return;
    // Литера масштабируется вместе с кубиком: на анимации появления она
    // появляется вместе с гранью, а у запертого ловушкой кубика меньше.
    const w = halfW * 0.36;
    const h = Math.min(halfH * 0.64, w * 1.15);
    // Штрих в четверть ширины литеры: тоньше — и на десятке пикселей буква
    // расплывается в пятно вместе со сглаживанием.
    const t = Math.max(0.014, w * 0.3);
    // Отступ от плоскости грани: декаль не должна спорить с ней по глубине.
    const eps = 0.006;
    const faces: { origin: [number, number, number]; right: [number, number, number]; letter: 'W' | 'S' | 'N' | 'E' }[] = [
      // −Z (север): наблюдатель с этой стороны видит «вправо» как мировую −X.
      { origin: [cx, cy, cz - halfD - eps], right: [-1, 0, 0], letter: 'N' },
      { origin: [cx, cy, cz + halfD + eps], right: [1, 0, 0], letter: 'S' },
      { origin: [cx - halfW - eps, cy, cz], right: [0, 0, 1], letter: 'W' },
      { origin: [cx + halfW + eps, cy, cz], right: [0, 0, -1], letter: 'E' },
    ];
    const darker = color.map((c) => c * 0.6);
    const base = mat4.create();
    for (const face of faces) {
      PicoglRenderer.setBasis(base, face.origin, face.right, [0, 1, 0]);
      this.drawLetter(face.letter, 0, 0, w, h, t, darker, base);
    }
  }
}
