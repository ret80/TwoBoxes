import type { MechanicId } from '../core/generation/mechanics';

/** Запрос на пару демо-уровней для фона главного меню. */
export interface DemoGenerateRequest {
  type: 'generate-demo';
  /** Эпизод, чьи механики показывают демо-уровни. */
  episodeId: number;
  seed: number;
  count: number;
  mechanics: MechanicId[];
}

export type DemoWorkerRequest = DemoGenerateRequest;

/** Ответ воркера: готовый демо-уровень, все готовы, либо ошибка. */
export type DemoWorkerResponse =
  | { type: 'demo-level-ready'; episodeId: number; levelId: number; rows: string[] }
  | { type: 'demo-ready'; episodeId: number }
  | { type: 'demo-error'; episodeId: number; levelId: number; message: string };
