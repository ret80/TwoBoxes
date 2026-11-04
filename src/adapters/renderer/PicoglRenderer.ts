import { App, Buffer, DrawCall, Program, VertexArray, PicoGL } from 'picogl';
import { mat4 } from 'gl-matrix';
import { ColorType } from '../../core/types/color';
import { CellType } from '../../core/types/cell';
import { Position } from '../../core/types/position';
import type { IRenderer, MoveAnimation, RenderState } from '../../ports/IRenderer';
import { buildGridLines, CUBE_VERTICES, QUAD_XZ_VERTICES } from './geometry';
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders';
import { Camera } from './camera';
import { TweenManager } from './tween-manager';
import { createWaveMask, maxWave, WAVE_INTERVAL_MS } from './create-animation';
import { ParticleSystem } from './particles';

// Цвета материалов оригинала (раздел 12.1 документации)
const COLOR_FLOOR = [28 / 255, 68 / 255, 102 / 255]; // тёмно-голубой mat_floor
const COLOR_WALL = [44 / 255, 107 / 255, 160 / 255]; // голубой mat_wall
const COLOR_BOX = [235 / 255, 31 / 255, 27 / 255]; // красный mat_color_one
const COLOR_BOX_TWO = [192 / 255, 182 / 255, 28 / 255]; // жёлтый mat_color_two
const COLOR_END = [150 / 255, 45 / 255, 40 / 255]; // приглушённо-красная площадка
const COLOR_END_TWO = [160 / 255, 150 / 255, 45 / 255]; // приглушённо-жёлтая площадка
const COLOR_GRID = [0.35, 0.55, 0.75];
const COLOR_PARTICLE = [1.0, 0.98, 0.23]; // жёлтый частиц (end.tscn)
const COLOR_BG = [0.78, 0.78, 0.78]; // серый фон (cam_envir.tres)

/** Позиция кубика для анимации: координаты уровня (центр клетки) + мировая высота. */
interface RenderBoxPos {
  x: number; // level coords center (pos.x + 0.5)
  z: number; // level coords center (pos.y + 0.5)
  y: number; // мировая высота
  color: ColorType;
}

/**
 * Рендер-адаптер на picogl (WebGL2). Реализация IRenderer.
 * Стиль оригинала: изометрическая ортокамера, простые примитивы, flat-цвета.
 */
export class PicoglRenderer implements IRenderer {
  private app: App | null = null;
  private program: Program | null = null;
  private cubeVao: VertexArray | null = null;
  private quadVao: VertexArray | null = null;
  private gridVao: VertexArray | null = null;

  private cubeDraw: DrawCall | null = null;
  private quadDraw: DrawCall | null = null;
  private gridDraw: DrawCall | null = null;

  private camera = new Camera();
  private tweens = new TweenManager();
  private particles = new ParticleSystem();

  private state: RenderState | null = null;
  private boxPos: RenderBoxPos[] = [];
  private gridBuf: Buffer | null = null;
  private gridWave = Number.NaN;

  // Волновая анимация появления
  private createMask: number[][] | null = null;
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
      .clearColor(COLOR_BG[0], COLOR_BG[1], COLOR_BG[2], 1);
    // Синхронная компиляция — программа одна, источник мал
    this.program = this.app.createProgram(VERTEX_SHADER, FRAGMENT_SHADER);

    const cubeBuf = this.app.createVertexBuffer(PicoGL.FLOAT, 3, CUBE_VERTICES);
    this.cubeVao = this.app.createVertexArray().vertexAttributeBuffer(0, cubeBuf);

    const quadBuf = this.app.createVertexBuffer(PicoGL.FLOAT, 3, QUAD_XZ_VERTICES);
    this.quadVao = this.app.createVertexArray().vertexAttributeBuffer(0, quadBuf);

