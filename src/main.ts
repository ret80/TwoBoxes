import './style.css';
import { createActor } from 'xstate';
import { createGameMachine } from '@core/state/game';
import { menuMachine } from '@core/state/menu';
import { Config } from '@core/services/config';
import { EpisodeManager, type SaveData } from '@core/services/episode-mng';
import { Statistics } from '@core/services/statistics';
import { PicoglRenderer } from '@adapters/renderer/PicoglRenderer';
import { WebAudioPlayer } from '@adapters/audio/WebAudioPlayer';
import { InputAggregator } from '@adapters/input/InputAggregator';
import { OrbitInput } from '@adapters/input/OrbitInput';
import { LocalStorageSave } from '@adapters/storage/LocalStorageSave';
import { InputAction } from '@ports/IInput';
import { LocaleManager } from '@presentation/i18n/LocaleManager';
import { MenuController, type MenuDirection } from '@presentation/controllers/MenuController';
import { GameController } from '@presentation/controllers/GameController';
import { PauseDialogController } from '@presentation/controllers/PauseDialogController';
import { CompletedDialogController } from '@presentation/controllers/CompletedDialogController';
import { buildGameScreen } from '@presentation/html/screens';

/**
 * Точка входа (план 14.1): сборка ядра, адаптеров, FSM и контроллеров.
 */

const app = document.getElementById('app') as HTMLElement;
const dialogRoot = document.createElement('div');
dialogRoot.id = 'dialogs';
app.appendChild(dialogRoot);
const screensRoot = document.createElement('div');
screensRoot.id = 'screens';
app.appendChild(screensRoot);

/*
 * Размытие сцены под интерфейсом: CSS-фильтр получает сам канвас. Так эффект
 * работает и в браузерах, где backdrop-filter не размывает WebGL-содержимое.
 */
type SceneBlur = 'none' | 'menu' | 'screen' | 'dialog';
let baseSceneBlur: SceneBlur = 'menu';
let dialogVisible = false;
const applySceneBlur = (): void => {
  app.dataset.sceneBlur = dialogVisible ? 'dialog' : baseSceneBlur;
};

// 1–3. Ядро
const config = new Config();
const episodes = new EpisodeManager();
const statistics = new Statistics();
const storage = new LocalStorageSave();

// Загрузка сохранения (активирует Resume)
const saved = storage.load('save');
if (saved) episodes.deserialize(saved as SaveData);

// 4–7. Адаптеры
const renderer = new PicoglRenderer();
const audio = new WebAudioPlayer();
const input = new InputAggregator(() => renderer.getCameraAngles());

// Громкость из настроек применяется к аудио-адаптеру сразу.
config.subscribe((key, value) => {
  if (key === 'sfxVolume') audio.setSfxVolume(value as number);
  if (key === 'musicVolume') audio.setMusicVolume(value as number);
});

// 9. FSM-машины
const menuActor = createActor(menuMachine);
menuActor.start();
const gameActor = createActor(createGameMachine(episodes.getCurLevel()));
gameActor.start();

// 10. Контроллеры
const i18n = new LocaleManager(storage);
const gameScreen = buildGameScreen(i18n, {
  onReset: () => undefined, // подключается ниже, после создания GameController
  onPause: () => undefined,
  onHint: () => undefined,
  onUndo: () => undefined,
});
screensRoot.appendChild(gameScreen.root);
// Вне состояния game верхняя панель HUD не показывается (меню, выбор уровня, помощь)
gameScreen.root.classList.add('screen--game-idle');

const game = new GameController(
  renderer,
  audio,
  episodes,
  statistics,
  storage,
  gameScreen.levelLabel,
  gameActor,
  (level) => i18n.t('LVL_NUM', level.episodeId + 1, level.levelId + 1),
);

// Панели HUD: верхняя (сброс/пауза) и нижняя (сброс/подсказка)
gameScreen.undo.addEventListener('click', () => game.undo());
gameScreen.resetBottom.addEventListener('click', () => game.reset());
gameScreen.pause.addEventListener('click', () => game.pause());

// Подсказка: направление первого хода кратчайшего решения во всплывающей плашке
const ARROWS: Record<string, string> = { '1,0': '→', '-1,0': '←', '0,1': '↓', '0,-1': '↑' };
let hintTimer = 0;
gameScreen.hint.addEventListener('click', () => {
  const dir = game.hint();
  gameScreen.hintToast.textContent = dir
    ? `${i18n.t('HINT')}: ${ARROWS[`${dir.x},${dir.y}`] ?? ''}`
    : i18n.t('HINT_NONE');
  gameScreen.hintToast.hidden = false;
  window.clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => {
    gameScreen.hintToast.hidden = true;
  }, 2200);
});

renderer.init(gameScreen.canvas);
const onResize = () => renderer.resize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);
onResize();
renderer.startLoop();

// Орбита камеры: мышь — перетаскивание, тач — два пальца (один палец — свайп хода)
const ORBIT_SPEED = 0.006; // радиан на пиксель сдвига
const orbit = new OrbitInput((dx, dy) =>
  renderer.orbit(dx * ORBIT_SPEED, dy * ORBIT_SPEED),
);
orbit.attach(gameScreen.canvasWrap);

const menuCtrl = new MenuController(
  screensRoot,
  i18n,
  episodes,
  menuActor,
  (ep, lvl) => {
    episodes.setCurLevel(ep, lvl);
  },
  config,
);

/*
 * HUD-панели: выезжают из-за краёв на старте уровня, уезжают за экран, когда
 * уровень пройден или поверх поля открыт любой диалог. Стартовое положение
 * держим один кадр, иначе transition не успевает сработать.
 */
