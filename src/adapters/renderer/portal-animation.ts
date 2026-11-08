/**
 * Анимация телепорта (клетки портала).
 *
 * Плавный вариант: кубик въезжает на клетку портала, немного поднимается над
 * плитой, вытягивается вверх, сужается по X и Z в тонкую вертикальную палку и
 * схлопывается в маленький кубик — и исчезает. На выходе та же
 * последовательность играет в обратном порядке: точка → палка → кубик, который
 * опускается на плиту. Нижняя грань всё время висит над плитой (при `lift > 0`),
 * поэтому растянутый кубик не «прорезает» площадку и читается как парящий.
 *
 * Быстрый вариант (ускоренная анимация хода): кубик просто сжимается в
 * маленький и переносится, а на выходе так же разжимается обратно. Подъёма и
 * вытягивания в палку нет, и вся анимация заметно короче плавной.
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
/** Размер, до которого кубик сжимается в быстром варианте. */
export const PORTAL_SMALL = 0.28;

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
 * Кадры плавного телепорта: подъём → вытягивание → палка → кубик →
 * исчезновение, затем выход в обратном порядке. `ms` — длительность перехода
 * к кадру.
 */
const PORTAL_KEYS_SOFT: PortalKey[] = [
  // Вход: кубик отрывается от плиты, тянется вверх, сужается и схлопывается.
  { ms: 60, lift: PORTAL_LIFT, sy: 1, sxz: 1 },
  { ms: 70, lift: PORTAL_LIFT, sy: PORTAL_STRETCH, sxz: 1 },
  { ms: 70, lift: PORTAL_LIFT, sy: PORTAL_STRETCH, sxz: PORTAL_NARROW },
  { ms: 70, lift: PORTAL_LIFT, sy: PORTAL_NARROW, sxz: PORTAL_NARROW },
  { ms: 40, lift: PORTAL_LIFT, sy: 0, sxz: 0, atExit: true },
  // Мгновение пустоты: входа уже нет, выхода ещё нет.
  { ms: 25, lift: PORTAL_LIFT, sy: 0, sxz: 0 },
  // Выход: та же последовательность в обратном порядке.
  { ms: 40, lift: PORTAL_LIFT, sy: PORTAL_NARROW, sxz: PORTAL_NARROW },
  { ms: 70, lift: PORTAL_LIFT, sy: PORTAL_STRETCH, sxz: PORTAL_NARROW },
  { ms: 70, lift: PORTAL_LIFT, sy: PORTAL_STRETCH, sxz: 1 },
  { ms: 70, lift: PORTAL_LIFT, sy: 1, sxz: 1 },
  // Опускается на плиту — поза совпадает с обычной.
  { ms: 60, lift: 0, sy: 1, sxz: 1 },
];

/**
 * Кадры быстрого телепорта (ускоренная анимация хода): кубик сжимается в
 * маленький, исчезает и так же разжимается на выходе — без подъёма и палки.
 */
const PORTAL_KEYS_SNAPPY: PortalKey[] = [
  { ms: 90, lift: 0, sy: PORTAL_SMALL, sxz: PORTAL_SMALL },
  { ms: 60, lift: 0, sy: 0, sxz: 0, atExit: true },
  { ms: 50, lift: 0, sy: 0, sxz: 0 },
  { ms: 60, lift: 0, sy: PORTAL_SMALL, sxz: PORTAL_SMALL },
  { ms: 100, lift: 0, sy: 1, sxz: 1 },
];

const timelineMs = (keys: PortalKey[]): number => keys.reduce((sum, key) => sum + key.ms, 0);

/** Длительность плавной анимации телепорта (мс). */
export const PORTAL_TOTAL_MS = timelineMs(PORTAL_KEYS_SOFT);
/** Длительность быстрой анимации телепорта (мс) — заметно короче плавной. */
export const PORTAL_SNAPPY_MS = timelineMs(PORTAL_KEYS_SNAPPY);

/** Длительность телепорта в выбранном варианте, мс. */
export function portalDurationMs(snappy = false): number {
  return snappy ? PORTAL_SNAPPY_MS : PORTAL_TOTAL_MS;
}

/** Поза кубика на плите: обычный размер, без подъёма. */
export const PORTAL_REST: PortalPose = { lift: 0, sy: 1, sxz: 1, atExit: false };

const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Поза телепорта через `elapsed` мс от начала. Время вне интервала
 * клампится: до старта — обычная поза, после конца — обычная поза на выходе.
 * `snappy` — быстрый вариант (ускоренная анимация хода).
 */
export function portalPose(elapsed: number, snappy = false): PortalPose {
  const keys = snappy ? PORTAL_KEYS_SNAPPY : PORTAL_KEYS_SOFT;
  let prev: PortalPose = { ...PORTAL_REST };
  let start = 0;
  for (const key of keys) {
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
