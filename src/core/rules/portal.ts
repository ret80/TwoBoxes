import { CellType, portalPartner } from '../types/cell';
import type { PathPoint } from '../types/game-state';
import type { Level } from '../types/level';
import { Position } from '../types/position';

/**
 * Все правила телепорта — в одном месте.
 *
 * Семантика портала раньше была размазана по коду: `moveBoxes` сам искал
 * парную клетку и решал, кто куда едет, а рендерер по совпадению «выход
 * одного = вход другого» угадывал, что кубики поменялись местами. Теперь и
 * ход, и анимация спрашивают одно и то же правило.
 *
 * Решатель, подсказка и генератор уровней не знают о порталах ничего: они
 * ходят только через `moveBoxes`, поэтому любая правка здесь сразу доезжает
 * до игры, решателя и генератора. Генератору дополнительно нужен только
 * признак «этот ход был обменом» — он и отдаётся в состоянии хода
 * (`GameState.portalSwaps`).
 *
 * Правила:
 * - вход переносит кубик на парный портал и отпускает дальше в том же
 *   направлении;
 * - если на выходе стоит свободный кубик, они меняются местами: вошедший
 *   уходит на выход, стоявший там — на вход;
 * - запертый ловушкой кубик в этом ходу не двигается, поэтому вход работает
 *   как упор;
 * - второй вход за ход не телепортирует: кубик, проехавший выход и снова
 *   доехавший до входа, иначе прыгал бы туда-обратно бесконечно.
 */

/** Кубик в пределах одного хода — порталу нужны только эти поля. */
export interface PortalRun {
  pos: Position;
  /** Кубик ещё едет: не упёрся, не застрял в ловушке, не заперт. */
  moving: boolean;
  points: PathPoint[];
  /** Кубик уже пользовался порталом в этом ходу: второй вход не телепортирует. */
  teleported: boolean;
}

/** Кубик, въехавший на клетку портала в текущем шаге. */
export interface PortalArrival {
  index: number;
  cell: CellType;
}

/** Один прыжок через портал: от клетки входа до клетки выхода. */
export interface PortalHop {
  entry: Position;
  exit: Position;
}

export class PortalRule {
  /** Парная клетка одна на уровень: ищем её один раз за ход. */
  private readonly exits = new Map<CellType, Position | null>();

  constructor(private readonly level: Level) {}

  /** Клетка портала — вход. */
  static isEntrance(cell: CellType): boolean {
    return portalPartner(cell) !== null;
  }

  /**
   * Два прыжка — это обмен местами: выход одного приходится на вход другого.
   * По этому признаку рендерер связывает прыжки в пару и стартует их вместе.
   */
  static isSwapPair(a: PortalHop, b: PortalHop): boolean {
    return a.exit.equals(b.entry) && b.exit.equals(a.entry);
  }

  /** Ключ клетки в карте занятости (`occupied`): y * width + x. */
  cellKey(pos: Position): number {
    return pos.y * this.level.width + pos.x;
  }

  /** Парная клетка портала или null, если пары на уровне нет. */
  exitOf(from: Position, cell: CellType): Position | null {
    const partner = portalPartner(cell);
    if (!partner) return null;
    if (this.exits.has(partner)) return this.exits.get(partner)?.clone() ?? null;

    let found: Position | null = null;
    for (let y = 0; y < this.level.height && !found; y++) {
      for (let x = 0; x < this.level.width; x++) {
        const pos = new Position(x, y);
        if (pos.equals(from)) continue;
        if (this.level.grid.get(pos) === partner) {
          found = pos;
          break;
        }
      }
    }
    this.exits.set(partner, found);
    return found?.clone() ?? null;
  }

  /**
   * Разрешить все входы одного шага: перенос, обмен местами или упор.
   * Входы считаются вместе — иначе два кубика, одновременно въехавшие в
   * парные порталы, глушили бы друг друга.
   *
   * @returns сколько обменов местами случилось в этом шаге (0 или 1).
   */
  resolve(
    runs: PortalRun[],
    occupied: Map<number, number>,
    arrivals: PortalArrival[],
    locked: readonly boolean[],
  ): number {
    if (arrivals.length === 0) return 0;
    const handled = new Set<number>();
    let swaps = 0;

    for (const arrival of arrivals) {
      if (handled.has(arrival.index)) continue;
      const run = runs[arrival.index];
      if (run.teleported) {
        run.moving = false;
        continue;
      }

      const exit = this.exitOf(run.pos, arrival.cell);
      if (!exit) {
        run.moving = false;
        continue;
      }

      const occupant = occupied.get(this.cellKey(exit));
      if (occupant === undefined || occupant === arrival.index) {
        this.transfer(run, exit, occupied, arrival.index);
        continue;
      }

      if (locked[occupant]) {
        // Запертый кубик в этом ходу не двигается: вход становится упором.
        run.moving = false;
        continue;
      }

      // Обмен: кубик с выхода уходит на вход, а вошедший — на выход. Оба
      // проигрывают телепорт, поэтому один и тот же шаг годится и для двух
      // кубиков, въехавших в порталы разом, и для второго кубика, который
      // доехал до входа позже.
      const entry = run.pos.clone();
      const other = runs[occupant];
      occupied.delete(this.cellKey(entry));
      occupied.delete(this.cellKey(exit));
      this.moveTo(run, exit, occupied, arrival.index);
      this.moveTo(other, entry, occupied, occupant);
      handled.add(arrival.index);
      handled.add(occupant);
      swaps++;
    }

    return swaps;
  }

  /** Выход свободен: перенос и продолжение движения в том же направлении. */
  private transfer(
    run: PortalRun,
    exit: Position,
    occupied: Map<number, number>,
    index: number,
  ): void {
    occupied.delete(this.cellKey(run.pos));
    this.moveTo(run, exit, occupied, index);
  }

  private moveTo(
    run: PortalRun,
    pos: Position,
    occupied: Map<number, number>,
    index: number,
  ): void {
    run.pos = pos;
    run.points.push({ pos: pos.clone(), teleport: true });
    run.teleported = true;
    occupied.set(this.cellKey(run.pos), index);
  }
}
