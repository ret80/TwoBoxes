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
import { LocalStorageSave } from '@adapters/storage/LocalStorageSave';
import { InputAction } from '@ports/IInput';
import { LocaleManager } from '@presentation/i18n/LocaleManager';
import { MenuController } from '@presentation/controllers/MenuController';
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
const input = new InputAggregator();
void config; // громкость/демо — конфиг подключён через подписки контроллеров

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
);

// Кнопки topbar: [Reset, Menu(Pause)]
const [resetBtn, menuBtn] = Array.from(gameScreen.root.querySelectorAll('button'));
resetBtn.addEventListener('click', () => game.reset());
menuBtn.addEventListener('click', () => game.pause());

renderer.init(gameScreen.canvas);
const onResize = () => renderer.resize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);
onResize();
renderer.startLoop();

const menuCtrl = new MenuController(screensRoot, i18n, episodes, menuActor, (ep, lvl) => {
  episodes.setCurLevel(ep, lvl);
});

const pauseDialog = new PauseDialogController(dialogRoot, i18n, audio, input, {
  onResume: () => game.resume(),
  onLevelSelect: () => menuActor.send({ type: 'BACK' }),
  onMainMenu: () => menuActor.send({ type: 'HOME' }),
});

const completedDialog = new CompletedDialogController(dialogRoot, i18n, audio, {
  onNext: () => {
    episodes.nextLevel();
    game.startLevel(episodes.getCurLevel());
  },
  onHome: () => menuActor.send({ type: 'HOME' }),
  onReset: () => game.reset(),
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
for (const dirAction of [InputAction.UP, InputAction.DOWN, InputAction.LEFT, InputAction.RIGHT]) {
  input.on(dirAction, (payload) => {
    if (payload?.dir) game.handleDirection(payload.dir);
  });
}
input.on(InputAction.RESET, () => {
  if (menuActor.getSnapshot().value === 'game') game.reset();
});
input.on(InputAction.PAUSE, () => {
  if (menuActor.getSnapshot().value === 'game') game.pause();
});
input.setEnabled(true);

// Демо-режим: активен во всех состояниях menuFSM, кроме `game` (фон меню)
let prevMenuState = menuActor.getSnapshot().value as string;
menuActor.subscribe((snapshot) => {
  const state = snapshot.value as string;
  const enteringGame = state === 'game' && prevMenuState !== 'game';
  prevMenuState = state;

  const demo = state !== 'game';
  config.set('demoMode', demo);
  input.setDemoMode(demo);
  game.setDemo(demo);
  menuCtrl.show(state);
  gameScreen.root.classList.toggle('screen--game-idle', state !== 'game');

  if (enteringGame) {
    const selected = snapshot.context.selected;
    if (selected) episodes.setCurLevel(selected.episodeId, selected.levelId);
    game.startLevel(episodes.getCurLevel());
  }
  if (state === 'selector') menuCtrl.refreshSelector();
  if (state === 'mmenu') menuCtrl.refreshResume();
});

// AudioContext — по user gesture (политика автозапуска)
const initAudio = () => {
  void audio.init();
  audio.playMusic('ambient');
  document.removeEventListener('pointerdown', initAudio);
  document.removeEventListener('keydown', initAudio);
};
document.addEventListener('pointerdown', initAudio);
document.addEventListener('keydown', initAudio);
