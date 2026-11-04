/** Хелпер определения ориентации (план 12.1). */
export type Orientation = 'portrait' | 'landscape';

export function getOrientation(): Orientation {
  return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
}

/** Подписка на смену ориентации (resize + orientationchange). Возвращает отписку. */
export function onOrientationChange(cb: (orientation: Orientation) => void): () => void {
  let current = getOrientation();
  const handler = () => {
    const next = getOrientation();
    if (next !== current) {
      current = next;
      cb(next);
    }
    cb(getOrientation());
  };
  window.addEventListener('resize', handler);
  window.addEventListener('orientationchange', handler);
  return () => {
    window.removeEventListener('resize', handler);
    window.removeEventListener('orientationchange', handler);
  };
}
