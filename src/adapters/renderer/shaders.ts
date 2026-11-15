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
 * `uAlpha` нужен для полупрозрачных декалей, `uGlow` — для свечения кубика,
 * стоящего на своей площадке.
 *
 * Свет — половинный ламберт: тень на боковых гранях не проваливается в
 * контраст, пастельная палитра остаётся пастельной. Нормали у куба скруглены
 * на рёбрах (см. geometry.ts), поэтому грани переходят друг в друга мягкой
 * подсветкой, как на микрофаске.
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
  vec3 n = normalize(vNormal);
  // Половинный ламберт: 0.5 + 0.5·cos — боковые грани светлее, чем при
  // обычном max(dot, 0), и куб читается объёмно, не проваливаясь в тень.
  float diff = 0.5 + 0.5 * dot(n, LIGHT_DIR);
  vec3 lit = uColor * (0.70 + 0.34 * diff);
  // Кубик на своей площадке чуть «напитан» светом: силуэт светится в основном
  // ореолом (он повторяет проекцию кубика), а грани — только легче обычного,
  // иначе у плоского куба ореол разбивался бы на отдельные светлые грани.
  lit *= 1.0 + 0.08 * uGlow;
  fragColor = vec4(min(lit, vec3(1.0)), uAlpha);
}
`;

/**
 * Контактная тень кубика.
 *
 * Рисуется плоским квадом в плоскости XZ, внутри которого шейдер считает
 * расстояние до скруглённого прямоугольника (SDF). Ядро тени ровное, край
 * тает по гауссу — без «пятна» с заметной границей и без размытия текстурой.
 * Полуразмер ядра, скругление и мягкость приходят в локальных единицах квада.
 */
export const SHADOW_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 aPosition;
uniform mat4 uModel;
uniform mat4 uViewProj;
uniform float uWarp;
out vec2 vLocal;
${PROJECT}
void main() {
  vLocal = aPosition.xz;
  gl_Position = projectVertex(uViewProj * uModel * vec4(aPosition, 1.0));
}
`;

/**
 * Тень платформы: один квад с размытой маской силуэта плит.
 *
 * Поштучные квады клеток не сливаются в одну тень: каждая клетка даёт свой
 * скруглённый край, и на месте общей тени получается гребёнка. Поэтому силуэт
 * плит рисуется в маленький canvas, размывается там же гауссом и уходит в
 * текстуру — квад тени повторяет форму поля целиком, включая дырки.
 */
export const MASK_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 2) in vec2 aUv;
uniform mat4 uModel;
uniform mat4 uViewProj;
uniform float uWarp;
/** Кусок маски, который ложится на этот квад: смещение и размер в UV. */
uniform vec4 uUvRect;
out vec2 vUv;
${PROJECT}
void main() {
  vUv = aUv * uUvRect.zw + uUvRect.xy;
  gl_Position = projectVertex(uViewProj * uModel * vec4(aPosition, 1.0));
}
`;

export const MASK_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uMask;
uniform vec3 uColor;
uniform float uAlpha;
/**
 * Готовность клеток поля (по текселю на клетку, линейная фильтрация): тень
 * проявляется вместе с плитами, а не целиком. Между клетками значения
 * интерполируются, поэтому волна идёт мягко, без ступенек на стыках.
 */
uniform sampler2D uProgress;
/** Сколько клеток маски по осям (с полями) и сколько клеток занимают поля. */
uniform vec2 uCells;
uniform float uMargin;
uniform float uProgressOn;
in vec2 vUv;
out vec4 fragColor;
void main() {
  // Маска — белый силуэт по чёрному, размытый до плотности тени.
  float density = texture(uMask, vUv).r;
  // UV маски → координаты клетки поля: центр клетки попадает в центр текселя.
  vec2 cell = vUv * uCells - uMargin;
  vec2 level = max(uCells - 2.0 * uMargin, vec2(1.0));
  float progress = mix(1.0, texture(uProgress, cell / level).r, uProgressOn);
  fragColor = vec4(uColor, density * uAlpha * progress);
}
`;

