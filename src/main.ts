import './style.css';
import { createActor } from 'xstate';
import { createGameMachine } from '@core/state/game';
import { menuMachine } from '@core/state/menu';
import { Config, type HintStyle, type Theme, type ThemeMode } from '@core/services/config';
import { EpisodeManager, type SaveData } from '@core/services/episode-mng';
import {
  DEMO_LEVEL_COUNT,
  DEMO_SEED,
  episodeMechanics,
  GENERATED_EPISODES,
} from '@core/data/generated-episodes';
import { Statistics } from '@core/services/statistics';
import { generateTestLevel, type TestLevelOptions } from '@core/generation/level-generator';
import { formatLevelSeed } from '@core/generation/level-seed';
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
import { buildGameScreen, setButtonIcon } from '@presentation/html/screens';
import type {
  EpisodeWorkerRequest,
  EpisodeWorkerResponse,
} from './workers/episode-protocol';
import type { DemoWorkerRequest, DemoWorkerResponse } from './workers/demo-protocol';

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

// Тема — пользовательская настройка, как язык: выбор переживает перезагрузку.
const THEME_KEY = 'theme';
const savedTheme = storage.load(THEME_KEY);
if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
  config.set('theme', savedTheme);
}

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

/** Фон страницы для мобильной панели браузера — тот же, что у сцены. */
const THEME_COLORS: Record<Theme, string> = { light: '#eee7d7', dark: '#1a1715' };

/** Системная настройка «тёмное оформление»: за ней следует режим «как в системе». */
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

/** Выбор из настроек → фактическая тема: системный режим спрашивает ОС. */
const resolveTheme = (mode: ThemeMode): Theme =>
  mode === 'system' ? (systemDark.matches ? 'dark' : 'light') : mode;

/**
 * Тема переключает и интерфейс (data-theme у <html> — CSS-переменные), и
 * сцену (палитра рендера): иначе тёмные панели соседствовали бы с кремовым
 * полем. Вызывается до init — палитра попадёт в clearColor первого кадра.
 */
const applyTheme = (mode: ThemeMode): void => {
  const theme = resolveTheme(mode);
  document.documentElement.dataset.theme = theme;
  renderer.setTheme(theme);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[theme]);
};

// ОС переключила светлую/тёмную на лету: в режиме «как в системе» следуем сразу.
systemDark.addEventListener('change', () => {
  if ((config.get('theme') as ThemeMode) === 'system') applyTheme('system');
});

// Громкость из настроек применяется к аудио-адаптеру сразу, отладочные
// переключатели, скорость хода, вид подсказки и тема — к рендеру.
config.subscribe((key, value) => {
  if (key === 'sfxVolume') audio.setSfxVolume(value as number);
  if (key === 'musicVolume') audio.setMusicVolume(value as number);
  if (key === 'projection') renderer.setProjection(value as ProjectionMode);
  if (key === 'showFps') renderer.setFpsVisible(value === true);
  if (key === 'moveSpeed') renderer.setMoveSpeed(value === 'fast' ? FAST_MOVE_SPEED : 1);
  if (key === 'hintStyle') renderer.setHintStyle(value as HintStyle);
  if (key === 'compass') {
    compassAlways = value === 'on';
    applyKeyGuide();
  }
  if (key === 'theme') {
    applyTheme(value as ThemeMode);
    storage.save(THEME_KEY, value);
  }
});
applyTheme(config.get('theme') as ThemeMode);

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
  gameScreen.seedLabel,
  gameActor,
  (level) => i18n.t('LVL_NUM', level.episodeId + 1, level.levelId + 1),
  (seed) => i18n.t('LVL_SEED', formatLevelSeed(seed)),
);

// Панели HUD: верхняя (сброс/пауза) и нижняя (сброс/подсказка)
gameScreen.undo.addEventListener('click', () => game.undo());
gameScreen.resetBottom.addEventListener('click', () => game.reset());

/**
 * Кнопка в верхней панели: на обычном уровне — пауза, на тестовом — выход
 * обратно в дебаг-меню (там же выбираются механики и сложность).
 */
const setTopbarAction = (mode: 'pause' | 'exit'): void => {
  if (mode === 'exit') setButtonIcon(gameScreen.pause, 'exit', i18n.t('DEBUG_BACK'));
  else setButtonIcon(gameScreen.pause, 'pause', i18n.t('PAUSE'));
};
gameScreen.pause.addEventListener('click', () => {
  if (game.isTestLevel) menuActor.send({ type: 'EXIT_TEST' });
  else game.pause();
});

