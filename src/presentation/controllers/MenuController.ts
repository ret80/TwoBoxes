import type { ActorRefFrom } from 'xstate';
import type { EpisodeManager } from '../../core/services/episode-mng';
import type { Config } from '../../core/services/config';
import { menuMachine } from '../../core/state/menu';
import type { Locale, LocaleManager } from '../i18n/LocaleManager';
import {
  buildAboutScreen,
  buildDebugScreen,
  buildHelpScreen,
  buildMenuScreen,
  buildSelectorScreen,
  buildSettingsScreen,
  type MainMenuRefs,
  type MenuItemId,
} from '../html/screens';
import type { ProjectionMode } from '../../ports/IRenderer';

export type MenuDirection = 'up' | 'down' | 'left' | 'right';

/** Горизонтальный ряд иконок главного меню (слева направо). */
const MENU_ORDER: MenuItemId[] = ['debug', 'settings', 'play', 'help', 'about'];
/** Колонка иконки в карусели: 0 — центральная («Играть»), -1/+1/+2 — соседние. */
const MENU_SLOT: Record<MenuItemId, number> = {
  continue: 0,
  debug: -2,
  settings: -1,
  play: 0,
  help: 1,
  about: 2,
};
const MENU_LABEL: Record<MenuItemId, string> = {
  continue: 'RESUME',
  play: 'PLAY',
  settings: 'OPTIONS',
  help: 'HELP',
  about: 'ABOUT',
  debug: 'DEBUG',
};

/** Сколько пикселей свайпа — на одну иконку карусели. */
const SWIPE_STEP = 46;

/**
 * Контроллер меню (план 11.3): управление экранами mmenu/selector/help/about/settings,
 * подписка на menuFSM. Главное меню — карусель иконок (PSP XMB): активная иконка
 * всегда в центре, подпись под меню называет её.
 */
export class MenuController {
  private menuActor: ActorRefFrom<typeof menuMachine>;
  private container: HTMLElement;
  private i18n: LocaleManager;
  private episodes: EpisodeManager;
  private config: Config;
  private onGameSelected: (episodeId: number, levelId: number) => void;

  private screens = new Map<string, HTMLElement>();
  private current = '';
  private menu: MainMenuRefs | null = null;
  private activeItem: MenuItemId = 'play';
  /** Отладочное меню доступно только с параметром `?debug` в адресе. */
  private readonly debugEnabled =
    new URLSearchParams(window.location.search).has('debug') ||
    window.location.hash.includes('debug');
  /** Свайп уже отработал — клик после него не должен открывать пункт. */
  private suppressClickUntil = 0;

  constructor(
    container: HTMLElement,
    i18n: LocaleManager,
    episodes: EpisodeManager,
    menuActor: ActorRefFrom<typeof menuMachine>,
    onGameSelected: (episodeId: number, levelId: number) => void,
    config: Config,
  ) {
    this.container = container;
    this.i18n = i18n;
    this.episodes = episodes;
    this.config = config;
    this.menuActor = menuActor;
    this.onGameSelected = onGameSelected;
    this.buildScreens();
    this.attachSwipe();
    this.menuActor.subscribe((s) => this.show(s.value as string));
    // Смена языка перестраивает все экраны с новыми подписями.
    this.i18n.subscribe(() => this.rebuildScreens());
    this.show(this.menuActor.getSnapshot().value as string);
  }

  private buildScreens(): void {
    const { episodes, i18n } = this;

    const menu = buildMenuScreen(i18n, episodes.isResume(), this.debugEnabled, {
      onActivate: (item) => this.activateItem(item),
    });
    this.menu = menu;
    this.screens.set('mmenu', menu.root);
    this.updateMenu();

    const settings = buildSettingsScreen(
      i18n,
      {
        sfx: Number(this.config.get('sfxVolume')),
        music: Number(this.config.get('musicVolume')),
      },
      {
        onBack: () => this.menuActor.send({ type: 'BACK' }),
        onSfxChange: (value) => this.config.set('sfxVolume', value),
        onMusicChange: (value) => this.config.set('musicVolume', value),
        onLocaleChange: (locale: Locale) => this.i18n.setLocale(locale),
      },
    );
    this.screens.set('settings', settings);

    const help = buildHelpScreen(i18n, {
      onBack: () => this.menuActor.send({ type: 'BACK' }),
    });
    this.screens.set('help', help);

    const about = buildAboutScreen(i18n, {
      onBack: () => this.menuActor.send({ type: 'BACK' }),
    });
    this.screens.set('about', about);

    // Отладочный экран собирается всегда, но иконка в меню — только с ?debug.
    const debug = buildDebugScreen(
      i18n,
      {
        showFps: this.config.get('showFps') === true,
        projection: this.config.get('projection') as ProjectionMode,
      },
      {
        onBack: () => this.menuActor.send({ type: 'BACK' }),
        onFpsChange: (value) => this.config.set('showFps', value),
        onProjectionChange: (mode) => this.config.set('projection', mode),
      },
    );
    this.screens.set('debug', debug);

    this.rebuildSelector();

    for (const s of this.screens.values()) this.container.appendChild(s);
  }

