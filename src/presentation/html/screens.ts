import type { Locale, LocaleManager } from '../i18n/LocaleManager';
import type { EpisodeManager } from '../../core/services/episode-mng';
import type {
  CompassMode,
  HintStyle,
  MoveSpeed,
  ThemeMode,
} from '../../core/services/config';
import type { ProjectionMode } from '../../ports/IRenderer';
import { ALL_MECHANICS, type MechanicId } from '../../core/generation/mechanics';
import { episodeTheme } from '../../core/data/generated-episodes';
import { formatLevelSeed } from '../../core/generation/level-seed';

/** DOM-генераторы экранов (план 11.1 — TS-модули вместо .html, SPA/Vite). */

export function el<T extends HTMLElement = HTMLElement>(
  tag: string,
  className?: string,
  text?: string,
): T {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e as T;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Плоский одноцветный замок (заливка currentColor). */
const LOCK_PATH =
  'M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm0 2a3 3 0 0 1 3 3v3H9V7a3 3 0 0 1 3-3Z';

/** Иконка закрытого уровня: один цвет (наследует color), без объёма и тени. */
function lockIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('lvl-card__lock');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', LOCK_PATH);
  svg.appendChild(path);
  return svg;
}

/**
 * Геометрия иконок: 24×24, один цвет (currentColor) — плоский стиль.
 * `style: 'stroke'` рисует контуром, `fill` — заливкой; `evenodd` нужен для
 * выреза внутри фигуры (например, play в круге у «Продолжить»).
 */
type IconDef = { style: 'fill' | 'stroke'; evenodd?: boolean; paths: string[] };

const ICONS = {
  // Закрученная стрелка (сброс уровня)
  reset: {
    style: 'fill',
    paths: [
      'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z',
    ],
  },
  // Две вертикальные полоски (пауза)
  pause: { style: 'fill', paths: ['M6 19h4V5H6v14Zm8-14v14h4V5h-4Z'] },
  // Выход: дверь и стрелка наружу (тестовый уровень → дебаг-меню)
  exit: {
    style: 'stroke',
    paths: ['M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5', 'M10 17l5-5-5-5', 'M15 12H3'],
  },
  // Плоский домик (в главное меню)
  home: { style: 'fill', paths: ['M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5Z'] },
  // Две стрелки вправо (играть / следующий уровень)
  next: { style: 'stroke', paths: ['M5 4l8 8-8 8', 'M12 4l8 8-8 8'] },
  // Стрелка отката назад (undo) — тонкий контур, как в макете
  undo: {
    style: 'stroke',
    paths: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11'],
  },
  // Лампочка (подсказка) — контур с двумя штрихами цоколя
  hint: {
    style: 'stroke',
    paths: [
      'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5',
      'M9 18h6',
      'M10 22h4',
    ],
  },
  // Играть: залитый треугольник (центральная иконка главного меню)
  play: { style: 'fill', paths: ['M8 5v14l11-7-11-7Z'] },
  // Продолжить: play в круге (вырез треугольника — fill-rule evenodd)
  resume: {
    style: 'fill',
    evenodd: true,
    paths: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-2 5.5 7 4.5-7 4.5v-9Z'],
  },
  // Отладка: жук (debug)
  debug: {
    style: 'fill',
    paths: [
      'M20 8h-2.81a5.985 5.985 0 0 0-1.82-1.96L17 4.41 15.59 3l-2.17 2.17a5.947 5.947 0 0 0-2.84 0L8.41 3 7 4.41l1.62 1.63A5.985 5.985 0 0 0 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81a6 6 0 0 0 10.38 0H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8Zm-6 8h-4v-2h4v2Zm0-4h-4v-2h4v2Z',
    ],
  },
  // Настройки: три ползунка (tune)
  settings: {
    style: 'fill',
    paths: [
      'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z',
    ],
  },
} as const satisfies Record<string, IconDef>;

/** Пункты главного меню-карусели. */
export type MenuItemId = 'continue' | 'play' | 'settings' | 'help' | 'about' | 'debug';

type IconName = keyof typeof ICONS | 'help' | 'about';

/** Иконки-символы: проще и чётче, чем путь (например, знак вопроса). */
const TEXT_ICONS: Partial<Record<IconName, string>> = {
  help: '?',
  about: 'i',
};

/** Плоская иконка (без объёма и тени), цвет наследуется от кнопки. */
function icon(name: IconName): Element {
  const glyph = TEXT_ICONS[name];
  if (glyph) {
    const span = el('span', 'btn__icon btn__icon--text', glyph);
    span.setAttribute('aria-hidden', 'true');
    return span;
  }
  const def: IconDef = ICONS[name as keyof typeof ICONS];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('btn__icon', def.style === 'stroke' ? 'btn__icon--stroke' : 'btn__icon--fill');
  for (const d of def.paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    if ('evenodd' in def && def.evenodd) path.setAttribute('fill-rule', 'evenodd');
    svg.appendChild(path);
  }
  return svg;
}

/** Грани изометрического кубика логотипа: верхняя, левая и правая. */
type CubePalette = { top: string; left: string; right: string };

const LOGO_GOLD: CubePalette = { top: '#e7ba52', left: '#f2cd72', right: '#d3a13c' };
const LOGO_CORAL: CubePalette = { top: '#e98a66', left: '#f3a184', right: '#d2704f' };

