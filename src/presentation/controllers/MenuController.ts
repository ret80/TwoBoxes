import type { ActorRefFrom } from 'xstate';
import type { EpisodeManager } from '../../core/services/episode-mng';
import { menuMachine } from '../../core/state/menu';
import type { LocaleManager } from '../i18n/LocaleManager';
import { buildHelpScreen, buildMenuScreen, buildSelectorScreen, buildAboutScreen } from '../html/screens';

/**
 * Контроллер меню (план 11.3): управление экранами mmenu/selector/help/about,
 * подписка на menuFSM. Resume активна только при наличии сохранения.
 */
export class MenuController {
  private menuActor: ActorRefFrom<typeof menuMachine>;
  private container: HTMLElement;
  private i18n: LocaleManager;
  private episodes: EpisodeManager;
  private onGameSelected: (episodeId: number, levelId: number) => void;

  private screens = new Map<string, HTMLElement>();
  private current = '';

  constructor(
    container: HTMLElement,
    i18n: LocaleManager,
    episodes: EpisodeManager,
    menuActor: ActorRefFrom<typeof menuMachine>,
    onGameSelected: (episodeId: number, levelId: number) => void,
  ) {
    this.container = container;
    this.i18n = i18n;
    this.episodes = episodes;
    this.menuActor = menuActor;
    this.onGameSelected = onGameSelected;
    this.buildScreens();
    this.menuActor.subscribe((s) => this.show(s.value as string));
    this.show(this.menuActor.getSnapshot().value as string);
  }

  private buildScreens(): void {
    const { episodes, i18n } = this;

    const menu = buildMenuScreen(i18n, episodes.isResume(), {
      onResume: () => this.menuActor.send({ type: 'RESUME' }),
      onPlay: () => this.menuActor.send({ type: 'PLAY' }),
      onHelp: () => this.menuActor.send({ type: 'HELP' }),
      onAbout: () => this.menuActor.send({ type: 'ABOUT' }),
    });
    this.screens.set('mmenu', menu);

    const help = buildHelpScreen(i18n, {
      onBack: () => this.menuActor.send({ type: 'BACK' }),
    });
    this.screens.set('help', help);

    const about = buildAboutScreen(i18n, {
      onBack: () => this.menuActor.send({ type: 'BACK' }),
    });
    this.screens.set('about', about);

    this.rebuildSelector();

    for (const s of this.screens.values()) this.container.appendChild(s);
  }

  private rebuildSelector(): void {
    const prev = this.screens.get('selector');
    if (prev) prev.remove();
    const selector = buildSelectorScreen(this.i18n, this.episodes, {
      onSelect: (ep, lvl) => {
        this.menuActor.send({ type: 'SELECT_LEVEL', episodeId: ep, levelId: lvl });
        this.onGameSelected(ep, lvl);
      },
      onBack: () => this.menuActor.send({ type: 'BACK' }),
    });
    this.screens.set('selector', selector);
    this.container.appendChild(selector);
  }

  /** Обновить статус уровней (например, после победы). */
  refreshSelector(): void {
    this.rebuildSelector();
    if (this.current === 'selector') this.show('selector');
  }

  /** Показать/скрыть Resume: пока игра не начиналась, кнопки нет совсем. */
  refreshResume(): void {
    const menu = this.screens.get('mmenu');
    const btn = menu?.querySelector<HTMLButtonElement>('button[data-action="resume"]');
    if (!btn) return;
    const canResume = this.episodes.isResume();
    btn.hidden = !canResume;
    btn.disabled = !canResume;
  }

  show(name: string): void {
    this.current = name;
    for (const [key, s] of this.screens) {
      s.classList.toggle('screen--hidden', key !== name);
    }
  }

  hideAll(): void {
    this.current = '';
    for (const s of this.screens.values()) s.classList.add('screen--hidden');
  }
}
