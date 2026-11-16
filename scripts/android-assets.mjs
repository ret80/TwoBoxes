#!/usr/bin/env node
// Иконки и сплэши Android-приложения в стиле игры: кремовый фон, изометрические
// кубики и «2» из логотипа главного меню (координаты — из screens.ts).
//
// PNG рисует sharp из тех же векторных фигур, поэтому любой размер остаётся
// чётким. Скрипт идемпотентен: перезаписывает сгенерированные файлы.
//
//   npm run android:assets
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const RES = 'android/app/src/main/res';
const BUILD = 'build/android';

const CREAM = '#eee7d7';
const COFFEE = '#4a3527';
const GOLD = { top: '#e7ba52', left: '#f2cd72', right: '#d3a13c' };
const CORAL = { top: '#e98a66', left: '#f3a184', right: '#d2704f' };

/** Грань куба: многоугольник со скруглённым стыком (обводка того же цвета). */
function face(points, fill) {
  return `<polygon points="${points.map(([x, y]) => `${x},${y}`).join(' ')}" fill="${fill}" stroke="${fill}" stroke-width="5" stroke-linejoin="round"/>`;
}

/** Изометрический куб: центр верхней грани (cx, cy), полуширина a, высота h. */
function cube(cx, cy, a, h, c) {
  const b = a / 2;
  return (
    face([[cx - a, cy], [cx, cy + b], [cx, cy + b + h], [cx - a, cy + h]], c.left) +
    face([[cx + a, cy], [cx, cy + b], [cx, cy + b + h], [cx + a, cy + h]], c.right) +
    face([[cx - a, cy], [cx, cy - b], [cx + a, cy], [cx, cy + b]], c.top)
  );
}

// Раскладка логотипа меню: золотой куб стоит ближе к коралловому вдоль линии
// пола (сдвиг на 16 вправо и на 8 вниз), коралловый — на её продолжении.
const GOLD_CUBE = { x: 80, y: 48, a: 44, h: 50 };
const CORAL_CUBE = { x: 150, y: 86, a: 42, h: 48 };
const MARK = { x: 30, y: 20, w: 168, h: 141 };

/** Логотип как самостоятельный SVG-фрагмент, вписанный в прямоугольник. */
function mark({ x, y, w, h }) {
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${MARK.x} ${MARK.y} ${MARK.w} ${MARK.h}">
    ${cube(GOLD_CUBE.x, GOLD_CUBE.y, GOLD_CUBE.a, GOLD_CUBE.h, GOLD)}
    ${cube(CORAL_CUBE.x, CORAL_CUBE.y, CORAL_CUBE.a, CORAL_CUBE.h, CORAL)}
    <text x="105" y="142" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
      font-size="150" font-weight="800" fill="${COFFEE}" stroke="${COFFEE}"
      stroke-width="10" stroke-linejoin="round">2</text>
  </svg>`;
}

/** Квадратный SVG: фон (или прозрачный), логотип по центру заданной доли ширины. */
function squareSvg(size, artScale, bg) {
  const w = size * artScale;
  const h = w * (MARK.h / MARK.w);
  const background =
    bg === 'rounded'
      ? `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${CREAM}"/>`
      : bg === 'circle'
        ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${CREAM}"/>`
        : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    ${background}${mark({ x: (size - w) / 2, y: (size - h) / 2, w, h })}
  </svg>`;
}

/** Сплэш: кремовый фон на весь экран (его растягивает система) и логотип по центру. */
function splashSvg(width, height) {
  const w = Math.min(width, height) * 0.3;
  const h = w * (MARK.h / MARK.w);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="${CREAM}"/>
    ${mark({ x: (width - w) / 2, y: (height - h) / 2, w, h })}
  </svg>`;
}

async function png(svg, file) {
  await mkdir(path.dirname(file), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(file);
}

const DENSITIES = {
  mdpi: { scale: 1, launcher: 48, foreground: 108, land: [480, 320], port: [320, 480] },
  hdpi: { scale: 1.5, launcher: 72, foreground: 162, land: [800, 480], port: [480, 800] },
  xhdpi: { scale: 2, launcher: 96, foreground: 216, land: [1280, 720], port: [720, 1280] },
  xxhdpi: { scale: 3, launcher: 144, foreground: 324, land: [1600, 960], port: [960, 1600] },
  xxxhdpi: { scale: 4, launcher: 192, foreground: 432, land: [1920, 1280], port: [1280, 1920] },
};

for (const [density, d] of Object.entries(DENSITIES)) {
  // Легаси-иконки (API < 26): скруглённый квадрат и круглая версия.
  await png(squareSvg(d.launcher, 0.66, 'rounded'), `${RES}/mipmap-${density}/ic_launcher.png`);
  await png(squareSvg(d.launcher, 0.64, 'circle'), `${RES}/mipmap-${density}/ic_launcher_round.png`);
  // Адаптивная иконка (API 26+): прозрачный передний план в безопасной зоне 66dp из 108dp.
  await png(squareSvg(d.foreground, 0.52, 'none'), `${RES}/mipmap-${density}/ic_launcher_foreground.png`);
  // Сплэш по ориентациям; общий drawable/splash.png (480x320) — запасной вариант.
  const [lw, lh] = d.land;
  const [pw, ph] = d.port;
  await png(splashSvg(lw, lh), `${RES}/drawable-land-${density}/splash.png`);
  await png(splashSvg(pw, ph), `${RES}/drawable-port-${density}/splash.png`);
  if (density === 'mdpi') {
    await png(splashSvg(480, 320), `${RES}/drawable/splash.png`);
  }
}

// Иконка для карточки приложения в Google Play: 512x512 без прозрачности.
await png(squareSvg(512, 0.66, 'rounded'), `${BUILD}/play-icon-512.png`);
await writeFile(
  `${RES}/values/ic_launcher_background.xml`,
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${CREAM.toUpperCase()}</color>
</resources>
`,
);

console.log(`Готово: иконки и сплэши в ${RES}, иконка для Play — ${BUILD}/play-icon-512.png`);
