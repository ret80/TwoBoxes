/**
 * Геометрия примитивов (аналоги префабов оригинала):
 * - куб (box/wall/floor/particle) — BoxMesh в оригинале;
 * - плоский квад в плоскости XZ (end-площадка) — QuadMesh 0.8×0.8 в оригинале;
 * - линии сетки.
 */

/** Юнит-куб (24 вершины, 36 индексов в треугольники, без нормалей — flat color). */
export const CUBE_VERTICES: Float32Array = buildCube();

function buildCube(): Float32Array {
  // 8 углов юнит-куба с центром в origin
  const v = [
    [-0.5, -0.5, -0.5],
    [0.5, -0.5, -0.5],
    [0.5, 0.5, -0.5],
    [-0.5, 0.5, -0.5],
    [-0.5, -0.5, 0.5],
    [0.5, -0.5, 0.5],
    [0.5, 0.5, 0.5],
    [-0.5, 0.5, 0.5],
  ];
  // 12 треугольников (6 граней)
  const faces = [
    [0, 1, 2, 0, 2, 3], // back
    [5, 4, 7, 5, 7, 6], // front
    [4, 0, 3, 4, 3, 7], // left
    [1, 5, 6, 1, 6, 2], // right
    [4, 5, 1, 4, 1, 0], // bottom
    [3, 2, 6, 3, 6, 7], // top
  ];
  const out: number[] = [];
  for (const f of faces) for (const i of f) out.push(...v[i]);
  return new Float32Array(out);
}

/** Плоский квад в плоскости XZ (нормаль вверх), размер 1×1 с центром в origin. */
export const QUAD_XZ_VERTICES: Float32Array = new Float32Array([
  -0.5, 0, -0.5,
  0.5, 0, -0.5,
  0.5, 0, 0.5,

  -0.5, 0, -0.5,
  0.5, 0, 0.5,
  -0.5, 0, 0.5,
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