    this.cubeDraw = this.app.createDrawCall(this.program, this.cubeVao);
    this.quadDraw = this.app.createDrawCall(this.program, this.quadVao);
  }

  resize(width: number, height: number): void {
    this.app?.resize(width, height);
    this.updateCamera();
  }

  render(state: RenderState): void {
    this.updateCamera();
    // Синхронизировать позиции кубиков, если движение не анимируется
    if (this.movingCount === 0) {
      this.boxPos = state.boxes.map((b) => ({
        x: b.pos.x + 0.5,
        z: b.pos.y + 0.5,
        y: 0.5,
        color: b.color,
      }));
      // Частицы: активны там, где кубик стоит на цели того же цвета
      for (const end of state.ends) {
        const filled = state.boxes.some((b) => b.pos.equals(end.pos) && b.color === end.color);
        this.particles.setActive(end.pos, filled);
      }
    }
    this.state = state;
  }

  private updateCamera(): void {
    if (!this.state || !this.app) return;
    const gl = this.app.gl;
    const dpr = window.devicePixelRatio || 1;
    this.camera.updateProjection(
      this.state.width,
      this.state.height,
      gl.drawingBufferWidth / dpr,
      gl.drawingBufferHeight / dpr,
    );
  }

  /** Перестроить сетку для данной волны create-анимации. */
  private rebuildGrid(state: RenderState, wave: number): void {
    if (!this.app || !this.program) return;
    this.gridWave = wave;
    const lines = buildGridLines(state.width, state.height, (x, y) =>
      this.cellVisibleAt(x, y, wave),
    );
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
    this.gridDraw = this.app.createDrawCall(this.program, this.gridVao).primitive(PicoGL.LINES);
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
        { x: m.to.x + 0.5, z: m.to.y + 0.5, y: 0.5 },
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
    this.createElapsed = 0;
    this.createDone = onComplete;
  }

  setEndParticles(pos: Position, active: boolean): void {
    this.particles.setActive(pos, active);
  }

  startLoop(): void {
    if (this.loopRunning) return;
    this.loopRunning = true;
    this.lastFrameTime = performance.now();
    const frame = (now: number) => {
      if (!this.loopRunning) return;
      const dt = (now - this.lastFrameTime) / 1000;
      this.lastFrameTime = now;
      this.tweens.update(dt * 1000);
      this.updateCreateAnim(dt);
      this.particles.update(dt);
      this.drawFrame();
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stopLoop(): void {
    this.loopRunning = false;
    cancelAnimationFrame(this.rafId);
  }

  private updateCreateAnim(dt: number): void {
    if (!this.createMask) return;
    this.createElapsed += dt * 1000;
    const wave = Math.floor(this.createElapsed / WAVE_INTERVAL_MS);
    if (wave > this.createMaxWave) {
      this.createMask = null;
      const cb = this.createDone;
      this.createDone = null;
      cb?.();
    }
  }

  private currentCreateWave(): number {
    return this.createMask ? Math.floor(this.createElapsed / WAVE_INTERVAL_MS) : Number.MAX_SAFE_INTEGER;
  }

  private cellVisibleAt(x: number, y: number, wave: number): boolean {
    if (!this.createMask) return true;
    const v = this.createMask[y]?.[x] ?? -1;
    if (v < 0) return false;
    return v <= wave;
  }

  private cellVisible(x: number, y: number): boolean {
    return this.cellVisibleAt(x, y, this.currentCreateWave());
  }

  private drawFrame(): void {
    const app = this.app;
    const state = this.state;
    if (!app || !state || !this.cubeDraw || !this.quadDraw) return;

    app.clear();
    const viewProj = this.camera.getViewProj();
    const model = mat4.create();

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

    const wave = this.currentCreateWave();

    // Пол, стены, целевые площадки
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        const cell = state.grid[y * state.width + x] as CellType;
        if (cell === CellType.UNKNOWN || !this.cellVisibleAt(x, y, wave)) continue;

        drawCube(worldX(x), -0.125, worldZ(y), 1, 0.25, 1, COLOR_FLOOR);

        if (cell === CellType.WALL) {
          drawCube(worldX(x), 0.25, worldZ(y), 1, 0.5, 1, COLOR_WALL);
        }
        if (cell === CellType.END || cell === CellType.END_TWO) {
          const wx = worldX(x);
          const wz = worldZ(y);
          const color = cell === CellType.END ? COLOR_END : COLOR_END_TWO;
          mat4.fromTranslation(model, [wx, 0.01, wz]);
          mat4.scale(model, model, [0.8, 1, 0.8]);
          this.quadDraw.uniform('uModel', model).uniform('uViewProj', viewProj).uniform('uColor', color);
          this.quadDraw.draw();
        }
      }
    }

    // Линии сетки: перестраивать только при изменении волны
    if (wave !== this.gridWave) {
      this.rebuildGrid(state, wave);
    }
    if (this.gridDraw) {
      mat4.identity(model);
      this.gridDraw.uniform('uModel', model).uniform('uViewProj', viewProj).uniform('uColor', COLOR_GRID);
      this.gridDraw.draw();
    }

    // Кубики: скрывать до появления клетки (аналог скрытых узлов в create_state.gd)
    for (const b of this.boxPos) {
      const bx = Math.round(b.x - 0.5);
      const bz = Math.round(b.z - 0.5);
      if (!this.cellVisibleAt(bx, bz, wave)) continue;
      drawCube(
        b.x - state.width / 2,
        b.y,
        b.z - state.height / 2,
        0.9,
        1,
        0.9,
        b.color === ColorType.ONE ? COLOR_BOX : COLOR_BOX_TWO,
      );
    }

    // Частицы (маленькие кубики 0.1)
    for (const p of this.particles.getPositions()) {
      drawCube(p.x - state.width / 2, p.y, p.z - state.height / 2, 0.1, 0.1, 0.1, COLOR_PARTICLE);
    }
  }
}
