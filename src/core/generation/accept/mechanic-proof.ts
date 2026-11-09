import { CellType } from '../../types/cell';
import type { Box } from '../../types/entity';
import { Level } from '../../types/level';
import { createMechanicState } from '../../types/mechanic-state';
import { Position } from '../../types/position';
import { moveBoxes } from '../../rules/move';
import { getMechanic, type MechanicId, type MechanicModule } from '../mechanics';

/**
 * Механики, которые кратчайшее решение реально задело.
 *
 * Это ещё не доказательство, что механика **нужна** (см. `stripMechanics` и
 * проверку `mechanic-not-required`), но уже не «механика нарисована где
 * угодно»: клетка должна лежать на траектории кубика.
 */
export function mechanicsInSolution(
  level: Level,
  solution: Position[],
  modules: MechanicModule[],
): MechanicModule[] {
  if (modules.length === 0) return [];
  const used = new Set<MechanicId>();
  let boxes: Box[] = level.boxes.map((box) => ({
    pos: box.pos.clone(),
    color: box.color,
  }));
  let state = createMechanicState(boxes.length);

  for (const dir of solution) {
    const next = moveBoxes(level, boxes, dir, 0, 0, state);
    if (!next) break;
    for (const path of next.paths ?? []) {
      for (const point of path) {
        const cell = level.grid.get(point.pos);
        for (const module of modules) {
          if (module.owns(cell)) used.add(module.id);
        }
      }
    }
    boxes = next.boxes;
    state = next.mechanicState ?? state;
  }

  return modules.filter((module) => used.has(module.id));
}

/**
 * Копия уровня, где клетки указанных механик стали обычным полом.
 *
 * Нужна для честной проверки «механика обязательна»: если уровень без неё
 * решается за то же число ходов, механика — декорация. Решатель не меняется:
 * это другой `Level` и тот же `analyze`.
 */
export function stripMechanics(level: Level, ids: MechanicId[]): Level {
  const grid = level.grid.duplicate();
  const modules = ids.map(getMechanic);
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const pos = new Position(x, y);
      const cell = grid.get(pos);
      if (modules.some((module) => module.owns(cell))) {
        grid.set(pos, CellType.EMPTY);
      }
    }
  }
  return new Level(
    level.episodeId,
    level.levelId,
    grid,
    level.boxes.map((box) => ({ pos: box.pos.clone(), color: box.color })),
    level.ends.map((end) => ({ pos: end.pos.clone(), color: end.color })),
  );
}
