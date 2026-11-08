import { DIRS, Position } from '../types/position';
import { CellType } from '../types/cell';
import { ColorType } from '../types/color';
import { createLevelFromData } from '../rules/create';
import { moveBoxes } from '../rules/move';
import { createMechanicState, type MechanicState } from '../types/mechanic-state';
import type { Box } from '../types/entity';
import { findShortestSolution, solveLevel } from './solver';
import { scoreDifficulty } from './difficulty';
import { assembleField, type PatternKind } from './patterns';
import {
  mechanicChar,
  resolveMechanics,
  type FieldDraft,
  type MechanicId,
  type MechanicModule,
} from './mechanics';

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
 * Сложность задаётся профилем (см. `episodeProfiles`): длина решения, доля
 * разрешённых тупиков, размер поля и набор паттернов. Поле можно собирать из
 * паттернов эпизода 1 (`patterns.ts`) — тогда у уровня появляются коридоры и
 * карманы, как в ручных картах, — или простыми случайными стенками, как раньше.
 * Из нескольких подходящих кандидатов выбирается тот, чья оценка сложности
 * (`difficulty.ts`) ближе к цели профиля.
 *
 * Генерация детерминирована сидом: эпизод одинаков между перезагрузками,
 * поэтому сохранения и подсказки остаются стабильными.
 */

export interface GeneratedLevel {
  rows: string[];
  /** Проверенная последовательность ходов от стартов до целей. */
  solution: Position[];
  /** Оценка сложности 0..100 (см. `difficulty.ts`). */
  score: number;
  /** Доля достижимых состояний, из которых победа недостижима. */
  deadEndRatio: number;
  /** Механики, которые реально встречаются в решении. */
  mechanics: MechanicId[];
}

export interface GenerateLevelOptions {
  seed: number;
  /** Сколько ходов должно быть в решении. */
  moves: number;
  /** Сторона квадратного поля (включая стены по краям). */
  size?: number;
  /** Допустимая доля тупиков: 0 — уровень прощает любую ошибку. */
  deadEnds?: number;
  /** Требуемая доля тупиков: поздние уровни должны наказывать за ошибку. */
  minDeadEnds?: number;
  /** Паттерны поля; пусто — случайные стенки в комнате, как раньше. */
  patterns?: PatternKind[];
  /** Потолок клеток пола при паттерновой сборке. */
  budget?: number;
  /** Целевая оценка сложности: из кандидатов выбирается ближайший. */
  score?: number;
  /**
   * Допуск к целевой оценке: кандидат вне полосы `score ± tolerance` не
   * принимается. Без допуска берётся просто ближайший из нескольких, и
   * соседние уровни эпизода иногда меняются сложностью местами.
   */
  scoreTolerance?: number;
  /** Верхняя граница длины решения (по умолчанию `moves + 3`). */
  maxMoves?: number;
  /** Сколько подходящих кандидатов сравнивать (по умолчанию 1). */
  candidates?: number;
  /** Подключённые механики; пусто — классический уровень. */
  mechanics?: MechanicId[];
}

const OPPOSITE: Record<string, string> = {
  '0,-1': '0,1',
  '0,1': '0,-1',
  '-1,0': '1,0',
  '1,0': '-1,0',
};

const key = (pos: Position): string => `${pos.x},${pos.y}`;
const boxesKey = (boxes: Box[]): string => boxes.map((box) => key(box.pos)).join('|');
const walkKey = (boxes: Box[], state: MechanicState): string =>
  `${boxesKey(boxes)}#${state.locks.join(',')}#${state.rotorFlip ? 1 : 0}`;

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

/**
 * Перемешать сид с номером попытки. Без этого попытки шли арифметической
 * прогрессией (`seed + attempt * 7919`), и разные стартовые сиды попадали в ту
 * же самую последовательность — то есть разные уровни получали одинаковые карты.
 */
