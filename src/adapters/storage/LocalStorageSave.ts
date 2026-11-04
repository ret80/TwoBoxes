import type { ISaveStorage } from '../../ports/ISaveStorage';

const PREFIX = '2boxpuzzle:';

/**
 * Хранилище на localStorage (план 10.1).
 * Обрабатываются QuotaExceededError и SecurityError (private mode).
 * Версионирование — в сериализованных данных ядра (EpisodeManager, v1).
 */
export class LocalStorageSave implements ISaveStorage {
  save(key: string, data: unknown): void {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(data));
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'SecurityError')) {
        console.warn(`LocalStorageSave: не удалось сохранить "${key}": ${e.name}`);
      } else {
        throw e;
      }
    }
  }

  load(key: string): unknown | null {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return null;
      return JSON.parse(raw) as unknown;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'SecurityError') {
        console.warn(`LocalStorageSave: доступ к хранилищу запрещён (${e.name})`);
        return null;
      }
      if (e instanceof SyntaxError) {
        // Повреждённое сохранение — удаляем и начинаем с нуля
        this.remove(key);
        return null;
      }
      throw e;
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      // игнорируем в private mode
    }
  }
}
