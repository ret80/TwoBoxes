/**
 * Геометрия примитивов (аналоги префабов оригинала):
 * - куб (box/wall/floor/particle) — BoxMesh в оригинале;
 * - плоский квад в плоскости XZ (end-площадка) — QuadMesh 0.8×0.8 в оригинале;
 * - линии сетки.
 *
 * У куба и квада есть нормали: по ним фрагментный шейдер считает простое
 * направленное освещение (как DirectionalLight3D в оригинале), иначе все
 * грани выглядят одинаково и поле «расплющивается».
 */

/** 8 углов юнит-куба с центром в origin. */
const CUBE_CORNERS: number[][] = [
  [-0.5, -0.5, -0.5],
  [0.5, -0.5, -0.5],
  [0.5, 0.5, -0.5],
  [-0.5, 0.5, -0.5],
  [-0.5, -0.5, 0.5],
  [0.5, -0.5, 0.5],
  [0.5, 0.5, 0.5],
  [-0.5, 0.5, 0.5],
];

/** Грани: индексы вершин (2 треугольника) + нормаль. */
const CUBE_FACES: { idx: number[]; normal: number[] }[] = [
  { idx: [0, 1, 2, 0, 2, 3], normal: [0, 0, -1] }, // back
  { idx: [5, 4, 7, 5, 7, 6], normal: [0, 0, 1] }, // front
  { idx: [4, 0, 3, 4, 3, 7], normal: [-1, 0, 0] }, // left
  { idx: [1, 5, 6, 1, 6, 2], normal: [1, 0, 0] }, // right
  { idx: [4, 5, 1, 4, 1, 0], normal: [0, -1, 0] }, // bottom
  { idx: [3, 2, 6, 3, 6, 7], normal: [0, 1, 0] }, // top
];

function buildCubeVertices(): Float32Array {
  const out: number[] = [];
  for (const face of CUBE_FACES) for (const i of face.idx) out.push(...CUBE_CORNERS[i]);
  return new Float32Array(out);
}

/**
 * Доля соседних граней в нормали угла. 0 — жёсткая грань (как раньше), 1 —
 * полностью сглаженный «шарик». Небольшое значение даёт микрофаску: у рёбер
 * нормаль чуть поворачивается к соседу, и свет мягко подсвечивает кромку
 * вместо резкого перепада между гранями.
 */
const BEVEL_BLEND = 0.3;

/**
 * Нормали скруглённого куба. Каждая вершина — угол куба, поэтому к нормали
 * грани подмешиваются нормали двух соседних граней, сходящихся в этом угле.
 * Геометрия остаётся кубом (силуэт ровный), меняется только освещение — это и
 * есть «микрофаска» без дополнительных полигонов.
 */
function buildCubeNormals(): Float32Array {
  const out: number[] = [];
  for (const face of CUBE_FACES) {
    for (const index of face.idx) {
      const corner = CUBE_CORNERS[index];
      const normal = [face.normal[0], face.normal[1], face.normal[2]];
      for (const other of CUBE_FACES) {
        if (other.normal === face.normal) continue;
        // Грань проходит через угол, если его проекция на её нормаль — 0.5.
        const dot =
          corner[0] * other.normal[0] +
          corner[1] * other.normal[1] +
          corner[2] * other.normal[2];
        if (dot < 0.49) continue;
        normal[0] += other.normal[0] * BEVEL_BLEND;
        normal[1] += other.normal[1] * BEVEL_BLEND;
        normal[2] += other.normal[2] * BEVEL_BLEND;
      }
      const length = Math.hypot(normal[0], normal[1], normal[2]) || 1;
      out.push(normal[0] / length, normal[1] / length, normal[2] / length);
    }
  }
  return new Float32Array(out);
}

/** Юнит-куб: 36 вершин, без индексов (flat color + освещение). */
export const CUBE_VERTICES: Float32Array = buildCubeVertices();
export const CUBE_NORMALS: Float32Array = buildCubeNormals();

/** Плоский квад в плоскости XZ (нормаль вверх), размер 1×1 с центром в origin. */
export const QUAD_XZ_VERTICES: Float32Array = new Float32Array([
  -0.5, 0, -0.5,
  0.5, 0, -0.5,
  0.5, 0, 0.5,

  -0.5, 0, -0.5,
  0.5, 0, 0.5,
  -0.5, 0, 0.5,
]);

export const QUAD_NORMALS: Float32Array = new Float32Array([
  0, 1, 0,
  0, 1, 0,
  0, 1, 0,

  0, 1, 0,
  0, 1, 0,
  0, 1, 0,
]);

/**
 * Плоский квад в плоскости XY с центром в origin (декали: стрелки, буквы).
 * Обход — по часовой стрелке при взгляде с +Z: с включённым `frontFace(CW)`
 * такая грань считается лицевой, когда камера смотрит со стороны +Z базиса.
 */
export const QUAD_XY_VERTICES: Float32Array = new Float32Array([
  -0.5, -0.5, 0,
  -0.5, 0.5, 0,
  0.5, 0.5, 0,

  -0.5, -0.5, 0,
  0.5, 0.5, 0,
  0.5, -0.5, 0,
]);

/** Нормали XY-квада: смотрят в +Z (декаль повёрнута к камере своим базисом). */
export const QUAD_XY_NORMALS: Float32Array = new Float32Array([
  0, 0, 1,
  0, 0, 1,
  0, 0, 1,

  0, 0, 1,
  0, 0, 1,
  0, 0, 1,
]);

/** UV-координаты квада: нужны радиальному свечению (uOrigin — центр). */
export const QUAD_UVS: Float32Array = new Float32Array([
  0, 0,
  0, 1,
  1, 1,

  0, 0,
  1, 1,
  1, 0,
]);

/**
 * UV для квада в плоскости XZ: локальный X — это U, локальный Z — V. По ним
 * растягивается размытый силуэт платформы (маска тени).
 */
export const QUAD_XZ_UVS: Float32Array = new Float32Array([
  0, 0,
  1, 0,
  1, 1,

  0, 0,
  1, 1,
  0, 1,
]);

/**
 * Линии сетки поля width×height (аналог script/game/grid.gd).
 * Возвращает пары вершин для режима GL_LINES в координатах поля (центр — origin).
 * `isVisible` — фильтр клеток: ребро проводится только если хотя бы одна
 * из двух смежных клеток видима (иначе UNKNOWN-зоны покрываются сеткой).
 * `y` — высота линий над плоскостью поля (сетка лежит на верхней грани плит).
 */
export function buildGridLines(
  width: number,
  height: number,
  isVisible?: (x: number, y: number) => boolean,
  y = 0.002,
): Float32Array {
  const lines: number[] = [];
  const x0 = -width / 2;
  const z0 = -height / 2;
  const vis = (x: number, cy: number) => (isVisible ? isVisible(x, cy) : true);

  for (let cy = 0; cy < height; cy++) {
    for (let cx = 0; cx < width; cx++) {
      if (!vis(cx, cy)) continue;
      const x = x0 + cx;
      const z = z0 + cy;
      // Верхняя и левая сторона клетки; нижняя/правая — от соседа или внешний край
      lines.push(x, y, z, x + 1, y, z);
      lines.push(x, y, z, x, y, z + 1);
      if (!vis(cx + 1, cy)) lines.push(x + 1, y, z, x + 1, y, z + 1);
      if (!vis(cx, cy + 1)) lines.push(x, y, z + 1, x + 1, y, z + 1);
    }
  }
  return new Float32Array(lines);
}
