import { describe, expect, it } from 'vitest';
import { generateEpisode, generateLevel } from './level-generator';
import { findShortestSolution, solveLevel } from './solver';
import { createLevelFromData } from '../rules/create';
import { moveBoxes } from '../rules/move';
import { checkWin } from '../rules/check';
import { findHint } from '../rules/hint';
import type { Position } from '../types/position';

function replay(rows: string[], solution: Position[]): boolean {
  const level = createLevelFromData(0, 0, rows);
  let boxes = level.boxes.map((b) => ({ pos: b.pos.clone(), color: b.color }));
  for (const dir of solution) {
    const next = moveBoxes(level, boxes, dir, 0, 0);
    if (!next) return false;
    boxes = next.boxes;
  }
  return checkWin(boxes, level.ends);
}

function levelCells(rows: string[]): string[] {
  const level = createLevelFromData(0, 0, rows);
  return [
    ...level.boxes.map((b) => `${b.pos.x},${b.pos.y}`),
    ...level.ends.map((e) => `${e.pos.x},${e.pos.y}`),
  ];
}

describe('level generator', () => {
  it('generates 20 distinct levels that are solvable without dead ends', () => {
    const seed = 0x2b0b2;
    const episode = generateEpisode(seed, 20);

    expect(episode).toHaveLength(20);
    expect(new Set(episode.map((rows) => rows.join('\n'))).size).toBe(20);

    episode.forEach((rows, index) => {
      const level = createLevelFromData(0, 0, rows);
      const target = 5 + Math.floor(index / 2);
      const solved = solveLevel(level);

      expect(solved, `level ${index + 1}`).not.toBeNull();
      if (!solved) return;

      // Решение найдено независимым BFS, а не взято из пути генератора.
      expect(replay(rows, solved.solution), `level ${index + 1} replay`).toBe(true);
      expect(solved.solution.length, `level ${index + 1} difficulty`).toBeGreaterThanOrEqual(target);
      expect(solved.solution.length, `level ${index + 1} difficulty`).toBeLessThanOrEqual(target + 2);
      expect(findShortestSolution(level)?.length, `level ${index + 1} shortest`).toBe(
        solved.solution.length,
      );
      expect(findHint(level, level.boxes), `level ${index + 1} hint`).not.toBeNull();

      // Оба кубика должны поучаствовать в решении.
      expect(solved.movesByBox[0], `level ${index + 1} red moves`).toBeGreaterThanOrEqual(2);
      expect(solved.movesByBox[1], `level ${index + 1} yellow moves`).toBeGreaterThanOrEqual(2);

      // Из любого достижимого состояния всё ещё можно дойти до победы.
      expect(solved.deadEnds, `level ${index + 1} dead ends`).toBe(0);

      // Старты и цели — четыре разные клетки, маркеры не перекрываются.
      expect(new Set(levelCells(rows)).size, `level ${index + 1} cells`).toBe(4);
    });
  }, 20_000);

  it('is deterministic', () => {
    const first = generateEpisode(0x2b0b2, 12);
    const second = generateEpisode(0x2b0b2, 12);
    expect(first).toEqual(second);
  });

  it('creates compact single levels with a replayable shortest solution', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const generated = generateLevel({ seed, moves: 6, size: 10 });
      expect(generated, `seed ${seed}`).not.toBeNull();
      if (!generated) continue;

      const level = createLevelFromData(0, 0, generated.rows);
      expect(level.boxes).toHaveLength(2);
      expect(level.ends).toHaveLength(2);
      expect(level.width).toBeLessThanOrEqual(10);
      expect(level.height).toBeLessThanOrEqual(10);
      expect(level.width).toBeGreaterThanOrEqual(4);
      expect(replay(generated.rows, generated.solution)).toBe(true);
      expect(findHint(level, level.boxes)).not.toBeNull();
      expect(new Set(levelCells(generated.rows)).size).toBe(4);
    }
  }, 10_000);
});

describe('level solver', () => {
  it('finds a solution and reports irreversible dead ends', () => {
    // Старая карта 2-1: решение существует, но 44 из 65 состояний — тупики.
    const rows = [
      ' ### ####',
      ' #.###..#',
      ' #......#',
      ' #...R.Y#',
      '##......#',
      '#.....y##',
      '#.....r# ',
      '#..###.# ',
      '#### ### ',
    ];
    const level = createLevelFromData(0, 0, rows);
    const solved = solveLevel(level);

    expect(solved).not.toBeNull();
    expect(solved?.solution.length).toBe(5);
    expect(solved?.deadEnds).toBeGreaterThan(0);
    expect(replay(rows, solved?.solution ?? [])).toBe(true);
  });
});