export const SHADOW_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
/** Полуразмеры ядра по осям квада: квадрат у контактной тени, полоска у стенки. */
uniform vec2 uHalf;
uniform float uRound;
uniform float uSoft;
in vec2 vLocal;
out vec4 fragColor;

/** SDF прямоугольника со скруглёнными углами: < 0 внутри, > 0 снаружи. */
float roundedBox(vec2 p, vec2 halfSize, float round) {
  vec2 q = abs(p) - halfSize + round;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - round;
}

void main() {
  float d = max(roundedBox(vLocal, uHalf, uRound), 0.0);
  float a = uAlpha * exp(-(d * d) / max(uSoft * uSoft, 1e-6));
  // Квад должен быть больше самой тени: гасим хвост до его края, иначе
  // видна прямая граница квада (тот же приём, что у ореола).
  a *= 1.0 - smoothstep(0.40, 0.49, max(abs(vLocal.x), abs(vLocal.y)));
  fragColor = vec4(uColor, a);
}
`;

/**
 * Ореол-свечение кубика на своей площадке.
 *
 * Свечение считается по расстоянию до силуэта (SDF), как в шейдерных
 * глоу-примерах: у самой поверхности оно максимально и гаснет с расстоянием, а
 * не рисуется «пятном» через smoothstep (у пятна плоское ядро и заметная
 * граница). Две составляющие, как у bloom (светлое ядро + размытие): инверсия
 * расстояния даёт яркую кромку, гауссово затухание — мягкий ореол.
 *
 * Силуэт задан тремя полосами `|dot(p, nᵢ)| ≤ rᵢ` — это центрально-симметричный
 * выпуклый шестиугольник. Такой вид имеет проекция параллелепипеда, а радиусы
 * считаются опорной функцией зонотопа (см. `cubeHull` в рендерере), поэтому
 * свечение облегает именно силуэт кубика с любого ракурса, а не круг, который
 * с части углов не достаёт до низа и боков. Для площадки полос две — квадрат
 * клетки.
 *
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
/** Полосы силуэта в UV квада: нормаль (уже единичная) и радиус каждой. */
uniform vec2 uN0;
uniform float uR0;
uniform vec2 uN1;
uniform float uR1;
uniform vec2 uN2;
uniform float uR2;
/** Радиус яркого ядра (инверсия расстояния) и мягкого ореола (гаусс). */
uniform float uCore;
uniform float uWide;
in vec2 vUv;
out vec4 fragColor;

/** Расстояние до полосы |dot(p, n)| <= r: ноль на её границе. */
float slab(vec2 p, vec2 n, float r) {
  return abs(dot(p, n)) - r;
}

void main() {
  vec2 p = vUv - vec2(0.5);
  // Расстояние до силуэта: пересечение полос — точный силуэт кубика (или
  // квадрата клетки), максимум даёт расстояние до его границы наружу.
  float d = max(max(slab(p, uN0, uR0), slab(p, uN1, uR1)), slab(p, uN2, uR2));
  d = max(d, 0.0);
  // Ядро — инверсия расстояния: единица у силуэта и длинный хвост.
  float core = uCore / (d + uCore);
  // Мягкий ореол — гауссово затухание, как размытие в bloom.
  float wide = exp(-(d * d) / (uWide * uWide));
  float glow = clamp(core * 0.42 + wide * 0.75, 0.0, 1.0);
  // Квад кончается на 0.5 UV: догоняем ореол до нуля у его края, иначе
  // хвост обрезается прямой линией и видна граница квада.
  glow *= 1.0 - smoothstep(0.40, 0.49, length(p));
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
uniform float uAlpha;
out vec4 fragColor;
void main() {
  fragColor = vec4(uColor, uAlpha);
}
`;
