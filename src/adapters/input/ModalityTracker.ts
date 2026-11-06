/**
 * Последний «живой» способ ввода (клавиатура / геймпад / мышь / тач).
 *
 * Нужен интерфейсу, чтобы не показывать подсказки для клавиатуры на телефоне:
 * компас L/D имеет смысл только там, где есть клавиши или геймпад, и только
 * после того, как ими действительно пользовались.
 */
export type Modality = 'keyboard' | 'gamepad' | 'mouse' | 'touch';

const hasTouchScreen = (): boolean =>
  typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0;

export class ModalityTracker {
  private listeners = new Set<(modality: Modality) => void>();
  /** До первого события: тач-экран считаем тач-устройством, иначе клавиатуру. */
  private current: Modality = hasTouchScreen() ? 'touch' : 'keyboard';
  private attached = false;

  constructor(private target: Window = window) {}

  get(): Modality {
    return this.current;
  }

  /** Нужен ли компас клавиатуры: только для клавиатуры и геймпада. */
  isPointing(): boolean {
    return this.current === 'keyboard' || this.current === 'gamepad';
  }

  subscribe(listener: (modality: Modality) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('pointerdown', this.onPointerDown);
    this.target.addEventListener('gamepadconnected', this.onGamepad);
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('pointerdown', this.onPointerDown);
    this.target.removeEventListener('gamepadconnected', this.onGamepad);
    this.attached = false;
    this.listeners.clear();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    // Модификаторы в одиночку (Ctrl/Shift) ничего не двигают — не переключаем.
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
    this.set('keyboard');
  };

  private onPointerDown = (e: PointerEvent) => {
    this.set(e.pointerType === 'touch' ? 'touch' : 'mouse');
  };

  private onGamepad = () => {
    this.set('gamepad');
  };

  private set(modality: Modality): void {
    if (modality === this.current) return;
    this.current = modality;
    for (const l of this.listeners) l(modality);
  }
}
