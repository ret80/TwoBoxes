/**
 * Порт хранилища. Реализация — localStorage-адаптер (Фаза 10).
 * Обработка QuotaExceededError / SecurityError — в адаптере.
 */
export interface ISaveStorage {
  save(key: string, data: unknown): void;
  load(key: string): unknown | null;
  remove(key: string): void;
}
