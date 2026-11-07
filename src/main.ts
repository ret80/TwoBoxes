import './style.css';
import { createActor } from 'xstate';
import { createGameMachine } from '@core/state/game';
import { menuMachine } from '@core/state/menu';
import { Config } from '@core/services/config';
import { EpisodeManager, type SaveData } from '@core/services/episode-mng';
import { EPISODE_2_LEVELS, EPISODE_2_SEED } from '@core/data/episode-2';
import { Statistics } from '@core/services/statistics';
import { generateTestLevel } from '@core/generation/level-generator';
import type { MechanicId } from '@core/generation/mechanics';
import { createLevelFromData } from '@core/rules/create';
import type { Level } from '@core/types/level';
import { PicoglRenderer } from '@adapters/renderer/PicoglRenderer';
import { WebAudioPlayer } from '@adapters/audio/WebAudioPlayer';
import { InputAggregator } from '@adapters/input/InputAggregator';
import { OrbitInput } from '@adapters/input/OrbitInput';
import { ModalityTracker } from '@adapters/input/ModalityTracker';
import { LocalStorageSave } from '@adapters/storage/LocalStorageSave';
import { InputAction } from '@ports/IInput';
import type { ProjectionMode } from '@ports/IRenderer';
import { LocaleManager } from '@presentation/i18n/LocaleManager';
import { MenuController, type MenuDirection } from '@presentation/controllers/MenuController';
import { GameController } from '@presentation/controllers/GameController';
import { PauseDialogController } from '@presentation/controllers/PauseDialogController';
import { CompletedDialogController } from '@presentation/controllers/CompletedDialogController';
import { buildGameScreen } from '@presentation/html/screens';
import type {
  EpisodeWorkerRequest,
  EpisodeWorkerResponse,
} from './workers/episode-protocol';

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
const modality = new ModalityTracker();

/**
 * Компас L/D нужен только клавиатуре и геймпаду: на тач-экране подсказка про
 * клавиши только мешает. Как только такой ввод замечен, компас остаётся на
 * экране до конца сессии — исчезать на каждый тап по экрану он не должен.
 * Отладочный режим `compass: 'on'` показывает его всегда.
 */
let inGame = false;
let pointingSeen = modality.isPointing();
let compassAlways = config.get('compass') === 'on';
const applyKeyGuide = (): void =>
  renderer.setKeyGuideVisible(inGame && (compassAlways || pointingSeen));
modality.subscribe((m) => {
  if (m === 'keyboard' || m === 'gamepad') pointingSeen = true;
  applyKeyGuide();
});

/** Во сколько раз быстрее едут кубики в настройке «Быстро». */
const FAST_MOVE_SPEED = 1.8;

// Громкость из настроек применяется к аудио-адаптеру сразу, отладочные
// переключатели и скорость хода — к рендеру (счётчик кадров, проекция, компас).
config.subscribe((key, value) => {
  if (key === 'sfxVolume') audio.setSfxVolume(value as number);
  if (key === 'musicVolume') audio.setMusicVolume(value as number);
  if (key === 'projection') renderer.setProjection(value as ProjectionMode);
  if (key === 'showFps') renderer.setFpsVisible(value === true);
  if (key === 'moveSpeed') renderer.setMoveSpeed(value === 'fast' ? FAST_MOVE_SPEED : 1);
  if (key === 'compass') {
    compassAlways = value === 'on';
    applyKeyGuide();
  }
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
  const plan = game.useHint();
  gameScreen.hintToast.textContent = plan
    ? `${i18n.t('HINT')}: ${ARROWS[`${plan.dir.x},${plan.dir.y}`] ?? ''}`
    : i18n.t('HINT_NONE');
  gameScreen.hintToast.hidden = false;
  // Стрелки скользят по полу от кубиков до упора в выбранном направлении.
  if (plan) renderer.showHint(plan.slides);
  else renderer.hideHint();
  window.clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => {
    gameScreen.hintToast.hidden = true;
    renderer.hideHint();
  }, 2200);
});

renderer.init(gameScreen.canvas);
renderer.setProjection(config.get('projection') as ProjectionMode);
renderer.setFpsVisible(config.get('showFps') === true);
renderer.setMoveSpeed(config.get('moveSpeed') === 'fast' ? FAST_MOVE_SPEED : 1);
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

/** Тестовый уровень из отладки: стартует сразу, минуя селектор. */
let pendingDebugLevel: Level | null = null;

