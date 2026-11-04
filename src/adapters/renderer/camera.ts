import { mat4 } from 'gl-matrix';

/**
 * Ортографическая изометрическая камера (док. раздел 12.4).
 * Оригинал: ортокамера size = 25.0, фиксированный ракурс через cam_point.
 */
export class Camera {
  private proj = mat4.create();
  private view = mat4.create();
  private viewProj = mat4.create();

  constructor() {
    this.updateView();
  }

  /**
   * Фиксированная изометрическая ориентация: наклон + поворот.
   * ⚠️ Наклон ПОЛОЖИТЕЛЬНЫЙ: взгляд камеры f = Rx(-θ)·(0,0,-1) = (0, -sinθ, -cosθ)
   * направлен вниз (f.y < 0) только при θ > 0 — камера смотрит сверху вниз.
   */
  private updateView(): void {
    const rx = mat4.fromXRotation(mat4.create(), Math.PI / 5); // ~36° наклон вниз
    const ry = mat4.fromYRotation(mat4.create(), Math.PI / 4); // 45° поворот
    mat4.multiply(this.view, rx, ry);
  }

  /**
   * Обновление проекции под размер поля и окна (адаптивность, Фаза 12).
   * Поле масштабируется по меньшей оси, aspect ratio сохраняется.
   */
  updateProjection(fieldWidth: number, fieldHeight: number, viewportW: number, viewportH: number): void {
    const margin = 2;
    const halfExtent = Math.max(fieldWidth, fieldHeight) / 2 + margin;
    const aspect = viewportW / Math.max(1, viewportH);
    let left: number, right: number, bottom: number, top: number;
    if (aspect >= 1) {
      // ландшафт: вертикальный охват определяет масштаб
      bottom = -halfExtent;
      top = halfExtent;
      left = -halfExtent * aspect;
      right = halfExtent * aspect;
    } else {
      // портрет: горизонтальный охват определяет масштаб
      left = -halfExtent;
      right = halfExtent;
      bottom = -halfExtent / aspect;
      top = halfExtent / aspect;
    }
    mat4.ortho(this.proj, left, right, bottom, top, -100, 100);
    mat4.multiply(this.viewProj, this.proj, this.view);
  }

  getViewProj(): Float32Array {
    return this.viewProj as Float32Array;
  }
}
