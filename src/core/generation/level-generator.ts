import { DIRS, Position } from '../types/position';
import { createLevelFromData } from '../rules/create';
import { findShortestSolution, solveLevel } from './solver';

/**
 * Генератор уровней для эпизода 2 — переработанный прототип
 * `script/game/levels/gen/generate_lvl*.gd` из Godot-версии.
 *
 * Идея прототипа сохранена: уровень строится «от решения» — выбираются
 * случайные старты, затем кубики серией случайных ходов доводятся до финиша,
 * а цели ставятся в конечные позиции. В отличие от прототипа:
 * - ходы считаются по точным правилам игры (все кубики скользят до упора,
 *   ведущий первым), поэтому записанная последовательность действительно
 *   проходит уровень;
 * - поле — комната со случайными внутренними стенками, а не пустой квадрат,
 *   поэтому уровни компактнее, а цели появляются и внутри поля;
 * - каждый кандидат проверяется полным обходом пространства состояний:
 *   решение ищется независимо от того пути, которым шёл генератор;
 * - уровни с тупиками отбрасываются: из любого достижимого состояния
 *   всё ещё можно дойти до победы, поэтому игрок не запрётся навсегда.
 *
 * Генерация детерминирована сидом: эпизод одинаков между перезагрузками,
 * поэтому сохранения и подсказки остаются стабильными.
 */

export interface GeneratedLevel {
  rows: string[];
  /** Проверенная последовательность ходов от стартов до целей. */
  solution: Position[];
}

export interface GenerateLevelOptions {
  seed: number;
  /** Сколько ходов должно быть в решении. */
  moves: number;
  /** Сторона квадратного поля (включая стены по краям). */
  size?: number;
}

const OPPOSITE: Record<string, string> = {
  '0,-1': '0,1',
  '0,1': '0,-1',
  '-1,0': '1,0',
  '1,0': '-1,0',
};

const key = (pos: Position): string => `${pos.x},${pos.y}`;
const boxesKey = (boxes: Position[]): string => boxes.map(key).join('|');

/** Быстрый детерминированный ГПСЧ (mulberry32). */
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

const NEIGHBORS_8: readonly Position[] = [
  new Position(-1, -1),
  new Position(0, -1),
  new Position(1, -1),
  new Position(-1, 0),
  new Position(1, 0),
  new Position(-1, 1),
  new Position(0, 1),
  new Position(1, 1),
];

/**
 * Случайное поле: комната со стенами по краям и несколькими короткими
 * внутренними стенками. В отличие от пустого прямоугольника, такие стенки
 * дают кубикам промежуточные упоры — цели получаются не только по периметру.
 * Возвращает маску пола (1 — пол, 0 — стена).
 */
function createField(size: number, rng: () => number): Uint8Array | null {
  const floor = new Uint8Array(size * size);
  floor.fill(1);

  for (let i = 0; i < size; i++) {
    floor[i] = 0;
    floor[(size - 1) * size + i] = 0;
    floor[i * size] = 0;
    floor[i * size + size - 1] = 0;
  }

  const segments = 5 + Math.floor(rng() * 4);
  for (let s = 0; s < segments; s++) {
    const horizontal = rng() < 0.5;
    const length = 2 + Math.floor(rng() * 3);
    if (horizontal) {
      const x = 1 + Math.floor(rng() * (size - 1 - length));
      const y = 1 + Math.floor(rng() * (size - 2));
      for (let i = 0; i < length; i++) floor[y * size + x + i] = 0;
    } else {
      const y = 1 + Math.floor(rng() * (size - 1 - length));
      const x = 1 + Math.floor(rng() * (size - 2));
      for (let i = 0; i < length; i++) floor[(y + i) * size + x] = 0;
    }
  }

  // Оставляем только самую большую связную область: иначе стенки могут
  // разрезать поле на независимые комнаты и уровень выглядит сломанным.
  const seen = new Uint8Array(size * size);
  let best: number[] = [];
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const start = y * size + x;
      if (!floor[start] || seen[start]) continue;
      const component: number[] = [];
      const stack = [start];
      seen[start] = 1;
      while (stack.length) {
        const cell = stack.pop() as number;
        component.push(cell);
        const cx = cell % size;
        const cy = Math.floor(cell / size);
        for (const dir of [DIRS.up, DIRS.down, DIRS.left, DIRS.right]) {
          const nx = cx + dir.x;
          const ny = cy + dir.y;
          if (nx < 1 || nx >= size - 1 || ny < 1 || ny >= size - 1) continue;
          const ni = ny * size + nx;
          if (!floor[ni] || seen[ni]) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
      if (component.length > best.length) best = component;
    }
  }

  if (best.length < 30) return null;
  const field = new Uint8Array(size * size);
  for (const cell of best) field[cell] = 1;
  return field;
}

