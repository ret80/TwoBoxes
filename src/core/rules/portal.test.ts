import { describe, expect, it } from 'vitest';
import { createLevelFromData } from './create';
import { PortalRule, type PortalRun } from './portal';
import { CellType } from '../types/cell';
import { Position } from '../types/position';

const levelOf = (rows: string[]) => createLevelFromData(0, 0, rows);

const runAt = (x: number, y: number): PortalRun => ({
  pos: new Position(x, y),
  moving: true,
  points: [{ pos: new Position(x, y) }],
  teleported: false,
});

const pair = () => levelOf(['#######', '#..a..#', '#.....#', '#..b..#', '#######']);

describe('PortalRule', () => {
  it('находит парную клетку портала с любой стороны', () => {
    const rule = new PortalRule(pair());
    const a = new Position(3, 1);
    const b = new Position(3, 3);

    expect(rule.exitOf(a, CellType.PORTAL_A)?.equals(b)).toBe(true);
    expect(rule.exitOf(b, CellType.PORTAL_B)?.equals(a)).toBe(true);
    // Обычная клетка никуда не переносит.
    expect(rule.exitOf(a, CellType.EMPTY)).toBeNull();
  });

  it('считает обменом только пару прыжков навстречу друг другу', () => {
    const hop = (entry: [number, number], exit: [number, number]) => ({
      entry: new Position(...entry),
      exit: new Position(...exit),
    });

    expect(PortalRule.isSwapPair(hop([3, 1], [3, 3]), hop([3, 3], [3, 1]))).toBe(true);
    // Обычный перенос в одну сторону обменом не является.
    expect(PortalRule.isSwapPair(hop([3, 1], [3, 3]), hop([3, 2], [3, 1]))).toBe(false);
  });

  it('переносит кубика на свободный выход и сообщает об отсутствии обмена', () => {
    const rule = new PortalRule(pair());
    const runs = [runAt(3, 1)];
    const occupied = new Map([[rule.cellKey(runs[0].pos), 0]]);

    const swaps = rule.resolve(runs, occupied, [{ index: 0, cell: CellType.PORTAL_A }], [false]);

    expect(swaps).toBe(0);
    expect(runs[0].pos.equals(new Position(3, 3))).toBe(true);
    expect(runs[0].teleported).toBe(true);
    const points = runs[0].points!;
    expect(points[points.length - 1].teleport).toBe(true);
  });

  it('меняет кубиков местами, если выход занят', () => {
    const rule = new PortalRule(pair());
    const runs = [runAt(3, 1), runAt(3, 3)];
    const occupied = new Map([
      [rule.cellKey(runs[0].pos), 0],
      [rule.cellKey(runs[1].pos), 1],
    ]);

    const swaps = rule.resolve(
      runs,
      occupied,
      [{ index: 0, cell: CellType.PORTAL_A }],
      [false, false],
    );

    expect(swaps).toBe(1);
    expect(runs[0].pos.equals(new Position(3, 3))).toBe(true);
    expect(runs[1].pos.equals(new Position(3, 1))).toBe(true);
    // Карта занятости пересчитана: на клетках теперь другие кубики.
    expect(occupied.get(rule.cellKey(new Position(3, 3)))).toBe(0);
    expect(occupied.get(rule.cellKey(new Position(3, 1)))).toBe(1);
  });

  it('запертый кубик на выходе не обменивается, а останавливает вошедшего', () => {
    const rule = new PortalRule(pair());
    const runs = [runAt(3, 1), runAt(3, 3)];
    const occupied = new Map([
      [rule.cellKey(runs[0].pos), 0],
      [rule.cellKey(runs[1].pos), 1],
    ]);

    const swaps = rule.resolve(
      runs,
      occupied,
      [{ index: 0, cell: CellType.PORTAL_A }],
      [false, true],
    );

    expect(swaps).toBe(0);
    expect(runs[0].pos.equals(new Position(3, 1))).toBe(true);
    expect(runs[0].moving).toBe(false);
    expect(runs[0].teleported).toBe(false);
  });

  it('второй вход за ход не телепортирует', () => {
    const rule = new PortalRule(pair());
    const runs = [runAt(3, 1), runAt(1, 1)];
    const occupied = new Map([
      [rule.cellKey(runs[0].pos), 0],
      [rule.cellKey(runs[1].pos), 1],
    ]);
    runs[0].teleported = true;

    const swaps = rule.resolve(
      runs,
      occupied,
      [{ index: 0, cell: CellType.PORTAL_A }],
      [false, false],
    );

    expect(swaps).toBe(0);
    expect(runs[0].pos.equals(new Position(3, 1))).toBe(true);
    expect(runs[0].moving).toBe(false);
  });
});
