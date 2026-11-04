import type { ITimeProvider } from '../../ports/ITimeProvider';

/** Поставщик времени на performance.now (delta между кадрами, секунды). */
export class PerformanceTimeProvider implements ITimeProvider {
  private last = performance.now();
  private dt = 0;

  now(): number {
    return performance.now() / 1000;
  }

  markFrame(): void {
    const now = performance.now();
    this.dt = (now - this.last) / 1000;
    this.last = now;
  }

  delta(): number {
    return this.dt;
  }
}
