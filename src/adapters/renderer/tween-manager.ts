import { Easing, Group, Tween } from '@tweenjs/tween.js';

/**
 * Обёртка над tween.js (план 7.3).
 * Длительность как в оригинале (move_state.gd): speed * distance,
 * где speed = 0.07 (сек на клетку).
 *
 * ⚠️ Отступление от оригинала по easing'у: TRANS_CIRC (Circular.Out) при
 * 60 кадрах отдаёт почти половину пути в первом кадре, и кубик выглядит
 * дёргающимся. Quadratic.Out разгоняется мягче, а конец хода так же плавно
 * затухает.
 */
export const MOVE_SPEED = 0.07; // секунд на клетку

export class TweenManager {
  private group = new Group();
  /** Tween'ы, остановленные на паузу (телепорт держит ход, пока играет анимация). */
  private paused: Tween<Record<string, number>>[] = [];

  /**
   * Tween для одного числового свойства с easing оригинала.
   * @param onComplete вызывается по завершении.
   */
  add(
    target: Record<string, number>,
    to: Record<string, number>,
    durationMs: number,
    onComplete?: () => void,
  ): Tween<Record<string, number>> {
    const tween = new Tween(target, this.group)
      .to(to, Math.max(1, Math.round(durationMs)))
      .easing(Easing.Quadratic.Out)
      .onComplete(() => onComplete?.())
      .start();
    return tween;
  }

  /**
   * Длительность движения в мс: speed (сек на клетку) * distance * 1000.
   * `speedMultiplier` > 1 ускоряет ход (настройка «Быстро») без изменения плавности.
   */
  static moveDuration(distance: number, speedMultiplier = 1): number {
    return (MOVE_SPEED * distance * 1000) / (speedMultiplier > 0 ? speedMultiplier : 1);
  }

  /**
   * Обновление всех активных tween (вызывается за кадр).
   * tween.js v25 трактует аргумент как абсолютное время в мс, а не кадровую
   * дельту: с `dt * 1000` анимация хода почти не продвигалась и кубик висел
   * на старой клетке десятки секунд.
   */
  update(): void {
    this.group.update(performance.now());
  }

  /**
   * Пауза всех активных tween'ов: кубик въехал в портал, остальные ждут.
   * Пауза сдвигает стартовое время tween'а, поэтому после `resumeAll`
   * анимация продолжается ровно с того места, где встала.
   */
  pauseAll(): void {
    this.paused = this.group.getAll() as Tween<Record<string, number>>[];
    this.paused = this.paused.filter((tween) => tween.isPlaying() && !tween.isPaused());
    for (const tween of this.paused) tween.pause();
  }

  resumeAll(): void {
    for (const tween of this.paused) tween.resume();
    this.paused = [];
  }

  get active(): boolean {
    return this.group.getAll().length > 0;
  }

  removeAll(): void {
    this.paused = [];
    this.group.removeAll();
  }
}
