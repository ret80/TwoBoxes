/**
 * Орбита камеры (пункт «вращать уровень вокруг Y и наклонять камеру»).
 *
 * Жесты:
 * - мышь: перетаскивание с зажатой кнопкой;
 * - тач: два пальца (один палец остаётся свайпу для хода кубиками).
 *
 * Сообщает приращение в пикселях экрана; ограничения наклона живут в Camera.
 */
export class OrbitInput {
  private pointers = new Map<number, { x: number; y: number; mouse: boolean }>();
  private last: { x: number; y: number } | null = null;
  private enabled = true;
  private target: HTMLElement | null = null;

  constructor(private onOrbit: (dx: number, dy: number) => void) {}

  attach(target: HTMLElement): void {
    this.target = target;
    target.addEventListener('pointerdown', this.onDown);
    target.addEventListener('pointermove', this.onMove);
    target.addEventListener('pointerup', this.onUp);
    target.addEventListener('pointercancel', this.onUp);
    target.addEventListener('pointerleave', this.onUp);
  }

  dispose(): void {
    const target = this.target;
    if (!target) return;
    target.removeEventListener('pointerdown', this.onDown);
    target.removeEventListener('pointermove', this.onMove);
    target.removeEventListener('pointerup', this.onUp);
    target.removeEventListener('pointercancel', this.onUp);
    target.removeEventListener('pointerleave', this.onUp);
    this.target = null;
    this.pointers.clear();
    this.last = null;
  }

  /** Орбита доступна только в игре и не поверх открытых диалогов. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.pointers.clear();
      this.last = null;
    }
  }

  private onDown = (e: PointerEvent) => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, mouse: e.pointerType === 'mouse' });
    this.last = this.centroid();
    // Мышь уводит курсор за пределы канваса — захватываем указатель.
    if (e.pointerType === 'mouse') this.target?.setPointerCapture?.(e.pointerId);
  };

  private onMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    const c = this.centroid();
    if (!c) return;
    const last = this.last;
    this.last = c;
    if (!last) return;
    // Один палец — свайп хода, орбита только мышью или двумя пальцами.
    const canOrbit = this.pointers.size >= 2 || p.mouse;
    if (!this.enabled || !canOrbit) return;
    const dx = c.x - last.x;
    const dy = c.y - last.y;
    if (dx === 0 && dy === 0) return;
    e.preventDefault();
    this.onOrbit(dx, dy);
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    this.last = this.centroid();
    if (this.pointers.size === 0) this.last = null;
  };

  private centroid(): { x: number; y: number } | null {
    if (this.pointers.size === 0) return null;
    let x = 0;
    let y = 0;
    for (const p of this.pointers.values()) {
      x += p.x;
      y += p.y;
    }
    return { x: x / this.pointers.size, y: y / this.pointers.size };
  }
}
