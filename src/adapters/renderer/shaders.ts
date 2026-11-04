/**
 * GLSL-шейдеры (WebGL2 / picogl). Экспортируются строками, чтобы не
 * настраивать пайплайн ассетов для .glsl (отклонение от плана 7.1 —
 * вместо файлов vertex.glsl/fragment.glsl/line.glsl один общий шейдер
 * для кубов, квадов и линий: геометрия отличается только режимом примитива).
 */

/** Общий vertex shader: модель + view-proj матрица. */
export const VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
uniform mat4 uModel;
uniform mat4 uViewProj;
void main() {
  gl_Position = uViewProj * uModel * vec4(aPosition, 1.0);
}
`;

/** Общий fragment shader: однотонный материал (аналог mat_*.tres). */
export const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec3 uColor;
out vec4 fragColor;
void main() {
  fragColor = vec4(uColor, 1.0);
}
`;
