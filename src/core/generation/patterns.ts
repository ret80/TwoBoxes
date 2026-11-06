/**
 * Паттерновая сборка поля.
 *
 * Ручные уровни эпизода 1 собраны из нескольких повторяющихся форм: комната с
 * колоннами (1-2), гребёнка из коридоров с зубьями (1-4), змейка (1-6),
 * симметричный крест (1-7, 1-10, 1-11), лестница (1-12), альковый лабиринт
 * (1-9). Генератор же выдаёт «площадку с дырками»: короткие случайные стенки в
 * пустом прямоугольнике дают много развилок и почти нет коридоров
 * (коридорность 0.27 против 0.46 у ручных уровней).
 *
 * Здесь эти формы описаны как тайлы с **портами** — клетками пола на границе
 * тайла, к которым приставляется следующий. Сборка: ставим ядро, затем
 * пристыковываем тайлы к случайным свободным портам, поворачивая их так, чтобы
 * их порт смотрел навстречу. Тайлы параметрические (длины и повороты случайны),
 * поэтому формы не заучиваются игроком, но морфология поля остаётся «ручной».
 *
 * Полученная маска отдаётся в существующий конвейер генератора: он всё равно
 * проверяет уровень независимым обходом, так что кривая сборка не может сделать
 * уровень нерешаемым — она просто отбрасывается по числу ходов или тупиков.
 */

/** Направления по часовой стрелке, начиная с «вверх» (ось Y вниз). */
const VECTORS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const OPPOSITE = [2, 3, 0, 1];

export interface Socket {
  x: number;
  y: number;
  dir: number;
}

export interface Tile {
  /** Строки тайла: '.' — пол, '#' — стена, ' ' — пустота. */
  cells: string[];
  sockets: Socket[];
}

export type PatternKind = 'room' | 'corridor' | 'comb' | 'snake' | 'chamber' | 'cross';

const ROOM = '#';
const FLOOR = '.';

/** Сборщик тайла: клетки в координатах сетки плюс отмеченные порты. */
class TileBuilder {
  private cells = new Map<string, string>();
  private sockets: Socket[] = [];

  constructor() {
    this.cells.set('0,0', FLOOR);
  }

  floor(x: number, y: number): this {
    this.cells.set(`${x},${y}`, FLOOR);
    return this;
  }

  /** Стена внутри тайла: колонна в комнате или разделитель. */
  wall(x: number, y: number): this {
    this.cells.set(`${x},${y}`, ROOM);
    return this;
  }

  socket(x: number, y: number, dir: number): this {
    this.floor(x, y);
    this.sockets.push({ x, y, dir });
    return this;
  }

  /** Проложить коридор с текущей клетки; возвращает конец и направление шага. */
  walk(x: number, y: number, dir: number, length: number): { x: number; y: number } {
    const [dx, dy] = VECTORS[dir];
    for (let i = 0; i < length; i++) {
      x += dx;
      y += dy;
      this.floor(x, y);
    }
    return { x, y };
  }

  build(): Tile {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const key of this.cells.keys()) {
      const [x, y] = key.split(',').map(Number);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const cells = Array.from({ length: height }, () => Array.from({ length: width }, () => ' '));
    for (const [key, ch] of this.cells) {
      const [x, y] = key.split(',').map(Number);
      cells[y - minY][x - minX] = ch;
    }

    return {
      cells: cells.map((row) => row.join('')),
      sockets: this.sockets.map((s) => ({ x: s.x - minX, y: s.y - minY, dir: s.dir })),
    };
  }
}

const randInt = (rng: () => number, min: number, max: number): number =>
  min + Math.floor(rng() * (max - min + 1));

/** Комната с колоннами: открытая площадка и один-два столба внутри. */
function room(rng: () => number): Tile {
  const width = randInt(rng, 4, 6);
  const height = randInt(rng, 4, 6);
  const b = new TileBuilder();

  // Прямоугольник пола: центральная клетка (0,0) уже заложена.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) b.floor(x, y);
  }
  // Колонны не на границе, чтобы не перекрыть порты по бокам.
  const pillars = randInt(rng, 0, 2);
  for (let i = 0; i < pillars; i++) {
    b.wall(randInt(rng, 1, width - 2), randInt(rng, 1, height - 2));
  }

  const midY = Math.floor(height / 2);
  const sockets = randInt(rng, 1, 2);
  b.socket(0, midY, 3);
  if (sockets === 2) b.socket(width - 1, midY, 1);
  return b.build();
}

/** Прямой коридор или Г-образный поворот. */
function corridor(rng: () => number): Tile {
  const b = new TileBuilder();
  const length = randInt(rng, 2, 4);
  if (rng() < 0.5) {
    b.socket(0, 0, 3);
    const end = b.walk(0, 0, 1, length);
    b.socket(end.x, end.y, 1);
  } else {
    // Г-образный поворот: порт сверху, поворот вправо или влево.
    b.socket(0, 0, 0);
    let cur = b.walk(0, 0, 2, randInt(rng, 1, length));
    const turn = rng() < 0.5 ? 1 : 3;
    cur = b.walk(cur.x, cur.y, turn, randInt(rng, 1, 3));
    b.socket(cur.x, cur.y, turn);
  }
  return b.build();
}

