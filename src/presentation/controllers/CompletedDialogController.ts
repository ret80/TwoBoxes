import type { LocaleManager } from '../i18n/LocaleManager';
import { buildCompletedDialog } from '../html/screens';

/**
 * Контроллер диалога завершения уровня (план 11.7).
 * Показывает статистику (ходы, время), кнопки Next / Home / Reset.
 * Звук 'message-appear' при открытии.
 */
export class CompletedDialogController {
  private root: HTMLElement;
  private statsEl: HTMLElement;
  private titleEl: HTMLElement;
  private i18n: LocaleManager;
  private audio: { playSfx(name: string): void };

  constructor(
    container: HTMLElement,
    i18n: LocaleManager,
    audio: { playSfx(name: string): void },
    handlers: { onNext: () => void; onHome: () => void; onReset: () => void },
  ) {
    this.i18n = i18n;
    this.audio = audio;
    const { root, stats, title } = buildCompletedDialog(i18n, handlers);
    this.root = root;
    this.statsEl = stats;
    this.titleEl = title;
    container.appendChild(root);
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
    void this.titleEl;
  }

  hide(): void {
    this.root.classList.add('dialog--hidden');
  }
}
