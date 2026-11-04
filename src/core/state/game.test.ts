import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { DIRS, Position } from '../types/position';
import { createLevelFromData } from '../rules/create';
import { createGameMachine } from './game';

function setup(rows: string[]) {
  const level = createLevelFromData(0, 0, rows);
  const actor = createActor(createGameMachine(level));
  actor.start();
  return { level, actor };
}

describe('Игровой FSM (create→input→move→check)', () => {
  it('create → CREATE_DONE → input', () => {
    const { actor } = setup(['#R..r#']);
    expect(actor.getSnapshot().value).toBe('create');
    actor.send({ type: 'CREATE_DONE' });
    expect(actor.getSnapshot().value).toBe('input');
  });

  it('MOVE → move → MOVE_DONE → check → (не победа) → input', () => {
    const { level, actor } = setup(['#R..#..r#']);
    actor.send({ type: 'CREATE_DONE' });
    actor.send({ type: 'MOVE', dir: DIRS.right });
    expect(actor.getSnapshot().value).toBe('move');
    actor.send({ type: 'MOVE_DONE' });
    // check — переходное состояние (always): сразу уходит в input/completed
    expect(actor.getSnapshot().value).toBe('input');
    expect(actor.getSnapshot().context.moves).toBe(1);
    void level;
  });

  it('ход в стену игнорируется (guard canMove)', () => {
    const { actor } = setup(['#R#']);
    actor.send({ type: 'CREATE_DONE' });
    actor.send({ type: 'MOVE', dir: DIRS.right });
    expect(actor.getSnapshot().value).toBe('input');
    expect(actor.getSnapshot().context.moves).toBe(0);
  });

  it('победа: check → completed', () => {
    const { actor } = setup(['#R.r#']);
    actor.send({ type: 'CREATE_DONE' });
    actor.send({ type: 'MOVE', dir: DIRS.right });
    actor.send({ type: 'MOVE_DONE' });
    expect(actor.getSnapshot().value).toBe('completed');
  });

  it('RESTART перезапускает уровень', () => {
    const { level, actor } = setup(['#R.r#']);
    actor.send({ type: 'CREATE_DONE' });
    actor.send({ type: 'MOVE', dir: DIRS.right });
    actor.send({ type: 'MOVE_DONE' });
    expect(actor.getSnapshot().value).toBe('completed');
    actor.send({ type: 'RESTART', level });
    expect(actor.getSnapshot().value).toBe('create');
    expect(actor.getSnapshot().context.moves).toBe(0);
  });

  it('START перезапускает контекст уровня', () => {
    const { level, actor } = setup(['#R..r#']);
    actor.send({ type: 'CREATE_DONE' });
    actor.send({ type: 'MOVE', dir: DIRS.right });
    const newLevel = createLevelFromData(0, 5, ['#Y..y#']);
    actor.send({ type: 'START', level: newLevel });
    expect(actor.getSnapshot().value).toBe('create');
    expect(actor.getSnapshot().context.level.levelId).toBe(5);
    expect(actor.getSnapshot().context.moves).toBe(0);
    void level;
  });

  it('UNDO возвращает кубики и счётчик хода к состоянию до хода', () => {
    const { actor } = setup(['#R..#..r#']);
    actor.send({ type: 'CREATE_DONE' });
    const start = actor.getSnapshot().context.boxes[0].pos.clone();
    actor.send({ type: 'MOVE', dir: DIRS.right });
    actor.send({ type: 'MOVE_DONE' });
    expect(actor.getSnapshot().context.moves).toBe(1);
    actor.send({ type: 'UNDO' });
    expect(actor.getSnapshot().value).toBe('move');
    actor.send({ type: 'MOVE_DONE' });
    expect(actor.getSnapshot().value).toBe('input');
    expect(actor.getSnapshot().context.moves).toBe(0);
    expect(actor.getSnapshot().context.boxes[0].pos).toEqual(start);
    expect(actor.getSnapshot().context.history).toHaveLength(0);
  });

  it('UNDO без ходов игнорируется (guard canUndo)', () => {
    const { actor } = setup(['#R..#..r#']);
    actor.send({ type: 'CREATE_DONE' });
    actor.send({ type: 'UNDO' });
    expect(actor.getSnapshot().value).toBe('input');
    expect(actor.getSnapshot().context.moves).toBe(0);
  });

  it('TICK увеличивает время', () => {
    const { actor } = setup(['#R.r#']);
    actor.send({ type: 'CREATE_DONE' });
    actor.send({ type: 'TICK', delta: 0.5 });
    actor.send({ type: 'TICK', delta: 0.25 });
    expect(actor.getSnapshot().context.time).toBeCloseTo(0.75);
  });
});

describe('Дифф-анимация контроллера: позиции кубиков обновляются', () => {
  it('после хода позиции меняются в контексте', () => {
    const { actor } = setup(['#R..#..r#']);
    actor.send({ type: 'CREATE_DONE' });
    actor.send({ type: 'MOVE', dir: DIRS.right });
    const boxes = actor.getSnapshot().context.boxes;
    expect(boxes[0].pos).toEqual(new Position(3, 0));
  });
});