/** Грань куба: плоский многоугольник со скруглёнными углами (стык контуром). */
function cubeFace(points: [number, number][], fill: string): SVGPolygonElement {
  const poly = document.createElementNS(SVG_NS, 'polygon');
  poly.setAttribute('points', points.map(([x, y]) => `${x},${y}`).join(' '));
  poly.setAttribute('fill', fill);
  poly.setAttribute('stroke', fill);
  poly.setAttribute('stroke-width', '5');
  poly.setAttribute('stroke-linejoin', 'round');
  return poly;
}

/** Изометрический кубик логотипа: центр верхней грани (cx, cy), полуширина `a`. */
function svgCube(cx: number, cy: number, a: number, h: number, c: CubePalette): SVGGElement {
  const b = a / 2;
  const g = document.createElementNS(SVG_NS, 'g');
  g.append(
    cubeFace([[cx - a, cy], [cx, cy + b], [cx, cy + b + h], [cx - a, cy + h]], c.left),
    cubeFace([[cx + a, cy], [cx, cy + b], [cx, cy + b + h], [cx + a, cy + h]], c.right),
    cubeFace([[cx - a, cy], [cx, cy - b], [cx + a, cy], [cx, cy + b]], c.top),
  );
  return g;
}

/**
 * Логотип главного меню: золотой и коралловый кубики, крупная «2» поверх них и
 * серая подпись под ними. Это название игры, а не заголовок меню, поэтому
 * увеличенный кегль заголовков на него не действует.
 */
function buildLogo(title: string, tagline: string): HTMLElement {
  const root = el('h1', 'screen__title screen__title--main');
  root.setAttribute('aria-label', `${title} — ${tagline}`);

  const svg = document.createElementNS(SVG_NS, 'svg');
  // Холст обрезан по рисунку: прозрачные поля вокруг логотипа мешали бы
  // отступу от верхнего края и делали бы знак визуально меньше своего размера.
  svg.setAttribute('viewBox', '30 20 168 141');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('logo__mark');

  // «2» рисуется толстым контуром того же цвета, что и заливка: так у цифры
  // появляется жирный округлый штрих, как на референсе.
  const two = document.createElementNS(SVG_NS, 'text');
  two.setAttribute('x', '105');
  two.setAttribute('y', '150');
  two.setAttribute('text-anchor', 'middle');
  two.setAttribute('font-size', '150');
  two.setAttribute('font-weight', '800');
  two.setAttribute('stroke-linejoin', 'round');
  // Цвет цифры наследуется от темы (currentColor): в тёмной теме она кремовая.
  two.setAttribute('fill', 'currentColor');
  two.setAttribute('stroke', 'currentColor');
  two.setAttribute('stroke-width', '10');
  two.textContent = '2';

  /*
   * Кубики стоят на одной линии пола. Нижнее ребро кубика идёт по изометрии
   * вниз-вправо с наклоном b / a (у svgCube b = a / 2, то есть 0.5). Золотой
   * сдвигается к коралловому вдоль этой же линии, поэтому его нижнее ребро с
   * неё не сходит, а коралловый ставится на её продолжение.
   */
  const slope = 0.5; // b / a — наклон нижнего ребра в изометрии
  const slide = 16; // сдвиг золотого вдоль линии пола: x — на slide, y — на slide / 2
  const gold = { x: 64 + slide, y: 40 + slide * slope, a: 44, h: 50 };
  const coral = { x: 150, a: 42, h: 48 };
  const floorX = gold.x - gold.a; // левый нижний угол золотого
  const floorY = gold.y + gold.h;
  const coralY = floorY + slope * (coral.x - coral.a - floorX) - coral.h;
  svg.append(
    svgCube(gold.x, gold.y, gold.a, gold.h, LOGO_GOLD),
    svgCube(coral.x, coralY, coral.a, coral.h, LOGO_CORAL),
    two,
  );
  root.append(svg, el('div', 'logo__subtitle', tagline));
  return root;
}

/**
 * Пустой слой-распорка у края экрана. Заголовок и кнопка «Назад»
 * позиционируются от этих краёв, поэтому стоят на одном уровне во всех меню.
 */
function hideLayer(kind: 'title' | 'bottom'): HTMLElement {
  return el('div', `menu-hide menu-hide--${kind}`);
}

/** Кнопка-иконка: текст убирается, подпись остаётся в aria-label/title. */
function iconButton(btn: HTMLButtonElement, name: IconName, label: string): HTMLButtonElement {
  btn.textContent = '';
  btn.appendChild(icon(name));
  btn.title = label;
  btn.setAttribute('aria-label', label);
  return btn;
}

/**
 * Сменить иконку и подпись существующей кнопки: верхняя панель игры меняет
 * «паузу» на «выход в отладку», когда запущен тестовый уровень.
 */
export function setButtonIcon(
  btn: HTMLButtonElement,
  name: IconName,
  label: string,
): void {
  iconButton(btn, name, label);
}

export interface MainMenuRefs {
  root: HTMLElement;
  items: Map<MenuItemId, HTMLButtonElement>;
  caption: HTMLElement;
}

/**
 * Главное меню в стиле PSP XMB: ряд иконок-плиток, активная — в центре.
 * «Продолжить» появляется над «Играть» в той же колонке, когда игра начата.
 * Подпись под меню показывает название активной иконки.
 */