/**
 * Один ход по точным правилам `moveBoxes`: все кубики скользят до упора,
 * ведущий (большая проекция на направление) движется первым.
 * Возвращает новые позиции либо null, если никто не сдвинулся.
 */
function slide(
  floor: Uint8Array,
  size: number,
  boxes: Position[],
  dir: Position,
): Position[] | null {
  const result = boxes.map((b) => b.clone());
  let moved = false;

  const order = [0, 1].sort((a, b) => {
    const pa = result[a].x * dir.x + result[a].y * dir.y;
    const pb = result[b].x * dir.x + result[b].y * dir.y;
    return pb - pa;
  });

  for (const index of order) {
    let cur = result[index];
    for (;;) {
      const next = cur.add(dir);
      if (next.x < 0 || next.y < 0 || next.x >= size || next.y >= size) break;
      if (!floor[next.y * size + next.x]) break;
      const other = result[1 - index];
      if (other.equals(next)) break;
      cur = next;
      moved = true;
    }
    result[index] = cur;
  }

  return moved ? result : null;
}

function adjacentToFloor(
  floor: Uint8Array,
  size: number,
  x: number,
  y: number,
): boolean {
  for (const d of NEIGHBORS_8) {
    const nx = x + d.x;
    const ny = y + d.y;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
    if (floor[ny * size + nx]) return true;
  }
  return false;
}

function render(floor: Uint8Array, size: number, starts: Position[], ends: Position[]): string[] {
  const grid: string[][] = [];
  for (let y = 0; y < size; y++) {
    const row: string[] = [];
    for (let x = 0; x < size; x++) {
      const isFloor = floor[y * size + x] === 1;
      row.push(isFloor ? '.' : adjacentToFloor(floor, size, x, y) ? '#' : ' ');
    }
    grid.push(row);
  }

  const put = (pos: Position, ch: string): void => {
    grid[pos.y][pos.x] = ch;
  };
  ends.forEach((pos, i) => put(pos, i === 0 ? 'r' : 'y'));
  starts.forEach((pos, i) => put(pos, i === 0 ? 'R' : 'Y'));

  // Обрезаем пустые края: поле компактное, как в ручных уровнях.
  const filled: boolean[] = grid.map((row) => row.some((c) => c !== ' '));
  const top = filled.indexOf(true);
  let bottom = filled.length - 1;
  while (bottom > top && !filled[bottom]) bottom--;

  let left = size;
  let right = -1;
  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < size; x++) {
      if (grid[y][x] === ' ') continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }

  return grid.slice(top, bottom + 1).map((row) => row.slice(left, right + 1).join(''));
}

function parse(rows: string[]) {
  return createLevelFromData(0, 0, rows);
}

/**
 * Сгенерировать один уровень. Возвращает null, если за отведённое число
 * попыток не удалось получить корректную карту.
 */