  /** Перестроить экраны после смены языка, сохранив текущее состояние меню. */
  private rebuildScreens(): void {
    for (const s of this.screens.values()) s.remove();
    this.screens.clear();
    this.menu = null;
    this.buildScreens();
    this.updateMenu();
    this.show(this.current);
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

  /**
   * Навигация по главному меню для геймпада, стрелок и курсора.
   * Влево/вправо двигают карусель, вверх — на «Продолжить» (если доступно),
   * вниз — обратно на «Играть».
   */
  navigate(dir: MenuDirection): void {
    if (this.current !== 'mmenu') return;
    if (dir === 'up') {
      // Вверх на «Продолжить» — только с центральной иконки «Играть».
      if (this.activeItem === 'play' && this.episodes.isResume()) this.selectItem('continue');
      return;
    }
    if (dir === 'down') {
      if (this.activeItem === 'continue') this.selectItem('play');
      return;
    }
    const current = this.activeItem === 'continue' ? 'play' : this.activeItem;
    // Скрытые иконки (отладка без ?debug, «Продолжить») в ряд не входят.
    const order = MENU_ORDER.filter((id) => !this.menu?.items.get(id)?.hidden);
    const index = Math.max(0, order.indexOf(current));
    const next =
      dir === 'right' ? Math.min(index + 1, order.length - 1) : Math.max(index - 1, 0);
    this.selectItem(order[next] ?? 'play');
  }

  /**
   * Свайп пальцем по экрану листает карусель: на тач-устройствах попадать
   * по соседним иконкам неудобно, а подписи у них нет.
   */
  private attachSwipe(): void {
    let pointerId = -1;
    let startX = 0;
    let startY = 0;
    let lastX = 0;

    const onDown = (e: PointerEvent) => {
      if (this.current !== 'mmenu' || pointerId !== -1 || !e.isPrimary) return;
      pointerId = e.pointerId;
      startX = lastX = e.clientX;
      startY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const totalX = e.clientX - startX;
      const totalY = e.clientY - startY;
      // Вертикальный жест — не листание карусели.
      if (Math.abs(totalY) > 60 && Math.abs(totalY) > Math.abs(totalX)) {
        pointerId = -1;
        return;
      }
      const step = e.clientX - lastX;
      if (Math.abs(step) < SWIPE_STEP) return;
      this.suppressClickUntil = performance.now() + 500;
      this.navigate(step < 0 ? 'right' : 'left');
      // Длинный свайп продолжается с текущей точки: несколько шагов за жест.
      lastX = e.clientX;
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId === pointerId) pointerId = -1;
    };

    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
  }

  /** Активировать текущую иконку (Enter / A / клик). */
  activate(): void {
    this.activateItem(this.activeItem);
  }

  private selectItem(item: MenuItemId): void {
    const next = item === 'continue' && !this.episodes.isResume() ? 'play' : item;
    if (next === this.activeItem) return;
    this.activeItem = next;
    this.updateMenu();
  }

  private activateItem(item: MenuItemId): void {
    if (this.current !== 'mmenu') return;
    // Свайп закончился отпусканием пальца — клик после него игнорируем.
    if (performance.now() < this.suppressClickUntil) return;
    this.selectItem(item);
    switch (this.activeItem) {
      case 'continue':
        this.menuActor.send({ type: 'RESUME' });
        break;
      case 'play':
        this.menuActor.send({ type: 'PLAY' });
        break;
      case 'settings':
        this.menuActor.send({ type: 'SETTINGS' });
        break;
      case 'help':
        this.menuActor.send({ type: 'HELP' });
        break;
      case 'about':
        this.menuActor.send({ type: 'ABOUT' });
        break;
      case 'debug':
        this.menuActor.send({ type: 'DEBUG' });
        break;
    }
  }

  /** Сдвинуть карусель: активная иконка — в центре, подпись — под меню. */
  private updateMenu(): void {
    const menu = this.menu;
    if (!menu) return;
    menu.root.style.setProperty('--active-slot', String(MENU_SLOT[this.activeItem]));
    for (const [id, btn] of menu.items) {
      const active = id === this.activeItem;
      btn.classList.toggle('is-active', active);
      if (active) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
      // Вертикально меняются местами только «Продолжить» и «Играть»:
      // горизонтальный ряд настроек/игр/помощи/«О игре» остаётся на месте.
      let dy = 0;
      if (this.activeItem === 'continue') {
        if (id === 'play') dy = -1;
      } else if (id === 'continue') {
        dy = -1;
      }
      btn.style.setProperty('--dy', String(dy));
    }
    menu.caption.textContent = this.i18n.t(MENU_LABEL[this.activeItem]);
  }

  /** Обновить статус уровней (например, после победы). */
  refreshSelector(): void {
    this.rebuildSelector();
    if (this.current === 'selector') this.show('selector');
  }

  /** Показать/скрыть «Продолжить»: пока игра не начиналась, иконки нет совсем. */
  refreshResume(): void {
    const btn = this.menu?.items.get('continue');
    if (!btn) return;
    const canResume = this.episodes.isResume();
    btn.hidden = !canResume;
    btn.disabled = !canResume;
    if (!canResume && this.activeItem === 'continue') {
      this.activeItem = 'play';
    }
    this.updateMenu();
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