export function buildMenuScreen(
  i18n: LocaleManager,
  canResume: boolean,
  debug: boolean,
  cb: { onActivate: (item: MenuItemId) => void },
): MainMenuRefs {
  const root = el('div', 'screen screen--menu');
  root.dataset.screen = 'mmenu';
  const title = buildLogo(i18n.t('TITLE'), i18n.t('TAGLINE'));
  const caption = el('div', 'xmb__caption', i18n.t('PLAY'));
  const stage = el('div', 'xmb');
  const items = new Map<MenuItemId, HTMLButtonElement>();

  const makeItem = (
    id: MenuItemId,
    iconName: IconName,
    label: string,
    slot: number,
  ): HTMLButtonElement => {
    const btn = el<HTMLButtonElement>('button', 'xmb__item');
    btn.dataset.item = id;
    // Горизонтальное смещение от активной колонки; вертикальное (--dy)
    // пересчитывает MenuController — сдвигается только пара «Продолжить/Играть».
    btn.style.setProperty('--slot', String(slot));
    btn.style.setProperty('--dy', '0');
    btn.appendChild(icon(iconName));
    btn.title = label;
    btn.setAttribute('aria-label', label);
    // Клик сразу открывает пункт. Наведение не двигает карусель: иначе только что
    // сдвинутая иконка уезжала из-под курсора и выбор «дрожал» между соседями.
    btn.addEventListener('click', () => cb.onActivate(id));
    items.set(id, btn);
    stage.appendChild(btn);
    return btn;
  };

  // Порядок как в PSP: настройки слева, «Играть» в центре, помощь и «О игре» справа.
  // «Продолжить» — над «Играть» в той же колонке (stack = -1).
  const resume = makeItem('continue', 'resume', i18n.t('RESUME'), 0);
  // Пока игра ни разу не начиналась, «Продолжить» вообще не показываем
  if (!canResume) {
    resume.hidden = true;
    resume.disabled = true;
  }
  makeItem('settings', 'settings', i18n.t('OPTIONS'), -1);
  makeItem('play', 'play', i18n.t('PLAY'), 0);
  makeItem('help', 'help', i18n.t('HELP'), 1);
  makeItem('about', 'about', i18n.t('ABOUT'), 2);
  // Отладочная иконка — только с параметром `?debug` в адресе, слева от настроек.
  const dbg = makeItem('debug', 'debug', i18n.t('DEBUG'), -2);
  dbg.hidden = !debug;
  dbg.disabled = !debug;

  root.append(title, stage, caption, hideLayer('bottom'));
  return { root, items, caption };
}

/** Выпадающий список в строке настроек: подпись слева, значение справа. */
function addSelectRow<T extends string>(
  panel: HTMLElement,
  label: string,
  value: T,
  options: [T, string][],
  onChange: (value: T) => void,
  className = 'settings-row settings-row--select',
): void {
  const row = el('label', className);
  row.appendChild(el('span', 'settings-row__label', label));
  const select = el<HTMLSelectElement>('select', 'settings-row__select');
  for (const [v, text] of options) {
    const option = el<HTMLOptionElement>('option', undefined, text);
    option.value = v;
    select.appendChild(option);
  }
  select.value = value;
  select.addEventListener('change', () => onChange(select.value as T));
  row.appendChild(select);
  panel.appendChild(row);
}

/** Настройки: громкость, язык, скорость кубиков, вид подсказки и тема. */
export function buildSettingsScreen(
  i18n: LocaleManager,
  values: {
    sfx: number;
    music: number;
    speed: MoveSpeed;
    hintStyle: HintStyle;
    theme: ThemeMode;
  },
  cb: {
    onBack: () => void;
    onSfxChange: (value: number) => void;
    onMusicChange: (value: number) => void;
    onLocaleChange: (locale: Locale) => void;
    onSpeedChange: (value: MoveSpeed) => void;
    onHintStyleChange: (value: HintStyle) => void;
    onThemeChange: (value: ThemeMode) => void;
  },
): HTMLElement {
  const root = el('div', 'screen screen--info screen--settings');
  root.dataset.screen = 'settings';
  root.append(hideLayer('title'));
  root.appendChild(el('h2', 'screen__title', i18n.t('OPTIONS')));
  const panel = el('div', 'panel panel--screen settings-panel');

  const addSlider = (
    labelKey: string,
    value: number,
    onChange: (value: number) => void,
  ): void => {
    const row = el('label', 'settings-row');
    row.appendChild(el('span', 'settings-row__label', i18n.t(labelKey)));
    const input = el<HTMLInputElement>('input', 'settings-row__range');
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.05';
    input.value = String(value);
    const out = el('span', 'settings-row__value', `${Math.round(value * 100)}%`);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      out.textContent = `${Math.round(v * 100)}%`;
      onChange(v);
    });
    row.append(input, out);
    panel.appendChild(row);
  };

  addSlider('SFX_VOLUME', values.sfx, cb.onSfxChange);
  addSlider('MUSIC_VOLUME', values.music, cb.onMusicChange);

  // Скорость хода кубиков: плавно (как раньше) или заметно быстрее.
  addSelectRow<MoveSpeed>(
    panel,
    i18n.t('MOVE_SPEED'),
    values.speed,
    [
      ['smooth', i18n.t('SPEED_SMOOTH')],
      ['fast', i18n.t('SPEED_FAST')],
    ],
    cb.onSpeedChange,
  );

  // Вид подсказки: стрелки на полу или проволочный кубик вдоль того же пути.
  addSelectRow<HintStyle>(
    panel,
    i18n.t('HINT_STYLE'),
    values.hintStyle,
    [
      ['arrows', i18n.t('HINT_STYLE_ARROWS')],
      ['cube', i18n.t('HINT_STYLE_CUBE')],
    ],
    cb.onHintStyleChange,
  );

  // Тема оформления: светлая, тёмная или как в системе (по умолчанию светлая).
  addSelectRow<ThemeMode>(
    panel,
    i18n.t('THEME'),
    values.theme,
    [
      ['light', i18n.t('THEME_LIGHT')],
      ['dark', i18n.t('THEME_DARK')],
      ['system', i18n.t('THEME_SYSTEM')],
    ],
    cb.onThemeChange,
  );

  // Язык интерфейса: подписи всегда на своём языке, чтобы было понятно без перевода.
  const langRow = el('div', 'settings-row');
  langRow.appendChild(el('span', 'settings-row__label', i18n.t('LANGUAGE')));
  const langSwitch = el('div', 'lang-switch');
  const addLang = (locale: Locale, label: string): void => {
    const btn = el<HTMLButtonElement>('button', 'lang-switch__btn', label);
    const active = i18n.getLocale() === locale;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
    btn.addEventListener('click', () => cb.onLocaleChange(locale));
    langSwitch.appendChild(btn);
  };
  addLang('ru', 'Русский');
  addLang('en', 'English');
  langRow.appendChild(langSwitch);
  panel.appendChild(langRow);

  const back = el('button', 'btn btn--back', i18n.t('BACK'));
  back.addEventListener('click', cb.onBack);
  root.append(panel, back, hideLayer('bottom'));
  return root;
}

