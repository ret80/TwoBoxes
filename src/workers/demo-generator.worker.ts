import { generateDemoLevel } from '../core/generation/level-generator';
import type { MechanicId } from '../core/generation/mechanics';
import type { DemoWorkerRequest, DemoWorkerResponse } from './demo-protocol';

/**
 * Фон главного меню: пара лёгких уровней с механиками эпизода, в который игрок
 * играл последним. Компьютер проходит их по кругу, пока открыто меню.
 *
 * Зачем отдельный воркер: демо нужны сразу при возврате в меню, а генератор
 * перебирает состояния и на эпизоде с ловушками думает секунды — на главном
 * потоке это была бы заметная пауза перед первым кадром меню. Воркер живёт
 * один запрос: посчитал пару уровней, отчитался и уничтожается вызывающей
 * стороной, поэтому очередь эпизодов он не задерживает и не зависит от неё.
 */
interface WorkerScope {
  onmessage: ((event: MessageEvent<DemoWorkerRequest>) => void) | null;
  postMessage(message: DemoWorkerResponse): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const { episodeId, seed, count, mechanics } = event.data;
  for (let levelId = 0; levelId < count; levelId++) {
    try {
      const rows = generateDemoLevel(seed, levelId, mechanics as MechanicId[]);
      scope.postMessage({ type: 'demo-level-ready', episodeId, levelId, rows });
    } catch (error) {
      scope.postMessage({
        type: 'demo-error',
        episodeId,
        levelId,
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }
  }
  scope.postMessage({ type: 'demo-ready', episodeId });
};
