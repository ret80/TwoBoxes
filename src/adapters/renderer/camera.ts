import { mat4, vec3 } from 'gl-matrix';

/** Пределы наклона: камера не уходит под уровень и не задирается за «вид сверху». */
export const MIN_PITCH = (16 * Math.PI) / 180;
export const MAX_PITCH = (86 * Math.PI) / 180;
export const DEFAULT_YAW = Math.PI / 4;
export const DEFAULT_PITCH = Math.PI / 5;

/**
 * Ортографическая изометрическая камера (док. раздел 12.4).
 * Оригинал: ортокамера size = 25.0, фиксированный ракурс через cam_point.
 * Теперь ракурс управляемый: рыскание вокруг Y уровня и наклон вокруг X.
 */
export class Camera {
  private proj = mat4.create();
  private view = mat4.create();
  private viewProj = mat4.create();
  private corner = vec3.create();

  private yaw = DEFAULT_YAW;
  private pitch = DEFAULT_PITCH;

  constructor() {
    this.updateView();
  }

  /** Орбита: рыскание свободное, наклон ограничен MIN_PITCH…MAX_PITCH. */
  orbit(dYaw: number, dPitch: number): void {
    const twoPi = Math.PI * 2;
    this.yaw = (((this.yaw + dYaw) % twoPi) + twoPi) % twoPi;
    this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.pitch + dPitch));
    this.updateView();
  }

  getAngles(): { yaw: number; pitch: number } {
    return { yaw: this.yaw, pitch: this.pitch };
  }

  /**
   * Ориентация из рыскания и наклона.
   * ⚠️ Наклон ПОЛОЖИТЕЛЬНЫЙ: взгляд камеры f = Rx(-θ)·(0,0,-1) = (0, -sinθ, -cosθ)
   * направлен вниз (f.y < 0) только при θ > 0 — камера смотрит сверху вниз.
   */
  private updateView(): void {
    const rx = mat4.fromXRotation(mat4.create(), this.pitch);
    const ry = mat4.fromYRotation(mat4.create(), this.yaw);
    mat4.multiply(this.view, rx, ry);
  }

  /**
   * Обновление проекции под реальные габариты сцены и окно (Фаза 12).
   *
   * `bounds` — габариты **видимых** плит в мировых координатах: рамка не тратит
   * место на невидимые стены по краям карты. Считаем проекцию углов на экран
   * с учётом поворота камеры и вписываем в кадр с отступами под панели HUD.
   */
  updateProjection(
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
    viewportW: number,
    viewportH: number,
  ): void {
    const viewportAspect = Math.max(1, viewportW) / Math.max(1, viewportH);

    const yBottom = -0.05; // низ плит
    const yTop = 1.45; // верх кубика на приподнятой плите

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const sx of [bounds.minX, bounds.maxX]) {
      for (const sz of [bounds.minZ, bounds.maxZ]) {
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

    const margin = 0.6; // боковые отступы в клетках
    const marginTop = 2.0; // запас сверху под плавающую панель HUD
    const marginBottom = 1.8; // запас снизу под нижнюю панель
    const boxW = maxX - minX + margin * 2;
    const boxH = maxY - minY + marginTop + marginBottom;
    const cx = (minX + maxX) / 2;
    const cy = (minY - marginBottom + maxY + marginTop) / 2;

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
