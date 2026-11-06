import { Easing, Group, Tween } from '@tweenjs/tween.js';

/**
 * Обёртка над tween.js (план 7.3).
 * Параметры оригинала (move_state.gd): EASE_OUT / TRANS_CIRC,
 * длительность = speed * distance, где speed = 0.07 (сек на клетку).
 */
export const MOVE_SPEED = 0.07; // секунд на клетку

export class TweenManager {
  private group = new Group();

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
      .easing(Easing.Circular.Out)
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

  get active(): boolean {
    return this.group.getAll().length > 0;
  }

  removeAll(): void {
    this.group.removeAll();
  }
}
