import { describe, expect, it } from 'vitest';
import {
  PORTAL_LIFT,
  PORTAL_NARROW,
  PORTAL_REST,
  PORTAL_SMALL,
  PORTAL_SNAPPY_MS,
  PORTAL_STRETCH,
  PORTAL_TOTAL_MS,
  portalDurationMs,
  portalPose,
} from './portal-animation';

/** Поза на каждом миллисекунде анимации: удобно искать экстремумы. */
function samples(snappy = false): { t: number; pose: ReturnType<typeof portalPose> }[] {
  const out = [];
  const total = portalDurationMs(snappy);
  for (let t = 0; t <= total; t++) out.push({ t, pose: portalPose(t, snappy) });
  return out;
}

describe('анимация телепорта', () => {
  it('начинается и заканчивается обычной позой кубика на плите', () => {
    expect(portalPose(0)).toEqual({ ...PORTAL_REST, atExit: false });
    const end = portalPose(PORTAL_TOTAL_MS);
    expect(end).toEqual({ lift: 0, sy: 1, sxz: 1, atExit: true });
    // За концом анимации поза не меняется — рендерер может ещё кадр её держать.
    expect(portalPose(PORTAL_TOTAL_MS * 2)).toEqual(end);
  });

  it('проходит через подъём, вытягивание, палку и точку', () => {
    const poses = samples().map((s) => s.pose);
    expect(Math.max(...poses.map((p) => p.lift))).toBeCloseTo(PORTAL_LIFT, 5);
    expect(Math.max(...poses.map((p) => p.sy))).toBeCloseTo(PORTAL_STRETCH, 5);
    expect(Math.min(...poses.map((p) => p.sy))).toBe(0);
    expect(Math.min(...poses.map((p) => p.sxz))).toBe(0);
    // Сначала кубик вытягивается во всю высоту и только потом сужается:
    // первая самая высокая поза ещё полная по сечению.
    const tallest = samples().find((s) => s.pose.sy > PORTAL_STRETCH - 1e-6);
    expect(tallest).toBeDefined();
    expect(tallest!.pose.sxz).toBeCloseTo(1, 5);
    // Дальше он сужается в тонкую палку, оставаясь вытянутым.
    const rod = samples().find((s) => s.pose.sxz < PORTAL_NARROW + 1e-6);
    expect(rod).toBeDefined();
    expect(rod!.pose.sy).toBeGreaterThan(PORTAL_NARROW * 2);
  });

  it('не касается плиты, пока кубик вытянут или сужен', () => {
    for (const { pose } of samples()) {
      const reshaped = pose.sy > 1 + 1e-6 || pose.sxz < 1 - 1e-6;
      if (!reshaped) continue;
      expect(pose.lift).toBeCloseTo(PORTAL_LIFT, 6);
    }
  });

  it('исчезает на входе и появляется уже на выходе', () => {
    const hidden = samples().filter((s) => s.pose.sy <= 0.001);
    expect(hidden.length).toBeGreaterThan(1);
    // Пока кубик виден на входе, он ещё не перескочил на выход.
    expect(samples()[0].pose.atExit).toBe(false);
    const firstExit = samples().find((s) => s.pose.atExit);
    expect(firstExit).toBeDefined();
    expect(firstExit!.pose.sy).toBeLessThan(1e-6);
    // На выходе он снова собирается из точки в кубик.
    const exitPoses = samples()
      .filter((s) => s.pose.atExit)
      .map((s) => s.pose);
    expect(Math.max(...exitPoses.map((p) => p.sy))).toBeCloseTo(PORTAL_STRETCH, 5);
    expect(Math.max(...exitPoses.map((p) => p.sxz))).toBe(1);
  });
});

describe('быстрый телепорт (ускоренная анимация хода)', () => {
  it('заметно короче плавного', () => {
    expect(PORTAL_SNAPPY_MS).toBeLessThan(PORTAL_TOTAL_MS * 0.6);
    expect(portalDurationMs(true)).toBe(PORTAL_SNAPPY_MS);
    expect(portalDurationMs()).toBe(PORTAL_TOTAL_MS);
  });

  it('только сжимается в маленький кубик и разжимается обратно', () => {
    const poses = samples(true).map((s) => s.pose);
    // Никакого подъёма и вытягивания в палку — кубик остаётся на плите.
    expect(Math.max(...poses.map((p) => p.lift))).toBe(0);
    expect(Math.max(...poses.map((p) => p.sy))).toBe(1);
    // В видимой части он уменьшается до маленького кубика (а не до палки).
    expect(poses.filter((p) => p.sy > 0).every((p) => p.sy <= 1 + 1e-6)).toBe(true);
    expect(portalPose(90, true)).toMatchObject({ sy: PORTAL_SMALL, sxz: PORTAL_SMALL, lift: 0 });
    // Сжимается в точку только на исчезновении, в самом конце входа.
    expect(Math.min(...poses.map((p) => p.sy))).toBe(0);
  });

  it('на выходе всё идёт в обратном порядке', () => {
    const poses = samples(true);
    const gone = poses.find((s) => s.pose.atExit);
    expect(gone).toBeDefined();
    // Появляется маленьким и растёт до обычного: размер только увеличивается.
    const exit = poses.filter((s) => s.pose.atExit).map((s) => s.pose.sy);
    expect(exit[0]).toBeLessThan(PORTAL_SMALL + 1e-6);
    for (let i = 1; i < exit.length; i++) expect(exit[i]).toBeGreaterThanOrEqual(exit[i - 1]);
    expect(exit[exit.length - 1]).toBe(1);
    // И заканчивает обычной позой на плите.
    expect(poses[poses.length - 1].pose).toEqual({ lift: 0, sy: 1, sxz: 1, atExit: true });
  });
});
