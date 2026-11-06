/**
 * Статистика уровня: счётчик ходов + таймер
 * (аналог `script/statistics/statistics.gd` — CounterVar + TimerVar).
 *
 * Ядро не привязано к реальному времени: delta подаётся методом `tick(delta)`
 * из игрового цикла (тестируемость без моков Date/performance).
 */
export class Statistics {
  private _moves = 0;
  private _time = 0; // секунды
  /** Сколько раз игрок пользовался подсказкой на текущем уровне. */
  private _hints = 0;
  private _running = false;

  start(): void {
    this._running = true;
  }

  stop(): void {
    this._running = false;
  }

  reset(): void {
    this._moves = 0;
    this._time = 0;
    this._hints = 0;
    this._running = false;
  }

  /** Обновление таймера за кадр (вызывается игровым циклом). */
  tick(delta: number): void {
    if (this._running) this._time += delta;
  }

  incrementMoves(): void {
    this._moves++;
  }

  incrementHints(): void {
    this._hints++;
  }

  getHints(): number {
    return this._hints;
  }

  getMoves(): number {
    return this._moves;
  }

  getTime(): number {
    return this._time;
  }
}
