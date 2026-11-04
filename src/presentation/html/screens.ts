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

/** Главное меню: Resume (если есть сохранение), Play, Help, About. */
export function buildMenuScreen(
  i18n: LocaleManager,
  canResume: boolean,
  cb: { onResume: () => void; onPlay: () => void; onHelp: () => void; onAbout: () => void },
): HTMLElement {
  const root = el('div', 'screen screen--menu');
  root.dataset.screen = 'mmenu';
  const title = el('h1', 'screen__title', i18n.t('TITLE'));

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

  root.append(title, buttons);
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

  const gridWrap = el('div', 'selector-grid-wrap');
  episodes.episodes.forEach((episode) => {
    gridWrap.appendChild(el('div', 'selector-episode', i18n.t('EPISODE_NUM', episode.episodeId + 1)));
    const grid = el('div', 'selector-grid');
    for (let lvl = 0; lvl < episode.levelCount; lvl++) {
      const card = el<HTMLButtonElement>('button', 'lvl-card', `${episode.episodeId + 1}-${lvl + 1}`);
      if (episodes.isLocked(episode.episodeId, lvl)) {
        card.classList.add('lvl-card--locked');
        card.disabled = true;
      } else {
        card.setAttribute('aria-label', `Level ${episode.episodeId + 1}-${lvl + 1}`);
        card.addEventListener('click', () => cb.onSelect(episode.episodeId, lvl));
      }
      grid.appendChild(card);
    }
    gridWrap.appendChild(grid);
  });

  const back = el('button', 'btn', i18n.t('BACK'));
  back.addEventListener('click', cb.onBack);
  root.append(gridWrap, back);
  return root;
}

/** Игровой экран: topbar (номер уровня, Reset, Menu) + canvas. */
export function buildGameScreen(
  i18n: LocaleManager,
  cb: { onReset: () => void; onPause: () => void },
): { root: HTMLElement; levelLabel: HTMLElement; canvas: HTMLCanvasElement } {
  const root = el('div', 'screen screen--game');
  root.dataset.screen = 'game';

  const topbar = el('div', 'game-topbar');
  const levelLabel = el('div', 'game-topbar__label', '');
  const reset = el<HTMLButtonElement>('button', 'btn btn--warning btn--icon', i18n.t('RESET'));
  reset.setAttribute('aria-label', i18n.t('RESET'));
  reset.addEventListener('click', cb.onReset);
  const menu = el<HTMLButtonElement>('button', 'btn btn--icon', i18n.t('PAUSE'));
  menu.setAttribute('aria-label', i18n.t('PAUSE'));
  menu.addEventListener('click', cb.onPause);
  topbar.append(levelLabel, reset, menu);

  const canvasWrap = el('div', '', undefined);
  canvasWrap.id = 'canvas-wrap';
  const canvas = document.createElement('canvas');
  canvas.id = 'game-canvas';
  canvasWrap.appendChild(canvas);

  root.append(topbar, canvasWrap);
  return { root, levelLabel, canvas };
}

/** Экран помощи. */
export function buildHelpScreen(
  i18n: LocaleManager,
  cb: { onBack: () => void },
): HTMLElement {
  const root = el('div', 'screen screen--help');
  root.dataset.screen = 'help';
  root.appendChild(el('h2', 'screen__title', i18n.t('HELP')));
  const panel = el('div', 'panel');
  panel.appendChild(
    el(
      'p',
      undefined,
      'Переместите 2 кубика на целевые площадки того же цвета. ' +
        'Все кубики двигаются одновременно: скользят до упора. ' +
        'Управление: стрелки / свайпы. R — сброс уровня. Escape — пауза.',
    ),
  );
  const back = el('button', 'btn', i18n.t('BACK'));
  back.addEventListener('click', cb.onBack);
  root.append(panel, back);
  return root;
}

/** Экран «О игре» — кредиты команды. */
export function buildAboutScreen(
  _i18n: LocaleManager,
  cb: { onBack: () => void },
): HTMLElement {
  const root = el('div', 'screen screen--about');
  root.dataset.screen = 'about';
  root.appendChild(el('h2', 'screen__title', '2Box Puzzle'));
  const panel = el('div', 'panel');
  panel.appendChild(el('p', undefined, 'Program: Alexey Dyadchenko'));
  panel.appendChild(el('p', undefined, 'Art: Olga Iva'));
  panel.appendChild(el('p', undefined, 'Level Design: Nikolay Unknow'));
  const back = el('button', 'btn', 'Back');
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
  const reset = el('button', 'btn btn--warning btn--icon', i18n.t('RESET'));
  reset.addEventListener('click', cb.onReset);
  const home = el<HTMLButtonElement>('button', 'btn btn--icon', '🏠');
  home.title = i18n.t('MMENU');
  home.setAttribute('aria-label', i18n.t('MMENU'));
  home.addEventListener('click', cb.onHome);
  const next = el<HTMLButtonElement>('button', 'btn btn--danger', i18n.t('PLAY'));
  next.setAttribute('aria-label', i18n.t('PLAY'));
  next.addEventListener('click', cb.onNext);
  const row = el('div', 'screen__buttons');
  row.append(reset, home, next);
  box.append(title, stats, row);
  root.appendChild(box);
  return { root, stats, title };
}