/**
 * Сид из поля ввода отладочного меню: пусто — `null` (случайный сид),
 * неразобранный текст — `undefined`. Принимаются `0x`-hex и десятичные числа.
 */
function parseSeed(raw: string): number | null | undefined {
  const text = raw.trim().toLowerCase();
  if (text === '') return null;
  const hex = text.startsWith('0x');
  const digits = hex ? text.slice(2) : text;
  if (hex) return /^[0-9a-f]{1,8}$/.test(digits) ? parseInt(digits, 16) : undefined;
  if (/^\d{1,10}$/.test(digits)) {
    const value = Number(digits);
    return value <= 0xffffffff ? value : undefined;
  }
  // Без префикса hex тоже понятен, если в числе есть буквы: так проще копировать
  // сид из консоли или из плашки уровня.
  return /^[0-9a-f]{1,8}$/.test(digits) ? parseInt(digits, 16) : undefined;
}

/**
 * Отладочное меню (открывается иконкой-жуком слева от настроек при `?debug`):
 * счётчик FPS, проекция уровня, режим компаса и разблокировка всех уровней.
 */
export function buildDebugScreen(
  i18n: LocaleManager,
  values: {
    showFps: boolean;
    projection: ProjectionMode;
    compass: CompassMode;
    mechanics: MechanicId[];
    difficulty: number;
    /** Последний использованный сид тестового уровня (для поля ввода). */
    seed?: number | null;
  },
  cb: {
    onBack: () => void;
    onFpsChange: (value: boolean) => void;
    onProjectionChange: (mode: ProjectionMode) => void;
    onCompassChange: (mode: CompassMode) => void;
    onUnlockAll: () => void;
    onMechanicsChange: (mechanics: MechanicId[]) => void;
    onDifficultyChange: (difficulty: number) => void;
    /** `null` вместо сида — уровень по случайному сиду. Возвращает использованный сид. */
    onTestLevel: (
      mechanics: MechanicId[],
      difficulty: number,
      seed: number | null,
    ) => Promise<number | null>;
  },
): HTMLElement {
  const root = el('div', 'screen screen--info screen--debug');
  root.dataset.screen = 'debug';
  root.append(hideLayer('title'));
  root.appendChild(el('h2', 'screen__title', i18n.t('DEBUG')));
  const panel = el('div', 'panel panel--screen settings-panel');

  const fpsRow = el('label', 'settings-row settings-row--check');
  fpsRow.appendChild(el('span', 'settings-row__label', i18n.t('DEBUG_FPS')));
  const fps = el<HTMLInputElement>('input', 'settings-row__check');
  fps.type = 'checkbox';
  fps.checked = values.showFps;
  fps.addEventListener('change', () => cb.onFpsChange(fps.checked));
  fpsRow.appendChild(fps);
  panel.appendChild(fpsRow);

  const projRow = el('label', 'settings-row');
  projRow.appendChild(el('span', 'settings-row__label', i18n.t('DEBUG_PROJECTION')));
  const select = el<HTMLSelectElement>('select', 'settings-row__select');
  const options: [ProjectionMode, string][] = [
    ['ortho', i18n.t('PROJ_ORTHO')],
    ['iso', i18n.t('PROJ_ISO')],
    ['isoReverse', i18n.t('PROJ_ISO_REVERSE')],
  ];
  for (const [value, label] of options) {
    const option = el<HTMLOptionElement>('option', undefined, label);
    option.value = value;
    select.appendChild(option);
  }
  select.value = values.projection;
  select.addEventListener('change', () => cb.onProjectionChange(select.value as ProjectionMode));
  projRow.appendChild(select);
  panel.appendChild(projRow);

  // Компас L/D: «авто» — по последнему способу ввода, «включён» — всегда.
  addSelectRow<CompassMode>(
    panel,
    i18n.t('DEBUG_COMPASS'),
    values.compass,
    [
      ['auto', i18n.t('COMPASS_AUTO')],
      ['on', i18n.t('COMPASS_ON')],
    ],
    cb.onCompassChange,
    'settings-row',
  );

  // ── Тестовые уровни с механиками ────────────────────────────────────
  panel.appendChild(el('h3', 'help__title', i18n.t('DEBUG_MECHANICS')));
  const selected = new Set<MechanicId>(values.mechanics);
  const mechanicKey = (id: MechanicId): string =>
    `MECH_${id.toUpperCase()}`;
  for (const mechanic of ALL_MECHANICS) {
    const row = el('label', 'settings-row settings-row--check');
    row.appendChild(el('span', 'settings-row__label', i18n.t(mechanicKey(mechanic.id))));
    const check = el<HTMLInputElement>('input', 'settings-row__check');
    check.type = 'checkbox';
    check.checked = selected.has(mechanic.id);
    check.title = i18n.t(`${mechanicKey(mechanic.id)}_DESC`);
    check.addEventListener('change', () => {
      if (check.checked) selected.add(mechanic.id);
      else selected.delete(mechanic.id);
      cb.onMechanicsChange([...selected]);
    });
    row.appendChild(check);
    panel.appendChild(row);
  }

  const difficultyRow = el('label', 'settings-row');
  difficultyRow.appendChild(el('span', 'settings-row__label', i18n.t('DEBUG_DIFFICULTY')));
  const difficulty = el<HTMLInputElement>('input', 'settings-row__range');
  difficulty.type = 'range';
  difficulty.min = '0';
  difficulty.max = '100';
  difficulty.step = '5';
  difficulty.value = String(values.difficulty);
  const difficultyOut = el('span', 'settings-row__value', String(values.difficulty));
  difficulty.addEventListener('input', () => {
    difficultyOut.textContent = difficulty.value;
    cb.onDifficultyChange(Number(difficulty.value));
  });
  difficultyRow.append(difficulty, difficultyOut);
  panel.appendChild(difficultyRow);

  // Сид: можно ввести конкретное число (десятичное или `0x`-hex), чтобы
  // получить тот же уровень, что и раньше. Пустое поле — случайный сид.
  const seedRow = el('label', 'settings-row');
  seedRow.appendChild(el('span', 'settings-row__label', i18n.t('DEBUG_SEED')));
  const seedInput = el<HTMLInputElement>('input', 'settings-row__input');
  seedInput.type = 'text';
  seedInput.inputMode = 'text';
  seedInput.spellcheck = false;
  seedInput.autocomplete = 'off';
  seedInput.placeholder = i18n.t('DEBUG_SEED_PLACEHOLDER');
  if (values.seed !== null && values.seed !== undefined) {
    seedInput.value = formatLevelSeed(values.seed);
  }
  seedRow.appendChild(seedInput);
  panel.appendChild(seedRow);

  const generate = el<HTMLButtonElement>('button', 'btn btn--wide', i18n.t('DEBUG_GENERATE'));
  const status = el('p', 'help__text', '');
  generate.addEventListener('click', async () => {
    const seed = parseSeed(seedInput.value);
    if (seed === undefined) {
      status.textContent = i18n.t('DEBUG_SEED_INVALID');
      return;
    }
    generate.disabled = true;
    status.textContent = i18n.t('DEBUG_GENERATING');
    const used = await cb.onTestLevel([...selected], Number(difficulty.value), seed);
    generate.disabled = false;
    if (used === null) {
      status.textContent = i18n.t('DEBUG_GENERATE_FAILED');
      return;
    }
    // Сид, с которым уровень получился, остаётся в поле: повторный клик даёт ту
    // же самую карту.
    seedInput.value = formatLevelSeed(used);
    status.textContent = i18n.t('DEBUG_SEED_USED', formatLevelSeed(used));
  });
  panel.append(generate, status);

  // Чит: открыть все уровни всех эпизодов (прогресс сохраняется сразу).
  const unlock = el<HTMLButtonElement>('button', 'btn btn--wide', i18n.t('DEBUG_UNLOCK_ALL'));
  unlock.addEventListener('click', cb.onUnlockAll);
  panel.appendChild(unlock);

  const back = el('button', 'btn btn--back', i18n.t('BACK'));
  back.addEventListener('click', cb.onBack);
  root.append(panel, back, hideLayer('bottom'));
  return root;
}

