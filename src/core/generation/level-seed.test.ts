import { describe, expect, it } from 'vitest';
import { formatLevelSeed, levelSeed } from './level-seed';
import { createLevelFromData } from '../rules/create';

const ROWS = [
  ' ####### ',
  ' #..r..# ',
  ' #..R..# ',
  ' ####### ',
];

describe('сид уровня', () => {
  it('одинаковые карты дают одинаковый сид, разные — разные', () => {
    const level = createLevelFromData(0, 0, ROWS);
    const same = createLevelFromData(3, 5, ROWS);
    const other = createLevelFromData(0, 0, [' ####### ', ' #..r..# ', ' #..R..# ', ' ######  ']);

    // Номер эпизода и уровня на сид не влияют — это отпечаток самой карты.
    expect(levelSeed(same)).toBe(levelSeed(level));
    expect(levelSeed(other)).not.toBe(levelSeed(level));
  });

  it('учитывает механики уровня', () => {
    const plain = createLevelFromData(0, 0, [' ### ### ', ' #..r..# ', ' #..R..# ', ' ####### ']);
    const portal = createLevelFromData(0, 0, [' ### ### ', ' #.ar..# ', ' #..R..# ', ' ####### ']);
    expect(levelSeed(portal)).not.toBe(levelSeed(plain));
  });

  it('показывается как 0x и восемь hex-цифр', () => {
    expect(formatLevelSeed(0x2b0b2)).toBe('0x0002b0b2');
    expect(formatLevelSeed(0xffffffff)).toBe('0xffffffff');
  });
});
