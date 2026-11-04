import { InputAction } from '../../ports/IInput';
import { DIRS, Position } from '../../core/types/position';

export type DirDispatcher = (action: InputAction, dir: Position) => void;

const MIN_SWIPE_PX = 30; // фильтр случайных касаний

/**
 * Тач-ввод свайпами (план 8.2, аналог script/game/input/input_touch.gd).
 * Направление — по преобладающей оси (X или Y). Обрабатывается первый палец.
 */
export class TouchInput {
  private startX = 0;
  private startY = 0;
  private tracking = false;

  private onTouchStart = (e: TouchEvent) => {
    if (this.tracking || e.touches.length === 0) return;
    this.tracking = true;
    this.startX = e.touches[0].clientX;
    this.startY = e.touches[0].clientY;
  };

  private onTouchEnd = (e: TouchEvent) => {
    if (!this.tracking) return;
    this.tracking = false;
    const t = e.changedTouches[0];
    if (!t) return;
    const dir = vecToDir(this.startX, this.startY, t.clientX, t.clientY);
    if (dir) this.dispatch(dir.action, dir.dir);
  };

  constructor(private dispatch: DirDispatcher) {}

  attach(): void {
    window.addEventListener('touchstart', this.onTouchStart, { passive: true });
    window.addEventListener('touchend', this.onTouchEnd, { passive: true });
  }

  dispose(): void {
    window.removeEventListener('touchstart', this.onTouchStart);
    window.removeEventListener('touchend', this.onTouchEnd);
  }
}

/** Преобразование вектора свайпа в направление (аналог _vec2dir()). */
export function vecToDir(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { action: InputAction; dir: Position } | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (Math.abs(dx) < MIN_SWIPE_PX && Math.abs(dy) < MIN_SWIPE_PX) return null;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? { action: InputAction.RIGHT, dir: DIRS.right } : { action: InputAction.LEFT, dir: DIRS.left };
  }
  return dy > 0 ? { action: InputAction.DOWN, dir: DIRS.down } : { action: InputAction.UP, dir: DIRS.up };
}