/** Экран выбора уровня: сетка по 4 в ряд, замки на закрытых (раздел 6.2). */
export function buildSelectorScreen(
  i18n: LocaleManager,
  episodes: EpisodeManager,
  cb: { onSelect: (episodeId: number, levelId: number) => void; onBack: () => void },
): HTMLElement {
  const root = el('div', 'screen screen--selector');
  root.dataset.screen = 'selector';
  root.append(hideLayer('title'));
  root.appendChild(el('h2', 'screen__title', i18n.t('TITLE_SELECT_LVL')));

  const panel = el('div', 'panel panel--screen selector-panel');
  const gridWrap = el('div', 'selector-grid-wrap');
  episodes.episodes.forEach((episode) => {
    // Эпизод 2 готовит воркер: до готовности не показываем пустую секцию.
    // После генерации MenuController.refreshSelector перестроит список.
    if (episode.levelCount === 0) return;
    const header = el('div', 'selector-episode', i18n.t('EPISODE_NUM', episode.episodeId + 1));
    // Тему эпизода подсказывает подпись: сгенерированные эпизоды целиком
    // посвящены одной механике (см. data/generated-episodes.ts).
    const theme = episodeTheme(episode.episodeId);
    if (theme) {
      header.appendChild(
        el('span', 'selector-episode__theme', i18n.t(`MECH_${theme.toUpperCase()}`)),
      );
    }
    gridWrap.appendChild(header);
    const grid = el('div', 'selector-grid');
    for (let lvl = 0; lvl < episode.levelCount; lvl++) {
      const label = `${episode.episodeId + 1}-${lvl + 1}`;
      const card = el<HTMLButtonElement>('button', 'lvl-card', label);
      // Идентификаторы нужны контроллеру, чтобы пометить карточку, пока её
      // уровень догенерируется в воркере.
      card.dataset.episode = String(episode.episodeId);
      card.dataset.level = String(lvl);
      if (episodes.isLocked(episode.episodeId, lvl)) {
        card.classList.add('lvl-card--locked');
        card.disabled = true;
        card.textContent = '';
        card.appendChild(lockIcon());
        card.setAttribute('aria-label', `${i18n.t('TITLE_SELECT_LVL')} ${label}`);
      } else {
        card.setAttribute('aria-label', `Level ${label}`);
        card.addEventListener('click', () => cb.onSelect(episode.episodeId, lvl));
      }
      grid.appendChild(card);
    }
    gridWrap.appendChild(grid);
  });
  panel.appendChild(gridWrap);

  const back = el('button', 'btn btn--back', i18n.t('BACK'));
  back.addEventListener('click', cb.onBack);
  root.append(panel, back, hideLayer('bottom'));
  return root;
}

