import type { LocaleManager } from '../i18n/LocaleManager';
import type { EpisodeManager } from '../../core/services/episode-mng';

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

/** Геометрия иконок кнопок: 24×24, один цвет (currentColor) — плоский стиль. */
const ICONS = {
  // Закрученная стрелка (сброс уровня)
  reset: {
    stroke: false,
    paths: [
      'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z',
    ],
  },
  // Две вертикальные полоски (пауза)
  pause: { stroke: false, paths: ['M6 19h4V5H6v14Zm8-14v14h4V5h-4Z'] },
  // Плоский домик (в главное меню)
  home: { stroke: false, paths: ['M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5Z'] },
  // Две стрелки вправо (играть / следующий уровень)
  next: { stroke: true, paths: ['M5 4l8 8-8 8', 'M12 4l8 8-8 8'] },
  // Лампочка (подсказка)
  hint: {
    stroke: false,
    paths: [
      'M12 2a7 7 0 0 0-4.2 12.6c.5.4.8 1 .9 1.6l.1.8h6.4l.1-.8c.1-.6.4-1.2.9-1.6A7 7 0 0 0 12 2Z',
      'M9 19h6v1.2a1.8 1.8 0 0 1-1.8 1.8h-2.4A1.8 1.8 0 0 1 9 20.2V19Z',
    ],
  },
} as const;

type IconName = keyof typeof ICONS;

