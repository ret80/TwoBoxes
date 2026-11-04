import { App, DrawCall, Program, VertexArray, VertexBuffer, PicoGL } from 'picogl';
import { mat4 } from 'gl-matrix';
import { ColorType } from '../../core/types/color';
import { CellType, isBoxCell, isEndCell } from '../../core/types/cell';
import type { IRenderer, MoveAnimation, RenderState } from '../../ports/IRenderer';
import {
  buildGridLines,
  CUBE_NORMALS,
  CUBE_VERTICES,
  QUAD_NORMALS,
  QUAD_XZ_VERTICES,
} from './geometry';
import {
  FRAGMENT_SHADER,
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
const COLOR_GRID = [0.72, 0.83, 0.8]; // светлая сетка на плитах
const COLOR_BG = [0.914, 0.894, 0.863]; // кремовый фон сцены

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
  private program: Program | null = null;
  private lineProgram: Program | null = null;
  private cubeVao: VertexArray | null = null;
  private quadVao: VertexArray | null = null;
  private gridVao: VertexArray | null = null;

  private cubeDraw: DrawCall | null = null;
  private quadDraw: DrawCall | null = null;
  private gridDraw: DrawCall | null = null;

  private camera = new Camera();
  private tweens = new TweenManager();

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
    this.app = PicoGL.createApp(canvas)
      .enable(PicoGL.DEPTH_TEST)
      // Отсечение задних граней: без него совпадающие грани соседних клеток
      // (пол/стена, стена/стена) дают z-fighting с мерцающими швами.
      .enable(PicoGL.CULL_FACE)
      .clearColor(COLOR_BG[0], COLOR_BG[1], COLOR_BG[2], 1);
    // Грани куба/квада обходятся по часовой стрелке снаружи.
    this.app.gl.frontFace(this.app.gl.CW);
    // Синхронная компиляция — программ две, источник мал
    this.program = this.app.createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
    this.lineProgram = this.app.createProgram(LINE_VERTEX_SHADER, LINE_FRAGMENT_SHADER);

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
    if (!this.state) return;
    this.camera.frame(
      this.visibleBounds(this.state),
      this.viewportW,
      this.viewportH,
      HUD_INSET_TOP,
      HUD_INSET_BOTTOM,
    );
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
    const lines = buildGridLines(state.width, state.height, cellVisible, PLATFORM_TOP + 0.004);
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
        TweenManager.moveDuration(distance),
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

  startLoop(): void {
    if (this.loopRunning) return;
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
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stopLoop(): void {
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
    if (!app || !state || !this.cubeDraw || !this.quadDraw) return;

    app.clear();
    const viewProj = this.camera.getViewProj();
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
    ) => {
      mat4.fromTranslation(model, [x, y, z]);
      mat4.scale(model, model, [sx, sy, sz]);
      this.cubeDraw!.uniform('uModel', model).uniform('uViewProj', viewProj).uniform('uColor', color);
      this.cubeDraw!.draw();
    };

    const worldX = (x: number) => x - state.width / 2 + 0.5;
    const worldZ = (y: number) => y - state.height / 2 + 0.5;

    /** Плоский квад на клетке: размер, поворот вокруг Y (ромб цели). */
    const drawQuad = (x: number, y: number, z: number, size: number, color: number[], rotY = 0) => {
      // Порядок важен: сначала перенос в центр клетки, потом поворот, потом масштаб.
      mat4.fromTranslation(model, [x, y, z]);
      mat4.rotateY(model, model, rotY);
      mat4.scale(model, model, [size, 1, size]);
      this.quadDraw!.uniform('uModel', model).uniform('uViewProj', viewProj).uniform('uColor', color);
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
          drawQuad(worldX(x), surface + 0.002, worldZ(y), 0.82 * scale, COLOR_RECESS);
          if (!animating) {
            drawQuad(worldX(x), surface + 0.006, worldZ(y), 0.68, goalColor);
            drawQuad(worldX(x), surface + 0.009, worldZ(y), 0.48, COLOR_RECESS);
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
      this.gridDraw
        .uniform('uModel', model)
        .uniform('uViewProj', viewProj)
        .uniform('uColor', COLOR_GRID);
      this.gridDraw.draw();
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
      );
    }
  }
}
