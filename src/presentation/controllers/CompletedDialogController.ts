import type { LocaleManager } from '../i18n/LocaleManager';
import { buildCompletedDialog } from '../html/screens';

/**
 * Контроллер диалога завершения уровня (план 11.7).
 * Показывает статистику (ходы, время), кнопки Next / Home / Reset.
 * Звук 'message-appear' при открытии.
 */
export class CompletedDialogController {
  private root!: HTMLElement;
  private statsEl!: HTMLElement;
  private titleEl!: HTMLElement;
  private container: HTMLElement;
  private i18n: LocaleManager;
  private audio: { playSfx(name: string): void };
  private onNextGame: () => void;
  private onHomeGame: () => void;
  private onResetGame: () => void;
  private onVisibility?: (visible: boolean) => void;

  constructor(
    container: HTMLElement,
    i18n: LocaleManager,
    audio: { playSfx(name: string): void },
    handlers: {
      onNext: () => void;
      onHome: () => void;
      onReset: () => void;
      /** Открытие/закрытие диалога — для размытия сцены под ним. */
      onVisibility?: (visible: boolean) => void;
    },
  ) {
    this.container = container;
    this.i18n = i18n;
    this.audio = audio;
    this.onNextGame = handlers.onNext;
    this.onHomeGame = handlers.onHome;
    this.onResetGame = handlers.onReset;
    this.onVisibility = handlers.onVisibility;
    this.build();
    i18n.subscribe(() => this.build());
  }

  private build(): void {
    this.root?.remove();
    const { root, stats, title } = buildCompletedDialog(this.i18n, {
      onNext: () => this.onNextGame(),
      onHome: () => this.onHomeGame(),
      onReset: () => this.onResetGame(),
    });
    this.root = root;
    this.statsEl = stats;
    this.titleEl = title;
    this.container.appendChild(root);
  }

  show(moves: number, time: number): void {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const timeStr = `${minutes}:${String(seconds).padStart(2, '0')}`;
    this.statsEl.innerHTML = '';
    this.statsEl.appendChild(
      document.createTextNode(this.i18n.t('MOVES_COUNT', moves)),
    );
    this.statsEl.appendChild(document.createElement('br'));
    this.statsEl.appendChild(document.createTextNode(this.i18n.t('TIME', timeStr)));
    this.root.classList.remove('dialog--hidden');
    this.audio.playSfx('message-appear');
    this.onVisibility?.(true);
    void this.titleEl;
  }

  hide(): void {
    this.root.classList.add('dialog--hidden');
    this.onVisibility?.(false);
  }
}