// Подсказка: направление первого хода кратчайшего решения во всплывающей плашке
const ARROWS: Record<string, string> = { '1,0': '→', '-1,0': '←', '0,1': '↓', '0,-1': '↑' };
let hintTimer = 0;
gameScreen.hint.addEventListener('click', () => {
  const plan = game.useHint();
  // Оба кубика в ловушке: любое направление — пропуск хода, пути нет. Стрелку
  // такому ходу не рисуем, иначе подсказка выглядит как «ничего не произошло».
  const wait = !!plan && plan.slides.every((slide) => slide.path.length <= 1);
  gameScreen.hintToast.textContent = !plan
    ? i18n.t('HINT_NONE')
    : wait
      ? i18n.t('HINT_WAIT')
      : `${i18n.t('HINT')}: ${ARROWS[`${plan.dir.x},${plan.dir.y}`] ?? ''}`;
  gameScreen.hintToast.hidden = false;
  // Подсказка едет по фактическим путям кубиков: повороты и порталы учтены.
  if (plan && !wait) renderer.showHint(plan.slides);
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
renderer.setHintStyle(config.get('hintStyle') as HintStyle);
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
/** Параметры его генерации: по ним уровень собирается заново по сиду. */
let pendingDebugRecipe: TestLevelOptions | null = null;

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
  // Отладка: собрать уровень под выбранные механики и сложность. Сид из поля
  // ввода (или случайный, если поле пустое) возвращается экрану, чтобы ввести
  // его повторно и получить ту же карту.
  async (mechanics: MechanicId[], difficulty: number, seed: number | null) => {
    // Дать экрану нарисовать статус «Генерирую…» перед синхронным перебором.
    await new Promise((resolve) => setTimeout(resolve, 30));
    const usedSeed = seed ?? 0x7e57 + (Date.now() % 100000);
    const generated = generateTestLevel({ mechanics, difficulty, seed: usedSeed });
    if (!generated) return null;
    // Пока шла генерация, игрок мог уйти с отладочного экрана — тогда
    // тестовый уровень не должен подменять следующий обычный запуск.
    if ((menuActor.getSnapshot().value as string) !== 'debug') return null;
    pendingDebugLevel = createLevelFromData(0, 0, generated.rows);
    // Рецепт уровня (механики, сложность, сид) — чтобы показать настоящий
    // сид в плашке и собрать карту заново по нему.
    pendingDebugRecipe = { mechanics, difficulty, seed: usedSeed };
    menuActor.send({ type: 'TEST_LEVEL' });
    return usedSeed;
  },
);

/*
 * Демо-фон главного меню: пара лёгких уровней с механиками эпизода, в который
 * игрок играл последним. Запрос уходит при смене эпизода (в том числе пока идёт
 * игра), поэтому к возвращению в меню карты обычно уже готовы и фон не
 * переключается с чужих уровней на нужные.
 *
 * Считает отдельный воркер: генератор перебирает состояния, на эпизоде с
 * ловушками это секунды работы, и на главном потоке был бы заметный простой.
 * Воркер живёт один запрос и потом уничтожается.
 */
const demoRows = new Map<number, string[][]>();
let demoRequested = -1;
let demoWorker: Worker | null = null;

/** Отдать готовые демо-уровни в контроллер (если эпизод всё ещё тот же). */
const applyDemoRows = (episodeId: number): void => {
  const rows = demoRows.get(episodeId);
  if (!rows || episodeId !== episodes.curEpisodeId) return;
  game.setDemoLevels(rows);
};

const requestDemoLevels = (): void => {
  const episodeId = episodes.curEpisodeId;
  if (demoRequested === episodeId) return;
  demoRequested = episodeId;
  if (demoRows.has(episodeId)) {
    applyDemoRows(episodeId);
    return;
  }
  demoWorker?.terminate();
  const worker = new Worker(
    new URL('./workers/demo-generator.worker.ts', import.meta.url),
    { type: 'module' },
  );
  demoWorker = worker;
  const levels: string[][] = [];
  const stop = (): void => {
    worker.terminate();
    if (demoWorker === worker) demoWorker = null;
  };
  worker.onmessage = (event: MessageEvent<DemoWorkerResponse>) => {
    const message = event.data;
    if (message.type === 'demo-level-ready') {
      if (message.episodeId === episodeId) levels[message.levelId] = message.rows;
      return;
    }
    stop();
    if (message.type === 'demo-ready') {
      demoRows.set(episodeId, levels);
      applyDemoRows(episodeId);
      return;
    }
    // Ошибка: следующая попытка — при следующем входе в меню.
    demoRequested = -1;
    console.error(
      `Не удалось собрать демо-уровень ${message.episodeId + 1}-${message.levelId + 1}:`,
      message.message,
    );
  };
  worker.onerror = (event) => {
    console.error('Ошибка воркера демо-уровней:', event.message);
    stop();
    demoRequested = -1;
  };
  const request: DemoWorkerRequest = {
    type: 'generate-demo',
    episodeId,
    seed: DEMO_SEED,
    count: DEMO_LEVEL_COUNT,
    mechanics: episodeMechanics(episodeId),
  };
  worker.postMessage(request);
};

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
      const recipe = pendingDebugRecipe;
      pendingDebugLevel = null;
      pendingDebugRecipe = null;
      game.startTestLevel(level, i18n.t('DEBUG_TEST_LEVEL'), recipe ?? undefined);
    } else {
      const selected = snapshot.context.selected;
      if (selected) episodes.setCurLevel(selected.episodeId, selected.levelId);
      game.startLevel(episodes.getCurLevel());
    }
    setTopbarAction(game.isTestLevel ? 'exit' : 'pause');
  } else if (state !== 'game') {
    // Меню поверх игры не должно оставлять в панели чужую иконку.
    setTopbarAction('pause');
  }
  if (state === 'selector') menuCtrl.refreshSelector();
  if (state === 'mmenu') menuCtrl.refreshResume();
  // Эпизод мог смениться входом в игру — демо-уровни просим под него.
  requestDemoLevels();
};
menuActor.subscribe(applyMenuState);
// XState не вызывает подписчика для текущего состояния: синхронизируем стартовое
// меню вручную, иначе демо-фон и активная иконка не включались при загрузке.
applyMenuState(menuActor.getSnapshot());

