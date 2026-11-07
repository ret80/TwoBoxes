/** Запрос воркеру на генерацию эпизода целиком. */
export interface EpisodeGenerateRequest {
  type: 'generate-episode';
  episodeId: number;
  seed: number;
  count: number;
}

/** Просьба сгенерировать конкретный уровень вне очереди. */
export interface EpisodePrioritizeRequest {
  type: 'prioritize';
  episodeId: number;
  levelId: number;
}

export type EpisodeWorkerRequest = EpisodeGenerateRequest | EpisodePrioritizeRequest;

/** Ответ воркера: один готовый уровень, весь эпизод, либо ошибка. */
export type EpisodeWorkerResponse =
  | { type: 'episode-level-ready'; episodeId: number; levelId: number; rows: string[] }
  | { type: 'episode-ready'; episodeId: number }
  | { type: 'episode-error'; episodeId: number; levelId?: number; message: string };
