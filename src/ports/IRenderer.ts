import { ColorType } from '../core/types/color';
import type { PathPoint } from '../core/types/game-state';
import type { MechanicState } from '../core/types/mechanic-state';
import { Position } from '../core/types/position';
import type { HintStyle, Theme } from '../core/services/config';

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

  /** Показать подсказку: едет по фактическим путям кубиков и гаснет. */
  showHint(paths: HintPath[]): void;

  /** Убрать подсказку сразу. */
  hideHint(): void;

  /** Плавно погасить подсказку (игрок уже сделал ход). */
  fadeHintOut(): void;

  /** Вид подсказки: стрелки на полу или проволочный кубик. */
  setHintStyle(style: HintStyle): void;

  /** Тема сцены: палитра фона, плит, механик и подписей. */
  setTheme(theme: Theme): void;

  /** Подсказка осей для клавиатуры (плоскость L/D) видна только в игре. */
  setKeyGuideVisible(visible: boolean): void;

  /** Проекция сцены (отладочное меню). */
  setProjection(mode: ProjectionMode): void;

  /** Скорость анимации хода: 1 — плавно (по умолчанию), >1 — быстрее. */
  setMoveSpeed(multiplier: number): void;

  /** Счётчик кадров в левом нижнем углу. */
  setFpsVisible(visible: boolean): void;
}

/**
 * Проекция уровня: обычная ортокамера, классическая изометрия и её «обратный»
 * вариант — с вывернутой перспективой (дальние части кажутся больше).
 */
export type ProjectionMode = 'ortho' | 'iso' | 'isoReverse';

/**
 * Путь подсказки: куда и каким маршрутом проедет один кубик. Точки берутся из
 * правил (`GameState.paths`), поэтому путь повторяет повороты на ротаторах и
 * прыжок через портал.
 */
export interface HintPath {
  color: ColorType;
  path: PathPoint[];
}

/** Всё, что нужно отрисовщику на кадр. */
export interface RenderState {
  grid: number[]; // плоская карта (CellType)
  width: number;
  height: number;
  boxes: { pos: Position; color: ColorType }[];
  ends: { pos: Position; color: ColorType }[];
  /** Ловушки и перевёрнутые ротаторы: рендер показывает состояние на поле. */
  mechanicState?: MechanicState;
}

/** Описание перемещения одного кубика для tween-анимации. */
export interface MoveAnimation {
  color: ColorType;
  from: Position;
  to: Position;
  /** Фактический путь: повороты и прыжки через порталы. */
  path?: PathPoint[];
}
