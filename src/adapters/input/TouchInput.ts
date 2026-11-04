import { InputAction } from '../../ports/IInput';
import { DIRS, Position } from '../../core/types/position';

export type DirDispatcher = (action: InputAction, dir: Position) => void;
export type ViewAnglesProvider = () => { yaw: number; pitch: number };

const MIN_SWIPE_PX = 30; // фильтр случайных касаний

/**
 * Тач-ввод свайпами (план 8.2, аналог script/game/input/input_touch.gd).
 * Свайп переводится в **локальные оси уровня** с учётом текущего рыскания и
 * наклона камеры: после поворота уровня «вправо по экрану» не обязано быть
 * «вправо по сетке». Жест двумя пальцами зарезервирован под орбиту камеры.
 */
export class TouchInput {
  private startX = 0;
  private startY = 0;
  private tracking = false;
  private multiTouch = false;

  private onTouchStart = (e: TouchEvent) => {
    // Второй палец — это вращение уровня, а не ход: свайп отменяется.
    if (e.touches.length > 1) {
      this.multiTouch = true;
      this.tracking = false;
      return;
    }
    if (this.tracking || e.touches.length === 0) return;
    this.tracking = true;
    this.multiTouch = false;
    this.startX = e.touches[0].clientX;
    this.startY = e.touches[0].clientY;
  };

  private onTouchEnd = (e: TouchEvent) => {
    const wasMulti = this.multiTouch;
    if (e.touches.length === 0) this.multiTouch = false;
    if (!this.tracking) return;
    this.tracking = false;
    if (wasMulti) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dir = vecToDir(this.startX, this.startY, t.clientX, t.clientY, this.getAngles?.());
    if (dir) this.dispatch(dir.action, dir.dir);
  };

  private onTouchCancel = () => {
    this.tracking = false;
    this.multiTouch = false;
  };

  constructor(
    private dispatch: DirDispatcher,
    private getAngles?: ViewAnglesProvider,
  ) {}

  attach(): void {
    window.addEventListener('touchstart', this.onTouchStart, { passive: true });
    window.addEventListener('touchend', this.onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', this.onTouchCancel, { passive: true });
  }

  dispose(): void {
    window.removeEventListener('touchstart', this.onTouchStart);
    window.removeEventListener('touchend', this.onTouchEnd);
    window.removeEventListener('touchcancel', this.onTouchCancel);
  }
}

/**
 * Преобразование вектора свайпа в направление (аналог _vec2dir()).
 *
 * Экранные проекции осей уровня при рыскании `yaw` и наклоне `pitch`
 * (экранный «низ» положителен):
 *   +x сетки → (cos yaw, −sin yaw·sin pitch)
 *   +y сетки → (sin yaw, +cos yaw·sin pitch)
 * Раскладываем свайп по этим осям и берём преобладающую.
 * Без углов (или почти при виде сверху) работает простая поворотная формула.
 */
export function vecToDir(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  angles?: { yaw: number; pitch: number },
): { action: InputAction; dir: Position } | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (Math.abs(dx) < MIN_SWIPE_PX && Math.abs(dy) < MIN_SWIPE_PX) return null;

  const yaw = angles?.yaw ?? 0;
  const sinPitch = Math.sin(angles?.pitch ?? 0);
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);

  let alongX: number;
  let alongY: number;
  if (Math.abs(sinPitch) < 0.25) {
    // Вид почти сверху: оси сетки проецируются без сжатия, только поворот.
    alongX = dx * cosYaw - dy * sinYaw;
    alongY = dx * sinYaw + dy * cosYaw;
  } else {
    alongX = dx * cosYaw - (dy * sinYaw) / sinPitch;
    alongY = (dy * cosYaw) / sinPitch + dx * sinYaw;
  }

  if (Math.abs(alongX) >= Math.abs(alongY)) {
    return alongX > 0
      ? { action: InputAction.RIGHT, dir: DIRS.right }
      : { action: InputAction.LEFT, dir: DIRS.left };
  }
  return alongY > 0
    ? { action: InputAction.DOWN, dir: DIRS.down }
    : { action: InputAction.UP, dir: DIRS.up };
}
