import type { MechanicId } from '../core/generation/mechanics';

/** Запрос воркеру на генерацию эпизода целиком. */
export interface EpisodeGenerateRequest {
  type: 'generate-episode';
  episodeId: number;
  seed: number;
  count: number;
  /** Механики эпизода: все обязаны встретиться в решении каждого уровня. */
  mechanics: MechanicId[];
}

/** Просьба сгенерировать конкретный уровень вне очереди. */
export interface EpisodePrioritizeRequest {
  type: 'prioritize';
  episodeId: number;
  levelId: number;
}

export type EpisodeWorkerRequest = EpisodeGenerateRequest | EpisodePrioritizeRequest;

/** Ответ воркера: один готовый уровень, весь эпизод, всё готово, либо ошибка. */
export type EpisodeWorkerResponse =
  | {
      type: 'episode-level-ready';
      episodeId: number;
      levelId: number;
      rows: string[];
      /** Настоящий сид генератора: по нему карта собирается заново. */
      seed: number;
    }
  | { type: 'episode-ready'; episodeId: number }
  | { type: 'all-ready' }
  | { type: 'episode-error'; episodeId: number; levelId?: number; message: string };
