import { describe, expect, it } from 'vitest';
import {
  episodeProfiles,
  generateDemoLevel,
  generateEpisode,
  generateEpisodeLevel,
  generateLevel,
} from './level-generator';
import { findShortestSolution, solveLevel } from './solver';
import { measureLevel } from './difficulty';
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
  it('builds an episode whose difficulty grows from the first level to the last', () => {
    const seed = 0x2b0b2;
    const count = 12;
    const episode = generateEpisode(seed, count);
    const profiles = episodeProfiles(count);

    expect(episode).toHaveLength(count);
    expect(new Set(episode.map((rows) => rows.join('\n'))).size).toBe(count);

    const scores: number[] = [];
    episode.forEach((rows, index) => {
      const level = createLevelFromData(0, 0, rows);
      const solved = solveLevel(level);
      const profile = profiles[index];
      const label = `level ${index + 1}`;

      expect(solved, label).not.toBeNull();
      if (!solved) return;

      // Решение найдено независимым BFS, а не взято из пути генератора.
      expect(replay(rows, solved.solution), `${label} replay`).toBe(true);
      expect(findShortestSolution(level)?.length, `${label} shortest`).toBe(solved.solution.length);
      expect(findHint(level, level.boxes), `${label} hint`).not.toBeNull();

      // Профиль уровня соблюдён: он не проще заявленного и не длиннее допуска.
      expect(solved.solution.length, `${label} min moves`).toBeGreaterThanOrEqual(profile.moves);
      expect(solved.solution.length, `${label} max moves`).toBeLessThanOrEqual(
        profile.moves + (profile.moves <= 5 ? 1 : 3),
      );

      // Оба кубика должны поучаствовать в решении.
      expect(solved.movesByBox[0], `${label} red moves`).toBeGreaterThanOrEqual(2);
      expect(solved.movesByBox[1], `${label} yellow moves`).toBeGreaterThanOrEqual(2);

      // Тупики — только в пределах квоты профиля.
      const deadEndRatio = solved.deadEnds / solved.states;
      expect(deadEndRatio, `${label} dead ends`).toBeLessThanOrEqual(profile.deadEnds + 1e-9);

      // Старты и цели — четыре разные клетки, маркеры не перекрываются.
      expect(new Set(levelCells(rows)).size, `${label} cells`).toBe(4);

      scores.push(measureLevel(level)?.score ?? 0);
    });

    // Главное требование: эпизод действительно усложняется.
    const head = scores.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const tail = scores.slice(-3).reduce((a, b) => a + b, 0) / 3;
    expect(scores[scores.length - 1] - scores[0]).toBeGreaterThanOrEqual(25);
    expect(tail - head).toBeGreaterThanOrEqual(20);
  }, 60_000);

  it('is deterministic and matches per-level worker generation', () => {
    const first = generateEpisode(0x2b0b2, 12);
    // Воркер считает уровни поштучно и в произвольном порядке: результат
    // обязан совпадать с пакетной генерацией эпизода.
    const second = Array.from({ length: 12 }, (_, index) =>
      generateEpisodeLevel(0x2b0b2, index, 12),
    );
    expect(first).toEqual(second);
  }, 60_000);

  it('spreads seeds: different seeds give different levels', () => {
    const levels = [1, 2, 3, 4].map((seed) =>
      generateLevel({ seed, moves: 6, size: 10, patterns: ['room', 'corridor', 'chamber'] }),
    );
    const rows = levels.map((level) => level?.rows.join('\n') ?? 'failed');
    expect(new Set(rows).size).toBe(rows.length);
  }, 20_000);

  it('profiles grow monotonically', () => {
    const profiles = episodeProfiles(12);
    for (let i = 1; i < profiles.length; i++) {
      expect(profiles[i].moves).toBeGreaterThanOrEqual(profiles[i - 1].moves);
      expect(profiles[i].size).toBeGreaterThanOrEqual(profiles[i - 1].size);
      expect(profiles[i].budget).toBeGreaterThanOrEqual(profiles[i - 1].budget);
      expect(profiles[i].score).toBeGreaterThanOrEqual(profiles[i - 1].score);
      expect(profiles[i].deadEnds).toBeGreaterThanOrEqual(profiles[i - 1].deadEnds);
    }
    // Первый уровень эпизода — самый простой, последний — с тупиками.
    expect(profiles[0].moves).toBeLessThanOrEqual(4);
    expect(profiles[0].deadEnds).toBe(0);
    expect(profiles[profiles.length - 1].deadEnds).toBeGreaterThan(0.2);
    expect(profiles[0].score).toBeLessThan(profiles[profiles.length - 1].score);
  });

  it('creates compact single levels with a replayable shortest solution', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const generated = generateLevel({ seed, moves: 6, size: 10 });
      expect(generated, `seed ${seed}`).not.toBeNull();
      if (!generated) continue;

      const level = createLevelFromData(0, 0, generated.rows);
      expect(level.boxes).toHaveLength(2);
      expect(level.ends).toHaveLength(2);
      expect(level.width).toBeLessThanOrEqual(13);
      expect(level.height).toBeLessThanOrEqual(13);
      expect(level.width).toBeGreaterThanOrEqual(4);
      expect(replay(generated.rows, generated.solution)).toBe(true);
      expect(findHint(level, level.boxes)).not.toBeNull();
      expect(new Set(levelCells(generated.rows)).size).toBe(4);
    }
  }, 20_000);
});

describe('демо-уровни меню', () => {
  it('лёгкие, решаемые и с механиками эпизода', () => {
    const rows = generateDemoLevel(0x0de40, 0, ['portal']);
    const level = createLevelFromData(0, 0, rows);
    // Механика из эпизода в демо есть — иначе фон меню показывал бы обычный уровень.
    const cells = rows.join('');
    expect(cells).toContain('a');
    expect(cells).toContain('b');
    const solution = findShortestSolution(level);
    expect(solution).not.toBeNull();
    // Короткое решение — демо крутится в меню само, пока игрок выбирает пункт.
    expect(solution!.length).toBeLessThanOrEqual(4);
    const metrics = measureLevel(level);
    expect(metrics!.deadEndRatio).toBe(0);
  }, 20_000);
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
    expect(solved?.branching).toBeGreaterThan(1);
    expect(replay(rows, solved?.solution ?? [])).toBe(true);
  });
});
