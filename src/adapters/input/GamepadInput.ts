import { InputAction } from '../../ports/IInput';

export type Dispatcher = (action: InputAction) => void;

const DEADZONE = 0.2; // deadzone аналогового стика

/**
 * Ввод с геймпада (план 8.3).
 * D-pad: up/down/left/right; стик (deadzone 0.2) → направление;
 * A/× → RESUME, B/○ → BACK, START → PAUSE.
 * Опрос `navigator.getGamepads()` в игровом цикле.
 */
export class GamepadInput {
  private prevButtons: boolean[] = [];
  private rafId = 0;
  private running = false;

  constructor(private dispatch: Dispatcher) {}

  attach(): void {
    if (this.running) return;
    this.running = true;
    const poll = () => {
      if (!this.running) return;
      this.pollOnce();
      this.rafId = requestAnimationFrame(poll);
    };
    this.rafId = requestAnimationFrame(poll);
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /** Один кадр опроса (публично для тестов с моком). */
  pollOnce(navigatorRef: Navigator = navigator): void {
    const pads = navigatorRef.getGamepads?.() ?? [];
    const pad = Array.from(pads).find((p) => p && p.connected);
    if (!pad) return;

    // D-pad (standart mapping: 12=up, 13=down, 14=left, 15=right)
    const dpad: (InputAction | null)[] = [
      InputAction.UP,
      InputAction.DOWN,
      InputAction.LEFT,
      InputAction.RIGHT,
    ];
    dpad.forEach((action, i) => {
      const pressed = !!pad.buttons[12 + i]?.pressed;
      if (pressed && !this.prevButtons[12 + i] && action) this.dispatch(action);
    });

    // Аналоговый стик
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    if (Math.abs(ax) > DEADZONE || Math.abs(ay) > DEADZONE) {
      if (Math.abs(ax) > Math.abs(ay)) {
        this.dispatch(ax > 0 ? InputAction.RIGHT : InputAction.LEFT);
      } else {
        this.dispatch(ay > 0 ? InputAction.DOWN : InputAction.UP);
      }
    }

    // Кнопки (edge-triggered)
    const buttonActions: [number, InputAction][] = [
      [0, InputAction.RESUME], // A/×
      [1, InputAction.BACK], // B/○
      [9, InputAction.PAUSE], // START
    ];
    for (const [idx, action] of buttonActions) {
      const pressed = !!pad.buttons[idx]?.pressed;
      if (pressed && !this.prevButtons[idx]) this.dispatch(action);
    }

    this.prevButtons = pad.buttons.map((b) => b.pressed);
  }
}
