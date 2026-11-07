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
import type { CompassMode, MoveSpeed } from '../../core/services/config';
import type { MechanicId } from '../../core/generation/mechanics';
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

/**
 * Пороги жеста (CSS-пиксели). С этого расстояния понятно, по какой оси идёт
 * жест; вертикальный свайп по-прежнему делает один шаг, а горизонтальный
 * превращается в непрерывное перетаскивание карусели.
 */
const SWIPE_AXIS = 12;
const SWIPE_STEP_Y = 34;
/** Запас вокруг ряда иконок: вертикальный свайп работает только в этой полосе. */
const SWIPE_ZONE_PAD = 28;
/** Сопротивление за крайней иконкой: ряд тянется, но не уезжает в пустоту. */
const DRAG_EDGE_RESISTANCE = 0.35;
/** С такой скорости отпускания (px/ms) ряд продолжает ехать по инерции. */
const FLING_MIN_VELOCITY = 0.35;
/** Затухание скорости инерции за миллисекунду (0.99 — примерно 200 px на 2 px/ms). */
const FLING_FRICTION = 0.99;
/** Скорость, ниже которой инерция считается остановленной и включается магнит. */
const FLING_STOP_VELOCITY = 0.02;

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
  /** Вызывается после разблокировки всех уровней — прогресс надо сохранить. */
  private onUnlockAll?: () => void;

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
  /** Экран открыт поверх паузы: «Назад» вернёт в предыдущее меню — паузу. */
  private overlayReturn: (() => void) | null = null;
  /** Запрос догенерировать уровень, карт которого ещё нет (эпизод 2). */
  private onLevelNeeded: ((episodeId: number, levelId: number) => void) | null = null;
  /** Уровень, который игрок выбрал до окончания его генерации. */
  private pendingLevel: { episodeId: number; levelId: number } | null = null;
  /** Выбранные в отладке механики и сложность тестового уровня. */
  private debugMechanics: MechanicId[] = ['portal'];
  private debugDifficulty = 50;
  /** Генерация тестового уровня из отладочного меню. */
  private onTestLevel?: (mechanics: MechanicId[], difficulty: number) => Promise<boolean>;

  constructor(
    container: HTMLElement,
    i18n: LocaleManager,
    episodes: EpisodeManager,
    menuActor: ActorRefFrom<typeof menuMachine>,
    onGameSelected: (episodeId: number, levelId: number) => void,
    config: Config,
    onUnlockAll?: () => void,
    onTestLevel?: (mechanics: MechanicId[], difficulty: number) => Promise<boolean>,
  ) {
    this.container = container;
    this.i18n = i18n;
    this.episodes = episodes;
    this.config = config;
    this.menuActor = menuActor;
    this.onGameSelected = onGameSelected;
    this.onUnlockAll = onUnlockAll;
    this.onTestLevel = onTestLevel;
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
        speed: this.config.get('moveSpeed') as MoveSpeed,
      },
      {
        onBack: () => this.backFromScreen(),
        onSfxChange: (value) => this.config.set('sfxVolume', value),
        onMusicChange: (value) => this.config.set('musicVolume', value),
        onLocaleChange: (locale: Locale) => this.i18n.setLocale(locale),
        onSpeedChange: (value: MoveSpeed) => this.config.set('moveSpeed', value),
      },
    );
    this.screens.set('settings', settings);

    const help = buildHelpScreen(i18n, {
      onBack: () => this.backFromScreen(),
    });
    this.screens.set('help', help);

    const about = buildAboutScreen(i18n, {
      onBack: () => this.backFromScreen(),
    });
    this.screens.set('about', about);

    // Отладочный экран собирается всегда, но иконка в меню — только с ?debug.
    const debug = buildDebugScreen(
      i18n,
      {
        showFps: this.config.get('showFps') === true,
        projection: this.config.get('projection') as ProjectionMode,
        compass: this.config.get('compass') as CompassMode,
        mechanics: this.debugMechanics,
        difficulty: this.debugDifficulty,
      },
      {
        onBack: () => this.backFromScreen(),
        onFpsChange: (value) => this.config.set('showFps', value),
        onProjectionChange: (mode) => this.config.set('projection', mode),
        onCompassChange: (mode) => this.config.set('compass', mode),
        onUnlockAll: () => this.unlockAllLevels(),
        onMechanicsChange: (mechanics) => {
          this.debugMechanics = mechanics;
        },
        onDifficultyChange: (difficulty) => {
          this.debugDifficulty = difficulty;
        },
        onTestLevel: (mechanics, difficulty) =>
          this.onTestLevel?.(mechanics, difficulty) ?? Promise.resolve(false),
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
        if (!this.episodes.hasLevel(ep, lvl)) {
          // Карты уровня ещё нет: просим воркер посчитать его первым и
          // запускаем игру, как только уровень будет готов.
          this.pendingLevel = { episodeId: ep, levelId: lvl };
          this.markLevelPending(ep, lvl);
          this.onLevelNeeded?.(ep, lvl);
          return;
        }
        this.selectLevel(ep, lvl);
      },
      onBack: () => this.backFromScreen(),
    });
    this.screens.set('selector', selector);
    this.container.appendChild(selector);
    if (this.pendingLevel) {
      this.markLevelPending(this.pendingLevel.episodeId, this.pendingLevel.levelId);
    }
  }

  /** Подключить фоновую генерацию уровней (воркер эпизода 2). */
  setLevelGenerator(handler: ((episodeId: number, levelId: number) => void) | null): void {
    this.onLevelNeeded = handler;
  }

  private selectLevel(episodeId: number, levelId: number): void {
    this.menuActor.send({ type: 'SELECT_LEVEL', episodeId, levelId });
    this.onGameSelected(episodeId, levelId);
  }

  /** Уровень догенерирован: если его ждали — сразу открываем игру. */
  levelReady(episodeId: number, levelId: number): void {
    const pending = this.pendingLevel;
    if (!pending || pending.episodeId !== episodeId || pending.levelId !== levelId) return;
    this.pendingLevel = null;
    this.clearPendingMarks();
    this.selectLevel(episodeId, levelId);
  }

  /** Генерация выбранного уровня не удалась — снимаем ожидание. */
  levelGenerationFailed(episodeId: number, levelId: number): void {
    const pending = this.pendingLevel;
    if (!pending || pending.episodeId !== episodeId || pending.levelId !== levelId) return;
    this.cancelPendingSelection();
  }

  /** Воркер недоступен: снимаем ожидание, чтобы карточка снова стала кликабельной. */
  cancelPendingSelection(): void {
    this.pendingLevel = null;
    this.clearPendingMarks();
  }

  /** Карточка ждёт генерации: показываем это и не даём кликнуть дважды. */
  private markLevelPending(episodeId: number, levelId: number): void {
    this.clearPendingMarks();
    const card = this.screens
      .get('selector')
      ?.querySelector<HTMLElement>(`.lvl-card[data-episode="${episodeId}"][data-level="${levelId}"]`);
    card?.classList.add('lvl-card--pending');
    card?.setAttribute('aria-busy', 'true');
  }

  private clearPendingMarks(): void {
    const selector = this.screens.get('selector');
    if (!selector) return;
    for (const card of selector.querySelectorAll('.lvl-card--pending')) {
      card.classList.remove('lvl-card--pending');
      card.removeAttribute('aria-busy');
    }
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
   * Жесты по главному меню: пальцем, пером и мышью с зажатой левой кнопкой.
   *
   * Горизонтальное перетаскивание больше не дискретное: пока жест удерживается,
   * ряд иконок едет за ним один к одному (без transition), а не прыгает на
   * один шаг и не замирает до отпускания. Сильный свайп продолжает движение
   * по инерции с затуханием, а затем ближайшая к центральному слоту иконка
   * «магнитится» — становится активной, и ряд плавно доезжает до неё.
   * За крайними иконками добавлено сопротивление, чтобы пустой ряд не уезжал
   * за экран.
   *
   * Вертикальный свайп остаётся шагом: он переключает «Продолжить»/«Играть»
   * в той же колонке и работает только в полосе иконок.
   */
  private attachSwipe(): void {
    let pointerId = -1;
    let startX = 0;
    let startY = 0;
    let axis: '' | 'x' | 'y' = '';
    let handled = false;
    let dragging = false;
    /** Смещение карусели в пикселях: во время перетаскивания — за пальцем. */
    let dragX = 0;
    /** Поправка на порог оси, чтобы в момент старта ряд не дёргался. */
    let dragBase = 0;
    /** Границы свободного хода карусели (крайние иконки у центра). */
    let dragMin = 0;
    let dragMax = 0;
    let stepX = 0;
    /** Скорость пальца в px/ms — сглаженная по последним событиям. */
    let velocity = 0;
    let lastSampleX = 0;
    let lastSampleAt = 0;
    let inertiaFrame = 0;

    const inIconZone = (y: number): boolean => {
      const menu = this.menu;
      if (!menu) return false;
      let top = Number.POSITIVE_INFINITY;
      let bottom = Number.NEGATIVE_INFINITY;
      for (const btn of menu.items.values()) {
        if (btn.hidden) continue;
        const r = btn.getBoundingClientRect();
        if (r.width === 0) continue;
        top = Math.min(top, r.top);
        bottom = Math.max(bottom, r.bottom);
      }
      return Number.isFinite(top) && y >= top - SWIPE_ZONE_PAD && y <= bottom + SWIPE_ZONE_PAD;
    };

    /** Диапазон смещений, при которых хотя бы одна иконка ряда доходит до центра. */
    const measureDragRange = (): void => {
      const menu = this.menu;
      // Шаг анимации — CSS-переменная с clamp()/vw. getComputedStyle возвращает
      // её как текст, а не в пикселях, поэтому измеряем реальную ширину
      // скрытым пробником внутри .xmb (там переменная определена).
      const probe = menu ? [...menu.items.values()].find((btn) => !btn.hidden) : undefined;
      const stage = probe?.parentElement;
      if (stage) {
        const meter = document.createElement('div');
        meter.style.cssText =
          'position:absolute;left:0;top:0;height:0;visibility:hidden;width:var(--xmb-step-x)';
        stage.appendChild(meter);
        stepX = meter.getBoundingClientRect().width;
        meter.remove();
      } else {
        stepX = 0;
      }
      const activeSlot = MENU_SLOT[this.activeItem];
      let minRel = 0;
      let maxRel = 0;
      for (const id of MENU_ORDER) {
        const btn = menu?.items.get(id);
        if (!btn || btn.hidden) continue;
        const rel = MENU_SLOT[id] - activeSlot;
        minRel = Math.min(minRel, rel);
        maxRel = Math.max(maxRel, rel);
      }
      // Сдвиг, при котором крайняя левая/правая иконка встаёт в центральный слот.
      dragMin = -maxRel * stepX;
      dragMax = -minRel * stepX;
    };

    const applyDrag = (): void => {
      const menu = this.menu;
      if (!menu) return;
      menu.root.style.setProperty('--drag-x', `${dragX}px`);
    };

    const setDragging = (on: boolean): void => {
      dragging = on;
      const menu = this.menu;
      if (!menu) return;
      menu.root.classList.toggle('is-dragging', on);
      if (!on) menu.root.style.setProperty('--drag-x', '0px');
    };

    const stopInertia = (): void => {
      if (inertiaFrame) cancelAnimationFrame(inertiaFrame);
      inertiaFrame = 0;
    };

    /**
     * Инерция после сильного свайпа: ряд продолжает ехать с затухающей
     * скоростью, а затем магнит доводит ближайшую к центру иконку.
     */
    const startInertia = (initialVelocity: number): void => {
      stopInertia();
      let v = initialVelocity;
      let last = performance.now();
      const frame = (now: number): void => {
        const dt = Math.min(Math.max(now - last, 1), 32);
        last = now;
        const next = dragX + v * dt;
        // У края ряда инерцию не пускаем в пустоту: доехали до крайней
        // иконки — сразу магнитная доводка к ней.
        if (next <= dragMin || next >= dragMax) {
          dragX = next < dragMin ? dragMin : dragMax;
          applyDrag();
          inertiaFrame = 0;
          snapToNearest();
          return;
        }
        dragX = next;
        v *= Math.pow(FLING_FRICTION, dt);
        applyDrag();
        if (Math.abs(v) < FLING_STOP_VELOCITY) {
          inertiaFrame = 0;
          snapToNearest();
          return;
        }
        inertiaFrame = requestAnimationFrame(frame);
      };
      inertiaFrame = requestAnimationFrame(frame);
    };

    /** Отпустили палец: активируем иконку, ближайшую к центральному слоту. */
    const snapToNearest = (): void => {
      const menu = this.menu;
      if (!menu) return;
      const activeSlot = MENU_SLOT[this.activeItem];
      // Текущая иконка участвует в сравнении наравне с соседями: «Продолжить»
      // занимает тот же центральный слот, и лёгкое дрожание пальца не должно
      // переключать её на «Играть».
      let nearest: MenuItemId = this.activeItem;
      let nearestDist = Math.abs(dragX);
      for (const [id, btn] of menu.items) {
        if (id === this.activeItem || btn.hidden) continue;
        const offset = (MENU_SLOT[id] - activeSlot) * stepX + dragX;
        const dist = Math.abs(offset);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = id;
        }
      }
      // Клик, который браузер пришлёт после pointerup, не должен открывать пункт.
      this.suppressClickUntil = performance.now() + 500;
      setDragging(false);
      dragX = 0;
      this.selectItem(nearest);
    };

    const onDown = (e: PointerEvent) => {
      // Мышь перетаскивает карусель левой кнопкой; тач и перо — любым касанием.
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (this.current !== 'mmenu' || pointerId !== -1 || !e.isPrimary) return;
      stopInertia();
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      axis = '';
      handled = false;
      velocity = 0;
      lastSampleX = e.clientX;
      lastSampleAt = performance.now();
      setDragging(false);
      dragX = 0;
      dragBase = 0;
      measureDragRange();
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (axis === '' && Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE_AXIS) {
        axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        if (axis === 'x') {
          // Начинаем с нуля на пороге: ряд не прыгает на первые 12 px жеста.
          dragBase = Math.sign(dx) * SWIPE_AXIS;
          this.suppressClickUntil = performance.now() + 500;
          setDragging(true);
          lastSampleX = e.clientX;
          lastSampleAt = performance.now();
          velocity = 0;
        }
      }
      if (axis === '') return;

      if (axis === 'x') {
        // Скорость по последним событиям: нужна для инерции на отпускании.
        const now = performance.now();
        const dt = now - lastSampleAt;
        if (dt > 0) {
          // Ограничиваем выбросы: одно редкое событие не должно раскрутить ряд.
          const instant = Math.max(-5, Math.min(5, (e.clientX - lastSampleX) / dt));
          velocity = velocity === 0 ? instant : velocity * 0.65 + instant * 0.35;
          lastSampleX = e.clientX;
          lastSampleAt = now;
        }
        const raw = dx - dragBase;
        if (raw > dragMax) {
          dragX = dragMax + (raw - dragMax) * DRAG_EDGE_RESISTANCE;
        } else if (raw < dragMin) {
          dragX = dragMin + (raw - dragMin) * DRAG_EDGE_RESISTANCE;
        } else {
          dragX = raw;
        }
        applyDrag();
        return;
      }

      // Вертикальный жест работает только в полосе иконок и делает один шаг.
      if (handled) return;
      if (!inIconZone(startY) || Math.abs(dy) < SWIPE_STEP_Y) return;
      this.suppressClickUntil = performance.now() + 500;
      this.selectItem(dy > 0 ? 'continue' : 'play');
      handled = true;
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const wasDragging = dragging && axis === 'x';
      pointerId = -1;
      axis = '';
      handled = false;
      if (!wasDragging) {
        setDragging(false);
        return;
      }
      // Клик после pointerup не должен открывать пункт.
      this.suppressClickUntil = performance.now() + 500;
      // Палец замер перед отпусканием — инерции нет, только магнит.
      if (performance.now() - lastSampleAt > 100) velocity = 0;
      // За краем ряда сразу возвращаемся магнитом, без свободного хода.
      const atEdge = dragX <= dragMin || dragX >= dragMax;
      if (e.type === 'pointerup' && !atEdge && Math.abs(velocity) >= FLING_MIN_VELOCITY) {
        startInertia(velocity);
      } else {
        stopInertia();
        snapToNearest();
      }
    };

    // Уход с главного меню не должен оставлять катящийся ряд в фоне.
    this.menuActor.subscribe((s) => {
      if ((s.value as string) !== 'mmenu') {
        stopInertia();
        setDragging(false);
        dragX = 0;
      }
    });

    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
  }

  /**
   * Показать экран поверх паузы (настройки из меню паузы). Экран не меняет
   * состояние menuFSM: когда игрок нажмёт «Назад», вернёмся в паузу, а не в
   * главное меню.
   */
  showOverPause(name: 'settings', onBack: () => void): void {
    this.overlayReturn = onBack;
    this.show(name);
  }

  /** «Назад» на экране: в исходное меню — пауза или главное. */
  private backFromScreen(): void {
    const back = this.overlayReturn;
    if (back) {
      this.overlayReturn = null;
      this.hideAll();
      back();
      return;
    }
    this.menuActor.send({ type: 'BACK' });
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

  /** Отладочный чит: открыть все уровни и сразу обновить список уровней. */
  private unlockAllLevels(): void {
    this.episodes.unlockAllLevels();
    this.onUnlockAll?.();
    this.refreshSelector();
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
    // Ушли с выбора уровня, пока догенерировался выбранный, — не открываем
    // игру самовольно, когда карты будут готовы.
    if (name !== 'selector' && this.pendingLevel) {
      this.pendingLevel = null;
      this.clearPendingMarks();
    }
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
