import { Position } from '../../core/types/position';

/**
 * Частицы целевых площадок (план 7.5, аналог GPUParticles3D из prefab/end.tscn):
 * - эмиссия кольцом (радиус 0.5);
 * - «гравитация» (0, 0.5, 0) — частицы всплывают вверх;
 * - жёлтый цвет (1, 0.98, 0.23);
 * - маленький кубик 0.1×0.1×0.1;
 * - по умолчанию выключены, активируются при попадании кубика.
 */
const RING_RADIUS = 0.5;
const RISE_SPEED = 0.5; // единиц в секунду
const MAX_HEIGHT = 1.2;
const PARTICLES_PER_END = 8;

interface Particle {
  key: string;
  x: number;
  z: number;
  y: number;
  phase: number; // смещение по кольцу
}

export class ParticleSystem {
  private activePositions = new Set<string>();
  private particles: Particle[] = [];

  /** Включить/выключить эмиссию на целевой площадке. */
  setActive(pos: Position, active: boolean): void {
    const key = `${pos.x},${pos.y}`;
    if (active) {
      if (!this.activePositions.has(key)) {
        this.activePositions.add(key);
        this.spawnFor(key, pos);
      }
    } else {
      this.activePositions.delete(key);
      this.particles = this.particles.filter((p) => p.key !== key);
    }
  }

  private spawnFor(key: string, pos: Position): void {
    for (let i = 0; i < PARTICLES_PER_END; i++) {
      const phase = (i / PARTICLES_PER_END) * Math.PI * 2;
      this.particles.push({
        key,
        x: pos.x + 0.5 + Math.cos(phase) * RING_RADIUS,
        z: pos.y + 0.5 + Math.sin(phase) * RING_RADIUS,
        y: 0.05 + (i / PARTICLES_PER_END) * 0.3,
        phase,
      });
    }
  }

  /** Обновление за кадр: подъём частиц и вращение по кольцу. */
  update(dt: number): void {
    for (const p of this.particles) {
      p.y += RISE_SPEED * dt;
      p.phase += dt * 1.5;
      if (p.y > MAX_HEIGHT) p.y = 0.05;
    }
  }

  /** Активные частицы: [x, y, z] в координатах уровня (x, z — центр клетки + смещение). */
  getPositions(): { x: number; y: number; z: number }[] {
    return this.particles.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  }

  clear(): void {
    this.activePositions.clear();
    this.particles = [];
  }
}
