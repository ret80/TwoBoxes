import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { menuMachine } from './menu';

describe('Меню FSM (mmenu→selector→game→help→about)', () => {
  it('стартует в mmenu, демо-режим включён', () => {
    const actor = createActor(menuMachine);
    actor.start();
    expect(actor.getSnapshot().value).toBe('mmenu');
    expect(actor.getSnapshot().context.demoMode).toBe(true);
  });

  it('PLAY → selector → SELECT_LEVEL → game (демо выключен)', () => {
    const actor = createActor(menuMachine);
    actor.start();
    actor.send({ type: 'PLAY' });
    expect(actor.getSnapshot().value).toBe('selector');
    actor.send({ type: 'SELECT_LEVEL', episodeId: 0, levelId: 2 });
    expect(actor.getSnapshot().value).toBe('game');
    expect(actor.getSnapshot().context.demoMode).toBe(false);
    expect(actor.getSnapshot().context.selected).toEqual({ episodeId: 0, levelId: 2 });
  });

  it('RESUME → game', () => {
    const actor = createActor(menuMachine);
    actor.start();
    actor.send({ type: 'RESUME' });
    expect(actor.getSnapshot().value).toBe('game');
  });

  it('BACK из selector → mmenu, из game → selector', () => {
    const actor = createActor(menuMachine);
    actor.start();
    actor.send({ type: 'PLAY' });
    actor.send({ type: 'BACK' });
    expect(actor.getSnapshot().value).toBe('mmenu');
    actor.send({ type: 'RESUME' });
    actor.send({ type: 'BACK' });
    expect(actor.getSnapshot().value).toBe('selector');
  });

  it('HOME из game → mmenu', () => {
    const actor = createActor(menuMachine);
    actor.start();
    actor.send({ type: 'RESUME' });
    actor.send({ type: 'HOME' });
    expect(actor.getSnapshot().value).toBe('mmenu');
  });

  it('NEXT_LEVEL/RESET — self-переход в game', () => {
    const actor = createActor(menuMachine);
    actor.start();
    actor.send({ type: 'RESUME' });
    actor.send({ type: 'NEXT_LEVEL' });
    expect(actor.getSnapshot().value).toBe('game');
    actor.send({ type: 'RESET' });
    expect(actor.getSnapshot().value).toBe('game');
  });

  it('help и about → BACK → mmenu', () => {
    const actor = createActor(menuMachine);
    actor.start();
    actor.send({ type: 'HELP' });
    expect(actor.getSnapshot().value).toBe('help');
    actor.send({ type: 'BACK' });
    actor.send({ type: 'ABOUT' });
    expect(actor.getSnapshot().value).toBe('about');
    actor.send({ type: 'BACK' });
    expect(actor.getSnapshot().value).toBe('mmenu');
    expect(actor.getSnapshot().context.demoMode).toBe(true);
  });
});
