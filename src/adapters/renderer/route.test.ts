import { describe, expect, it } from 'vitest';
import { Position } from '../../core/types/position';
import type { PathPoint } from '../../core/types/game-state';
import { firstTeleport, planRoute, routeCells } from './route';

/** Путь из последовательности клеток; `teleport` помечает клетку выхода. */
const path = (...cells: [number, number, boolean?][]): PathPoint[] =>
  cells.map(([x, y, teleport]) => ({
    pos: new Position(x, y),
    ...(teleport ? { teleport: true as const } : {}),
  }));

describe('planRoute', () => {
  it('склеивает прямой проезд в один отрезок', () => {
    const route = planRoute(path([2, 2], [3, 2], [4, 2], [5, 2]));
    expect(route).toEqual([{ kind: 'slide', dir: { x: 1, y: 0 }, cells: 3 }]);
    expect(routeCells(route)).toBe(3);
  });

  it('начинает новый отрезок на повороте', () => {
    // Два хода вправо, ротатор, клетка вниз.
    const route = planRoute(path([0, 0], [1, 0], [2, 0], [2, 1]));
    expect(route).toEqual([
      { kind: 'slide', dir: { x: 1, y: 0 }, cells: 2 },
      { kind: 'slide', dir: { x: 0, y: 1 }, cells: 1 },
    ]);
  });

  it('ставит прыжок между проездами и не склеивает их', () => {
    // Вход в портал (2,0) → выход (0,3) → проезд вниз ещё на клетку.
    const route = planRoute(path([1, 0], [2, 0], [0, 3, true], [0, 4]));
    expect(route).toEqual([
      { kind: 'slide', dir: { x: 1, y: 0 }, cells: 1 },
      { kind: 'teleport', entry: new Position(2, 0), exit: new Position(0, 3) },
      { kind: 'slide', dir: { x: 0, y: 1 }, cells: 1 },
    ]);
    // Прыжок не считается проездом: кубик проехал две клетки, а не четыре.
    expect(routeCells(route)).toBe(2);
  });

  it('не склеивает одинаковое направление по разные стороны портала', () => {
    const route = planRoute(path([1, 0], [2, 0], [2, 4, true], [2, 5]));
    expect(route).toEqual([
      { kind: 'slide', dir: { x: 1, y: 0 }, cells: 1 },
      { kind: 'teleport', entry: new Position(2, 0), exit: new Position(2, 4) },
      { kind: 'slide', dir: { x: 0, y: 1 }, cells: 1 },
    ]);
  });

  it('пустой путь и путь из одной точки дают пустой маршрут', () => {
    expect(planRoute([])).toEqual([]);
    expect(planRoute(path([3, 3]))).toEqual([]);
  });
});

describe('firstTeleport', () => {
  it('находит прыжок и его клетки', () => {
    const route = planRoute(path([0, 0], [1, 0], [4, 2, true], [4, 3]));
    expect(firstTeleport(route)).toEqual({
      kind: 'teleport',
      entry: new Position(1, 0),
      exit: new Position(4, 2),
    });
  });

  it('без портала возвращает null', () => {
    expect(firstTeleport(planRoute(path([0, 0], [0, 1])))).toBeNull();
  });
});
