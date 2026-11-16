/**
 * Версия игры для подписи в главном меню: `0.5.<короткий хеш коммита>`.
 *
 * Хеш подставляет `vite.config.ts` при сборке (`git rev-parse --short HEAD`).
 * В тестах и в редакторе без сборки подстановки нет — тогда `dev`.
 */
declare const __APP_VERSION__: string | undefined;

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