/**
 * Игровой экран: плавающие панели поверх канваса (как в атласе).
 * Верхняя — номер уровня и пауза. Нижняя — откат хода, сброс и подсказка.
 */
export function buildGameScreen(
  i18n: LocaleManager,
  cb: { onReset: () => void; onPause: () => void; onHint: () => void; onUndo: () => void },
): {
  root: HTMLElement;
  levelLabel: HTMLElement;
  /** Сид уровня под верхним баром: скрыт, пока его не откроют кликами. */
  seedLabel: HTMLElement;
  canvas: HTMLCanvasElement;
  canvasWrap: HTMLElement;
  pause: HTMLButtonElement;
  undo: HTMLButtonElement;
  resetBottom: HTMLButtonElement;
  hint: HTMLButtonElement;
  hintToast: HTMLElement;
} {
  const root = el('div', 'screen screen--game');
  root.dataset.screen = 'game';

  const topbar = el('div', 'game-topbar');
  const levelLabel = el('div', 'game-topbar__label', '');
  const pause = iconButton(el<HTMLButtonElement>('button', 'btn btn--icon'), 'pause', i18n.t('PAUSE'));
  pause.addEventListener('click', cb.onPause);
  topbar.append(levelLabel, pause);
  // Пасхалка: десять кликов по номеру уровня показывают его сид; у
  // сгенерированных карт по клику на сид игра собирает уровень заново.
  const seedLabel = el('div', 'game-seed', '');
  seedLabel.hidden = true;
  seedLabel.title = i18n.t('LVL_SEED_REBUILD');

  const canvasWrap = el('div', '', undefined);
  canvasWrap.id = 'canvas-wrap';
  const canvas = document.createElement('canvas');
  canvas.id = 'game-canvas';
  canvasWrap.appendChild(canvas);

  const bottombar = el('div', 'game-bottombar');
  const hintToast = el('div', 'hud-hint');
  hintToast.hidden = true;
  const undo = iconButton(el<HTMLButtonElement>('button', 'btn btn--icon'), 'undo', i18n.t('UNDO'));
  undo.disabled = true; // откатывать нечего до первого хода
  undo.addEventListener('click', cb.onUndo);
  const resetBottom = iconButton(el<HTMLButtonElement>('button', 'btn btn--icon'), 'reset', i18n.t('RESET'));
  resetBottom.addEventListener('click', cb.onReset);
  const hint = iconButton(el<HTMLButtonElement>('button', 'btn btn--icon'), 'hint', i18n.t('HINT'));
  hint.addEventListener('click', cb.onHint);
  bottombar.append(hintToast, undo, resetBottom, hint);

  root.append(canvasWrap, topbar, seedLabel, bottombar);
  return {
    root,
    levelLabel,
    seedLabel,
    canvas,
    canvasWrap,
    pause,
    undo,
    resetBottom,
    hint,
    hintToast,
  };
}

/** Элемент SVG с атрибутами — для иллюстраций в справке. */
function svgNode<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

/**
 * Иллюстрация компаса: поле сверху, оси на четыре стороны света и буквы у их
 * концов. Слева (запад) и снизу (юг) — те же оси, что в подсказке под полем;
 * север и восток подписаны на гранях кубиков.
 */
