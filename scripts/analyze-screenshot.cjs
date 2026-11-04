/* Анализ скриншота: распределение цветов по горизонтальным полосам
   (проверка ориентации камеры и полноты сборки поля). */
const fs = require('fs');
const { PNG } = require('pngjs');

const file = process.argv[2] || 'screenshots/fix-menu.png';
const png = PNG.sync.read(fs.readFileSync(file));
const { width, height, data } = png;
const at = (x, y) => {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
};

function classify([r, g, b]) {
  if (Math.abs(r - 199) < 25 && Math.abs(g - 199) < 25 && Math.abs(b - 199) < 25) return 'bg';
  if (r > 200 && g < 80 && b < 80) return 'red';
  if (r > 160 && g > 150 && b < 90) return 'yellow';
  if (Math.abs(r - 28) < 30 && Math.abs(g - 68) < 30 && Math.abs(b - 102) < 35) return 'floor';
  if (Math.abs(r - 44) < 30 && Math.abs(g - 107) < 35 && Math.abs(b - 160) < 35) return 'wall';
  return 'other';
}

const bands = 8;
for (let b = 0; b < bands; b++) {
  const y0 = Math.floor((b * height) / bands);
  const y1 = Math.floor(((b + 1) * height) / bands);
  const counts = { bg: 0, floor: 0, wall: 0, red: 0, yellow: 0, other: 0 };
  for (let y = y0; y < y1; y += 2) {
    for (let x = 0; x < width; x += 2) counts[classify(at(x, y))]++;
  }
  console.log(`band ${b} y${y0}-${y1}:`, JSON.stringify(counts));
}
