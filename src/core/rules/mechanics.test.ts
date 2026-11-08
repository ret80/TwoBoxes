import { describe, expect, it } from 'vitest';
import { createLevelFromData } from './create';
import { planSlides } from './hint';
import { moveBoxes } from './move';
import { DIRS, Position } from '../types/position';

const levelOf = (rows: string[]) => createLevelFromData(0, 0, rows);

describe('mechanic rules', () => {
  it('portal carries a box to the paired exit and keeps sliding', () => {
    const level = levelOf([
      '#######',
      '#R..a.#',
      '#.....#',
      '#b....#',
      '#....y#',
      '#######',
    ]);
    const next = moveBoxes(level, level.boxes, DIRS.right, 0, 0);

    expect(next).not.toBeNull();
    expect(next?.boxes[0].pos.x).toBe(5);
    expect(next?.boxes[0].pos.y).toBe(3);
    expect(next?.paths?.[0].some((point) => point.teleport)).toBe(true);
  });

  it('trap stops the box and makes it skip two moves', () => {
    const level = levelOf([
      '#######',
      '#R.t..#',
      '#.....#',
      '#.....#',
      '#######',
    ]);
    const first = moveBoxes(level, level.boxes, DIRS.right, 0, 0);
    expect(first?.boxes[0].pos.x).toBe(3);
    expect(first?.mechanicState?.locks[0]).toBe(2);

    const waiting = moveBoxes(level, first!.boxes, DIRS.right, 1, 0, first!.mechanicState);
    expect(waiting?.boxes[0].pos.x).toBe(3);
    expect(waiting?.mechanicState?.locks[0]).toBe(1);
    expect(waiting?.moves).toBe(2);

    const stillWaiting = moveBoxes(
      level,
      waiting!.boxes,
      DIRS.right,
      2,
      0,
      waiting!.mechanicState,
    );
    expect(stillWaiting?.boxes[0].pos.x).toBe(3);
    expect(stillWaiting?.mechanicState?.locks[0]).toBe(0);

    const free = moveBoxes(
      level,
      stillWaiting!.boxes,
      DIRS.right,
      3,
      0,
      stillWaiting!.mechanicState,
    );
    expect(free?.boxes[0].pos.x).toBe(5);
  });

  it('rotator turns movement by 90 degrees', () => {
    const level = levelOf([
      '#######',
      '#R.c..#',
      '#.....#',
      '#.....#',
      '#######',
    ]);
    const next = moveBoxes(level, level.boxes, DIRS.right, 0, 0);

    expect(next?.boxes[0].pos.x).toBe(3);
    expect(next?.boxes[0].pos.y).toBe(3);
  });

  it('switch flips all rotators for the following moves', () => {
    const level = levelOf([
      '#######',
      '#R.c..#',
      '#..s..#',
      '#.....#',
      '#######',
    ]);
    const first = moveBoxes(level, level.boxes, DIRS.right, 0, 0);
    expect(first?.mechanicState?.rotorFlip).toBe(true);
    expect(first?.boxes[0].pos.y).toBe(3);

    // Тот же ротатор в перевёрнутом состоянии поворачивает в другую сторону:
    // снизу вверх кубик уходит влево, а не вправо.
    const second = moveBoxes(
      level,
      [{ pos: new Position(3, 2), color: first!.boxes[0].color }],
      DIRS.up,
      1,
      0,
      { locks: [0], rotorFlip: true },
    );
    expect(second?.boxes[0].pos.x).toBe(1);
    expect(second?.boxes[0].pos.y).toBe(1);
  });

  it('hint path follows the portal jump instead of a straight line', () => {
    const level = levelOf([
      '#######',
      '#R..a.#',
      '#.....#',
      '#b....#',
      '#....y#',
      '#######',
    ]);
    const [slide] = planSlides(level, level.boxes, DIRS.right);
    // Путь идёт по клеткам до входа в портал...
    expect(slide.path.some((point) => point.pos.equals(new Position(4, 1)))).toBe(true);
    // ...затем прыжок на парный выход и продолжение движения уже из него.
    expect(slide.path.some((point) => point.teleport)).toBe(true);
    expect(slide.path[slide.path.length - 1].pos.equals(new Position(5, 3))).toBe(true);
  });

  it('one-way cell blocks entry against its arrow and allows entry with it', () => {
    const withArrow = levelOf([
      '#######',
      '#...>R#',
      '#.....#',
      '#######',
    ]);
    expect(moveBoxes(withArrow, withArrow.boxes, DIRS.left, 0, 0)).toBeNull();

    const forward = levelOf([
      '#######',
      '#R..>.#',
      '#.....#',
      '#######',
    ]);
    const next = moveBoxes(forward, forward.boxes, DIRS.right, 0, 0);
    expect(next?.boxes[0].pos.x).toBe(5);
  });
});
