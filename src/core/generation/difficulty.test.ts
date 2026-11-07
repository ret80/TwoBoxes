import { describe, expect, it } from 'vitest';
import { measureLevel, narrowRatio, scoreDifficulty } from './difficulty';
import { createLevelFromData } from '../rules/create';
import { EPISODE_1 } from '../data/episode-1';

const levelOf = (index: number) => createLevelFromData(0, index, EPISODE_1[index]);

describe('difficulty model', () => {
  it('grows with every component', () => {
    const base = { moves: 6, states: 60, deadEndRatio: 0, branching: 2.5 };
    const score = scoreDifficulty(base);

    expect(scoreDifficulty({ ...base, moves: 12 })).toBeGreaterThan(score);
    expect(scoreDifficulty({ ...base, states: 300 })).toBeGreaterThan(score);
    expect(scoreDifficulty({ ...base, deadEndRatio: 0.3 })).toBeGreaterThan(score);
    expect(scoreDifficulty({ ...base, branching: 2.8 })).toBeGreaterThan(score);
  });

  it('stays inside 0..100', () => {
    expect(scoreDifficulty({ moves: 0, states: 0, deadEndRatio: 0, branching: 0 })).toBe(0);
    const max = scoreDifficulty({ moves: 30, states: 5000, deadEndRatio: 1, branching: 4 });
    expect(max).toBeLessThanOrEqual(100);
  });

  it('ranks the hand-made episode the way it plays', () => {
    const first = measureLevel(levelOf(0));
    const sixth = measureLevel(levelOf(5));
    const last = measureLevel(levelOf(11));

    expect(first).not.toBeNull();
    expect(sixth).not.toBeNull();
    expect(last).not.toBeNull();
    if (!first || !sixth || !last) return;

    expect(first.score).toBeLessThan(sixth.score);
    expect(sixth.score).toBeLessThan(last.score);
    // Новый 1-12 (исходный 1-10) — самый длинный уровень эпизода:
    // 28 ходов и 378 состояний.
    expect(last.moves).toBe(28);
    expect(last.score).toBeGreaterThan(80);
  });

  it('sees the punishing level as punishing', () => {
    // Новый 1-11 (исходный 1-4) — коридорная «гребёнка»: почти половина
    // состояний — тупики.
    const comb = measureLevel(levelOf(10));
    expect(comb).not.toBeNull();
    if (!comb) return;
    expect(comb.deadEndRatio).toBeGreaterThan(0.3);
    expect(comb.narrowRatio).toBeGreaterThan(0.7);
    expect(comb.score).toBeGreaterThan(measureLevel(levelOf(0))?.score ?? 0);
  });

  it('measures the previously broken hand-made level', () => {
    // Бывший 1-9 (теперь 1-10) раньше не решался (цель стояла на (6,6));
    // после переноса цели на клетку правее он решается за 18 ходов и попадает
    // между соседями по отсортированной кривой сложности.
    const fixed = measureLevel(levelOf(9));
    expect(fixed).not.toBeNull();
    if (!fixed) return;
    expect(fixed.moves).toBe(18);
    expect(fixed.score).toBeGreaterThan(measureLevel(levelOf(8))?.score ?? 0);
    expect(fixed.score).toBeLessThan(measureLevel(levelOf(10))?.score ?? 100);
  });

  it('measures corridor share of the field', () => {
    // Открытая комната 6×6: ровно два соседа только у четырёх углов.
    const open = createLevelFromData(0, 0, [
      '########',
      '#......#',
      '#......#',
      '#......#',
      '#......#',
      '#......#',
      '#......#',
      '########',
    ]);
    // Коридор шириной в клетку: у средних клеток ровно два соседа.
    const corridor = createLevelFromData(0, 0, [
      '#####',
      '##.##',
      '##.##',
      '##.##',
      '##.##',
      '##.##',
      '#####',
    ]);
    expect(narrowRatio(open)).toBeLessThan(0.2);
    expect(narrowRatio(corridor)).toBeGreaterThan(0.5);
  });
});
