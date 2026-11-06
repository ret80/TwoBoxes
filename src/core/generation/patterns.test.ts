import { describe, expect, it } from 'vitest';
import { assembleField, buildPattern, rotateTile, type PatternKind, type Tile } from './patterns';

function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KINDS: PatternKind[] = ['room', 'corridor', 'comb', 'snake', 'chamber', 'cross'];

const normalize = (tile: Tile): string => tile.cells.join('\n');

describe('pattern tiles', () => {
  it('builds every pattern with valid sockets', () => {
    for (const kind of KINDS) {
      const tile = buildPattern(kind, rngFrom(7));
      const height = tile.cells.length;
      const width = tile.cells[0].length;

      expect(height).toBeGreaterThan(0);
      expect(tile.sockets.length, `${kind} sockets`).toBeGreaterThan(0);
      for (const row of tile.cells) expect(row.length).toBe(width);

      for (const socket of tile.sockets) {
        expect(socket.x).toBeGreaterThanOrEqual(0);
        expect(socket.x).toBeLessThan(width);
        expect(socket.y).toBeGreaterThanOrEqual(0);
        expect(socket.y).toBeLessThan(height);
        // Порт — это клетка пола.
        expect(tile.cells[socket.y][socket.x]).toBe('.');
        // У порта есть клетка пола внутри тайла, иначе он ни к чему не ведёт.
        const inward = [
          [0, 1],
          [-1, 0],
          [0, -1],
          [1, 0],
        ][socket.dir];
        const x = socket.x + inward[0];
        const y = socket.y + inward[1];
        const inside = y >= 0 && y < height && x >= 0 && x < width;
        expect(inside && tile.cells[y][x] === '.', `${kind} socket leads inside`).toBe(true);
      }
    }
  });

  it('rotates back to the original after four turns', () => {
    for (const kind of KINDS) {
      const tile = buildPattern(kind, rngFrom(11));
      let result = tile;
      for (let i = 0; i < 4; i++) result = rotateTile(result);
      expect(normalize(result), kind).toBe(normalize(tile));
      expect(result.sockets).toEqual(tile.sockets);
    }
  });
});

describe('pattern field assembly', () => {
  it('assembles a connected field of the requested budget', () => {
    const field = assembleField({
      size: 12,
      budget: 70,
      patterns: ['room', 'corridor', 'chamber', 'comb'],
      rng: rngFrom(3),
    });
    expect(field).not.toBeNull();
    if (!field) return;

    expect(field.mask.some((cell) => cell === 1)).toBe(true);
    // Поле окружено рамкой стен: генератор ищет старты внутри без проверки краёв.
    for (let i = 0; i < field.size; i++) {
      expect(field.mask[i]).toBe(0);
      expect(field.mask[(field.size - 1) * field.size + i]).toBe(0);
      expect(field.mask[i * field.size]).toBe(0);
      expect(field.mask[i * field.size + field.size - 1]).toBe(0);
    }

    // Одна связная область пола.
    let floor = 0;
    for (let i = 0; i < field.mask.length; i++) floor += field.mask[i];
    expect(floor).toBeGreaterThan(20);

    const seen = new Uint8Array(field.mask.length);
    let start = field.mask.findIndex((cell) => cell === 1);
    const stack = [start];
    seen[start] = 1;
    let reached = 0;
    while (stack.length) {
      const cell = stack.pop() as number;
      reached++;
      const x = cell % field.size;
      const y = Math.floor(cell / field.size);
      for (const [dx, dy] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= field.size || ny >= field.size) continue;
        const index = ny * field.size + nx;
        if (!field.mask[index] || seen[index]) continue;
        seen[index] = 1;
        stack.push(index);
      }
    }
    expect(reached).toBe(floor);
  });

  it('is deterministic and gives varied shapes for different seeds', () => {
    const make = (seed: number) =>
      assembleField({
        size: 12,
        budget: 70,
        patterns: ['room', 'corridor', 'chamber'],
        rng: rngFrom(seed),
      });

    const a = make(5);
    const b = make(5);
    expect(a?.mask).toEqual(b?.mask);

    const shapes = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const field = make(seed);
      if (field) shapes.add(field.mask.join(''));
    }
    expect(shapes.size).toBeGreaterThan(4);
  });

  it('refuses to assemble from an empty pattern list', () => {
    expect(assembleField({ size: 10, budget: 50, patterns: [], rng: rngFrom(1) })).toBeNull();
  });
});