const hudRoot = gameScreen.root;

// Любое меню поверх поля прячет HUD тем же движением, что и экран победы.
const setDialogVisible = (visible: boolean): void => {
  dialogVisible = visible;
  applySceneBlur();
  hudRoot.classList.toggle('hud--hidden', visible);
};

const pauseDialog = new PauseDialogController(dialogRoot, i18n, audio, input, {
  onResume: () => game.resume(),
  onLevelSelect: () => menuActor.send({ type: 'BACK' }),
  onMainMenu: () => menuActor.send({ type: 'HOME' }),
  onVisibility: setDialogVisible,
});
const revealHud = (): void => {
  hudRoot.classList.add('hud--hidden');
  requestAnimationFrame(() =>
    requestAnimationFrame(() => hudRoot.classList.remove('hud--hidden')),
  );
};

let prevGameState = gameActor.getSnapshot().value as string;
gameActor.subscribe((snapshot) => {
  const state = snapshot.value as string;
  // Кнопка undo активна, пока есть ходы в истории и ждём ввод
  gameScreen.undo.disabled = !(state === 'input' && snapshot.context.history.length > 0);
  const entered = state !== prevGameState;
  prevGameState = state;
  if (!entered) return;
  if (state === 'create') revealHud();
  if (state === 'completed') hudRoot.classList.add('hud--hidden');
});

const completedDialog = new CompletedDialogController(dialogRoot, i18n, audio, {
  onNext: () => {
    episodes.nextLevel();
    game.startLevel(episodes.getCurLevel());
  },
  onHome: () => menuActor.send({ type: 'HOME' }),
  onReset: () => game.reset(),
  onVisibility: setDialogVisible,
});

game.attachDialogs({
  showPause: () => pauseDialog.show(),
  showCompleted: (moves, time) => completedDialog.show(moves, time),
  hideDialogs: () => {
    pauseDialog.hide();
    completedDialog.hide();
  },
});

// 11–12. Ввод и запуск
input.attach();
// Демо-подсказка: компьютер в фоне идёт к решению, а не только случайно.
input.setDemoDirectionProvider(() => game.hint());

const DIRECTION_ACTIONS: [InputAction, MenuDirection][] = [
  [InputAction.UP, 'up'],
  [InputAction.DOWN, 'down'],
  [InputAction.LEFT, 'left'],
  [InputAction.RIGHT, 'right'],
];
for (const [action, menuDir] of DIRECTION_ACTIONS) {
  input.on(action, (payload) => {
    if (!payload?.dir) return;
    // Ходы демо-компьютера всегда идут в игру, а не в навигацию меню.
    if (payload.demo) {
      game.handleDirection(payload.dir);
      return;
    }
    const state = menuActor.getSnapshot().value as string;
    if (state === 'mmenu') {
      menuCtrl.navigate(menuDir);
      return;
    }
    // Вне игры кубиками управляет только демо-компьютер, а не игрок.
    if (state === 'game') game.handleDirection(payload.dir);
  });
}
input.on(InputAction.RESET, () => {
  if (menuActor.getSnapshot().value === 'game') game.reset();
});
input.on(InputAction.PAUSE, () => {
  if (menuActor.getSnapshot().value === 'game') game.pause();
});
input.on(InputAction.RESUME, () => {
  // Enter / A/×: в главном меню активируют выбранную иконку.
  if (menuActor.getSnapshot().value === 'mmenu') menuCtrl.activate();
});
input.on(InputAction.BACK, () => {
  const state = menuActor.getSnapshot().value as string;
  if (state === 'help' || state === 'about' || state === 'settings' || state === 'selector') {
    menuActor.send({ type: 'BACK' });
  }
});
input.setEnabled(true);

// Демо-режим: активен во всех состояниях menuFSM, кроме `game` (фон меню)
let prevMenuState = menuActor.getSnapshot().value as string;
const applyMenuState = (snapshot: ReturnType<typeof menuActor.getSnapshot>): void => {
  const state = snapshot.value as string;
  const enteringGame = state === 'game' && prevMenuState !== 'game';
  prevMenuState = state;

  baseSceneBlur = state === 'game' ? 'none' : state === 'mmenu' ? 'menu' : 'screen';
  applySceneBlur();

  const demo = state !== 'game';
  config.set('demoMode', demo);
  input.setDemoMode(demo);
  game.setDemo(demo);
  menuCtrl.show(state);
  gameScreen.root.classList.toggle('screen--game-idle', state !== 'game');
  if (state !== 'game') hudRoot.classList.add('hud--hidden');
  orbit.setEnabled(state === 'game');

  if (enteringGame) {
    const selected = snapshot.context.selected;
    if (selected) episodes.setCurLevel(selected.episodeId, selected.levelId);
    game.startLevel(episodes.getCurLevel());
  }
  if (state === 'selector') menuCtrl.refreshSelector();
  if (state === 'mmenu') menuCtrl.refreshResume();
};
menuActor.subscribe(applyMenuState);
// XState не вызывает подписчика для текущего состояния: синхронизируем стартовое
// меню вручную, иначе демо-фон и активная иконка не включались при загрузке.
applyMenuState(menuActor.getSnapshot());

// AudioContext — по user gesture (политика автозапуска)
const initAudio = () => {
  void audio.init();
  audio.playMusic('ambient');
  document.removeEventListener('pointerdown', initAudio);
  document.removeEventListener('keydown', initAudio);
};
document.addEventListener('pointerdown', initAudio);
document.addEventListener('keydown', initAudio);
