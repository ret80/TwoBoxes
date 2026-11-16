import type { LocaleManager } from '../i18n/LocaleManager';
import type { GameResult } from '../../core/types/game-result';
import {
  buildCompletedDialog,
  el,
  setButtonIcon,
  starOutlineIcon,
} from '../html/screens';

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
  private homeEl!: HTMLButtonElement;
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
    const { root, stats, stars, title, home } = buildCompletedDialog(this.i18n, {
      onNext: () => this.onNextGame(),
      onHome: () => this.onHomeGame(),
      onReset: () => this.onResetGame(),
    });
    this.root = root;
    this.statsEl = stats;
    this.starsEl = stars;
    this.titleEl = title;
    this.homeEl = home;
    this.container.appendChild(root);
  }

  show(result: GameResult, testMode = false): void {
    const minutes = Math.floor(result.time / 60);
    const seconds = Math.floor(result.time % 60);
    const timeStr = `${minutes}:${String(seconds).padStart(2, '0')}`;

    // Три звезды-контура, как на карточках уровней: полученные — цветом
    // текста, остальные серым, как неактивная подсказка.
    this.starsEl.innerHTML = '';
    this.starsEl.setAttribute('aria-label', `${result.stars}/3`);
    for (let i = 0; i < 3; i++) {
      const star = starOutlineIcon('dialog__star');
      if (i < result.stars) star.classList.add('is-on');
      this.starsEl.appendChild(star);
    }

    // Статистика — таблица без рамок: подпись слева, число справа.
    this.statsEl.innerHTML = '';
    const rows: [string, string][] = [[this.i18n.t('STAT_MOVES'), String(result.moves)]];
    if (result.minMoves > 0) {
      rows.push([this.i18n.t('STAT_MIN_MOVES'), String(result.minMoves)]);
    }
    rows.push([this.i18n.t('STAT_HINTS'), String(result.hints)]);
    rows.push([this.i18n.t('STAT_TIME'), timeStr]);
    for (const [label, value] of rows) {
      const row = el('div', 'dialog__stat');
      row.append(
        el('span', 'dialog__statLabel', label),
        el('span', 'dialog__statValue', value),
      );
      this.statsEl.appendChild(row);
    }

    // В тестовом уровне это другой экран победы: вместо выхода в главное меню
    // возвращаемся в отладку, а «дальше» собирает новую карту.
    this.titleEl.textContent = testMode
      ? this.i18n.t('DEBUG_TEST_LEVEL')
      : this.i18n.t('COMPLETED');
    setButtonIcon(
      this.homeEl,
      testMode ? 'exit' : 'home',
      testMode ? this.i18n.t('DEBUG_BACK') : this.i18n.t('MMENU'),
    );
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
