// ⚠️ typescript-eslint пока несовместим с TypeScript 7 (peer <6.1.0),
// поэтому TS-файлы проверяются строгим `tsc --noEmit` (npm run lint).
// Конфиг оставлен как основа после выхода совместимой версии typescript-eslint.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
  },
];