/** Гребёнка: коридор-хребет с короткими зубьями-карманами по бокам. */
function comb(rng: () => number): Tile {
  const b = new TileBuilder();
  const length = randInt(rng, 3, 6);
  const stubLen = randInt(rng, 1, 2);
  const side = rng() < 0.5 ? 0 : 2;

  b.socket(0, 0, 3);
  for (let x = 1; x <= length; x++) {
    b.floor(x, 0);
    // Зубья не на последней клетке: там будет порт.
    if (x < length && x % 2 === 1) {
      for (let k = 1; k <= stubLen; k++) b.floor(x, side === 0 ? -k : k);
    }
  }
  b.socket(length, 0, 1);
  return b.build();
}

/** Змейка: коридор, сложенный в S, с выходами слева и справа. */
function snake(rng: () => number): Tile {
  const b = new TileBuilder();
  const width = randInt(rng, 3, 5);
  const depth = randInt(rng, 2, 3);
  const back = randInt(rng, 1, width - 1);

  b.socket(0, 0, 3);
  let cur = { x: 0, y: 0 };
  cur = b.walk(cur.x, cur.y, 1, width);
  cur = b.walk(cur.x, cur.y, 2, depth);
  cur = b.walk(cur.x, cur.y, 3, back);
  cur = b.walk(cur.x, cur.y, 2, depth);
  cur = b.walk(cur.x, cur.y, 1, randInt(rng, 1, width));
  b.socket(cur.x, cur.y, 1);
  return b.build();
}

/** Карман: короткий вход и камера на конце — «остановка» посреди поля. */
function chamber(rng: () => number): Tile {
  const b = new TileBuilder();
  b.socket(0, 0, 3);
  const cur = b.walk(0, 0, 1, randInt(rng, 1, 3));
  const w = randInt(rng, 2, 3);
  const h = randInt(rng, 2, 3);
  for (let y = -1; y < h - 1; y++) {
    for (let x = 0; x < w; x++) b.floor(cur.x + x, cur.y + y);
  }
  return b.build();
}

/** Крест: перекрёсток с четырьмя выходами — ядро симметричных уровней. */
function cross(rng: () => number): Tile {
  const b = new TileBuilder();
  const arm = randInt(rng, 1, 3);
  b.socket(0, 0, 0);
  const down = b.walk(0, 0, 2, arm);
  b.socket(down.x, down.y, 2);
  const right = b.walk(0, 0, 1, arm);
  b.socket(right.x, right.y, 1);
  const left = b.walk(0, 0, 3, arm);
  b.socket(left.x, left.y, 3);
  return b.build();
}

/** Построить тайл нужного вида (размеры и повороты внутри — по rng). */
export function buildPattern(kind: PatternKind, rng: () => number): Tile {
  switch (kind) {
    case 'room':
      return room(rng);
    case 'corridor':
      return corridor(rng);
    case 'comb':
      return comb(rng);
    case 'snake':
      return snake(rng);
    case 'chamber':
      return chamber(rng);
    case 'cross':
      return cross(rng);
  }
}

/** Поворот тайла на 90° по часовой стрелке. */
export function rotateTile(tile: Tile): Tile {
  const height = tile.cells.length;
  const width = tile.cells[0].length;
  const cells = Array.from({ length: width }, (_, y) =>
    Array.from({ length: height }, (_, x) => tile.cells[height - 1 - x][y]).join(''),
  );
  return {
    cells,
    sockets: tile.sockets.map((s) => ({ x: height - 1 - s.y, y: s.x, dir: (s.dir + 1) % 4 })),
  };
}

export interface AssembleOptions {
  /** Сторона холста сборки. */
  size: number;
  /** Потолок клеток пола: поле не должно разрастаться. */
  budget: number;
  /** Из каких паттернов собирать. */
  patterns: PatternKind[];
  rng: () => number;
  /** Сколько тайлов максимум приставить к ядру. */
  maxTiles?: number;
}

export interface AssembledField {
  /** Маска пола: 1 — пол, 0 — стена. С краёв добавлена рамка стен. */
  mask: Uint8Array;
  size: number;
  /** Сколько тайлов реально вошло в сборку. */
  tiles: number;
}

/**
 * Собрать поле из паттернов. Возвращает null, если собрать связное поле
 * нужного размера не удалось (тогда генератор пробует другой сид).
 */