/*
 * Эпизоды 2–6 генерируются в фоновом потоке, пока игрок в меню: синхронная
 * генерация при импорте данных подвешивала первый кадр и анимацию появления.
 * Уровни приходят по одному, поэтому клик по ещё не готовому уровню можно
 * обслужить вне очереди: воркер досчитает текущий (~250 мс), затем выбранный,
 * а потом продолжит остальные. Если сохранение указывает на ещё не собранный
 * эпизод, Resume появится после подстановки нужной карты.
 */
let episodeWorker: Worker | null = null;

const requestEpisodeLevel = (episodeId: number, levelId: number): void => {
  const request: EpisodeWorkerRequest = { type: 'prioritize', episodeId, levelId };
  episodeWorker?.postMessage(request);
};
menuCtrl.setLevelGenerator(requestEpisodeLevel);

const startEpisodesGeneration = (): void => {
  const worker = new Worker(
    new URL('./workers/episode-generator.worker.ts', import.meta.url),
    { type: 'module' },
  );
  episodeWorker = worker;
  worker.onmessage = (event: MessageEvent<EpisodeWorkerResponse>) => {
    const message = event.data;
    if (message.type === 'episode-level-ready') {
      episodes.applyEpisodeLevel(message.episodeId, message.levelId, message.rows, message.seed);
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
      // Эпизод собран: в селекторе больше нет карточек, ожидающих карту.
      return;
    }
    if (message.type === 'all-ready') {
      // Все эпизоды собраны, воркер больше не нужен.
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
    console.error('Ошибка воркера генерации эпизодов:', event.message);
    worker.terminate();
    if (episodeWorker === worker) episodeWorker = null;
    menuCtrl.cancelPendingSelection();
  };
  // Эпизоды идут очередью: второй считается первым, остальные — за ним.
  for (const config of GENERATED_EPISODES) {
    const request: EpisodeWorkerRequest = {
      type: 'generate-episode',
      episodeId: config.episodeId,
      seed: config.seed,
      count: config.levelCount,
      mechanics: config.mechanics,
    };
    worker.postMessage(request);
  }
};
startEpisodesGeneration();

// AudioContext — по user gesture (политика автозапуска)
const initAudio = () => {
  void audio.init();
  audio.playMusic('ambient');
  document.removeEventListener('pointerdown', initAudio);
  document.removeEventListener('keydown', initAudio);
};
document.addEventListener('pointerdown', initAudio);
document.addEventListener('keydown', initAudio);
