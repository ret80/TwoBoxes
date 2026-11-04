import { describe, expect, it } from 'vitest';
import { Statistics } from './statistics';

describe('Statistics (CounterVar + TimerVar)', () => {
  it('таймер тикает только когда активен', () => {
    const s = new Statistics();
    s.tick(1);
    expect(s.getTime()).toBe(0);
    s.start();
    s.tick(0.5);
    s.tick(0.25);
    expect(s.getTime()).toBeCloseTo(0.75);
    s.stop();
    s.tick(10);
    expect(s.getTime()).toBeCloseTo(0.75);
  });

  it('счётчик ходов инкрементируется', () => {
    const s = new Statistics();
    s.incrementMoves();
    s.incrementMoves();
    expect(s.getMoves()).toBe(2);
  });

  it('reset сбрасывает всё', () => {
    const s = new Statistics();
    s.start();
    s.incrementMoves();
    s.tick(5);
    s.reset();
    expect(s.getMoves()).toBe(0);
    expect(s.getTime()).toBe(0);
    s.tick(1);
    expect(s.getTime()).toBe(0);
  });
});