function mixSeed(seed: number, attempt: number, salt: number): number {
  // Каждый вход смешивается и прибавляется отдельно. Простое `h ^ number`
  // склеивает пары: (сид 1, попытка 3) и (сид 2, попытка 0) дают одно число.
  let h = (seed >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = (h + Math.imul(attempt | 0, 0x27d4eb2d)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h + Math.imul(salt | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
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

function render(
  floor: Uint8Array,
  size: number,
  starts: Position[],
  ends: Position[],
  cells: Map<number, CellType>,
): string[] {
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
  // Сначала механики, затем старты/цели: сущности всегда главнее фона.
  for (const [index, cell] of cells) {
    const ch = mechanicChar(cell);
    if (!ch) continue;
    put(new Position(index % size, Math.floor(index / size)), ch);
  }
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
 * Пройти кратчайшее решение и вернуть механики, клетки которых кубики
 * действительно задели. Проверка нужна, чтобы отбросить уровни, где портал
 * или ловушка стоят в стороне от маршрута.
 */
function mechanicsInSolution(
  level: ReturnType<typeof parse>,
  solution: Position[],
  modules: MechanicModule[],
): MechanicModule[] {
  if (modules.length === 0) return [];
  const used = new Set<MechanicId>();
  let boxes: Box[] = level.boxes.map((box) => ({
    pos: box.pos.clone(),
    color: box.color,
  }));
  let state = createMechanicState(boxes.length);

  for (const dir of solution) {
    const next = moveBoxes(level, boxes, dir, 0, 0, state);
    if (!next) break;
    for (const path of next.paths ?? []) {
      for (const point of path) {
        const cell = level.grid.get(point.pos);
        for (const module of modules) {
          if (module.owns(cell)) used.add(module.id);
        }
      }
    }
    boxes = next.boxes;
    state = next.mechanicState ?? state;
  }

  return modules.filter((module) => used.has(module.id));
}

/**
 * Сгенерировать один уровень. Возвращает null, если за отведённое число
 * попыток не удалось получить корректную карту.
 */
export function generateLevel(options: GenerateLevelOptions): GeneratedLevel | null {
  const size = options.size ?? 10;
  if (size < 7 || options.moves < 2) return null;
  // Путь генератора длиннее целевого решения: запас даёт BFS место найти
  // короткие обходы, иначе узкий диапазон отбраковывает почти всё.
  const maxMoves = Math.max(options.moves, options.maxMoves ?? options.moves + 3);
  const walkMoves = maxMoves + 1;
  const allowedDeadEnds = options.deadEnds ?? 0;
  const targetCandidates = Math.max(1, options.candidates ?? 1);
  const patterns = options.patterns ?? [];
  const modules = resolveMechanics(options.mechanics ?? []);
  const accepted: GeneratedLevel[] = [];

  for (let attempt = 0; attempt < 400; attempt++) {
    const rng = createRng(mixSeed(options.seed, attempt, 0x51ed));
    // Поле либо собирается из паттернов (коридоры, комнаты, карманы), либо
    // остаётся прежней комнатой со случайными стенками.
    let floor: Uint8Array | null;
    let side = size;
    if (patterns.length > 0) {
      const assembled = assembleField({
        size,
        budget: options.budget ?? Math.round(size * size * 0.55),
        patterns,
        rng,
      });
      floor = assembled?.mask ?? null;
      side = assembled?.size ?? size;
    } else {
      floor = createField(size, rng);
    }
    if (!floor) continue;

    // Механики раскладываются до выбора стартов: старт не должен стоять на
    // портале, ловушке или ротаторе. Порядок модулей — это и есть пайплайн.
    const draft: FieldDraft = { size: side, floor, cells: new Map() };
    let placed = true;
    for (const module of modules) {
      if (!module.place(draft, rng)) {
        placed = false;
        break;
      }
    }
    if (!placed) continue;

    const free: Position[] = [];
    for (let y = 1; y < side - 1; y++) {
      for (let x = 1; x < side - 1; x++) {
        const index = y * side + x;
        if (floor[index] && !draft.cells.has(index)) free.push(new Position(x, y));
      }
    }
    if (free.length < 4) continue;
    shuffle(free, rng);

    const starts = [free[0].clone(), free[1].clone()];
    if (starts[0].equals(starts[1])) continue;
    if (Math.abs(starts[0].x - starts[1].x) + Math.abs(starts[0].y - starts[1].y) < 2) {
      continue;
    }

    // Пробный уровень: старты уже стоят на карте, целей пока нет. Дальше
    // ходы считает настоящий `moveBoxes`, поэтому разметка механик и путь
    // генератора не могут разойтись с игрой.
    const walkLevel = parse(render(floor, side, starts, [], draft.cells));
    let boxes: Box[] = starts.map((pos, i) => ({
      pos,
      color: i === 0 ? ColorType.ONE : ColorType.TWO,
    }));
    let mechanicState = createMechanicState(boxes.length);
    const solution: Position[] = [];
    const visited = new Set<string>([walkKey(boxes, mechanicState)]);
    let last: Position | null = null;

    const candidatesFor = (allowRepeat: boolean) => {
      const result: { dir: Position; next: ReturnType<typeof moveBoxes>; distance: number }[] = [];
      for (const dir of [DIRS.up, DIRS.down, DIRS.left, DIRS.right]) {
        if (last && !allowRepeat && key(dir) === key(last)) continue;
        if (last && key(dir) === OPPOSITE[key(last)]) continue;
        const next = moveBoxes(walkLevel, boxes, dir, 0, 0, mechanicState);
        if (!next) continue;
        // Ход-пропуск из-за ловушки не двигает кубики: путь не строим.
        const moved = next.paths?.some((path) => path.length > 1) ?? false;
        if (!moved) continue;
        if (visited.has(walkKey(next.boxes, next.mechanicState ?? mechanicState))) continue;
        let distance = 0;
        next.boxes.forEach((box, i) => {
          distance += Math.abs(box.pos.x - boxes[i].pos.x) + Math.abs(box.pos.y - boxes[i].pos.y);
        });
        result.push({ dir, next, distance });
      }
      return result;
    };

    for (let step = 0; step < walkMoves; step++) {
      let candidates = candidatesFor(false);
      // Если все направления исключены — разрешаем повтор, но не разворот.
      if (candidates.length === 0 && last) candidates = candidatesFor(true);
      if (candidates.length === 0) break;

      candidates.sort((a, b) => b.distance - a.distance);
      const found = candidates[Math.floor(rng() * Math.min(3, candidates.length))];
      boxes = found.next!.boxes;
      mechanicState = found.next!.mechanicState ?? mechanicState;
      visited.add(walkKey(boxes, mechanicState));
      last = found.dir;
      solution.push(found.dir);
    }

    if (solution.length !== walkMoves) continue;
    if (boxes[0].pos.equals(boxes[1].pos)) continue;

    const ends = boxes.map((box) => box.pos.clone());
    const all = [...starts, ...ends];
    // Старты и цели не должны делить клетку: иначе маркеры перекроются.
    if (new Set(all.map(key)).size !== all.length) continue;
    // Цель не должна стоять на клетке механики: иначе маркер цели затрёт
    // портал/ротатор и выбранная механика исчезнет из готового уровня.
    if (ends.some((end) => draft.cells.has(end.y * side + end.x))) continue;

    const rows = render(floor, side, starts, ends, draft.cells);
    const level = parse(rows);
    if (level.boxes.length !== 2 || level.ends.length !== 2) continue;

    // Сначала дешёвый BFS с ранним выходом: полный анализ нужен только
    // кандидатам, у которых уже совпала заявленная сложность.
    const shortest = findShortestSolution(level);
    if (!shortest || shortest.length < options.moves || shortest.length > maxMoves) {
      continue;
    }

    const solved = solveLevel(level);
    if (!solved) continue;
    // Кратчайшее решение, найденное независимо от пути генерации, должно
    // попадать в заявленный диапазон — без «лишних» ходов-циклов.
    if (solved.solution.length < options.moves || solved.solution.length > maxMoves) {
      continue;
    }
    // Оба кубика реально участвуют в решении.
    if (solved.movesByBox[0] < 2 || solved.movesByBox[1] < 2) continue;
    // Тупики разрешены только в пределах квоты профиля: ранние уровни эпизода
    // должны прощать ошибку, поздние — наказывать за неё.
    const deadEndRatio = solved.states > 0 ? solved.deadEnds / solved.states : 0;
    if (deadEndRatio > allowedDeadEnds) continue;
    if (deadEndRatio < (options.minDeadEnds ?? 0)) continue;

    // Каждая выбранная механика должна встречаться в кратчайшем решении:
    // иначе уровень формально содержит портал, но играет как классический.
    const used = mechanicsInSolution(level, solved.solution, modules);
    if (modules.length > 0 && used.length < modules.length) continue;

    const score = scoreDifficulty({
      moves: solved.solution.length,
      states: solved.states,
      deadEndRatio,
      branching: solved.branching,
    });
    // Допуск к цели: без него ближайший кандидат может оказаться на 10–15
    // пунктов мимо, и порядок уровней в эпизоде перестаёт быть возрастающим.
    if (options.score !== undefined && options.scoreTolerance !== undefined) {
      if (Math.abs(score - options.score) > options.scoreTolerance) continue;
    }

    accepted.push({
      rows,
      solution: solved.solution,
      score,
      deadEndRatio,
      mechanics: used.map((mechanic) => mechanic.id),
    });
    if (accepted.length >= targetCandidates) break;
  }

  if (accepted.length === 0) return null;
  // Без цели по сложности подходит первый кандидат; с целью — ближайший к ней.
  if (accepted.length === 1 || options.score === undefined) return accepted[0];
  const target = options.score;
  return accepted.reduce((best, candidate) =>
    Math.abs(candidate.score - target) < Math.abs(best.score - target) ? candidate : best,
  );
}

/** Профиль одного уровня эпизода: чем он сложнее, тем больше ходов,
 * пространства, тупиков и структурных элементов поля. */
export interface LevelProfile {
  moves: number;
  size: number;
  budget: number;
  patterns: PatternKind[];
  deadEnds: number;
  score: number;
}

/**
 * Набор паттернов по месту уровня в эпизоде: сначала простая комната, затем
 * коридоры с карманами, в конце — гребёнки, змейки и кресты.
 */
function patternsForProgress(t: number): PatternKind[] {
  if (t < 0.2) return ['room'];
  if (t < 0.45) return ['room', 'room', 'corridor', 'chamber'];
  if (t < 0.7) return ['room', 'corridor', 'chamber', 'snake', 'room'];
  // В конце — лабиринт, но с комнатами и перекрёстками: одни коридоры дают
  // тонкую «змейку» без единой развилки.
  return ['room', 'corridor', 'comb', 'chamber', 'cross', 'snake'];
}

/**
 * Кривая сложности эпизода: от простых уровней к сложным.
 *
 * Первая треть — комната без тупиков и короткое решение: игрок осваивает
 * механику и ничем не наказывается. Дальше включаются коридоры и карманы,
 * разрешённая доля тупиков растёт с 0 до 0.35, длина решения — с 3 до 13,
 * поле — с 8 до 13 клеток.
 */
export function episodeProfiles(count: number): LevelProfile[] {
  const profiles: LevelProfile[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 1 : i / (count - 1);
    profiles.push({
      moves: Math.round(3 + 8 * t),
      size: Math.round(8 + 5 * t),
      budget: Math.round(34 + 70 * t),
      patterns: patternsForProgress(t),
      // Тупики появляются только после первой трети эпизода.
      deadEnds: t < 0.34 ? 0 : Math.round(((0.35 * (t - 0.34)) / 0.66) * 100) / 100,
      score: Math.round(28 + 40 * t),
    });
  }
  return profiles;
}

/** Сид следующего уровня внутри эпизода (номера идут арифметической прогрессией). */
const LEVEL_SEED_STEP = 104729;
/** Шаг между попытками поиска карты для одного и того же уровня. */
const ATTEMPT_SEED_STEP = 15485863;
/** Сколько попыток перебирает `generateEpisodeLevel`, прежде чем сдаться. */
const EPISODE_ATTEMPTS = 400;

/**
 * Параметры генерации уровня эпизода. Сид попытки плюс профиль — весь рецепт:
 * повторный `generateLevel` с этими же опциями даёт ту же карту.
 */
function episodeLevelOptions(
  seed: number,
  index: number,
  count: number,
  mechanics: MechanicId[],
  attempt: number,
): GenerateLevelOptions {
  const profile = episodeProfiles(count)[index];
  if (!profile) throw new Error(`Профиль уровня ${index + 1} не найден`);
  // Сначала ищем уровень, точно попадающий в оценку профиля (±2): так
  // соседние уровни эпизода не меняются сложностью местами. Если узкая
  // полоса не далась, допуск расширяется, и только в самом конце берётся
  // что угодно близкое по сиду.
  const scoreTolerance = attempt < 25 ? 2 : attempt < 70 ? 5 : undefined;
  return {
    seed: seed + index * LEVEL_SEED_STEP + attempt * ATTEMPT_SEED_STEP,
    moves: profile.moves,
    maxMoves: profile.moves + (profile.moves <= 5 ? 1 : 3),
    size: profile.size,
    budget: profile.budget,
    patterns: profile.patterns,
    deadEnds: profile.deadEnds,
    score: profile.score,
    scoreTolerance,
    candidates: 4,
    mechanics,
  };
}

/**
 * Сид уровня вместе с рецептом: `seed` — тот самый сид, с которым карта
 * получилась, по нему уровень собирается заново (`rebuildEpisodeLevel`).
 */
export interface EpisodeLevelRecipe {
  rows: string[];
  seed: number;
}

/**
 * Сгенерировать уровень эпизода и вернуть его настоящий сид — для показа
 * игроку и повторной сборки карты.
 */
export function generateEpisodeLevelRecipe(
  seed: number,
  index: number,
  count: number,
  mechanics: MechanicId[] = [],
): EpisodeLevelRecipe {
  let generated: GeneratedLevel | null = null;
  let options: GenerateLevelOptions | null = null;
  for (let attempt = 0; attempt < EPISODE_ATTEMPTS && !generated; attempt++) {
    options = episodeLevelOptions(seed, index, count, mechanics, attempt);
    generated = generateLevel(options);
  }
  if (!generated) {
    const profile = episodeProfiles(count)[index];
    throw new Error(
      `Не удалось сгенерировать уровень ${index + 1} ` +
        `(${profile.moves} ходов, ${profile.size}×${profile.size}, ` +
        `тупики ≤ ${profile.deadEnds}, оценка ≈ ${profile.score}` +
        (mechanics.length > 0 ? `, механики: ${mechanics.join(', ')}` : '') +
        ')',
    );
  }
  return { rows: generated.rows, seed: options?.seed ?? seed };
}

/**
 * Сгенерировать один уровень эпизода по его профилю. Воркер вызывает эту
 * функцию поштучно, поэтому приоритетный уровень можно посчитать первым, а
 * очередь остальных продолжить после него.
 *
 * `mechanics` — тема эпизода: все перечисленные механики обязаны встретиться в
 * кратчайшем решении, иначе уровень отклоняется и генератор пробует новый сид.
 */
export function generateEpisodeLevel(
  seed: number,
  index: number,
  count: number,
  mechanics: MechanicId[] = [],
): string[] {
  return generateEpisodeLevelRecipe(seed, index, count, mechanics).rows;
}

/**
 * Собрать уровень эпизода заново по его сиду: рецепт (профиль уровня, номер
 * попытки, механики) восстанавливается из сида, поэтому генератор выдаёт ту же
 * самую карту. `null` — сид не из этого эпизода.
 */
export function rebuildEpisodeLevel(
  seed: number,
  index: number,
  count: number,
  mechanics: MechanicId[],
  levelSeed: number,
): string[] | null {
  const offset = levelSeed - seed - index * LEVEL_SEED_STEP;
  if (offset < 0 || offset % ATTEMPT_SEED_STEP !== 0) return null;
  const attempt = offset / ATTEMPT_SEED_STEP;
  if (!Number.isInteger(attempt) || attempt >= EPISODE_ATTEMPTS) return null;
  return generateLevel(episodeLevelOptions(seed, index, count, mechanics, attempt))?.rows ?? null;
}

/**
 * Сгенерировать эпизод по кривой сложности. Сид фиксирован, поэтому эпизод
 * детерминирован.
 */
export function generateEpisode(
  seed: number,
  count: number,
  mechanics: MechanicId[] = [],
): string[][] {
  const levels: string[][] = [];
  for (let i = 0; i < count; i++) levels.push(generateEpisodeLevel(seed, i, count, mechanics));
  return levels;
}

/**
 * Уровень демо-фона главного меню: короткое решение и простая комната без
 * тупиков. Механики эпизода при этом обязательные — иначе демо показывает не ту
 * игру, в которую игрок только что играл.
 *
 * Профиль нарочно лёгкий: компьютер в меню переставляет кубики сам, и уровень
 * должен проходиться за несколько ходов, пока игрок выбирает пункт меню.
 */
export function generateDemoLevel(
  seed: number,
  index: number,
  mechanics: MechanicId[] = [],
): string[] {
  for (let attempt = 0; attempt < 120; attempt++) {
    const generated = generateLevel({
      seed: seed + index * 104729 + attempt * 15485863,
      moves: 3,
      maxMoves: 4,
      size: 8,
      budget: 34,
      patterns: ['room'],
      deadEnds: 0,
      score: 24,
      scoreTolerance: 10,
      candidates: 2,
      mechanics,
    });
    if (generated) return generated.rows;
  }
  throw new Error(
    `Не удалось сгенерировать демо-уровень ${index + 1}` +
      (mechanics.length > 0 ? ` (механики: ${mechanics.join(', ')})` : ''),
  );
}

/** Параметры тестового уровня из отладочного меню. */
export interface TestLevelOptions {
  mechanics: MechanicId[];
  /** Целевая сложность 0..100. */
  difficulty: number;
  seed?: number;
}

/**
 * Уровень для отладочного меню: сложность задаётся ползунком, а не местом в
 * эпизоде. Тот же конвейер, что и у эпизода, плюс выбранные механики.
 */
export function generateTestLevel(options: TestLevelOptions): GeneratedLevel | null {
  const t = Math.min(1, Math.max(0, options.difficulty / 100));
  const moves = Math.round(3 + 9 * t);
  const size = Math.round(8 + 5 * t);
  const seed = options.seed ?? 0x7e57;
  const target = Math.round(options.difficulty);

  // Несколько независимых сидов: при неудачной раскладке механик один
  // кандидат может не дать маршрута, но следующий обычно даёт.
  for (let attempt = 0; attempt < 60; attempt++) {
    const generated = generateLevel({
      seed: seed + attempt * 104729,
      moves,
      maxMoves: moves + 2,
      size,
      budget: Math.round(34 + 70 * t),
      patterns: patternsForProgress(t),
      deadEnds: t < 0.34 ? 0 : Math.round(((0.35 * (t - 0.34)) / 0.66) * 100) / 100,
      score: target,
      candidates: 4,
      mechanics: options.mechanics,
    });
    if (generated) return generated;
  }
  return null;
}
