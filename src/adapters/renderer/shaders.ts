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
/** Направление на камеру: по нему считается подсветка рёбер. */
uniform vec3 uViewDir;
in vec3 vNormal;
out vec4 fragColor;
const vec3 LIGHT_DIR = vec3(0.4467, 0.8437, 0.2978); // normalize(0.45, 0.85, 0.3)
void main() {
  vec3 n = normalize(vNormal);
  float diff = max(dot(n, LIGHT_DIR), 0.0);
  vec3 lit = uColor * (0.78 + 0.30 * diff);
  // Свечение кубика на площадке: светятся рёбра (rim), а не весь объём —
  // плоские грани не выцветают, а силуэт читается светящейся кромкой.
  float rim = pow(1.0 - abs(dot(n, uViewDir)), 2.4);
  lit *= 1.0 + 0.12 * uGlow;
  lit += uColor * rim * 0.55 * uGlow;
  fragColor = vec4(min(lit, vec3(1.0)), uAlpha);
}
`;

/**
 * Ореол-свечение кубика на своей площадке.
 *
 * Свечение считается по расстоянию до силуэта (SDF скруглённого
 * прямоугольника), как в шейдерных глоу-примерах: у самой поверхности оно
 * максимально и гаснет с расстоянием, а не рисуется «пятном» через smoothstep
 * (у пятна плоское ядро и заметная граница). Две составляющие, как у bloom
 * (светлое ядро + размытие): инверсия расстояния даёт яркую кромку и длинный
 * хвост, гауссово затухание — широкий мягкий ореол.
 *
 * Силуэт задаётся uniform-ами: для кубика это круг, для площадки — её квадрат.
 * Цвет остаётся цветом кубика (светлеет только кромка), поэтому на кремовом
 * фоне свечение не выгорает в белое, как при аддитивном блендинге.
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
/** Половина размера силуэта в UV квада (0.5 — весь квад) и радиус скругления. */
uniform vec2 uRect;
uniform float uRadius;
/** Радиус яркого ядра (инверсия расстояния) и широкого ореола (гаусс). */
uniform float uCore;
uniform float uWide;
in vec2 vUv;
out vec4 fragColor;

/** SDF скруглённого прямоугольника (Inigo Quilez): меньше нуля внутри силуэта. */
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 p = vUv - vec2(0.5);
  // Расстояние до силуэта: ноль у поверхности и растёт наружу.
  float d = max(sdRoundBox(p, uRect, uRadius), 0.0);
  // Ядро — инверсия расстояния: единица у силуэта и длинный хвост.
  float core = uCore / (d + uCore);
  // Широкий ореол — гауссово затухание, как размытие в bloom.
  float wide = exp(-(d * d) / (uWide * uWide));
  float glow = clamp(core * 0.42 + wide * 0.75, 0.0, 1.0);
  // Квад кончается на 0.5 UV: догоняем ореол до нуля у его края, иначе
  // хвост обрезается прямой линией и видна граница квада.
  glow *= 1.0 - smoothstep(0.30, 0.47, max(abs(p.x), abs(p.y)));
  // У самой кромки ореол чуть горячее; белый не подмешивается.
  vec3 color = min(uColor * (0.94 + 0.30 * pow(1.0 - smoothstep(0.0, uCore * 2.0, d), 2.0)), vec3(1.0));
  fragColor = vec4(color, glow * uIntensity);
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
