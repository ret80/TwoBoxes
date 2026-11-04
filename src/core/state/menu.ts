import { assign, setup } from 'xstate';

/**
 * Меню FSM (аналог menuFSM — глобальное состояние приложения).
 * Состояния: mmenu (стартовое) → selector / game / help / about.
 *
 * Демо-режим: активен во всех состояниях, кроме `game`
 * (даёт анимированный фон, раздел 17.6 документации).
 */
export interface SelectedLevel {
  episodeId: number;
  levelId: number;
}

export interface MenuContext {
  demoMode: boolean;
  selected: SelectedLevel | null;
}

export type MenuEvent =
  | { type: 'PLAY' } // mmenu → selector
  | { type: 'RESUME' } // mmenu → game (сохранённый уровень)
  | { type: 'HELP' } // mmenu → help
  | { type: 'ABOUT' } // mmenu → about
  | { type: 'BACK' } // selector/help/about → mmenu; game → selector (пауза «Level select»)
  | { type: 'SELECT_LEVEL'; episodeId: number; levelId: number } // selector → game
  | { type: 'HOME' } // game → mmenu (диалоги паузы/завершения)
  | { type: 'NEXT_LEVEL' } // game → game (self-переход, следующий уровень)
  | { type: 'RESET' }; // game → game (self-переход, сброс уровня)

export const menuMachine = setup({
  types: {
    context: {} as MenuContext,
    events: {} as MenuEvent,
  },
  actions: {
    enterDemo: assign(() => ({ demoMode: true })),
    enterGame: assign(() => ({ demoMode: false })),
    selectLevel: assign(({ event }) =>
      event.type === 'SELECT_LEVEL'
        ? {
            demoMode: false,
            selected: { episodeId: event.episodeId, levelId: event.levelId },
          }
        : {},
    ),
    clearSelected: assign(() => ({ selected: null })),
  },
}).createMachine({
  id: 'menu',
  initial: 'mmenu',
  context: {
    demoMode: true,
    selected: null,
  },
  states: {
    mmenu: {
      entry: 'enterDemo',
      on: {
        PLAY: 'selector',
        RESUME: 'game',
        HELP: 'help',
        ABOUT: 'about',
      },
    },
    selector: {
      entry: 'enterDemo',
      on: {
        BACK: { target: 'mmenu', actions: 'clearSelected' },
        SELECT_LEVEL: { target: 'game', actions: 'selectLevel' },
      },
    },
    game: {
      // Вход в игру: если есть selected — играем выбранный уровень,
      // иначе — сохранённый (RESUME); контроллер читает контекст машины.
      entry: 'enterGame',
      on: {
        HOME: { target: 'mmenu', actions: 'clearSelected' },
        BACK: { target: 'selector', actions: 'clearSelected' },
        NEXT_LEVEL: { target: 'game', reenter: true },
        RESET: { target: 'game', reenter: true },
      },
    },
    help: {
      entry: 'enterDemo',
      on: { BACK: 'mmenu' },
    },
    about: {
      entry: 'enterDemo',
      on: { BACK: 'mmenu' },
    },
  },
});
