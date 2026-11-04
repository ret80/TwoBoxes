import en from './locales/en.json';
import ru from './locales/ru.json';
import type { ISaveStorage } from '../../ports/ISaveStorage';

export type Locale = 'en' | 'ru';

const LOCALE_KEY = 'locale';

type Strings = Record<string, string>;

const DICTS: Record<Locale, Strings> = { en, ru };

/**
 * Менеджер локализации (план 13.1, строки из loc/puzzle_game.csv — 18 строк).
 * Автоопределение языка по navigator.language при первом запуске;
 * выбор сохраняется в localStorage.
 */
export class LocaleManager {
  private locale: Locale = 'en';
  private storage: ISaveStorage;

  constructor(storage: ISaveStorage) {
    this.storage = storage;
    const saved = this.storage.load(LOCALE_KEY);
    if (typeof saved === 'string' && saved in DICTS) {
      this.locale = saved as Locale;
    } else {
      const lang = navigator.language.slice(0, 2);
      this.locale = lang in DICTS ? (lang as Locale) : 'en';
    }
  }

  /** Форматирование строки: %d/%s заменяются аргументами по порядку. */
  t(key: string, ...args: (string | number)[]): string {
    let s = DICTS[this.locale][key] ?? DICTS.en[key] ?? key;
    for (const arg of args) s = s.replace('%d', String(arg)).replace('%s', String(arg));
    return s;
  }

  setLocale(locale: Locale): void {
    if (locale in DICTS) {
      this.locale = locale;
      this.storage.save(LOCALE_KEY, locale);
    }
  }

  getLocale(): Locale {
    return this.locale;
  }
}