export function assembleField(options: AssembleOptions): AssembledField | null {
  const { size, budget, patterns, rng } = options;
  const maxTiles = options.maxTiles ?? Math.max(2, Math.min(6, Math.round(size / 2.5)));
  if (patterns.length === 0) return null;

  const canvas: string[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ' '),
  );
  let floorCount = 0;
  let tilesPlaced = 0;

  /** Попытка положить тайл: клетки не должны конфликтовать с уже занятыми. */
  const place = (tile: Tile, originX: number, originY: number): boolean => {
    let added = 0;
    for (let y = 0; y < tile.cells.length; y++) {
      for (let x = 0; x < tile.cells[y].length; x++) {
        const ch = tile.cells[y][x];
        if (ch === ' ') continue;
        const cx = originX + x;
        const cy = originY + y;
        if (cx < 0 || cy < 0 || cx >= size || cy >= size) return false;
        const existing = canvas[cy][cx];
        if (existing !== ' ' && existing !== ch) return false;
        if (ch === FLOOR && existing === ' ') added++;
      }
    }
    if (floorCount + added > budget) return false;

    for (let y = 0; y < tile.cells.length; y++) {
      for (let x = 0; x < tile.cells[y].length; x++) {
        const ch = tile.cells[y][x];
        if (ch === ' ') continue;
        canvas[originY + y][originX + x] = ch;
      }
    }
    floorCount += added;
    tilesPlaced++;
    return true;
  };

  /** Абсолютные позиции всех портов уже положенных тайлов. */
  const sockets: Socket[] = [];
  const addSockets = (tile: Tile, originX: number, originY: number): void => {
    for (const s of tile.sockets) sockets.push({ x: originX + s.x, y: originY + s.y, dir: s.dir });
  };

  // Ядро: комната или крест, если они разрешены для этого уровня.
  const seedKind: PatternKind = patterns.includes('cross') && rng() < 0.4 ? 'cross' : 'room';
  const seedTile = buildPattern(patterns.includes(seedKind) ? seedKind : patterns[0], rng);
  const seedX = Math.floor((size - seedTile.cells[0].length) / 2);
  const seedY = Math.floor((size - seedTile.cells.length) / 2);
  if (!place(seedTile, seedX, seedY)) return null;
  addSockets(seedTile, seedX, seedY);

  const shuffle = <T>(items: T[]): T[] => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  };

  let attempts = 0;
  while (tilesPlaced < maxTiles && attempts < 80) {
    attempts++;
    // Порт свободен, если клетка за ним ещё пуста и сам порт — всё ещё пол.
    const open = sockets.filter((s) => {
      const [dx, dy] = VECTORS[s.dir];
      const nx = s.x + dx;
      const ny = s.y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) return false;
      return canvas[ny][nx] === ' ' && canvas[s.y][s.x] === FLOOR;
    });
    if (open.length === 0) break;
    shuffle(open);
    const target = open[0];
    const [dx, dy] = VECTORS[target.dir];
    const anchorX = target.x + dx;
    const anchorY = target.y + dy;

    // Тайл должен прийти портом навстречу: dir = OPPOSITE[target.dir].
    const kind = patterns[Math.floor(rng() * patterns.length)];
    let tile = buildPattern(kind, rng);
    let rotated = false;
    for (let turn = 0; turn < 4 && !rotated; turn++) {
      for (const socket of tile.sockets) {
        if (socket.dir !== OPPOSITE[target.dir]) continue;
        const originX = anchorX - socket.x;
        const originY = anchorY - socket.y;
        if (place(tile, originX, originY)) {
          addSockets(tile, originX, originY);
          rotated = true;
          break;
        }
      }
      if (!rotated) tile = rotateTile(tile);
    }
  }

  if (floorCount < Math.min(budget, 24)) return null;

  // Оставляем крупнейшую связную область пола: случайное наложение тайлов
  // иногда замыкает коридор в изолированную петлю.
  const seen = new Uint8Array(size * size);
  let best: number[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (canvas[y][x] !== FLOOR || seen[y * size + x]) continue;
      const component: number[] = [];
      const stack = [y * size + x];
      seen[y * size + x] = 1;
      while (stack.length) {
        const cell = stack.pop() as number;
        component.push(cell);
        const cx = cell % size;
        const cy = Math.floor(cell / size);
        for (const [vx, vy] of VECTORS) {
          const nx = cx + vx;
          const ny = cy + vy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const ni = ny * size + nx;
          if (canvas[ny][nx] !== FLOOR || seen[ni]) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
      if (component.length > best.length) best = component;
    }
  }
  if (best.length < Math.min(budget, 20)) return null;

  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;
  for (const cell of best) {
    const x = cell % size;
    const y = Math.floor(cell / size);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  // Рамка стен: генератор ищет старты внутри поля, не проверяя границы,
  // а маска должна остаться квадратной — по ней считаются индексы.
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const side = Math.max(width, height) + 2;
  const mask = new Uint8Array(side * side);
  const offsetX = Math.floor((side - width) / 2);
  const offsetY = Math.floor((side - height) / 2);
  for (const cell of best) {
    const x = (cell % size) - minX + offsetX;
    const y = Math.floor(cell / size) - minY + offsetY;
    mask[y * side + x] = 1;
  }

  return { mask, size: side, tiles: tilesPlaced };
}
