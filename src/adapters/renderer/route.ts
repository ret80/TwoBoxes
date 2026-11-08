import type { PathPoint } from '../../core/types/game-state';
import { Position } from '../../core/types/position';

/**
 * Маршрут хода одного кубика — не по клетке, а отрезками.
 *
 * Правила (`moveBoxes`) отдают путь по клеткам: старт, каждая клетка проезда,
 * клетка входа в портал, клетка выхода. Для анимации такая россыпь не нужна:
 * если вести tween на каждую клетку, кубик доскакивает на easing'е до границы
 * клетки и замирает — движение читается как ступеньки, хотя кадров 60.
 *
 * Поэтому путь склеивается в отрезки: сколько клеток кубик проехал в одном
 * направлении, и отдельно — прыжок через портал (во время него кубик ждёт,
 * пока проиграет анимация). Поворот на ротаторе или продолжение движения после
 * выхода из портала начинает новый отрезок, даже если направление совпало.
 *
 * Вид маршрута повторяет то, как ход описывается словами:
 * `[{ dir, cells }, { dir, cells }, { teleport }]`.
 */

/** Прямой проезд: `cells` клеток в направлении `dir` (одна из четырёх осей). */
export interface SlideSegment {
  kind: 'slide';
  dir: { x: number; y: number };
  cells: number;
}

/** Прыжок через портал: кубик исчез на входе и появился на выходе. */
export interface TeleportSegment {
  kind: 'teleport';
  /** Клетка портала, в которую въехал кубик. */
  entry: Position;
  /** Парная клетка, на которой кубик появился. */
  exit: Position;
}

export type RouteSegment = SlideSegment | TeleportSegment;

/**
 * Склеить путь из правил в отрезки маршрута. Путь из одной точки (кубик не
 * сдвинулся) даёт пустой маршрут.
 */
export function planRoute(path: readonly PathPoint[]): RouteSegment[] {
  const segments: RouteSegment[] = [];
  for (let i = 1; i < path.length; i++) {
    const point = path[i];
    const prev = path[i - 1].pos;
    if (point.teleport) {
      segments.push({ kind: 'teleport', entry: prev.clone(), exit: point.pos.clone() });
      continue;
    }
    const dx = point.pos.x - prev.x;
    const dy = point.pos.y - prev.y;
    // Клетка не сменилась — такого в путях правил не бывает, но маршрут
    // не должен из-за этого получить пустой отрезок.
    if (dx === 0 && dy === 0) continue;
    const last = segments[segments.length - 1];
    // Отрезок продолжается только в том же направлении: после портала
    // кубик «выезжает» заново, и ждать ему всё равно придётся.
    if (last && last.kind === 'slide' && last.dir.x === dx && last.dir.y === dy) {
      last.cells += 1;
      continue;
    }
    segments.push({ kind: 'slide', dir: { x: dx, y: dy }, cells: 1 });
  }
  return segments;
}

/** Сколько клеток кубик проезжает по маршруту (прыжки через портал не в счёт). */
export function routeCells(segments: readonly RouteSegment[]): number {
  let cells = 0;
  for (const segment of segments) {
    if (segment.kind === 'slide') cells += segment.cells;
  }
  return cells;
}

/** Первый прыжок через портал в маршруте (по правилам он в ходу один). */
export function firstTeleport(segments: readonly RouteSegment[]): TeleportSegment | null {
  for (const segment of segments) {
    if (segment.kind === 'teleport') return segment;
  }
  return null;
}
