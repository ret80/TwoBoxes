/**
 * GLSL-шейдеры (WebGL2 / picogl). Экспортируются строками, чтобы не
 * настраивать пайплайн ассетов для .glsl (отклонение от плана 7.1 —
 * вместо файлов vertex.glsl/fragment.glsl/line.glsl отдельные программы
 * для кубов и линий: геометрия отличается режимом примитива и наличием нормалей).
 *
 * Освещение — «как DirectionalLight3D» из оригинала: верхние грани светлее,
 * боковые темнее. Без него кубы читаются как плоские пятна.
 */

/** Куб/квад: модель + view-proj, нормаль во фрагментный шейдер. */
export const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uViewProj;
out vec3 vNormal;
void main() {
  mat3 m = mat3(uModel);
  vec3 scale = vec3(length(m[0]), length(m[1]), length(m[2]));
  vNormal = normalize(aNormal / max(scale, vec3(0.0001)));
  gl_Position = uViewProj * uModel * vec4(aPosition, 1.0);
}
`;

/**
 * Куб/квад: однотонный материал (аналог mat_*.tres) + мягкий направленный свет.
 * `uAlpha` нужен для полупрозрачного ореола-подсветки, `uGlow` — для свечения
 * кубика, стоящего на своей площадке.
 */
export const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uGlow;
in vec3 vNormal;
out vec4 fragColor;
const vec3 LIGHT_DIR = vec3(0.4467, 0.8437, 0.2978); // normalize(0.45, 0.85, 0.3)
void main() {
  float diff = max(dot(normalize(vNormal), LIGHT_DIR), 0.0);
  vec3 lit = uColor * (0.78 + 0.30 * diff);
  // Свечение поднимает яркость самого цвета, не подмешивая белый: кубик
  // становится заметно светлее, но не выглядит пересвеченным.
  lit *= 1.0 + 0.12 * uGlow;
  fragColor = vec4(min(lit, vec3(1.0)), uAlpha);
}
`;

/** Линии сетки: без нормалей и освещения. */
export const LINE_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 aPosition;
uniform mat4 uModel;
uniform mat4 uViewProj;
void main() {
  gl_Position = uViewProj * uModel * vec4(aPosition, 1.0);
}
`;

export const LINE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec3 uColor;
out vec4 fragColor;
void main() {
  fragColor = vec4(uColor, 1.0);
}
`;