function compassFigure(): SVGSVGElement {
  const svg = svgNode('svg', {
    viewBox: '0 0 132 132',
    role: 'img',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  svg.classList.add('help__figure');
  svg.append(
    svgNode('rect', {
      x: '14',
      y: '14',
      width: '104',
      height: '104',
      rx: '16',
      fill: 'var(--color-blue)',
      opacity: '0.22',
    }),
    // Кубики на поле: два маленьких квадрата в центре — сама сцена-поле.
    svgNode('rect', {
      x: '56',
      y: '56',
      width: '16',
      height: '16',
      rx: '4',
      fill: 'var(--color-red)',
    }),
    svgNode('rect', {
      x: '72',
      y: '68',
      width: '14',
      height: '14',
      rx: '4',
      fill: 'var(--color-yellow)',
      opacity: '0.9',
    }),
  );

  // Оси: от центра к краям поля. Запад и юг — те, что рисует подсказка.
  const axes: { letter: string; x: number; y: number; ax: number; ay: number; bx: number; by: number }[] = [
    { letter: 'N', x: 66, y: 30, ax: 66, ay: 52, bx: 66, by: 40 },
    { letter: 'S', x: 66, y: 104, ax: 66, ay: 80, bx: 66, by: 92 },
    { letter: 'W', x: 30, y: 66, ax: 52, ay: 66, bx: 40, by: 66 },
    { letter: 'E', x: 102, y: 66, ax: 80, ay: 66, bx: 92, by: 66 },
  ];
  for (const axis of axes) {
    svg.append(
      svgNode('line', {
        x1: String(axis.ax),
        y1: String(axis.ay),
        x2: String(axis.bx),
        y2: String(axis.by),
        stroke: 'var(--color-coffee)',
        'stroke-width': '3',
        'stroke-linecap': 'round',
        opacity: '0.7',
      }),
    );
  }
  for (const axis of axes) {
    const text = svgNode('text', {
      x: String(axis.x),
      y: String(axis.y + 7),
      'text-anchor': 'middle',
      'font-size': '19',
      'font-weight': '700',
      fill: 'var(--color-coffee)',
    });
    text.textContent = axis.letter;
    svg.append(text);
  }
  return svg;
}

/** Цвета клеток-механик: те же, что в сцене (portal A/B и ловушка). */
const CELL_ACCENT = { portal: '#5c9ee0', portalB: '#bd73d6', trap: '#d16b57' } as const;

/** Иллюстрация клетки-механики для списка «Специальные клетки». */
function cellFigure(kind: MechanicId): SVGSVGElement {
  const svg = svgNode('svg', {
    viewBox: '0 0 40 40',
    role: 'img',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  svg.classList.add('help__cellIcon');
  const dark = kind === 'trap';
  svg.append(
    svgNode('rect', {
      x: '4',
      y: '4',
      width: '32',
      height: '32',
      rx: '8',
      // Ловушка тёмная в обеих темах — как сама клетка в игре.
      fill: dark ? '#6a5a53' : 'var(--color-blue)',
      opacity: dark ? '1' : '0.34',
    }),
  );

  if (kind === 'portal') {
    svg.append(
      svgNode('circle', { cx: '15', cy: '20', r: '6', fill: CELL_ACCENT.portal }),
      svgNode('circle', { cx: '26', cy: '20', r: '6', fill: CELL_ACCENT.portalB }),
    );
  } else if (kind === 'trap') {
    svg.append(
      svgNode('path', {
        d: 'M13 13 L27 27 M27 13 L13 27',
        stroke: CELL_ACCENT.trap,
        'stroke-width': '3.4',
        'stroke-linecap': 'round',
      }),
    );
  } else if (kind === 'rotator') {
    // Поворот на 90°: стрелка входит снизу и выходит вправо.
    svg.append(
      svgNode('path', {
        d: 'M20 28 V19 Q20 16 23 16 H28',
        fill: 'none',
        stroke: 'var(--color-coffee)',
        'stroke-width': '3',
        'stroke-linecap': 'round',
      }),
      svgNode('path', {
        d: 'M25 12.5 L30.5 16 L25 19.5 Z',
        fill: 'var(--color-coffee)',
      }),
    );
  } else if (kind === 'switch') {
    svg.append(
      svgNode('path', {
        d: 'M14 20 H26 M20 14 V26',
        stroke: 'var(--color-coffee)',
        'stroke-width': '3.2',
        'stroke-linecap': 'round',
      }),
    );
  } else {
    // Односторонняя клетка: стрелка по разрешённому направлению.
    svg.append(
      svgNode('path', {
        d: 'M13 20 H27',
        stroke: 'var(--color-coffee)',
        'stroke-width': '3.2',
        'stroke-linecap': 'round',
      }),
      svgNode('path', {
        d: 'M22 13.5 L29 20 L22 26.5 Z',
        fill: 'var(--color-coffee)',
      }),
    );
  }
  return svg;
}

/** Экран помощи. */
export function buildHelpScreen(
  i18n: LocaleManager,
  cb: { onBack: () => void },
): HTMLElement {
  const root = el('div', 'screen screen--info screen--help');
  root.dataset.screen = 'help';
  root.append(hideLayer('title'));
  root.appendChild(el('h2', 'screen__title', i18n.t('HELP')));
  const panel = el('div', 'panel panel--screen help');

  const section = (title: string, body: string) => {
    panel.appendChild(el('h3', 'help__title', title));
    panel.appendChild(el('p', 'help__text', body));
  };
  section(i18n.t('HELP_GOAL_TITLE'), i18n.t('HELP_GOAL'));
  section(i18n.t('HELP_MOVE_TITLE'), i18n.t('HELP_MOVE'));

  // Компас: подсказка под полем и буквы на гранях кубиков — одна и та же
  // разметка сторон света, поэтому она идёт одним разделом с картинкой.
  panel.appendChild(el('h3', 'help__title', i18n.t('HELP_COMPASS_TITLE')));
  const compass = el('div', 'help__figureRow');
  compass.append(compassFigure(), el('p', 'help__text', i18n.t('HELP_COMPASS')));
  panel.appendChild(compass);

  // Специальные клетки: название и описание — те же строки, что в отладке.
  panel.appendChild(el('h3', 'help__title', i18n.t('HELP_CELLS_TITLE')));
  panel.appendChild(el('p', 'help__text', i18n.t('HELP_CELLS')));
  const cells = el('ul', 'help__cells');
  for (const mechanic of ALL_MECHANICS) {
    const key = `MECH_${mechanic.id.toUpperCase()}`;
    const item = el('li', 'help__cell');
    const text = el('span', 'help__cellText');
    text.append(
      el('strong', 'help__cellName', i18n.t(key)),
      el('span', 'help__cellDesc', i18n.t(`${key}_DESC`)),
    );
    item.append(cellFigure(mechanic.id), text);
    cells.appendChild(item);
  }
  panel.appendChild(cells);

  panel.appendChild(el('h3', 'help__title', i18n.t('HELP_CTRL_TITLE')));
  const controls = el('ul', 'help__list');
  for (const key of ['HELP_CTRL_MOVE', 'HELP_CTRL_ORBIT', 'HELP_CTRL_UNDO', 'HELP_CTRL_HINT']) {
    controls.appendChild(el('li', 'help__item', i18n.t(key)));
  }
  panel.appendChild(controls);
  panel.appendChild(el('p', 'help__tip', i18n.t('HELP_TIP')));

  const back = el('button', 'btn btn--back', i18n.t('BACK'));
  back.addEventListener('click', cb.onBack);
  root.append(panel, back, hideLayer('bottom'));
  return root;
}

/** Экран «О игре» — кредиты команды. */
export function buildAboutScreen(
  i18n: LocaleManager,
  cb: { onBack: () => void },
): HTMLElement {
  const root = el('div', 'screen screen--info screen--about');
  root.dataset.screen = 'about';
  root.append(hideLayer('title'));
  root.appendChild(el('h2', 'screen__title', '2Box Puzzle'));
  const panel = el('div', 'panel panel--screen');
  panel.appendChild(el('p', undefined, 'Program: Alexey Dyadchenko'));
  panel.appendChild(el('p', undefined, 'Art: Olga Iva'));
  panel.appendChild(el('p', undefined, 'Level Design: Nikolay Unknow'));
  const back = el('button', 'btn btn--back', i18n.t('BACK'));
  back.addEventListener('click', cb.onBack);
  root.append(panel, back, hideLayer('bottom'));
  return root;
}

/** Диалог паузы: Resume, Level select, Settings, Main Menu. */
export function buildPauseDialog(
  i18n: LocaleManager,
  cb: {
    onResume: () => void;
    onLevelSelect: () => void;
    onSettings: () => void;
    onMainMenu: () => void;
  },
): { root: HTMLElement } {
  const root = el('div', 'dialog dialog--hidden');
  root.dataset.dialog = 'pause';
  // Заголовок — отдельно от панели: он стоит на месте заголовка экрана,
  // а кнопки остаются по центру.
  const title = el('div', 'dialog__title dialog__title--fixed', i18n.t('PAUSE'));
  const box = el('div', 'dialog__box panel');
  const resume = el('button', 'btn', i18n.t('RESUME'));
  resume.addEventListener('click', cb.onResume);
  const select = el('button', 'btn', i18n.t('LVL_SELECTOR'));
  select.addEventListener('click', cb.onLevelSelect);
  const settings = el('button', 'btn', i18n.t('OPTIONS'));
  settings.addEventListener('click', cb.onSettings);
  const mmenu = el('button', 'btn', i18n.t('MMENU'));
  mmenu.addEventListener('click', cb.onMainMenu);
  box.append(resume, select, settings, mmenu);
  root.append(title, box);
  return { root };
}

/** Диалог завершения: звёзды, статистика + Reset / Home / Next. */
export function buildCompletedDialog(
  i18n: LocaleManager,
  cb: { onNext: () => void; onHome: () => void; onReset: () => void },
): { root: HTMLElement; stats: HTMLElement; stars: HTMLElement; title: HTMLElement } {
  const root = el('div', 'dialog dialog--hidden');
  root.dataset.dialog = 'completed';
  const box = el('div', 'dialog__box panel');
  // Заголовок — как в остальных меню: сверху, на месте заголовка экрана,
  // а не внутри панели со звёздами и статистикой.
  const title = el('div', 'dialog__title dialog__title--fixed', i18n.t('COMPLETED'));
  const stars = el('div', 'dialog__stars');
  const stats = el('div', 'dialog__stats');
  const reset = el<HTMLButtonElement>('button', 'btn btn--warning btn--icon');
  iconButton(reset, 'reset', i18n.t('RESET'));
  reset.addEventListener('click', cb.onReset);
  const home = el<HTMLButtonElement>('button', 'btn btn--icon');
  iconButton(home, 'home', i18n.t('MMENU'));
  home.addEventListener('click', cb.onHome);
  const next = el<HTMLButtonElement>('button', 'btn btn--danger btn--icon');
  iconButton(next, 'next', i18n.t('PLAY'));
  next.addEventListener('click', cb.onNext);
  const row = el('div', 'dialog__actions');
  row.append(reset, home, next);
  box.append(stars, stats);
  // Кнопки — отдельным рядом на уровне иконок главного меню (см. dialogs.css),
  // поэтому они не в панели со звёздами и статистикой.
  root.append(title, box, row);
  return { root, stats, stars, title };
}