export function generateLevel(options: GenerateLevelOptions): GeneratedLevel | null {
  const size = options.size ?? 10;
  if (size < 7 || options.moves < 2) return null;
  // Путь генератора длиннее целевого решения: после проверки BFS лишние
  // циклы отбрасываются, а оставшаяся длина должна совпасть с заявленной.
  const walkMoves = options.moves + 2;

  for (let attempt = 0; attempt < 400; attempt++) {
    const rng = createRng(options.seed + attempt * 7919);
    const floor = createField(size, rng);
    if (!floor) continue;

    const free: Position[] = [];
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        if (floor[y * size + x]) free.push(new Position(x, y));
      }
    }
    if (free.length < 4) continue;
    shuffle(free, rng);

    const starts = [free[0].clone(), free[1].clone()];
    if (starts[0].equals(starts[1])) continue;
    if (Math.abs(starts[0].x - starts[1].x) + Math.abs(starts[0].y - starts[1].y) < 2) {
      continue;
    }

    let boxes = starts.map((p) => p.clone());
    const solution: Position[] = [];
    const visited = new Set<string>([boxesKey(boxes)]);
    let last: Position | null = null;

    for (let step = 0; step < walkMoves; step++) {
      const candidates: { dir: Position; next: Position[]; distance: number }[] = [];
      for (const dir of [DIRS.up, DIRS.down, DIRS.left, DIRS.right]) {
        if (last) {
          if (key(dir) === key(last)) continue;
          if (key(dir) === OPPOSITE[key(last)]) continue;
        }
        const next = slide(floor, size, boxes, dir);
        if (!next || visited.has(boxesKey(next))) continue;
        let distance = 0;
        next.forEach((p, i) => {
          distance += Math.abs(p.x - boxes[i].x) + Math.abs(p.y - boxes[i].y);
        });
        candidates.push({ dir, next, distance });
      }

      // Если все направления исключены — разрешаем повтор, но не разворот.
      if (candidates.length === 0 && last) {
        for (const dir of [DIRS.up, DIRS.down, DIRS.left, DIRS.right]) {
          if (key(dir) === OPPOSITE[key(last)]) continue;
          const next = slide(floor, size, boxes, dir);
          if (!next || visited.has(boxesKey(next))) continue;
          let distance = 0;
          next.forEach((p, i) => {
            distance += Math.abs(p.x - boxes[i].x) + Math.abs(p.y - boxes[i].y);
          });
          candidates.push({ dir, next, distance });
        }
      }
      if (candidates.length === 0) break;

      candidates.sort((a, b) => b.distance - a.distance);
      const pick = candidates[Math.floor(rng() * Math.min(3, candidates.length))];
      boxes = pick.next;
      visited.add(boxesKey(boxes));
      last = pick.dir;
      solution.push(pick.dir);
    }

    if (solution.length !== walkMoves) continue;
    if (boxes[0].equals(boxes[1])) continue;

    const ends = boxes.map((p) => p.clone());
    const all = [...starts, ...ends];
    // Старты и цели не должны делить клетку: иначе маркеры перекроются.
    if (new Set(all.map(key)).size !== all.length) continue;

    const rows = render(floor, size, starts, ends);
    const level = parse(rows);
    if (level.boxes.length !== 2 || level.ends.length !== 2) continue;

    // Сначала дешёвый BFS с ранним выходом: полный анализ нужен только
    // кандидатам, у которых уже совпала заявленная сложность.
    const shortest = findShortestSolution(level);
    if (!shortest || shortest.length < options.moves || shortest.length > options.moves + 2) {
      continue;
    }

    const solved = solveLevel(level);
    if (!solved) continue;
    // Кратчайшее решение, найденное независимо от пути генерации, должно
    // попадать в заявленный диапазон — без «лишних» ходов-циклов.
    if (solved.solution.length < options.moves || solved.solution.length > options.moves + 2) {
      continue;
    }
    // Оба кубика реально участвуют в решении.
    if (solved.movesByBox[0] < 2 || solved.movesByBox[1] < 2) continue;
    // Из любого достижимого состояния должен оставаться путь к победе.
    if (solved.deadEnds !== 0) continue;

    return { rows, solution: solved.solution };
  }

  return null;
}

/**
 * Сгенерировать эпизод: сложность растёт по числу ходов и размеру поля.
 * Сид фиксирован, поэтому эпизод детерминирован.
 */
export function generateEpisode(seed: number, count: number): string[][] {
  const levels: string[][] = [];
  for (let i = 0; i < count; i++) {
    const moves = 5 + Math.floor(i / 2);
    const size = 9 + Math.min(2, Math.floor(i / 4));
    let generated: GeneratedLevel | null = null;
    for (let attempt = 0; attempt < 200 && !generated; attempt++) {
      generated = generateLevel({
        seed: seed + i * 104729 + attempt * 15485863,
        moves,
        size,
      });
    }
    if (!generated) {
      throw new Error(`Не удалось сгенерировать уровень ${i + 1} (${moves} ходов, ${size}×${size})`);
    }
    levels.push(generated.rows);
  }
  return levels;
}
