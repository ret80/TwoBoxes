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
      .to(to, Math.max(1, Math.round(durationMs * 1000)))
      .easing(Easing.Circular.Out)
      .onComplete(() => onComplete?.())
      .start();
    return tween;
  }

  /** Длительность движения в секундах: speed * distance. */
  static moveDuration(distance: number): number {
    return MOVE_SPEED * distance;
  }

  /** Обновление всех активных tween (вызывается за кадр). */
  update(deltaMs: number): void {
    this.group.update(deltaMs);
  }

  get active(): boolean {
    return this.group.getAll().length > 0;
  }

  removeAll(): void {
    this.group.removeAll();
  }
}
