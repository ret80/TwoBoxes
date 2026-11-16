import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/**
 * Версия сборки для подписи в меню: `0.5.<короткий хеш коммита>`.
 *
 * Если в рабочем дереве есть непринятые изменения, дописывается `-dirty` — по
 * подписи сразу видно, что игра собрана не из чистого коммита. Без git (архив
 * исходников) остаётся `0.5.dev`.
 */
function buildVersion(): string {
  try {
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim() !== '';
    return `0.5.${hash}${dirty ? '-dirty' : ''}`;
  } catch {
    return '0.5.dev';
  }
}

/**
 * SDK Яндекс Игр подключается только в билде для издателя: в обычной сборке и
 * в dev скрипта `/sdk.js` нет, иначе браузер получал бы 404 на каждой странице.
 *
 * Путь со слэшем в начале — так требует документация платформы: архив игры
 * лежит на сервере Яндекса, и по этому адресу он сам отдаёт актуальную версию
 * библиотеки. Копию файла в архив класть нельзя, она устареет.
 */
function yandexSdk(): Plugin {
  return {
    name: 'yandex-games-sdk',
    transformIndexHtml: () => [
      { tag: 'script', attrs: { src: '/sdk.js' }, injectTo: 'head-prepend' },
    ],
  };
}

export default defineConfig(({ mode }) => {
  // `--mode yandex` — сборка для Яндекс Игр (папка `dist-yandex`).
  const yandex = mode === 'yandex';
  return {
    // В архиве для издателя index.html лежит в корне, поэтому пути к ассетам
    // должны быть относительными: абсолютные сломаются на чужом origin.
    base: yandex ? './' : '/TwoBoxes/',
    define: { __APP_VERSION__: JSON.stringify(buildVersion()) },
    root: '.',
    plugins: yandex ? [yandexSdk()] : [],
    resolve: {
      alias: {
        '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
        '@ports': fileURLToPath(new URL('./src/ports', import.meta.url)),
        '@adapters': fileURLToPath(new URL('./src/adapters', import.meta.url)),
        '@presentation': fileURLToPath(new URL('./src/presentation', import.meta.url)),
      },
    },
    build: {
      outDir: yandex ? 'dist-yandex' : 'dist',
      target: 'es2020',
      minify: true,
      assetsInlineLimit: 4096,
    },
  };
});
