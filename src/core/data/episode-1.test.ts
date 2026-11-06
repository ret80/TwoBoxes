import { describe, expect, it } from 'vitest';
import { EPISODE_1 } from './episode-1';
import { createLevelFromData } from '../rules/create';
import { solveLevel } from '../generation/solver';
import { moveBoxes } from '../rules/move';
import { checkWin } from '../rules/check';
import { findHint } from '../rules/hint';

const levelOf = (index: number) => createLevelFromData(0, index, EPISODE_1[index]);

describe('episode 1 data', () => {
  it('has twelve levels with two boxes and two goals each', () => {
    expect(EPISODE_1).toHaveLength(12);
    EPISODE_1.forEach((_rows, index) => {
      const level = levelOf(index);
      expect(level.boxes, `1-${index + 1} boxes`).toHaveLength(2);
      expect(level.ends, `1-${index + 1} goals`).toHaveLength(2);
      const cells = [...level.boxes, ...level.ends].map((e) => `${e.pos.x},${e.pos.y}`);
      expect(new Set(cells).size, `1-${index + 1} distinct cells`).toBe(4);
    });
  });

  it('is solvable on every level', () => {
    EPISODE_1.forEach((_rows, index) => {
      const label = `1-${index + 1}`;
      const level = levelOf(index);
      const solved = solveLevel(level);

      expect(solved, `${label} must be solvable`).not.toBeNull();
      if (!solved) return;

      // Решение воспроизводится теми же правилами, что и в игре.
      let boxes = level.boxes.map((b) => ({ pos: b.pos.clone(), color: b.color }));
      for (const dir of solved.solution) {
        const next = moveBoxes(level, boxes, dir, 0, 0);
        expect(next, `${label} move must be legal`).not.toBeNull();
        if (!next) return;
        boxes = next.boxes;
      }
      expect(checkWin(boxes, level.ends), `${label} replay must win`).toBe(true);

      // Подсказка обязана находиться на любом уровне.
      expect(findHint(level, level.boxes), `${label} hint`).not.toBeNull();
    });
  });

  it('level 1-9 solves in 18 moves after the goal fix', () => {
    // До правки цель стояла на (6,6) и уровень не решался вообще.
    const level = levelOf(8);
    const solved = solveLevel(level);
    expect(solved).not.toBeNull();
    expect(solved?.solution.length).toBe(18);
    expect(solved?.movesByBox[0]).toBeGreaterThan(0);
    expect(solved?.movesByBox[1]).toBeGreaterThan(0);
    expect(level.ends.some((end) => end.pos.x === 7 && end.pos.y === 6)).toBe(true);
  });
});
