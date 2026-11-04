import { Position } from '../core/types/position';

/** Действия ввода (единый механизм подписки — см. правки плана, п.9). */
export enum InputAction {
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  RESET = 'RESET',
  NEXT = 'NEXT',
  HOME = 'HOME',
  RESUME = 'RESUME',
  BACK = 'BACK',
  PAUSE = 'PAUSE',
  SELECT_LEVEL = 'SELECT_LEVEL',
}

export interface InputPayload {
  dir?: Position; // для направлений
  episodeId?: number; // для SELECT_LEVEL
  levelId?: number;
}

export type InputHandler = (payload?: InputPayload) => void;

/**
 * Порт ввода (keyboard + touch + gamepad + demo через InputAggregator, Фаза 8).
 */
export interface IInput {
  on(action: InputAction, handler: InputHandler): void;
  off(action: InputAction, handler: InputHandler): void;
  /** Включить/выключить обработку (пауза, диалоги). */
  setEnabled(enabled: boolean): void;
  /** Демо-режим автоигры (фон меню). */
  setDemoMode(demo: boolean): void;
  dispose(): void;
}
