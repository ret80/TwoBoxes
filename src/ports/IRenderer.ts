import { ColorType } from '../core/types/color';
import { Position } from '../core/types/position';

/**
 * Порт рендера. Реализация — picogl-адаптер (Фаза 7).
 * Ядро/контроллеры не знают о WebGL; адаптер сам ведёт rAF-цикл.
 */
export interface IRenderer {
  /** Инициализация: canvas, WebGL2-контекст, компиляция шейдеров. */
  init(canvas: HTMLCanvasElement): void;

  /** Размер окна (вызов при resize). */
  resize(width: number, height: number): void;

  /** Полная отрисовка сцены текущего уровня. */
  render(state: RenderState): void;

  /** Запуск/остановка rAF-цикла отрисовки. */
  startLoop(): void;
  stopLoop(): void;

  /** Запуск tween-анимации движения кубиков (7.3). */
  animateMove(moves: MoveAnimation[], onComplete: () => void): void;

  /** Волновая анимация появления уровня (7.4). */
  animateCreate(state: RenderState, onComplete: () => void): void;

  /** Орбита камеры: приращения рыскания (Y уровня) и наклона (X), радианы. */
  orbit(dYaw: number, dPitch: number): void;

  /** Текущие углы камеры (радианы). */
  getCameraAngles(): { yaw: number; pitch: number };
}

/** Всё, что нужно отрисовщику на кадр. */
export interface RenderState {
  grid: number[]; // плоская карта (CellType)
  width: number;
  height: number;
  boxes: { pos: Position; color: ColorType }[];
  ends: { pos: Position; color: ColorType }[];
}

/** Описание перемещения одного кубика для tween-анимации. */
export interface MoveAnimation {
  color: ColorType;
  from: Position;
  to: Position;
}
