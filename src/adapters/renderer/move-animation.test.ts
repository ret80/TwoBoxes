import { afterEach, describe, expect, it, vi } from 'vitest';
import { CellType } from '../../core/types/cell';
import { ColorType } from '../../core/types/color';
import { Position } from '../../core/types/position';
import type { RenderState } from '../../ports/IRenderer';
import { PicoglRenderer } from './PicoglRenderer';
import { TweenManager } from './tween-manager';

/** Поле 7×7 из пола: рендереру достаточно карты, чтобы принять состояние. */
function field(): RenderState {
  const width = 7;
  const height = 7;
  const grid = new Array<number>(width * height).fill(CellType.EMPTY);
  return {
    grid,
    width,
    height,
    boxes: [{ pos: new Position(1, 1), color: ColorType.ONE }],
    ends: [],
  };
}

/** Активные tween'ы и анимации телепорта — внутреннее состояние рендерера. */
function internals(renderer: PicoglRenderer) {
  const tweens = (renderer as unknown as { tweens: TweenManager }).tweens;
  const group = (tweens as unknown as { group: { getAll(): unknown[]; update(time: number): void } })
    .group;
  const portals = (renderer as unknown as { portals: unknown[] }).portals;
  const boxPos = (renderer as unknown as { boxPos: { x: number; z: number }[] }).boxPos;
  return { tweens, group, portals, boxPos };
}

const path = (...cells: [number, number, boolean?][]) =>
  cells.map(([x, y, teleport]) => ({
    pos: new Position(x, y),
    ...(teleport ? { teleport: true as const } : {}),
  }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('анимация хода', () => {
  it('прямой проезд на 3 клетки — один tween, а не три', () => {
    const renderer = new PicoglRenderer();
    renderer.render(field());
    let done = 0;

    renderer.animateMove(
      [
        {
          color: ColorType.ONE,
          from: new Position(1, 1),
          to: new Position(4, 1),
          path: path([1, 1], [2, 1], [3, 1], [4, 1]),
        },
      ],
      () => done++,
    );

    expect(internals(renderer).group.getAll()).toHaveLength(1);
    expect(done).toBe(0);
  });

  it('на середине проезда кубик между клетками, а не на границе', () => {
    const renderer = new PicoglRenderer();
    renderer.render(field());
    const started = performance.now();

    renderer.animateMove(
      [
        {
          color: ColorType.ONE,
          from: new Position(1, 1),
          to: new Position(4, 1),
          path: path([1, 1], [2, 1], [3, 1], [4, 1]),
        },
      ],
      () => {},
    );

    // Три клетки по 70 мс: половина пути — 105 мс от старта.
    const { group, boxPos } = internals(renderer);
    group.update(started + TweenManager.moveDuration(3) / 2);

    const x = boxPos[0].x;
    // Старт в центре клетки 1 (x = 1.5), финиш в центре клетки 4 (x = 4.5).
    // При одном tween на весь проезд кубик в этот момент далеко от границ
    // клеток (2.5 и 3.5) — именно этого не хватало при tween на клетку.
    expect(x).toBeGreaterThan(2.5);
    expect(x).toBeLessThan(4.5);
    expect(Math.abs(x - Math.round(x - 0.5) - 0.5)).toBeGreaterThan(0.15);
  });

  it('по завершении проезда ход закрывается один раз', () => {
    const renderer = new PicoglRenderer();
    renderer.render(field());
    let done = 0;
    const started = performance.now();

    renderer.animateMove(
      [
        {
          color: ColorType.ONE,
          from: new Position(1, 1),
          to: new Position(4, 1),
          path: path([1, 1], [2, 1], [3, 1], [4, 1]),
        },
      ],
      () => done++,
    );

    const { group, boxPos } = internals(renderer);
    group.update(started + TweenManager.moveDuration(3) + 5);
    expect(done).toBe(1);
    expect(boxPos[0].x).toBeCloseTo(4.5, 5);
  });

  it('прыжок через портал играет анимацией телепорта, а не tween', () => {
    const renderer = new PicoglRenderer();
    renderer.render(field());

    renderer.animateMove(
      [
        {
          color: ColorType.ONE,
          from: new Position(1, 1),
          to: new Position(0, 3),
          path: path([1, 1], [1, 2], [4, 5, true], [4, 6]),
        },
      ],
      () => {},
    );

    const { group, portals } = internals(renderer);
    // Первый отрезок — проезд до входа: один tween. Прыжок — отдельная
    // анимация телепорта (она стартует, когда tween доедет до входа).
    expect(group.getAll()).toHaveLength(1);
    expect(portals).toHaveLength(0);
  });
});
