import { describe, expect, it, vi } from 'vitest';
import { GamepadInput } from './GamepadInput';
import { InputAction } from '../../ports/IInput';

function fakeNavigator(pressedIndices: number[], axes: number[]): Navigator {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: pressedIndices.includes(i) }));
  const pad = { connected: true, buttons, axes };
  return { getGamepads: () => [null, pad] } as unknown as Navigator;
}

describe('GamepadInput (план 8.3)', () => {
  it('D-pad → направления (edge-triggered)', () => {
    const dispatch = vi.fn();
    const gp = new GamepadInput(dispatch);
    gp.pollOnce(fakeNavigator([12], [0, 0])); // кнопка 12 = up
    expect(dispatch).toHaveBeenCalledWith(InputAction.UP);
    // отпущена — повторного события нет
    gp.pollOnce(fakeNavigator([], [0, 0]));
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('стик с превышением deadzone → направление', () => {
    const dispatch = vi.fn();
    const gp = new GamepadInput(dispatch);
    gp.pollOnce(fakeNavigator([], [-0.9, 0]));
    expect(dispatch).toHaveBeenCalledWith(InputAction.LEFT);
    // в мёртвой зоне — ничего
    gp.pollOnce(fakeNavigator([], [0.1, 0.1]));
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('A/× → RESUME, B/○ → BACK', () => {
    const dispatch = vi.fn();
    const gp = new GamepadInput(dispatch);
    gp.pollOnce(fakeNavigator([0], [0, 0])); // A/×
    expect(dispatch).toHaveBeenCalledWith(InputAction.RESUME);
    gp.pollOnce(fakeNavigator([1], [0, 0])); // B/○
    expect(dispatch).toHaveBeenCalledWith(InputAction.BACK);
  });
});