/** Плоская иконка (без объёма и тени), цвет наследуется от кнопки. */
function icon(name: IconName): SVGSVGElement {
  const def = ICONS[name];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('btn__icon', def.stroke ? 'btn__icon--stroke' : 'btn__icon--fill');
  for (const d of def.paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

/** Кнопка-иконка: текст убирается, подпись остаётся в aria-label/title. */
function iconButton(btn: HTMLButtonElement, name: IconName, label: string): HTMLButtonElement {
  btn.textContent = '';
  btn.appendChild(icon(name));
  btn.title = label;
  btn.setAttribute('aria-label', label);
  return btn;
}

/** Главное меню: Resume (если есть сохранение), Play, Help, About. */
export function buildMenuScreen(
  i18n: LocaleManager,
  canResume: boolean,
  cb: { onResume: () => void; onPlay: () => void; onHelp: () => void; onAbout: () => void },
): HTMLElement {
  const root = el('div', 'screen screen--menu');
  root.dataset.screen = 'mmenu';
  const title = el('h1', 'screen__title screen__title--main', i18n.t('TITLE'));

  const card = el('div', 'menu-card');
  const buttons = el('div', 'screen__buttons');
  const resume = el<HTMLButtonElement>('button', 'btn', i18n.t('RESUME'));
  resume.disabled = !canResume;
  resume.setAttribute('aria-label', i18n.t('RESUME'));
  resume.addEventListener('click', cb.onResume);
  const play = el<HTMLButtonElement>('button', 'btn', i18n.t('PLAY'));
  play.setAttribute('aria-label', i18n.t('PLAY'));
  play.addEventListener('click', cb.onPlay);
  const help = el<HTMLButtonElement>('button', 'btn', i18n.t('HELP'));
  help.setAttribute('aria-label', i18n.t('HELP'));
  help.addEventListener('click', cb.onHelp);
  // Options и About скрыты/отключены как в оригинале (раздел 17.3) — About оставляем
  const about = el<HTMLButtonElement>('button', 'btn', i18n.t('ABOUT'));
  about.setAttribute('aria-label', i18n.t('ABOUT'));
  about.addEventListener('click', cb.onAbout);
  buttons.append(resume, play, help, about);
  card.appendChild(buttons);

  root.append(title, card);
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
  root.appendChild(el('h2', 'screen__title', i18n.t('TITLE_SELECT_LVL')));

  const panel = el('div', 'panel panel--screen selector-panel');
  const gridWrap = el('div', 'selector-grid-wrap');
  episodes.episodes.forEach((episode) => {
    gridWrap.appendChild(el('div', 'selector-episode', i18n.t('EPISODE_NUM', episode.episodeId + 1)));
    const grid = el('div', 'selector-grid');
    for (let lvl = 0; lvl < episode.levelCount; lvl++) {
      const label = `${episode.episodeId + 1}-${lvl + 1}`;
      const card = el<HTMLButtonElement>('button', 'lvl-card', label);
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
  root.append(panel, back);
  return root;
}

/**
 * Игровой экран: плавающие панели поверх канваса (как в атласе).
 * Верхняя — номер уровня, сброс, пауза. Нижняя — сброс и подсказка.
 */
export function buildGameScreen(
  i18n: LocaleManager,
  cb: { onReset: () => void; onPause: () => void; onHint: () => void },
): {
  root: HTMLElement;
  levelLabel: HTMLElement;
  canvas: HTMLCanvasElement;
  canvasWrap: HTMLElement;
  resetTop: HTMLButtonElement;
  pause: HTMLButtonElement;
  resetBottom: HTMLButtonElement;
  hint: HTMLButtonElement;
  hintToast: HTMLElement;
} {
  const root = el('div', 'screen screen--game');
  root.dataset.screen = 'game';

  const topbar = el('div', 'game-topbar');
  const levelLabel = el('div', 'game-topbar__label', '');
  const resetTop = iconButton(el<HTMLButtonElement>('button', 'btn btn--icon'), 'reset', i18n.t('RESET'));
  resetTop.addEventListener('click', cb.onReset);
  const pause = iconButton(el<HTMLButtonElement>('button', 'btn btn--icon'), 'pause', i18n.t('PAUSE'));
  pause.addEventListener('click', cb.onPause);
  topbar.append(levelLabel, resetTop, pause);

  const canvasWrap = el('div', '', undefined);
  canvasWrap.id = 'canvas-wrap';
  const canvas = document.createElement('canvas');
  canvas.id = 'game-canvas';
  canvasWrap.appendChild(canvas);

  const bottombar = el('div', 'game-bottombar');
  const hintToast = el('div', 'hud-hint');
  hintToast.hidden = true;
  const resetBottom = iconButton(el<HTMLButtonElement>('button', 'btn btn--icon'), 'reset', i18n.t('RESET'));
  resetBottom.addEventListener('click', cb.onReset);
  const hint = iconButton(el<HTMLButtonElement>('button', 'btn btn--icon'), 'hint', i18n.t('HINT'));
  hint.addEventListener('click', cb.onHint);
  bottombar.append(hintToast, resetBottom, hint);

  root.append(canvasWrap, topbar, bottombar);
  return { root, levelLabel, canvas, canvasWrap, resetTop, pause, resetBottom, hint, hintToast };
}

/** Экран помощи. */
export function buildHelpScreen(
  i18n: LocaleManager,
  cb: { onBack: () => void },
): HTMLElement {
  const root = el('div', 'screen screen--info screen--help');
  root.dataset.screen = 'help';
  root.appendChild(el('h2', 'screen__title', i18n.t('HELP')));
  const panel = el('div', 'panel panel--screen');
  panel.appendChild(
    el(
      'p',
      undefined,
      'Переместите 2 кубика на целевые площадки того же цвета. ' +
        'Все кубики двигаются одновременно: скользят до упора. ' +
        'Управление: стрелки / свайпы. R — сброс уровня. Escape — пауза.',
    ),
  );
  const back = el('button', 'btn btn--back', i18n.t('BACK'));
  back.addEventListener('click', cb.onBack);
  root.append(panel, back);
  return root;
}

/** Экран «О игре» — кредиты команды. */
export function buildAboutScreen(
  i18n: LocaleManager,
  cb: { onBack: () => void },
): HTMLElement {
  const root = el('div', 'screen screen--info screen--about');
  root.dataset.screen = 'about';
  root.appendChild(el('h2', 'screen__title', '2Box Puzzle'));
  const panel = el('div', 'panel panel--screen');
  panel.appendChild(el('p', undefined, 'Program: Alexey Dyadchenko'));
  panel.appendChild(el('p', undefined, 'Art: Olga Iva'));
  panel.appendChild(el('p', undefined, 'Level Design: Nikolay Unknow'));
  const back = el('button', 'btn btn--back', i18n.t('BACK'));
  back.addEventListener('click', cb.onBack);
  root.append(panel, back);
  return root;
}

/** Диалог паузы: Resume, Level select, Main Menu. */
export function buildPauseDialog(
  i18n: LocaleManager,
  cb: { onResume: () => void; onLevelSelect: () => void; onMainMenu: () => void },
): { root: HTMLElement } {
  const root = el('div', 'dialog dialog--hidden');
  root.dataset.dialog = 'pause';
  const box = el('div', 'dialog__box panel');
  box.appendChild(el('div', 'dialog__title', i18n.t('PAUSE')));
  const resume = el('button', 'btn', i18n.t('RESUME'));
  resume.addEventListener('click', cb.onResume);
  const select = el('button', 'btn', i18n.t('LVL_SELECTOR'));
  select.addEventListener('click', cb.onLevelSelect);
  const mmenu = el('button', 'btn', i18n.t('MMENU'));
  mmenu.addEventListener('click', cb.onMainMenu);
  box.append(resume, select, mmenu);
  root.appendChild(box);
  return { root };
}

/** Диалог завершения: статистика + Reset / Home / Next. */
export function buildCompletedDialog(
  i18n: LocaleManager,
  cb: { onNext: () => void; onHome: () => void; onReset: () => void },
): { root: HTMLElement; stats: HTMLElement; title: HTMLElement } {
  const root = el('div', 'dialog dialog--hidden');
  root.dataset.dialog = 'completed';
  const box = el('div', 'dialog__box panel');
  const title = el('div', 'dialog__title', i18n.t('COMPLETED'));
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
  box.append(title, stats, row);
  root.appendChild(box);
  return { root, stats, title };
}
