import type { BlockRegistry } from './BlockRegistry';
import { Cell, cellId, cellState } from './cell';
import type { Box } from './models/BlockModel';
import { CellNeighbourhood } from './models/CellNeighbourhood';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../worldConstants';

// Box collision for the player (and later anything else that walks). It reads the collision boxes of block models,
// so slabs, stairs and fences stop you where they look like they should, and moves an axis-aligned box through them
// one axis at a time, so there is no tunnelling however far a single move goes.
//
// Coordinates are world coordinates. Block (x, y, z) fills x - 0.5 .. x + 0.5 on each axis, the same offset the
// renderer puts on chunk meshes, so the middle of a block is its integer coordinate.

/** What collision needs from the world. `VoxelWorld` fits. */
export interface CollisionWorld {
  readonly registry: BlockRegistry;
  getCell(x: number, y: number, z: number): Cell;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** How high a walking box climbs by itself: stairs and slabs (0.5) but not a full block. */
export const STEP_HEIGHT = 0.6;

/** The player's box extends this far above the eye (the position the camera sits at). */
export const PLAYER_HEAD_ROOM = 0.1;

// Boxes that touch do not collide. The tolerance keeps float noise from turning "resting on" into "inside".
const EPS = 1e-6;
// How far below the feet counts as standing on something.
const GROUND_PROBE = 1e-3;

/** The box of a player whose eyes are at (x, eyeY, z): feet PLAYER_HEIGHT below the eyes. */
export const playerBox = (x: number, eyeY: number, z: number): Box => [
  x - PLAYER_RADIUS, eyeY - PLAYER_HEIGHT, z - PLAYER_RADIUS,
  x + PLAYER_RADIUS, eyeY + PLAYER_HEAD_ROOM, z + PLAYER_RADIUS,
];

// One neighbourhood per world, so fences can read their neighbours without allocating on every query.
const neighbourhoods = new WeakMap<CollisionWorld, CellNeighbourhood>();
const neighbourhoodOf = (world: CollisionWorld): CellNeighbourhood => {
  let nb = neighbourhoods.get(world);
  if (!nb) {
    nb = new CellNeighbourhood(world.registry, (x, y, z) => world.getCell(x, y, z));
    neighbourhoods.set(world, nb);
  }
  return nb;
};

// Boxes found for one move, six numbers each. Moves never overlap in time, so one buffer does for all.
let found = new Float64Array(6 * 128);
let foundCount = 0;

const push = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void => {
  if ((foundCount + 1) * 6 > found.length) {
    const bigger = new Float64Array(found.length * 2);
    bigger.set(found);
    found = bigger;
  }
  const o = foundCount * 6;
  found[o] = x0; found[o + 1] = y0; found[o + 2] = z0;
  found[o + 3] = x1; found[o + 4] = y1; found[o + 5] = z1;
  foundCount++;
};

const addCellBoxes = (world: CollisionWorld, x: number, y: number, z: number): void => {
  const cell = world.getCell(x, y, z);
  const id = cellId(cell);
  if (id === 0 || !world.registry.isSolid(id)) return;
  const model = world.registry.model(id);
  const ox = x - 0.5, oy = y - 0.5, oz = z - 0.5;
  if (model.isFullCube) {
    push(ox, oy, oz, ox + 1, oy + 1, oz + 1);
    return;
  }
  for (const b of model.collisionBoxes(cellState(cell), neighbourhoodOf(world).at(x, y, z))) {
    push(ox + b[0], oy + b[1], oz + b[2], ox + b[3], oy + b[4], oz + b[5]);
  }
};

/**
 * The boxes that stop a mover in block (x, y, z), in world coordinates. Empty for air, water and every block that is
 * not `solid` (plants, lily pads), whatever shape their model has. A block with no model is a full cube.
 */
export const getCollisionBoxes = (world: CollisionWorld, x: number, y: number, z: number): Box[] => {
  const start = foundCount;
  addCellBoxes(world, x, y, z);
  const boxes: Box[] = [];
  for (let i = start; i < foundCount; i++) {
    const o = i * 6;
    boxes.push([found[o], found[o + 1], found[o + 2], found[o + 3], found[o + 4], found[o + 5]]);
  }
  foundCount = start;
  return boxes;
};

// Collects every box a move through the region can touch. A box may stick out of its cell upwards (a fence is 1.5
// high), so the cell below the region is searched too.
const gather = (world: CollisionWorld, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void => {
  foundCount = 0;
  const ix0 = Math.floor(x0 + 0.5), ix1 = Math.floor(x1 + 0.5);
  const iy0 = Math.floor(y0 + 0.5) - 1, iy1 = Math.floor(y1 + 0.5);
  const iz0 = Math.floor(z0 + 0.5), iz1 = Math.floor(z1 + 0.5);
  for (let x = ix0; x <= ix1; x++) {
    for (let z = iz0; z <= iz1; z++) {
      for (let y = iy0; y <= iy1; y++) addCellBoxes(world, x, y, z);
    }
  }
};

// How far `b` may move along `axis` (0 x, 1 y, 2 z) by `d` before it hits one of the gathered boxes.
const allowed = (b: Float64Array, axis: number, d: number): number => {
  if (d === 0) return 0;
  const o1 = (axis + 1) % 3;
  const o2 = (axis + 2) % 3;
  const lo = b[axis], hi = b[axis + 3];
  for (let i = 0; i < foundCount; i++) {
    const o = i * 6;
    if (b[o1 + 3] <= found[o + o1] + EPS || b[o1] >= found[o + o1 + 3] - EPS) continue;
    if (b[o2 + 3] <= found[o + o2] + EPS || b[o2] >= found[o + o2 + 3] - EPS) continue;
    if (d > 0) {
      if (hi <= found[o + axis] + EPS) d = Math.min(d, Math.max(0, found[o + axis] - hi));
    } else if (lo >= found[o + axis + 3] - EPS) {
      d = Math.max(d, Math.min(0, found[o + axis + 3] - lo));
    }
  }
  return d;
};

const sweep = (b: Float64Array, axis: number, d: number): number => {
  d = allowed(b, axis, d);
  b[axis] += d;
  b[axis + 3] += d;
  return d;
};

const afterY = new Float64Array(6);
const normal = new Float64Array(6);
const stepped = new Float64Array(6);
const work = new Float64Array(6);

const blocked = (requested: number, moved: number): boolean => Math.abs(requested - moved) > 1e-9;

export interface MoveResult {
  /** Where the box ended up. */
  box: Box;
  /** How far it moved on each axis, step-ups included in dy. */
  dx: number;
  dy: number;
  dz: number;
  /** The move was cut short on that axis. A step-up that got over the obstacle does not count. */
  hitX: boolean;
  hitY: boolean;
  hitZ: boolean;
  /** The box stands on something now: it is not rising and a box lies just under its feet. */
  onGround: boolean;
  /** How much it climbed to get over a step, 0 when it did not. */
  stepped: number;
}

export interface MoveOptions {
  /** How high the box climbs by walking into a ledge. 0 turns it off. Default STEP_HEIGHT. */
  stepHeight?: number;
}

/**
 * Moves `box` by `delta` through the solid blocks of `world`, vertically first, then x, then z, each axis swept to
 * the first box in its way. Because every box in the swept region is tested, a move of any length stops at the
 * first thing it meets instead of jumping past it.
 *
 * When the box stands on something and a horizontal move is cut short, it is tried again lifted by up to
 * `stepHeight`, moved, and set back down. That is how the player walks up stairs and slabs. Nothing is stepped
 * onto while the box is in the air or rising.
 */
export const moveAABB = (world: CollisionWorld, box: Box, delta: Vec3, options: MoveOptions = {}): MoveResult => {
  const stepHeight = options.stepHeight ?? STEP_HEIGHT;
  const { x: dx, y: dy, z: dz } = delta;
  const start = Float64Array.of(box[0], box[1], box[2], box[3], box[4], box[5]);
  const cur = Float64Array.from(start);

  gather(
    world,
    box[0] + Math.min(0, dx), box[1] + Math.min(0, dy), box[2] + Math.min(0, dz),
    box[3] + Math.max(0, dx), box[4] + Math.max(0, dy) + Math.max(0, stepHeight), box[5] + Math.max(0, dz),
  );

  const my = sweep(cur, 1, dy);
  afterY.set(cur);
  const wasOnGround = dy <= 0 && allowed(cur, 1, -GROUND_PROBE) > -GROUND_PROBE;
  let mx = sweep(cur, 0, dx);
  let mz = sweep(cur, 2, dz);
  let climbed = 0;

  if (wasOnGround && stepHeight > 0 && (blocked(dx, mx) || blocked(dz, mz))) {
    normal.set(cur);
    work.set(afterY);
    const up = sweep(work, 1, stepHeight);
    const sx = sweep(work, 0, dx);
    const sz = sweep(work, 2, dz);
    sweep(work, 1, -up);
    // Only take the step if it got further than walking into the ledge did, and ended no lower than it started.
    if (sx * sx + sz * sz > mx * mx + mz * mz + 1e-9 && work[1] >= afterY[1] - EPS) {
      stepped.set(work);
      cur.set(stepped);
      mx = sx;
      mz = sz;
      climbed = Math.max(0, work[1] - afterY[1]);
    } else {
      cur.set(normal);
    }
  }

  const movedY = cur[1] - start[1];
  const onGround = dy <= 0 && allowed(cur, 1, -GROUND_PROBE) > -GROUND_PROBE;
  return {
    box: [cur[0], cur[1], cur[2], cur[3], cur[4], cur[5]],
    dx: cur[0] - start[0],
    dy: movedY,
    dz: cur[2] - start[2],
    hitX: blocked(dx, mx),
    hitY: blocked(dy, my),
    hitZ: blocked(dz, mz),
    onGround,
    stepped: climbed,
  };
};
