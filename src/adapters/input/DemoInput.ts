import { InputAction } from '../../ports/IInput';
import { DIRS, Position } from '../../core/types/position';

export type DirDispatcher = (action: InputAction, dir: Position) => void;
/** Подсказка «умного хода»: в демо компьютер идёт по решению, если оно есть. */
export type PreferredDirProvider = () => Position | null;

const MIN_DELAY_MS = 500;
const MAX_DELAY_MS = 2000;
const PROB_SHIFT = 0.2; // корректировка вероятностей (раздел 4.6 документации)

/** Действие ввода, соответствующее единичному направлению. */
function actionForDir(dir: Position): InputAction {
  if (dir.equals(DIRS.up)) return InputAction.UP;
  if (dir.equals(DIRS.down)) return InputAction.DOWN;
  if (dir.equals(DIRS.left)) return InputAction.LEFT;
  return InputAction.RIGHT;
}

/**
 * Демо-режим автоигры (план 8.5, аналог script/game/input/input_demo.gd).
 * Активен в меню (не в игре): компьютер двигает кубики с задержкой 0.5–2.0 сек.
 * Если доступна подсказка решения — ход идёт по ней (демо проходит уровни), иначе
 * направление выбирается случайно: выбранное снижает свой шанс на 0.2, остальные
 * повышают на 0.2. Звук в демо не воспроизводится.
 */
export class DemoInput {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private probabilities: Record<InputAction, number> = {
    [InputAction.UP]: 0.25,
    [InputAction.DOWN]: 0.25,
    [InputAction.LEFT]: 0.25,
    [InputAction.RIGHT]: 0.25,
    [InputAction.RESET]: 0,
    [InputAction.NEXT]: 0,
    [InputAction.HOME]: 0,
    [InputAction.RESUME]: 0,
    [InputAction.BACK]: 0,
    [InputAction.PAUSE]: 0,
    [InputAction.SELECT_LEVEL]: 0,
  };

  constructor(
    private dispatch: DirDispatcher,
    private getPreferredDir?: PreferredDirProvider,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
    this.timer = setTimeout(() => {
      if (!this.running) return;
      this.step();
      this.schedule();
    }, delay);
  }

  private step(): void {
    // Демо в главном меню: сначала пробуем осмысленный ход по решению.
    const preferred = this.getPreferredDir?.() ?? null;
    if (preferred) {
      this.dispatch(actionForDir(preferred), preferred);
      return;
    }
    const dirActions = [InputAction.UP, InputAction.DOWN, InputAction.LEFT, InputAction.RIGHT];
    // Выбор направления по вероятностям
    const total = dirActions.reduce((s, a) => s + this.probabilities[a], 0);
    let roll = Math.random() * total;
    let chosen: InputAction = dirActions[0];
    for (const a of dirActions) {
      roll -= this.probabilities[a];
      if (roll <= 0) {
        chosen = a;
        break;
      }
    }
    // Корректировка вероятностей: выбранный —0.2, остальные +0.2
    for (const a of dirActions) {
      this.probabilities[a] = Math.max(
        0.05,
        Math.min(0.85, this.probabilities[a] + (a === chosen ? -PROB_SHIFT : PROB_SHIFT)),
      );
    }
    const dirMap: Partial<Record<InputAction, Position>> = {
      [InputAction.UP]: DIRS.up,
      [InputAction.DOWN]: DIRS.down,
      [InputAction.LEFT]: DIRS.left,
      [InputAction.RIGHT]: DIRS.right,
    };
    this.dispatch(chosen, dirMap[chosen]!);
  }
}
