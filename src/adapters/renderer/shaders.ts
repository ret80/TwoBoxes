/**
 * GLSL-шейдеры (WebGL2 / picogl). Экспортируются строками, чтобы не
 * настраивать пайплайн ассетов для .glsl (отклонение от плана 7.1 —
 * вместо файлов vertex.glsl/fragment.glsl/line.glsl отдельные программы
 * для кубов и линий: геометрия отличается режимом примитива и наличием нормалей).
 *
 * Освещение — «как DirectionalLight3D» из оригинала: верхние грани светлее,
 * боковые темнее. Без него кубы читаются как плоские пятна.
 */

/**
 * Общий кусок всех вершинных шейдеров: перевод в клип-пространство плюс
 * необязательная «обратная перспектива» (`uWarp` > 0): дальние части сцены
 * расширяются, ближние сжимаются — как будто точка схода за спиной.
 */
const PROJECT = `
vec4 projectVertex(vec4 clip) {
  float depth = clamp(clip.z * 0.5 + 0.5, 0.0, 1.0);
  clip.xy *= 1.0 + uWarp * (depth - 0.5);
  return clip;
}
`;

/** Куб/квад: модель + view-proj, нормаль во фрагментный шейдер. */
export const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uViewProj;
uniform float uWarp;
out vec3 vNormal;
${PROJECT}
void main() {
  mat3 m = mat3(uModel);
  vec3 scale = vec3(length(m[0]), length(m[1]), length(m[2]));
  vNormal = normalize(aNormal / max(scale, vec3(0.0001)));
  gl_Position = projectVertex(uViewProj * uModel * vec4(aPosition, 1.0));
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
  lit *= 1.0 + 0.16 * uGlow;
  fragColor = vec4(min(lit, vec3(1.0)), uAlpha);
}
`;

/**
 * Ореол-свечение кубика на своей площадке: камера-ориентированный квад с
 * радиальным затуханием. Цвет остаётся цветом кубика (светлеет только самое
 * ядро), поэтому свечение не «выгорает» в белое, как при аддитивном блендинге
 * на кремовом фоне.
 */
export const GLOW_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 2) in vec2 aUv;
uniform mat4 uModel;
uniform mat4 uViewProj;
uniform float uWarp;
out vec2 vUv;
${PROJECT}
void main() {
  vUv = aUv;
  gl_Position = projectVertex(uViewProj * uModel * vec4(aPosition, 1.0));
}
`;

export const GLOW_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec3 uColor;
uniform float uIntensity;
in vec2 vUv;
out vec4 fragColor;
void main() {
  // 0 в центре, 1 на краю квада
  float r = clamp(length(vUv - vec2(0.5)) * 2.0, 0.0, 1.0);
  // Ядро ореола за кубиком всё равно не видно, поэтому плотность держится
  // до края силуэта и только потом плавно гаснет — иначе видимое кольцо
  // получается почти прозрачным и цвет кубика вымывается в беж.
  float halo = pow(1.0 - smoothstep(0.14, 0.95, r), 1.05);
  // Ореол остаётся цветом кубика: чуть горячее у самого кубика и чище к краю.
  // Белый в смесь не подмешивается — иначе свечение выгорало в белое.
  vec3 color = min(uColor * (0.92 + 0.28 * pow(1.0 - r, 3.0)), vec3(1.0));
  fragColor = vec4(color, halo * uIntensity);
}
`;

/** Линии сетки: без нормалей и освещения. */
export const LINE_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 aPosition;
uniform mat4 uModel;
uniform mat4 uViewProj;
uniform float uWarp;
${PROJECT}
void main() {
  gl_Position = projectVertex(uViewProj * uModel * vec4(aPosition, 1.0));
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