const menuCtrl = new MenuController(
  screensRoot,
  i18n,
  episodes,
  menuActor,
  (ep, lvl) => {
    episodes.setCurLevel(ep, lvl);
  },
  config,
  // Отладка: открыть все уровни — прогресс сразу пишется в сохранение.
  () => game.saveProgress(),
  // Отладка: собрать уровень под выбранные механики и сложность.
  async (mechanics: MechanicId[], difficulty: number) => {
    // Дать экрану нарисовать статус «Генерирую…» перед синхронным перебором.
    await new Promise((resolve) => setTimeout(resolve, 30));
    const generated = generateTestLevel({
      mechanics,
      difficulty,
      seed: 0x7e57 + (Date.now() % 100000),
    });
    if (!generated) return false;
    // Пока шла генерация, игрок мог уйти с отладочного экрана — тогда
    // тестовый уровень не должен подменять следующий обычный запуск.
    if ((menuActor.getSnapshot().value as string) !== 'debug') return false;
    pendingDebugLevel = createLevelFromData(0, 0, generated.rows);
    menuActor.send({ type: 'TEST_LEVEL' });
    return true;
  },
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
  // Настройки из паузы: игра остаётся замороженной, а «Назад» в настройках
  // возвращает в меню паузы (а не в главное меню).
  onSettings: () => menuCtrl.showOverPause('settings', () => pauseDialog.restore()),
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
  // Подсказки нет — «?» гаснет так же, как недоступный откат хода.
  if (state === 'input') gameScreen.hint.disabled = game.hint() === null;
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
  showCompleted: (result) => completedDialog.show(result),
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
  if (
    state === 'help' ||
    state === 'about' ||
    state === 'settings' ||
    state === 'debug' ||
    state === 'selector'
  ) {
    menuActor.send({ type: 'BACK' });
  }
});
input.setEnabled(true);

modality.attach();
applyKeyGuide();

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
  inGame = state === 'game';
  applyKeyGuide();
  gameScreen.root.classList.toggle('screen--game-idle', state !== 'game');
  if (state !== 'game') hudRoot.classList.add('hud--hidden');
  orbit.setEnabled(state === 'game');

  if (enteringGame) {
    if (pendingDebugLevel) {
      const level = pendingDebugLevel;
      pendingDebugLevel = null;
      game.startTestLevel(level, i18n.t('DEBUG_TEST_LEVEL'));
    } else {
      const selected = snapshot.context.selected;
      if (selected) episodes.setCurLevel(selected.episodeId, selected.levelId);
      game.startLevel(episodes.getCurLevel());
    }
  }
  if (state === 'selector') menuCtrl.refreshSelector();
  if (state === 'mmenu') menuCtrl.refreshResume();
};
menuActor.subscribe(applyMenuState);
// XState не вызывает подписчика для текущего состояния: синхронизируем стартовое
// меню вручную, иначе демо-фон и активная иконка не включались при загрузке.
applyMenuState(menuActor.getSnapshot());

/*
 * Эпизод 2 генерируется в фоновом потоке, пока игрок в меню: синхронная
 * генерация при импорте данных подвешивала первый кадр и анимацию появления.
 * Уровни приходят по одному, поэтому клик по ещё не готовому уровню можно
 * обслужить вне очереди: воркер досчитает текущий (~250 мс), затем выбранный,
 * а потом продолжит остальные. Если сохранение указывает на эпизод 2,
 * Resume появится после подстановки нужной карты.
 */
let episodeWorker: Worker | null = null;

const requestEpisodeLevel = (episodeId: number, levelId: number): void => {
  const request: EpisodeWorkerRequest = { type: 'prioritize', episodeId, levelId };
  episodeWorker?.postMessage(request);
};
menuCtrl.setLevelGenerator(requestEpisodeLevel);

const startEpisodeTwoGeneration = (): void => {
  const worker = new Worker(
    new URL('./workers/episode-generator.worker.ts', import.meta.url),
    { type: 'module' },
  );
  episodeWorker = worker;
  worker.onmessage = (event: MessageEvent<EpisodeWorkerResponse>) => {
    const message = event.data;
    if (message.type === 'episode-level-ready') {
      episodes.applyEpisodeLevel(message.episodeId, message.levelId, message.rows);
      // Если игрок уже нажал этот уровень — сразу запускаем игру.
      menuCtrl.levelReady(message.episodeId, message.levelId);
      if (
        episodes.curEpisodeId === message.episodeId &&
        episodes.curLevelId === message.levelId
      ) {
        menuCtrl.refreshResume();
      }
      return;
    }
    if (message.type === 'episode-ready') {
      // Карты эпизода собраны, воркер больше не нужен.
      worker.terminate();
      if (episodeWorker === worker) episodeWorker = null;
      return;
    }
    console.error(
      `Не удалось сгенерировать уровень ${message.episodeId + 1}-${(message.levelId ?? 0) + 1}:`,
      message.message,
    );
    if (message.levelId !== undefined) {
      menuCtrl.levelGenerationFailed(message.episodeId, message.levelId);
    }
  };
  worker.onerror = (event) => {
    console.error('Ошибка воркера генерации эпизода 2:', event.message);
    worker.terminate();
    if (episodeWorker === worker) episodeWorker = null;
    menuCtrl.cancelPendingSelection();
  };
  const request: EpisodeWorkerRequest = {
    type: 'generate-episode',
    episodeId: 1,
    seed: EPISODE_2_SEED,
    count: EPISODE_2_LEVELS,
  };
  worker.postMessage(request);
};
startEpisodeTwoGeneration();

// AudioContext — по user gesture (политика автозапуска)
const initAudio = () => {
  void audio.init();
  audio.playMusic('ambient');
  document.removeEventListener('pointerdown', initAudio);
  document.removeEventListener('keydown', initAudio);
};
document.addEventListener('pointerdown', initAudio);
document.addEventListener('keydown', initAudio);
