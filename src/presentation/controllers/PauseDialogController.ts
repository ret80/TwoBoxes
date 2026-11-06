import type { LocaleManager } from '../i18n/LocaleManager';
import { buildPauseDialog } from '../html/screens';

/**
 * Контроллер диалога паузы (план 11.6).
 * ⚠️ Без события FSM: пауза — диалог поверх сцены (правки плана, п.14);
 * menuFSM остаётся в `game`.
 */
export class PauseDialogController {
  private root!: HTMLElement;
  private container: HTMLElement;
  private i18n: LocaleManager;
  private audio: { pause(): void; resume(): void };
  private input: { setEnabled(enabled: boolean): void };
  private onResumeGame: () => void;
  private onLevelSelect: () => void;
  private onMainMenu: () => void;
  private onVisibility?: (visible: boolean) => void;

  constructor(
    container: HTMLElement,
    i18n: LocaleManager,
    audio: { pause(): void; resume(): void },
    input: { setEnabled(enabled: boolean): void },
    handlers: {
      onResume: () => void;
      onLevelSelect: () => void;
      onMainMenu: () => void;
      /** Открытие/закрытие диалога — для размытия сцены под ним. */
      onVisibility?: (visible: boolean) => void;
    },
  ) {
    this.container = container;
    this.i18n = i18n;
    this.audio = audio;
    this.input = input;
    this.onResumeGame = handlers.onResume;
    this.onLevelSelect = handlers.onLevelSelect;
    this.onMainMenu = handlers.onMainMenu;
    this.onVisibility = handlers.onVisibility;
    this.build();
    i18n.subscribe(() => this.build());
  }

  /** Пересобрать диалог: подписи зависят от текущего языка. */
  private build(): void {
    this.root?.remove();
    const { root } = buildPauseDialog(this.i18n, {
      onResume: () => {
        this.hide();
        this.audio.resume();
        this.input.setEnabled(true);
        this.onResumeGame();
      },
      onLevelSelect: () => {
        this.hide();
        this.audio.resume();
        this.input.setEnabled(true);
        this.onLevelSelect();
      },
      onMainMenu: () => {
        this.hide();
        this.audio.resume();
        this.input.setEnabled(true);
        this.onMainMenu();
      },
    });
    this.root = root;
    this.container.appendChild(root);
  }

  show(): void {
    this.audio.pause();
    this.input.setEnabled(false);
    this.root.classList.remove('dialog--hidden');
    this.onVisibility?.(true);
  }

  hide(): void {
    this.root.classList.add('dialog--hidden');
    this.onVisibility?.(false);
  }

  get visible(): boolean {
    return !this.root.classList.contains('dialog--hidden');
  }
}
