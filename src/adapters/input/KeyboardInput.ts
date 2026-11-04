import { InputAction } from '../../ports/IInput';
import { DIRS } from '../../core/types/position';

export type Dispatcher = (action: InputAction) => void;

/**
 * Ввод с клавиатуры (план 8.1, аналог script/game/input/input_key.gd).
 * Стрелки → направления; R → RESET; Escape → PAUSE; Enter → RESUME.
 */
export class KeyboardInput {
  private onKeyDown = (e: KeyboardEvent) => {
    let action: InputAction | null = null;
    switch (e.key) {
      case 'ArrowUp':
        action = InputAction.UP;
        break;
      case 'ArrowDown':
        action = InputAction.DOWN;
        break;
      case 'ArrowLeft':
        action = InputAction.LEFT;
        break;
      case 'ArrowRight':
        action = InputAction.RIGHT;
        break;
      case 'r':
      case 'R':
      case 'к':
      case 'К':
        action = InputAction.RESET;
        break;
      case 'Escape':
        action = InputAction.PAUSE;
        break;
      case 'Enter':
        action = InputAction.RESUME;
        break;
      default:
        return;
    }
    e.preventDefault();
    this.dispatch(action);
  };

  constructor(private dispatch: Dispatcher) {}

  attach(): void {
    window.addEventListener('keydown', this.onKeyDown);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
  }
}

// Направления экспортированы для тестов
void DIRS;
