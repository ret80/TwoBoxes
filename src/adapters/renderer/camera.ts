import { mat4, vec3 } from 'gl-matrix';

/**
 * Ортографическая изометрическая камера (док. раздел 12.4).
 * Оригинал: ортокамера size = 25.0, фиксированный ракурс через cam_point.
 */
export class Camera {
  private proj = mat4.create();
  private view = mat4.create();
  private viewProj = mat4.create();
  private corner = vec3.create();

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
   *
   * ⚠️ Раньше в портрете вертикальный охват считался как halfExtent/aspect,
   * из-за чего поле сжималось до ~30% высоты экрана. Теперь считаем реальные
   * габариты поля в плоскости экрана (с учётом поворота камеры) и вписываем
   * их в кадр с равномерным отступом; поле центрируется и занимает максимум места.
   */
  updateProjection(
    fieldWidth: number,
    fieldHeight: number,
    viewportW: number,
    viewportH: number,
  ): void {
    const viewportAspect = Math.max(1, viewportW) / Math.max(1, viewportH);

    const halfX = fieldWidth / 2;
    const halfZ = fieldHeight / 2;
    const yBottom = -0.35; // низ плит пола
    const yTop = 1.0; // верх кубика

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const sx of [-halfX, halfX]) {
      for (const sz of [-halfZ, halfZ]) {
        for (const sy of [yBottom, yTop]) {
          vec3.set(this.corner, sx, sy, sz);
          vec3.transformMat4(this.corner, this.corner, this.view);
          if (this.corner[0] < minX) minX = this.corner[0];
          if (this.corner[0] > maxX) maxX = this.corner[0];
          if (this.corner[1] < minY) minY = this.corner[1];
          if (this.corner[1] > maxY) maxY = this.corner[1];
        }
      }
    }

    const margin = 0.6; // боковые и нижний отступ в клетках
    const marginTop = 1.8; // запас сверху под панель HUD (в игре она поверх канваса)
    const boxW = maxX - minX + margin * 2;
    const boxH = maxY - minY + marginTop + margin;
    const cx = (minX + maxX) / 2;
    const cy = (minY - margin + maxY + marginTop) / 2;

    let halfW: number;
    let halfH: number;
    if (boxW / boxH >= viewportAspect) {
      halfW = boxW / 2;
      halfH = halfW / viewportAspect;
    } else {
      halfH = boxH / 2;
      halfW = halfH * viewportAspect;
    }

    mat4.ortho(this.proj, cx - halfW, cx + halfW, cy - halfH, cy + halfH, -100, 100);
    mat4.multiply(this.viewProj, this.proj, this.view);
  }

  getViewProj(): Float32Array {
    return this.viewProj as Float32Array;
  }
}
