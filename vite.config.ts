import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/** `0.5` из версии пакета: третье число подписи — хеш коммита. */
const gameVersion = pkg.version.split('.').slice(0, 2).join('.');

/**
 * Версия сборки для подписи в меню: `0.5.<короткий хеш коммита>`, где `0.5`
 * берётся из `version` в package.json.
 *
 * Если в рабочем дереве есть непринятые изменения, дописывается `-dirty` — по
 * подписи сразу видно, что игра собрана не из чистого коммита. Без git (архив
 * исходников) остаётся `0.5.dev`.
 */
function buildVersion(): string {
  try {
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim() !== '';
    return `${gameVersion}.${hash}${dirty ? '-dirty' : ''}`;
  } catch {
    return `${gameVersion}.dev`;
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
  // `--mode android` — сборка для Android-приложения через Capacitor.
  const yandex = mode === 'yandex';
  const android = mode === 'android';
  // В архиве для издателя и в WebView index.html лежит в корне, поэтому
  // пути к ассетам должны быть относительными: абсолютные сломаются на
  // чужом origin (в приложении игра грузится с https://localhost).
  const base = yandex || android ? './' : '/TwoBoxes/';
  const outDir = android ? 'dist-android' : yandex ? 'dist-yandex' : 'dist';
  return {
    base,
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
      outDir,
      target: 'es2020',
      minify: true,
      assetsInlineLimit: 4096,
    },
  };
});
