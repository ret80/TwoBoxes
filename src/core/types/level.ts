import { Box, End } from './entity';
import { LevelGrid } from './level-grid';

/**
 * Уровень (аналог `script/game/levels/level.gd`).
 * Содержит статическую карту (grid) и сущности (кубики, цели).
 */
export class Level {
  constructor(
    public readonly episodeId: number,
    public readonly levelId: number,
    public readonly grid: LevelGrid,
    public readonly boxes: Box[],
    public readonly ends: End[],
  ) {}

  get width(): number {
    return this.grid.width;
  }

  get height(): number {
    return this.grid.height;
  }

  /** Описание уровня в формате `Э-Л` (например, `1-3`). */
  get label(): string {
    return `${this.episodeId + 1}-${this.levelId + 1}`;
  }
}
