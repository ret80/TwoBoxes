import { generateEpisodeLevel } from '../core/generation/level-generator';
import type { EpisodeWorkerRequest, EpisodeWorkerResponse } from './episode-protocol';

/**
 * Фоновая генерация эпизода: перебор решений занимает секунды и на главном
 * потоке подвешивал старт игры. Уровни генерируются по одному и сразу
 * отправляются в игру. Если игрок нажал на ещё не готовый уровень, заявка
 * ставится в начало очереди: текущий уровень (~250 мс) досчитывается, затем
 * генерируется выбранный, а после него — остальные.
 */
interface WorkerScope {
  onmessage: ((event: MessageEvent<EpisodeWorkerRequest>) => void) | null;
  postMessage(message: EpisodeWorkerResponse): void;
}

const scope = self as unknown as WorkerScope;

let episodeId = 0;
let seed = 0;
let count = 0;
let started = false;
let announcedDone = false;
let running = false;
let runningLevel: number | null = null;
let queue: number[] = [];
const completed = new Set<number>();

const finishIfDone = (): void => {
  if (!started || announcedDone || running || queue.length > 0) return;
  // Эпизод готов только когда готовы все уровни: после ошибки воркер
  // остаётся живым, чтобы повторная заявка могла перегенерировать уровень.
  if (completed.size < count) return;
  announcedDone = true;
  scope.postMessage({ type: 'episode-ready', episodeId });
};

const runNext = (): void => {
  if (running || queue.length === 0) {
    finishIfDone();
    return;
  }
  running = true;
  const levelId = queue.shift() as number;
  runningLevel = levelId;
  // Отдельная задача на уровень: между уровнями воркер успевает принять
  // сообщение о приоритетном уровне и поставить его в начало очереди.
  setTimeout(() => {
    try {
      const rows = generateEpisodeLevel(seed, levelId, count);
      completed.add(levelId);
      scope.postMessage({ type: 'episode-level-ready', episodeId, levelId, rows });
    } catch (error) {
      scope.postMessage({
        type: 'episode-error',
        episodeId,
        levelId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    running = false;
    runningLevel = null;
    runNext();
  }, 0);
};

scope.onmessage = (event) => {
  const request = event.data;

  if (request.type === 'generate-episode') {
    episodeId = request.episodeId;
    seed = request.seed;
    count = request.count;
    queue = Array.from({ length: count }, (_, index) => index);
    completed.clear();
    started = true;
    announcedDone = false;
    running = false;
    runNext();
    return;
  }

  if (request.type === 'prioritize') {
    if (!started || request.episodeId !== episodeId) return;
    // Уровень уже готов или считается прямо сейчас — его сообщение придёт
    // само, дублировать работу не нужно.
    if (completed.has(request.levelId) || request.levelId === runningLevel) return;
    // Вынимаем уровень из хвоста очереди и ставим первым. Текущий уровень,
    // если он считается прямо сейчас, не прерываем: это около 250 мс.
    queue = [request.levelId, ...queue.filter((id) => id !== request.levelId)];
    runNext();
  }
};
