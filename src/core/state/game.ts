import { assign, setup } from 'xstate';
import { checkWin } from '../rules/check';
import { moveBoxes } from '../rules/move';
import type { Box } from '../types/entity';
import type { PathPoint } from '../types/game-state';
import type { Level } from '../types/level';
import {
  cloneMechanicState,
  createMechanicState,
  type MechanicState,
} from '../types/mechanic-state';
import { Position } from '../types/position';

/**
 * Игровой FSM (аналог gameFSM из script/FSM + script/game/state/*).
 *
 * Машина **чистая**: анимации, звук и ввод подключаются контроллером
 * через подписку на переходы (гексагональная архитектура — ядро без адаптеров).
 *
 * Состояния: create → input → move → check → (completed | input).
 * Guards:
 * - `canMove` — хотя бы один кубик может двигаться (иначе ход игнорируется);
 * - `isWin` — все цели закрыты кубиками того же цвета (раздел 4.3).
 */
export interface GameContext {
  level: Level;
  boxes: Box[];
  moves: number;
  time: number; // секунды с начала уровня
  /** Состояние ловушек и переключателей (см. `moveBoxes`). */
  mechanicState: MechanicState;
  /** Пути кубиков за последний ход — контроллер строит по ним анимацию. */
  lastPaths: PathPoint[][];
  /** История ходов для undo: позиции, счётчик и состояние механик. */
  history: { boxes: Box[]; moves: number; mechanicState: MechanicState }[];
}

export type GameEvent =
  | { type: 'START'; level: Level } // начать уровень (перезаписывает контекст)
  | { type: 'CREATE_DONE' } // анимация появления завершена
  | { type: 'MOVE'; dir: Position } // ввод направления
  | { type: 'MOVE_DONE' } // tween-анимация движения завершена
  | { type: 'TICK'; delta: number } // тик игрового цикла (время)
  | { type: 'UNDO' } // откат последнего хода (кнопка undo)
  | { type: 'RESTART'; level: Level }; // NEXT_LEVEL / RESET (уровень уже переключён менеджером)

export function createGameMachine(initialLevel: Level) {
  return setup({
    types: {
      context: {} as GameContext,
      events: {} as GameEvent,
    },
    guards: {
      canMove: ({ context, event }) =>
        event.type === 'MOVE' &&
        moveBoxes(
          context.level,
          context.boxes,
          event.dir,
          context.moves,
          context.time,
          context.mechanicState,
        ) !== null,
      isWin: ({ context }) => checkWin(context.boxes, context.level.ends),
      canUndo: ({ context }) => context.history.length > 0,
    },
    actions: {
      setLevel: assign(({ event }) =>
        event.type === 'START' || event.type === 'RESTART'
          ? {
              level: event.level,
              boxes: event.level.boxes.map((b) => ({ pos: b.pos.clone(), color: b.color })),
              moves: 0,
              time: 0,
              mechanicState: createMechanicState(event.level.boxes.length),
              lastPaths: [],
              history: [],
            }
          : {},
      ),
      applyMove: assign(({ context, event }) => {
        if (event.type !== 'MOVE') return {};
        const next = moveBoxes(
          context.level,
          context.boxes,
          event.dir,
          context.moves,
          context.time,
          context.mechanicState,
        );
        if (!next) return {};
        return {
          boxes: next.boxes,
          moves: next.moves,
          mechanicState: next.mechanicState ?? context.mechanicState,
          lastPaths: next.paths ?? [],
          history: [
            ...context.history,
            {
              boxes: context.boxes.map((b) => ({ pos: b.pos.clone(), color: b.color })),
              moves: context.moves,
              mechanicState: cloneMechanicState(context.mechanicState),
            },
          ],
        };
      }),
      undo: assign(({ context }) => {
        const prev = context.history[context.history.length - 1];
        if (!prev) return {};
        return {
          boxes: prev.boxes.map((b) => ({ pos: b.pos.clone(), color: b.color })),
          moves: prev.moves,
          mechanicState: cloneMechanicState(prev.mechanicState),
          lastPaths: [],
          history: context.history.slice(0, -1),
        };
      }),
      tickTime: assign(({ context, event }) =>
        event.type === 'TICK' ? { time: context.time + event.delta } : {},
      ),
    },
  }).createMachine({
    id: 'game',
    initial: 'create',
    context: {
      level: initialLevel,
      boxes: initialLevel.boxes.map((b) => ({ pos: b.pos.clone(), color: b.color })),
      moves: 0,
      time: 0,
      mechanicState: createMechanicState(initialLevel.boxes.length),
      lastPaths: [],
      history: [],
    },
    states: {
      create: {
        on: { CREATE_DONE: 'input' },
      },
      input: {
        on: {
          MOVE: { target: 'move', guard: 'canMove', actions: 'applyMove' },
          // Откат идёт через `move`, чтобы кубики вернулись с анимацией,
          // а затем обычная проверка победы возвращает в `input`.
          UNDO: { target: 'move', guard: 'canUndo', actions: 'undo' },
          TICK: { actions: 'tickTime' },
        },
      },
      move: {
        on: {
          MOVE_DONE: 'check',
          TICK: { actions: 'tickTime' },
        },
      },
      check: {
        always: [
          { guard: 'isWin', target: 'completed' },
          { target: 'input' },
        ],
      },
      completed: {
        on: { RESTART: { target: 'create', actions: 'setLevel' } },
      },
    },
    on: {
      START: { target: '.create', actions: 'setLevel' },
    },
  });
}
