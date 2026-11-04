import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageSave } from './LocalStorageSave';

describe('LocalStorageSave (план 10.1)', () => {
  const s = new LocalStorageSave();

  beforeEach(() => {
    localStorage.clear();
  });

  it('save/load round-trip', () => {
    s.save('test', { a: 1, b: 'x' });
    expect(s.load('test')).toEqual({ a: 1, b: 'x' });
  });

  it('load отсутствующего ключа → null', () => {
    expect(s.load('nope')).toBeNull();
  });

  it('remove удаляет ключ', () => {
    s.save('test', 1);
    s.remove('test');
    expect(s.load('test')).toBeNull();
  });

  it('повреждённый JSON удаляется и возвращает null', () => {
    localStorage.setItem('2boxpuzzle:test', '{broken');
    expect(s.load('test')).toBeNull();
    expect(localStorage.getItem('2boxpuzzle:test')).toBeNull();
  });
});
