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

function buildCubeNormals(): Float32Array {
  const out: number[] = [];
  for (const face of CUBE_FACES) {
    for (let i = 0; i < face.idx.length; i++) out.push(...face.normal);
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
 * Линии сетки поля width×height (аналог script/game/grid.gd).
 * Возвращает пары вершин для режима GL_LINES в координатах поля (центр — origin).
 * `isVisible` — фильтр клеток: ребро проводится только если хотя бы одна
 * из двух смежных клеток видима (иначе UNKNOWN-зоны покрываются сеткой).
 */
export function buildGridLines(
  width: number,
  height: number,
  isVisible?: (x: number, y: number) => boolean,
): Float32Array {
  const lines: number[] = [];
  const x0 = -width / 2;
  const z0 = -height / 2;
  const y = 0.002;
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
