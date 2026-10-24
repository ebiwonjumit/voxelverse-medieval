import { createDefaultRegistry } from '../../content/blocks';
import { AIR_CELL, Cell, cellId, packCell } from '../../engine/cell';
import { CollisionWorld, moveAABB, playerBox } from '../../engine/collision';
import { BlockType, PLAYER_HEIGHT } from '../../worldConstants';
import { Blueprint, NO_CELL } from '../../worldgen/structures/Blueprint';

// What the landmark tests share: a world made of one blueprint on flat ground, a count of floating blocks, and a walker.
// The walker is the game's own collision (engine/collision.ts) pushed through the blueprint one block at a time from a
// starting cell, so "reachable" means a player can really get there: through doors a block wide, up stairs and slabs by
// stepping, never over a full block.

export const registry = createDefaultRegistry();

/** Blueprint cells over a ground that is stone up to and including y = 0 and air above, so the ground surface is at y 0.5. */
export class BlueprintWorld implements CollisionWorld {
  readonly registry = registry;
  constructor(private readonly bp: Blueprint, private readonly ground = 0) {}

  getCell(x: number, y: number, z: number): Cell {
    const c = this.bp.get(x, y, z);
    if (c !== NO_CELL) return c;
    return y <= this.ground ? packCell(BlockType.STONE) : AIR_CELL;
  }
}

/**
 * Cells not joined to the ground through faces, edges or corners. `groundTop` is the highest row that counts as the ground: 1 by
 * default, as in the kit tests, because a building stands on the surface row (y 0) of terrain it does not draw. Air carvings are not cells.
 */
export const floatingCells = (bp: Blueprint, groundTop = 1): Array<[number, number, number]> => {
  const solid = new Set<string>();
  const stack: Array<[number, number, number]> = [];
  const seen = new Set<string>();
  bp.forEach((x, y, z, c) => {
    if (c === AIR_CELL) return;
    solid.add(`${x},${y},${z}`);
    if (y <= groundTop) { stack.push([x, y, z]); seen.add(`${x},${y},${z}`); }
  });
  while (stack.length) {
    const [x, y, z] = stack.pop()!;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const k = `${x + dx},${y + dy},${z + dz}`;
      if (solid.has(k) && !seen.has(k)) { seen.add(k); stack.push([x + dx, y + dy, z + dz]); }
    }
  }
  const out: Array<[number, number, number]> = [];
  for (const k of solid) if (!seen.has(k)) out.push(k.split(',').map(Number) as [number, number, number]);
  return out;
};

export interface Standing { x: number; z: number; feet: number }

export interface WalkOptions {
  /** The walker stays inside this box of block columns (inclusive). */
  minX: number; maxX: number; minZ: number; maxZ: number;
  /** Stop after this many standing places. */
  max?: number;
  /** The lowest the walker may fall to: a drop of more than this below the start counts as lost. */
  floor?: number;
}

const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Every place a walker can stand, found by walking: from the block column (x, z) with its feet at `feet`, a step in each of
 * the four directions with the game's collision (so it climbs a stair or slab by itself and stops at a wall, a closed pane or
 * a full block), then settling under gravity. A place is a column and a feet height in quarters of a block.
 */
export const walk = (world: CollisionWorld, start: Standing, options: WalkOptions): Map<string, Standing> => {
  const places = new Map<string, Standing>();
  const keyOf = (s: Standing): string => `${s.x},${s.z},${Math.round(s.feet * 4)}`;
  const settle = (x: number, z: number, feet: number): Standing | null => {
    const box = playerBox(x, feet + PLAYER_HEIGHT, z);
    const r = moveAABB(world, box, { x: 0, y: -3.2, z: 0 });
    if (!r.onGround) return null;
    if (r.box[1] < (options.floor ?? -4)) return null;
    return { x, z, feet: r.box[1] };
  };
  const first = settle(start.x, start.z, start.feet);
  if (!first) return places;
  places.set(keyOf(first), first);
  const queue: Standing[] = [first];
  const max = options.max ?? 400000;
  while (queue.length && places.size < max) {
    const here = queue.pop()!;
    for (const [dx, dz] of DIRS) {
      const nx = here.x + dx;
      const nz = here.z + dz;
      if (nx < options.minX || nx > options.maxX || nz < options.minZ || nz > options.maxZ) continue;
      // A block in four small steps with gravity between them, as the game moves a player frame by frame: a stair is a step
      // of half a block up and a climb of a block is two of them, which one long move would not take.
      let box = playerBox(here.x, here.feet + PLAYER_HEIGHT, here.z);
      let moved = 0;
      for (let i = 0; i < 4; i++) {
        const m = moveAABB(world, box, { x: dx * 0.25, y: 0, z: dz * 0.25 });
        moved += Math.abs(m.dx) + Math.abs(m.dz);
        const g = moveAABB(world, m.box, { x: 0, y: -0.3, z: 0 });
        box = g.box;
      }
      if (moved < 0.98) continue;
      const after = settle(nx, nz, box[1]);
      if (!after) continue;
      const k = keyOf(after);
      if (places.has(k)) continue;
      places.set(k, after);
      queue.push(after);
    }
  }
  return places;
};

/** Is some place within 0.75 blocks of the height of cell y at column (x, z) reachable: someone can stand in that cell. */
export const canStandIn = (places: ReadonlyMap<string, Standing>, x: number, y: number, z: number): boolean => {
  for (const p of places.values()) if (p.x === x && p.z === z && Math.abs(p.feet - (y - 0.5)) < 0.75) return true;
  return false;
};

/** The columns (x, z) with a standing place, for counting how much of a floor is walkable. */
export const columnsOf = (places: ReadonlyMap<string, Standing>): Set<string> => {
  const out = new Set<string>();
  for (const p of places.values()) out.add(`${p.x},${p.z}`);
  return out;
};

export const idOf = (c: Cell): number => cellId(c);
export { AIR_CELL, NO_CELL };
