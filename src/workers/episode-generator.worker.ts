import { generateEpisodeLevelRecipe } from '../core/generation/level-generator';
import type { MechanicId } from '../core/generation/mechanics';
import type { EpisodeWorkerRequest, EpisodeWorkerResponse } from './episode-protocol';

/**
 * Фоновая генерация эпизодов: перебор решений занимает секунды и на главном
 * потоке подвешивал старт игры. Эпизоды (со 2-го по 6-й) идут очередью,
 * уровни считаются по одному и сразу отправляются в игру — так селектор
 * наполняется постепенно, а не появляется целиком в конце.
 *
 * Порядок очереди — по эпизодам и по номерам уровней внутри эпизода, поэтому
 * ближайшие к игроку карты готовы первыми. Если игрок нажал на ещё не готовый
 * уровень, заявка ставится в начало: текущий уровень (~250 мс) досчитывается,
 * затем генерируется выбранный, а после него — остальные.
 *
 * Каждый уровень считается независимо от остальных (`generateEpisodeLevel`),
 * поэтому результат не зависит от порядка запросов и совпадает с пакетной
 * генерацией эпизода.
 */
interface WorkerScope {
  onmessage: ((event: MessageEvent<EpisodeWorkerRequest>) => void) | null;
  postMessage(message: EpisodeWorkerResponse): void;
}

interface EpisodeJob {
  episodeId: number;
  seed: number;
  count: number;
  mechanics: MechanicId[];
  /** Уровни, которые ещё нужно посчитать, в порядке очереди. */
  pending: number[];
  done: Set<number>;
}

const scope = self as unknown as WorkerScope;

let jobs: EpisodeJob[] = [];
let running = false;
/** Эпизод и уровень, которые считаются прямо сейчас. */
let runningKey = '';
/** Уровень, который игрок попросил посчитать первым. */
let priority: { episodeId: number; levelId: number } | null = null;
let announcedAll = false;

const post = (message: EpisodeWorkerResponse): void => scope.postMessage(message);

const jobFor = (episodeId: number): EpisodeJob | undefined =>
  jobs.find((job) => job.episodeId === episodeId);

const isDone = (job: EpisodeJob): boolean => job.done.size >= job.count;

const nextTask = (): { job: EpisodeJob; levelId: number } | null => {
  if (priority) {
    const wanted = priority;
    priority = null;
    const job = jobFor(wanted.episodeId);
    // Уровень мог уже посчитаться или считаться прямо сейчас — тогда просто
    // выкидываем заявку и идём дальше по очереди.
    const index = job ? job.pending.indexOf(wanted.levelId) : -1;
    if (job && !job.done.has(wanted.levelId) && index >= 0) {
      job.pending.splice(index, 1);
      return { job, levelId: wanted.levelId };
    }
  }
  for (const job of jobs) {
    if (job.pending.length > 0) return { job, levelId: job.pending.shift() as number };
  }
  return null;
};

const announceAllReady = (): void => {
  if (announcedAll || jobs.length === 0) return;
  if (!jobs.every(isDone)) return;
  announcedAll = true;
  post({ type: 'all-ready' });
};

const runNext = (): void => {
  if (running) return;
  const task = nextTask();
  if (!task) {
    announceAllReady();
    return;
  }
  running = true;
  const { job, levelId } = task;
  runningKey = `${job.episodeId}:${levelId}`;
  // Отдельная задача на уровень: между уровнями воркер успевает принять
  // сообщение о приоритетном уровне и поставить его в начало очереди.
  setTimeout(() => {
    try {
      const { rows, seed } = generateEpisodeLevelRecipe(
        job.seed,
        levelId,
        job.count,
        job.mechanics,
      );
      job.done.add(levelId);
      post({ type: 'episode-level-ready', episodeId: job.episodeId, levelId, rows, seed });
      if (isDone(job)) post({ type: 'episode-ready', episodeId: job.episodeId });
    } catch (error) {
      post({
        type: 'episode-error',
        episodeId: job.episodeId,
        levelId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    running = false;
    runningKey = '';
    runNext();
  }, 0);
};

scope.onmessage = (event) => {
  const request = event.data;

  if (request.type === 'generate-episode') {
    // Повторная заявка на тот же эпизод заменяет прежнюю работу.
    jobs = jobs.filter((job) => job.episodeId !== request.episodeId);
    jobs.push({
      episodeId: request.episodeId,
      seed: request.seed,
      count: request.count,
      mechanics: request.mechanics,
      pending: Array.from({ length: request.count }, (_, index) => index),
      done: new Set(),
    });
    jobs.sort((a, b) => a.episodeId - b.episodeId);
    announcedAll = false;
    runNext();
    return;
  }

  if (request.type === 'prioritize') {
    const job = jobFor(request.episodeId);
    if (!job) return;
    // Уровень уже готов или считается прямо сейчас — его сообщение придёт
    // само, дублировать работу не нужно.
    if (job.done.has(request.levelId)) return;
    if (runningKey === `${request.episodeId}:${request.levelId}`) return;
    if (!job.pending.includes(request.levelId)) return;
    priority = { episodeId: request.episodeId, levelId: request.levelId };
    runNext();
  }
};
