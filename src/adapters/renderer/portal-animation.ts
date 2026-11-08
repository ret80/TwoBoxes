/**
 * Анимация телепорта (клетки портала).
 *
 * Кубик въезжает на клетку портала, немного поднимается над плитой,
 * вытягивается вверх, сужается по X и Z в тонкую вертикальную палку и
 * схлопывается в маленький кубик — и исчезает. На выходе та же
 * последовательность играет в обратном порядке: точка → палка → кубик, который
 * опускается на плиту.
 *
 * Нижняя грань всё время висит над плитой (при `lift > 0`), поэтому растянутый
 * кубик не «прорезает» площадку и читается как парящий.
 *
 * Модуль чистый: поза считается по прошедшему времени, без WebGL и tween'ов,
 * поэтому её легко проверить тестом (`portal-animation.test.ts`).
 */

/** Подъём над плитой, с которого начинается вытягивание (в клетках). */
export const PORTAL_LIFT = 0.45;
/** Во сколько раз кубик вытягивается по Y на втором шаге. */
export const PORTAL_STRETCH = 1.95;
/** Сечение палки и размер точки перед исчезновением. */
export const PORTAL_NARROW = 0.26;

/** Поза кубика в анимации телепорта. */
export interface PortalPose {
  /** Смещение нижней грани кубика от его обычного положения на плите. */
  lift: number;
  /** Множитель высоты (Y). */
  sy: number;
  /** Множитель сечения (X и Z). */
  sxz: number;
  /** Кубик уже на выходе: координаты берутся у парной клетки. */
  atExit: boolean;
}

interface PortalKey {
  ms: number;
  lift: number;
  sy: number;
  sxz: number;
  /** Кубик исчез здесь и появился на выходе. */
  atExit?: boolean;
}

/**
 * Кадры одного телепорта: подъём → вытягивание → палка → кубик → исчезновение,
 * затем выход в обратном порядке. `ms` — длительность перехода к кадру.
 */
const PORTAL_KEYS: PortalKey[] = [
  // Вход: кубик отрывается от плиты, тянется вверх, сужается и схлопывается.
  { ms: 120, lift: PORTAL_LIFT, sy: 1, sxz: 1 },
  { ms: 140, lift: PORTAL_LIFT, sy: PORTAL_STRETCH, sxz: 1 },
  { ms: 140, lift: PORTAL_LIFT, sy: PORTAL_STRETCH, sxz: PORTAL_NARROW },
  { ms: 140, lift: PORTAL_LIFT, sy: PORTAL_NARROW, sxz: PORTAL_NARROW },
  { ms: 80, lift: PORTAL_LIFT, sy: 0, sxz: 0, atExit: true },
  // Мгновение пустоты: входа уже нет, выхода ещё нет.
  { ms: 50, lift: PORTAL_LIFT, sy: 0, sxz: 0 },
  // Выход: та же последовательность в обратном порядке.
  { ms: 80, lift: PORTAL_LIFT, sy: PORTAL_NARROW, sxz: PORTAL_NARROW },
  { ms: 140, lift: PORTAL_LIFT, sy: PORTAL_STRETCH, sxz: PORTAL_NARROW },
  { ms: 140, lift: PORTAL_LIFT, sy: PORTAL_STRETCH, sxz: 1 },
  { ms: 140, lift: PORTAL_LIFT, sy: 1, sxz: 1 },
  // Опускается на плиту — поза совпадает с обычной.
  { ms: 120, lift: 0, sy: 1, sxz: 1 },
];

/** Длительность всей анимации одного телепорта (мс до множителя скорости). */
export const PORTAL_TOTAL_MS = PORTAL_KEYS.reduce((sum, key) => sum + key.ms, 0);

/** Поза кубика на плите: обычный размер, без подъёма. */
export const PORTAL_REST: PortalPose = { lift: 0, sy: 1, sxz: 1, atExit: false };

const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Поза телепорта через `elapsed` мс от начала. Время вне интервала
 * клампится: до старта — обычная поза, после конца — обычная поза на выходе.
 */
export function portalPose(elapsed: number): PortalPose {
  let prev: PortalPose = { ...PORTAL_REST };
  let start = 0;
  for (const key of PORTAL_KEYS) {
    const end = start + key.ms;
    if (elapsed < end) {
      const eased = easeInOutCubic((elapsed - start) / key.ms);
      return {
        lift: prev.lift + (key.lift - prev.lift) * eased,
        sy: prev.sy + (key.sy - prev.sy) * eased,
        sxz: prev.sxz + (key.sxz - prev.sxz) * eased,
        // Позиция перескакивает на выход в момент, когда кубика уже не видно.
        atExit: prev.atExit,
      };
    }
    start = end;
    prev = { lift: key.lift, sy: key.sy, sxz: key.sxz, atExit: key.atExit ?? prev.atExit };
  }
  return { ...prev };
}
