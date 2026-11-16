import type { SDK } from 'ysdk';

/**
 * Яндекс Игры.
 *
 * SDK подключается тегом `<script src="/sdk.js">` только в билде для издателя
 * (`npm run yandex`, см. плагин в `vite.config.ts`) — в обычной сборке и в dev
 * этого скрипта нет, и всё здесь превращается в пустышки. Игра не должна
 * зависеть от платформы: без SDK она работает как обычная веб-страница.
 */
let sdk: SDK | null = null;

/**
 * Инициализировать SDK и сказать платформе, что игра загрузилась. Без
 * `LoadingAPI.ready()` площадка считает игру всё ещё грузящейся.
 */
export async function initYandexPlatform(): Promise<void> {
  if (typeof YaGames === 'undefined') return;
  try {
    sdk = await YaGames.init();
    sdk.features.LoadingAPI?.ready();
  } catch (error) {
    // Платформа недоступна (нет сети, отладка вне консоли) — играем молча.
    console.warn('Yandex Games SDK не инициализировался:', error);
  }
}

/**
 * Начало и остановка геймплея: по этим отметкам платформа считает метрики и
 * строит рекомендации в каталоге.
 */
export function setYandexGameplay(active: boolean): void {
  const api = sdk?.features.GameplayAPI;
  if (!api) return;
  if (active) api.start();
  else api.stop();
}
