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
 * Инициализировать SDK. Возвращает его же, чтобы вызывающие успели забрать
 * облачный прогресс до отметки о готовности игры.
 */
export async function initYandexPlatform(): Promise<SDK | null> {
  if (typeof YaGames === 'undefined') return null;
  try {
    sdk = await YaGames.init();
    return sdk;
  } catch (error) {
    // Платформа недоступна (нет сети, отладка вне консоли) — играем молча.
    console.warn('Yandex Games SDK не инициализировался:', error);
    return null;
  }
}

/**
 * Сказать платформе, что игра загрузилась и готова: без `LoadingAPI.ready()`
 * площадка считает игру всё ещё грузящейся. Вызывается после прогресса из
 * облака — тогда стартовый экран сразу видит сохранённую игру.
 */
export function markYandexReady(): void {
  sdk?.features.LoadingAPI?.ready();
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
