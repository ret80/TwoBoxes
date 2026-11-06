import type { LocaleManager } from '../i18n/LocaleManager';
import type { GameResult } from '../../core/types/game-result';
import { buildCompletedDialog, el } from '../html/screens';

/**
 * Контроллер диалога завершения уровня (план 11.7).
 * Показывает статистику (ходы, время), кнопки Next / Home / Reset.
 * Звук 'message-appear' при открытии.
 */
export class CompletedDialogController {
  private root!: HTMLElement;
  private statsEl!: HTMLElement;
  private starsEl!: HTMLElement;
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
    const { root, stats, stars, title } = buildCompletedDialog(this.i18n, {
      onNext: () => this.onNextGame(),
      onHome: () => this.onHomeGame(),
      onReset: () => this.onResetGame(),
    });
    this.root = root;
    this.statsEl = stats;
    this.starsEl = stars;
    this.titleEl = title;
    this.container.appendChild(root);
  }

  show(result: GameResult): void {
    const minutes = Math.floor(result.time / 60);
    const seconds = Math.floor(result.time % 60);
    const timeStr = `${minutes}:${String(seconds).padStart(2, '0')}`;

    // Три звезды: закрашены те, что заслужил игрок (3 — точно по минимуму).
    this.starsEl.innerHTML = '';
    this.starsEl.setAttribute('aria-label', `${result.stars}/3`);
    for (let i = 0; i < 3; i++) {
      const star = el('span', i < result.stars ? 'dialog__star is-on' : 'dialog__star', '★');
      star.setAttribute('aria-hidden', 'true');
      this.starsEl.appendChild(star);
    }

    this.statsEl.innerHTML = '';
    const rows = [this.i18n.t('MOVES_COUNT', result.moves)];
    if (result.minMoves > 0) rows.push(this.i18n.t('MIN_MOVES', result.minMoves));
    rows.push(this.i18n.t('HINTS_USED', result.hints));
    rows.push(this.i18n.t('TIME', timeStr));
    for (const text of rows) this.statsEl.appendChild(el('div', 'dialog__stat', text));

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
