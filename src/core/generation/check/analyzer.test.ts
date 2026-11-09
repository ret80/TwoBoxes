import { describe, expect, it } from 'vitest';
import { CellType } from '../../types/cell';
import { createLevelFromData } from '../../rules/create';
import { moveBoxes, stepBoxes } from '../../rules/move';
import { createMechanicState } from '../../types/mechanic-state';
import { DIRS, Position } from '../../types/position';
import { acceptCandidate } from '../accept/criteria';
import { stripMechanics } from '../accept/mechanic-proof';
import type { Candidate } from '../build/types';
import { portalMechanic } from '../mechanics/modules';
import { analyzeLevel, analyzeShortest } from './analyzer';

const rowsOf = (lines: string[]): string[] => lines;

function candidateOf(rows: string[], modules: Candidate['modules'] = []): Candidate {
  const level = createLevelFromData(0, 0, rows);
  const floor = new Uint8Array(level.width * level.height);
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const cell = level.grid.get(new Position(x, y));
      if (cell !== CellType.UNKNOWN && cell !== CellType.WALL) {
        floor[y * level.width + x] = 1;
      }
    }
  }
  return {
    level,
    rows,
    floor,
    size: level.width,
    starts: level.boxes.map((box) => box.pos.clone()),
    ends: level.ends.map((end) => end.pos.clone()),
    cells: new Map(),
    modules,
    walkMoves: 0,
  };
}

describe('единый анализатор', () => {
  it('различает «слишком большой граф» и «решения нет»', () => {
    const level = createLevelFromData(0, 0, [
      '#######',
      '#R...Y#',
      '#.....#',
      '#r...y#',
      '#######',
    ]);
    const tiny = analyzeShortest(level, { maxStates: 1 });
    expect(tiny.kind).toBe('tooLarge');

    const solved = analyzeShortest(level);
    expect(solved.kind).toBe('solved');

    // Неразрешимая карта: красный кубик и его цель заперты в отдельной
    // комнате, куда нельзя попасть.
    const unsolvable = createLevelFromData(0, 0, [
      '########',
      '#R#..Y.#',
      '###....#',
      '###....#',
      '###....#',
      '#r#..y.#',
      '########',
    ]);
    expect(analyzeShortest(unsolvable).kind).toBe('unsolvable');
  });

  it('считает тупики по всем рёбрам, а не только по дереву BFS', () => {
    // Старая карта 2-1: решение есть, и тупики должны быть > 0.
    const level = createLevelFromData(0, 0, [
      ' ### ####',
      ' #.###..#',
      ' #......#',
      ' #...R.Y#',
      '##......#',
      '#.....y##',
      '#.....r# ',
      '#..###.# ',
      '#### ### ',
    ]);
    const analysis = analyzeLevel(level);
    expect(analysis.kind).toBe('solved');
    if (analysis.kind !== 'solved') return;
    expect(analysis.deadEnds).toBeGreaterThan(0);
    expect(analysis.deadEnds).toBeLessThanOrEqual(analysis.states);
    expect(analysis.shortestCount).toBeGreaterThanOrEqual(1);
  });

  it('шаг без путей не расходится с игровым ходом', () => {
    const level = createLevelFromData(0, 0, [
      '#######',
      '#R...a#',
      '#.....#',
      '#b...Y#',
      '#r...y#',
      '#######',
    ]);
    let gameBoxes = level.boxes.map((box) => ({ pos: box.pos.clone(), color: box.color }));
    let stepB = level.boxes.map((box) => ({ pos: box.pos.clone(), color: box.color }));
    let gameState = createMechanicState(gameBoxes.length);
    let stepState = createMechanicState(stepB.length);

    for (const dir of [DIRS.right, DIRS.down, DIRS.left, DIRS.up, DIRS.right, DIRS.down]) {
      const game = moveBoxes(level, gameBoxes, dir, 0, 0, gameState);
      const step = stepBoxes(level, stepB, dir, stepState);
      expect(Boolean(step), `step ${dir}`).toBe(Boolean(game));
      if (!game || !step) break;

      game.boxes.forEach((box, index) => {
        expect(step.boxes[index].pos.equals(box.pos), `box ${index} ${dir}`).toBe(true);
      });
      expect(step.portalSwaps).toBe(game.portalSwaps ?? 0);
      expect(step.mechanicState.locks).toEqual(game.mechanicState?.locks);
      expect(step.mechanicState.rotorFlip).toBe(game.mechanicState?.rotorFlip);
      expect(step).not.toHaveProperty('paths');

      gameBoxes = game.boxes;
      gameState = game.mechanicState ?? gameState;
      stepB = step.boxes;
      stepState = step.mechanicState;
    }
  });
});

describe('приёмка механик', () => {
  it('отвергает портал вне маршрута решения', () => {
    // Кубики едут по верхним рядам, порталы стоят внизу и не участвуют.
    const rows = rowsOf([
      '##########',
      '#a......b#',
      '#R.......#',
      '#........#',
      '#Y.......#',
      '#.......r#',
      '#.......y#',
      '##########',
    ]);
    const verdict = acceptCandidate(candidateOf(rows, [portalMechanic]), {
      moves: 2,
      maxMoves: 2,
      allowedDeadEnds: 1,
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(['mechanic-untouched', 'mechanic-not-required']).toContain(verdict.reason);
  });

  it('не меняет решаемость уровня, где механик нет', () => {
    const level = createLevelFromData(0, 0, [
      '#######',
      '#R...Y#',
      '#.....#',
      '#r...y#',
      '#######',
    ]);
    const before = analyzeLevel(level);
    const after = analyzeLevel(stripMechanics(level, ['portal']));
    expect(after.kind).toBe(before.kind);
    if (before.kind !== 'solved' || after.kind !== 'solved') return;
    expect(after.solution.length).toBe(before.solution.length);
    expect(after.states).toBe(before.states);
  });
});
