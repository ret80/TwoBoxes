import { describe, expect, it } from 'vitest';
import { createLevelFromData } from './create';
import { ColorType } from '../types/color';
import { planSlides } from './hint';
import { moveBoxes } from './move';
import { checkWin } from './check';
import { findShortestSolution } from '../generation/solver';
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

  it('кубик с ротатора упирается в соседа, который уже доехал до стены', () => {
    // Жёлтый едет вверх по своей колонке и встаёт в стену. Коралловый едет
    // вверх, на ротаторе поворачивает вправо и едет по той же линии прямо в
    // жёлтого: он должен встать перед ним, а не проехать им насквозь.
    const level = levelOf([
      '   ######  ',
      '   #c...#  ',
      '####....###',
      '#w....w..y#',
      '####R..Y#.#',
      '   #...r#.#',
      '   ######.#',
      '       ##.#',
      '       #..#',
      '       ####',
    ]);
    const next = moveBoxes(level, level.boxes, DIRS.up, 0, 0)!;
    const coral = next.boxes.find((box) => box.color === ColorType.ONE)!;
    const yellow = next.boxes.find((box) => box.color === ColorType.TWO)!;

    expect({ x: yellow.pos.x, y: yellow.pos.y }).toEqual({ x: 7, y: 1 });
    expect({ x: coral.pos.x, y: coral.pos.y }).toEqual({ x: 6, y: 1 });
    // Коралловый прошёл тот же путь, но упёрся в жёлтого, а не встал за ним.
    const coralIndex = level.boxes.findIndex((box) => box.color === ColorType.ONE);
    const coralPath = next.paths![coralIndex].map((point) => `${point.pos.x},${point.pos.y}`);
    expect(coralPath).toContain('4,1');
    expect(coralPath[coralPath.length - 1]).toBe('6,1');
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

  it('два кубика, въехавшие в парные порталы разом, меняются местами и едут дальше', () => {
    const level = levelOf([
      '#########',
      '#.r.Ra..#',
      '#.......#',
      '#..Yb..y#',
      '#########',
    ]);
    const next = moveBoxes(level, level.boxes, DIRS.right, 0, 0)!;
    const coral = next.boxes.find((box) => box.color === ColorType.ONE)!;
    const yellow = next.boxes.find((box) => box.color === ColorType.TWO)!;

    // Коралловый вошёл в «a» (5,1) и ушёл на «b» (4,3), жёлтый — наоборот.
    // После обмена оба продолжили движение вправо до стенки.
    expect(`${coral.pos.x},${coral.pos.y}`).toBe('7,3');
    expect(`${yellow.pos.x},${yellow.pos.y}`).toBe('7,1');

    const jumps = (index: number): string[] =>
      next.paths![index]
        .filter((point) => point.teleport)
        .map((point) => `${point.pos.x},${point.pos.y}`);
    // У каждого ровно один прыжок — на клетку партнёра.
    expect(jumps(0)).toEqual(['4,3']);
    expect(jumps(1)).toEqual(['5,1']);
  });

  it('первый телепортируется, второй доезжает до входа и меняется с ним местами', () => {
    // Ход вправо: коралловый уходит через «a» (3,3) на «b» (5,1) и встаёт
    // там — справа стена. Жёлтый упирается в стенку и ждёт.
    // Ход вверх: жёлтый въезжает в «a», а выход занят — кубики меняются
    // местами: жёлтый на выход, коралловый обратно на вход.
    const level = levelOf([
      '#######',
      '#....b#',
      '#.....#',
      '#.Ra..#',
      '#..Y#.#',
      '#######',
    ]);
    const first = moveBoxes(level, level.boxes, DIRS.right, 0, 0)!;
    const find = (state: typeof first, color: ColorType) =>
      state.boxes.find((box) => box.color === color)!;
    expect(`${find(first, ColorType.ONE).pos.x},${find(first, ColorType.ONE).pos.y}`).toBe('5,1');
    expect(`${find(first, ColorType.TWO).pos.x},${find(first, ColorType.TWO).pos.y}`).toBe('3,4');

    const second = moveBoxes(level, first.boxes, DIRS.up, 1, 0, first.mechanicState)!;
    expect(`${find(second, ColorType.TWO).pos.x},${find(second, ColorType.TWO).pos.y}`).toBe('5,1');
    expect(`${find(second, ColorType.ONE).pos.x},${find(second, ColorType.ONE).pos.y}`).toBe('3,3');
    // Оба прыгают: жёлтый на выход, коралловый — обратно на вход.
    const jumps = (index: number): string[] =>
      second.paths![index]
        .filter((point) => point.teleport)
        .map((point) => `${point.pos.x},${point.pos.y}`);
    expect(jumps(second.boxes.findIndex((box) => box.color === ColorType.TWO))).toEqual(['5,1']);
    expect(jumps(second.boxes.findIndex((box) => box.color === ColorType.ONE))).toEqual(['3,3']);
  });

  it('кубик, догнавший вход в том же ходу, тоже меняется с первым', () => {
    // Коралловый уходит на выход, но второй кубик едет следом и въезжает во
    // вход уже в этом же ходу — обмен случается без лишнего хода игрока.
    const level = levelOf([
      '#######',
      '#....b#',
      '#.....#',
      '#YRa..#',
      '#######',
    ]);
    const next = moveBoxes(level, level.boxes, DIRS.right, 0, 0)!;
    const coral = next.boxes.find((box) => box.color === ColorType.ONE)!;
    const yellow = next.boxes.find((box) => box.color === ColorType.TWO)!;
    expect(`${coral.pos.x},${coral.pos.y}`).toBe('3,3');
    expect(`${yellow.pos.x},${yellow.pos.y}`).toBe('5,1');
  });

  it('решатель находит победу, которая возможна только через обмен местами', () => {
    // Без обмена кубики застряли бы на порталах, поэтому решение в один ход
    // существует именно благодаря новому правилу.
    const level = levelOf([
      '#########',
      '#...Ra.y#',
      '#.......#',
      '#..Yb..r#',
      '#########',
    ]);
    const solution = findShortestSolution(level);
    expect(solution).toHaveLength(1);
    expect(solution![0].equals(DIRS.right)).toBe(true);
    const next = moveBoxes(level, level.boxes, DIRS.right, 0, 0)!;
    expect(checkWin(next.boxes, level.ends)).toBe(true);
  });

  it('за ход кубик телепортируется только раз и не прыгает туда-обратно', () => {
    // Выход «b» (2,2) левее входа «a» (5,2): проехав выход, кубик снова
    // доезжает до входа. Второй прыжок запрещён — он встаёт на портале.
    const level = levelOf([
      '########',
      '#......#',
      '#.b.Ra.#',
      '#......#',
      '########',
    ]);
    const next = moveBoxes(level, level.boxes, DIRS.right, 0, 0)!;
    expect(`${next.boxes[0].pos.x},${next.boxes[0].pos.y}`).toBe('5,2');
    expect(next.paths![0].filter((point) => point.teleport)).toHaveLength(1);
  });

  it('запертый кубик на выходе не обменивается, а работает упором', () => {
    const level = levelOf([
      '#######',
      '#..b..#',
      '#.....#',
      '#..a..#',
      '#######',
    ]);
    const boxes = [
      { pos: new Position(3, 1), color: ColorType.TWO },
      { pos: new Position(2, 3), color: ColorType.ONE },
    ];
    // Жёлтый заперт ловушкой и этот ход пропускает.
    const next = moveBoxes(level, boxes, DIRS.right, 0, 0, { locks: [1, 0], rotorFlip: false })!;
    expect(`${next.boxes[0].pos.x},${next.boxes[0].pos.y}`).toBe('3,1');
    expect(`${next.boxes[1].pos.x},${next.boxes[1].pos.y}`).toBe('3,3');
    expect(next.paths![1].some((point) => point.teleport)).toBe(false);
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
