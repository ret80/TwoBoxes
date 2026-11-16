import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android-обёртка над тем же веб-приложением: `npm run android` собирает
 * `dist-android` и копирует его в нативную папку `android/`, откуда
 * `npm run android:play` собирает подписанный AAB для Google Play.
 *
 * Сеть не нужна: игра и все ассеты лежат внутри приложения и грузятся
 * с локального `https://localhost`.
 */
const config: CapacitorConfig = {
  appId: 'com.twoboxpuzzle.game',
  appName: '2Box Puzzle',
  webDir: 'dist-android',
  android: {
    // Фон WebView до первой отрисовки — цвет светлой темы (--color-bg),
    // чтобы не было белой вспышки при запуске.
    backgroundColor: '#eee7d7',
  },
};

export default config;
