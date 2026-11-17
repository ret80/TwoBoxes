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
 *
 * На площадке язык приходит из SDK (п. 2.14 требований Яндекс Игр) —
 * `applyPlatformLocale`, ручной выбор игрока он не перебивает.
 */
export class LocaleManager {
  private locale: Locale = 'en';
  private storage: ISaveStorage;
  private listeners = new Set<(locale: Locale) => void>();
  /** Язык выбран вручную (настройки): автоопределение площадки его не трогает. */
  private chosenManually = false;

  constructor(storage: ISaveStorage) {
    this.storage = storage;
    const saved = this.storage.load(LOCALE_KEY);
    if (typeof saved === 'string' && saved in DICTS) {
      this.locale = saved as Locale;
      this.chosenManually = true;
    } else {
      const lang = navigator.language.slice(0, 2);
      this.locale = lang in DICTS ? (lang as Locale) : 'en';
    }
    this.syncDocumentLang();
  }

  /** Подписка на смену языка: экраны и диалоги перестраивают подписи. */
  subscribe(listener: (locale: Locale) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Форматирование строки: %d/%s заменяются аргументами по порядку. */
  t(key: string, ...args: (string | number)[]): string {
    let s = DICTS[this.locale][key] ?? DICTS.en[key] ?? key;
    for (const arg of args) s = s.replace('%d', String(arg)).replace('%s', String(arg));
    return s;
  }

  /** Ручной выбор языка в настройках: он запоминается и важнее языка площадки. */
  setLocale(locale: Locale): void {
    if (!(locale in DICTS)) return;
    this.chosenManually = true;
    this.storage.save(LOCALE_KEY, locale);
    this.applyLocale(locale);
  }

  /**
   * Язык площадки из SDK (`ysdk.environment.i18n.lang`, п. 2.14 требований
   * Яндекс Игр). Применяется на старте и только пока игрок не выбрал язык сам:
   * иначе переключение в настройках отменялось бы при каждом запуске. Незнакомый
   * язык портала (например, `tr`) показывает английский — он у игры основной.
   */
  applyPlatformLocale(lang: string | null | undefined): void {
    if (!lang || this.chosenManually) return;
    const code = lang.slice(0, 2).toLowerCase();
    this.applyLocale((code in DICTS ? code : 'en') as Locale);
  }

  getLocale(): Locale {
    return this.locale;
  }

  /** Сменить язык и оповестить подписчиков (без записи выбора в хранилище). */
  private applyLocale(locale: Locale): void {
    if (locale === this.locale) return;
    this.locale = locale;
    this.syncDocumentLang();
    for (const listener of this.listeners) listener(locale);
  }

  private syncDocumentLang(): void {
    if (typeof document !== 'undefined') document.documentElement.lang = this.locale;
  }
}
