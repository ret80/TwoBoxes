import { describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { Config } from '../../core/services/config';
import { EpisodeManager } from '../../core/services/episode-mng';
import { menuMachine } from '../../core/state/menu';
import type { ISaveStorage } from '../../ports/ISaveStorage';
import { LocaleManager } from '../i18n/LocaleManager';
import { MenuController } from './MenuController';

function setup() {
  document.body.innerHTML = '<div id="root"></div>';
  const root = document.getElementById('root') as HTMLElement;
  const storage: ISaveStorage = {
    save: () => undefined,
    load: (key) => (key === 'locale' ? 'ru' : null),
    remove: () => undefined,
  };
  const i18n = new LocaleManager(storage);
  const episodes = new EpisodeManager();
  const actor = createActor(menuMachine);
  actor.start();
  const ctrl = new MenuController(root, i18n, episodes, actor, vi.fn(), new Config());
  return { ctrl, root, episodes, actor, i18n };
}

const caption = (root: HTMLElement): string =>
  root.querySelector('.xmb__caption')?.textContent ?? '';

const item = (root: HTMLElement, id: string): HTMLElement =>
  root.querySelector(`.xmb__item[data-item="${id}"]`) as HTMLElement;

const dy = (root: HTMLElement, id: string): string =>
  item(root, id).style.getPropertyValue('--dy');

describe('MenuController: карусель главного меню', () => {
  it('стартует с активной «Играть» и ведёт подпись под меню', () => {
    const { root } = setup();
    expect(caption(root)).toBe('Играть');
    expect(root.querySelector('.xmb__item.is-active')?.getAttribute('data-item')).toBe('play');
  });

  it('вправо: помощь, затем «О игре»; влево возвращает', () => {
    const { ctrl, root } = setup();
    ctrl.navigate('right');
    expect(caption(root)).toBe('Помощь');
    ctrl.navigate('right');
    expect(caption(root)).toBe('О игре');
    ctrl.navigate('left');
    expect(caption(root)).toBe('Помощь');
  });

  it('влево от «Играть» — настройки, вверх — «Продолжить» при сохранении', () => {
    const { ctrl, root, episodes } = setup();
    episodes.markStarted();
    ctrl.refreshResume();

    ctrl.navigate('left');
    expect(caption(root)).toBe('Настройки');

    ctrl.navigate('right');
    ctrl.navigate('up');
    expect(caption(root)).toBe('Продолжить');
    // Пара меняется местами, остальные иконки остаются в ряду.
    expect(dy(root, 'play')).toBe('-1');
    expect(dy(root, 'continue')).toBe('0');
    expect(dy(root, 'settings')).toBe('0');
    expect(dy(root, 'help')).toBe('0');

    ctrl.navigate('down');
    expect(caption(root)).toBe('Играть');
    expect(dy(root, 'play')).toBe('0');
    expect(dy(root, 'continue')).toBe('-1');
  });

  it('смена языка перестраивает подписи экранов', () => {
    const { root, i18n } = setup();
    expect(caption(root)).toBe('Играть');
    i18n.setLocale('en');
    expect(caption(root)).toBe('Play');
    // Название игры рисуется логотипом и не переводится
    expect(root.querySelector('.screen--menu .screen__title')?.getAttribute('aria-label')).toBe(
      '2Box — a puzzle game',
    );
  });

  it('«Продолжить» и «Играть» открывают игру', () => {
    const { ctrl, actor, episodes } = setup();
    episodes.markStarted();
    ctrl.refreshResume();

    ctrl.navigate('up');
    ctrl.activate();
    expect(actor.getSnapshot().value).toBe('game');
  });

  it('догенерирует выбранный уровень и запускает его, когда карта готова', () => {
    const { ctrl, actor, episodes, root } = setup();
    const request = vi.fn();
    ctrl.setLevelGenerator(request);
    episodes.unlockAllLevels();
    actor.send({ type: 'PLAY' });
    ctrl.refreshSelector();

    const card = root.querySelector<HTMLButtonElement>(
      '.lvl-card[data-episode="1"][data-level="5"]',
    );
    expect(card).not.toBeNull();
    card?.click();

    // Воркер получил приоритетную заявку, но игра ещё не началась.
    expect(request).toHaveBeenCalledWith(1, 5);
    expect(actor.getSnapshot().value).toBe('selector');
    expect(card?.classList.contains('lvl-card--pending')).toBe(true);

    episodes.applyEpisodeLevel(1, 5, episodes.getEpisode(0).levelRows[0]);
    ctrl.levelReady(1, 5);
    expect(actor.getSnapshot().value).toBe('game');
  });
});
