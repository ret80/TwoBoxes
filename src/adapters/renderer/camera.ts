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
  private refView = mat4.create();
  private corner = vec3.create();

  private yaw = DEFAULT_YAW;
  private pitch = DEFAULT_PITCH;
  /**
   * Точка, вокруг которой вращается уровень. Без неё орбита крутила форму
   * вокруг центра всей карты, и уровни со смещённым путём (например 1-6)
   * уезжали вбок при вращении.
   */
  private pivotX = 0;
  private pivotZ = 0;

  constructor() {
    this.updateView();
  }

  /**
   * Орбита: рыскание свободное, наклон ограничен MIN_PITCH…MAX_PITCH.
   * Масштаб при этом не меняется — проекция уже зафиксирована в `frame()`.
   */
  orbit(dYaw: number, dPitch: number): void {
    this.setAngles(this.yaw + dYaw, this.pitch + dPitch);
  }

  setAngles(yaw: number, pitch: number): void {
    const twoPi = Math.PI * 2;
    this.yaw = (((yaw % twoPi) + twoPi) % twoPi);
    this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, pitch));
    this.updateView();
    this.rebuildViewProj();
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
    const rotation = mat4.multiply(mat4.create(), rx, ry);
    // Сначала переносим центр формы в начало координат, потом вращаем:
    // view = R · T(−pivot)
    const shift = mat4.fromTranslation(mat4.create(), [-this.pivotX, 0, -this.pivotZ]);
    mat4.multiply(this.view, rotation, shift);
  }

  /**
   * Разовая настройка кадра на старте уровня (Фаза 12).
   *
   * Дальность камеры фиксируется по **опорному** ракурсу, а не по текущему:
   * иначе при вращении уровня проекция пересчитывалась бы и сцена то
   * приближалась, то отдалялась. Теперь орбита только меняет ориентацию.
   */
  frame(
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
    viewportW: number,
    viewportH: number,
    safeTop = 0,
    safeBottom = 0,
  ): void {
    const rx = mat4.fromXRotation(mat4.create(), DEFAULT_PITCH);
    const ry = mat4.fromYRotation(mat4.create(), DEFAULT_YAW);
    mat4.multiply(this.refView, rx, ry);

    // Вращаем и кадрируем вокруг центра именно видимых плит.
    this.pivotX = (bounds.minX + bounds.maxX) / 2;
    this.pivotZ = (bounds.minZ + bounds.maxZ) / 2;

    const yBottom = -0.05; // низ плит
    const yTop = 1.45; // верх кубика на приподнятой плите

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const sx of [bounds.minX, bounds.maxX]) {
      for (const sz of [bounds.minZ, bounds.maxZ]) {
        for (const sy of [yBottom, yTop]) {
          vec3.set(this.corner, sx - this.pivotX, sy, sz - this.pivotZ);
          vec3.transformMat4(this.corner, this.corner, this.refView);
          if (this.corner[0] < minX) minX = this.corner[0];
          if (this.corner[0] > maxX) maxX = this.corner[0];
          if (this.corner[1] < minY) minY = this.corner[1];
          if (this.corner[1] > maxY) maxY = this.corner[1];
        }
      }
    }

    const width = Math.max(1, viewportW);
    const height = Math.max(1, viewportH);
    const fieldW = maxX - minX;
    const fieldH = maxY - minY;
    const air = 0.4; // поля вокруг поля в клетках

    // Свободная полоса между панелями HUD. Вписываем поле равномерно в неё,
    // а не в урезанный вьюпорт — иначе при скрытых панелях кадр сплющивается.
    const usableW = width;
    const usableH = Math.max(1, height - safeTop - safeBottom);
    const scale = Math.min(
      usableW / Math.max(0.001, fieldW + air * 2),
      usableH / Math.max(0.001, fieldH + air * 2),
    );
    // Пикселей на единицу мира: одинаковая по обеим осям.
    const halfW = width / (2 * scale);
    const halfH = height / (2 * scale);

    const cx = (minX + maxX) / 2;
    // Сдвиг центра: положительный safeTop опускает картинку под верхнюю панель.
    const shiftPx = (safeTop - safeBottom) / 2;
    const cy = (minY + maxY) / 2 - shiftPx / scale;

    mat4.ortho(this.proj, cx - halfW, cx + halfW, cy - halfH, cy + halfH, -100, 100);
    this.updateView();
    this.rebuildViewProj();
  }

  private rebuildViewProj(): void {
    mat4.multiply(this.viewProj, this.proj, this.view);
  }

  getViewProj(): Float32Array {
    return this.viewProj as Float32Array;
  }
}
