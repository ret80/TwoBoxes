import type { IInput, InputHandler, InputPayload } from '../../ports/IInput';
import { InputAction } from '../../ports/IInput';
import { KeyboardInput } from './KeyboardInput';
import { TouchInput } from './TouchInput';
import { GamepadInput } from './GamepadInput';
import { DemoInput } from './DemoInput';

const DEBOUNCE_MS = 100; // защита от случайных двойных ходов

/**
 * Объединяет все источники ввода (план 8.4).
 * Приоритет источников: gamepad > touch > keyboard (дедупликация через debounce).
 * В демо-режиме добавляет автоигру DemoInput (фон меню).
 */
export class InputAggregator implements IInput {
  private handlers = new Map<InputAction, Set<InputHandler>>();
  private lastDispatch = 0;
  private enabled = true;
  private demo = false;

  private keyboard: KeyboardInput;
  private touch: TouchInput;
  private gamepad: GamepadInput;
  private demoInput: DemoInput;

  constructor() {
    this.keyboard = new KeyboardInput((a) => this.dispatch(a));
    this.touch = new TouchInput((a, dir) => this.dispatch(a, { dir }));
    this.gamepad = new GamepadInput((a) => this.dispatch(a));
    this.demoInput = new DemoInput((a, dir) => this.dispatch(a, { dir }));
  }

  attach(): void {
    this.keyboard.attach();
    this.touch.attach();
    this.gamepad.attach();
  }

  on(action: InputAction, handler: InputHandler): void {
    if (!this.handlers.has(action)) this.handlers.set(action, new Set());
    this.handlers.get(action)!.add(handler);
  }

  off(action: InputAction, handler: InputHandler): void {
    this.handlers.get(action)?.delete(handler);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setDemoMode(demo: boolean): void {
    this.demo = demo;
    if (demo) this.demoInput.start();
    else this.demoInput.stop();
  }

  dispose(): void {
    this.keyboard.dispose();
    this.touch.dispose();
    this.gamepad.dispose();
    this.demoInput.stop();
    this.handlers.clear();
  }

  /** Прямая отправка действия (публично для контроллеров/тестов). */
  dispatch(action: InputAction, payload?: InputPayload): void {
    if (!this.enabled) return;
    // Debounce направлений (не UI-действий)
    const isDir =
      action === InputAction.UP ||
      action === InputAction.DOWN ||
      action === InputAction.LEFT ||
      action === InputAction.RIGHT;
    const now = performance.now();
    if (isDir && now - this.lastDispatch < DEBOUNCE_MS) return;
    if (isDir) this.lastDispatch = now;

    for (const h of this.handlers.get(action) ?? []) h(payload);
  }

  /** Демо-режим не воспроизводит звук — контроллер проверяет флаг demoMode. */
  isDemo(): boolean {
    return this.demo;
  }
}
