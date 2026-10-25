import { NatureBlock } from '../../../content/blocksNature';
import { ShapedBlock } from '../../../content/blocksShaped';
import { TempestBlock as T } from '../../../content/blocksTempest';
import { hash2 } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { furnish } from '../../tempest/interiors';
import {
  BlockRef, BlueprintBuilder, DX, DZ, Dir, EAST, NORTH, OpeningKind, Rect, Room, SOUTH, WEST, opposite, rect, turnLeft, turnRight,
} from '../../structures/BlueprintBuilder';
import { RoofInfo } from '../../structures/roofs';
import { FLARED, FLARED_DEEP, FLARED_TIGHT, RoofProfile } from '../../structures/roofProfile';

// Shared pieces of the Tempest kits: bays of timber walls with a window in each, lean-to roofs over shop fronts, the
// stair that joins two floors, props for the street, a simple furnished interior. A kit is a few of these in an order
// and a handful of rolls; nothing here names a block that a style pack could supply (the few that have no role, the
// plank stairs and the plants, are named once, below).

/** A plank stair for inside the house: the style packs have no role for it. */
export const WOOD_STAIRS = ShapedBlock.DARK_PLANK_STAIRS;
export const WOOD_SLAB = ShapedBlock.WOOD_PLANK_SLAB;
export { rect };
export type { Rect, Dir };

export const SIDES: readonly Dir[] = [NORTH, EAST, SOUTH, WEST];

// --- Bays ---------------------------------------------------------------------------------------------------------

/** The cell between two posts along a wall, where a window or a door can go. */
export interface Bay {
  side: Dir;
  /** First and last cell along the wall, in blueprint coordinates (x for north and south, z for east and west). */
  from: number;
  to: number;
  /** Distance of the first cell from the wall's start, the `at` of `opening`. */
  at: number;
  len: number;
}

/** Positions of the posts along a wall from a to b, the same ones `BlueprintBuilder.frame` stands. */
export const postCoords = (a: number, b: number, spacing: number): number[] => {
  const len = b - a;
  const n = Math.max(1, Math.ceil(len / spacing));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(a + Math.round((len * i) / n));
  return out;
};

export const bays = (r: Rect, side: Dir, spacing: number): Bay[] => {
  const horizontal = side === NORTH || side === SOUTH;
  const [a, z] = horizontal ? [r.x0, r.x1] : [r.z0, r.z1];
  const posts = postCoords(a, z, spacing);
  const out: Bay[] = [];
  for (let i = 0; i + 1 < posts.length; i++) {
    const from = posts[i] + 1;
    const to = posts[i + 1] - 1;
    if (to >= from) out.push({ side, from, to, at: from - a, len: to - from + 1 });
  }
  return out;
};

export interface WindowSpec {
  y: number;
  height?: number;
  kind: OpeningKind;
  lit?: boolean;
  /** Cells wide, at most the bay's width; default the whole bay. */
  width?: number;
  sill?: BlockRef;
  /** A timber across the top of the opening, a row above it. */
  lintel?: BlockRef;
}

/** Cuts a window into a bay, centred in it. */
export const bayWindow = (b: BlueprintBuilder, r: Rect, bay: Bay, w: WindowSpec): void => {
  const width = Math.min(bay.len, w.width ?? bay.len);
  const at = bay.at + Math.floor((bay.len - width) / 2);
  const height = w.height ?? (w.kind === 'door' ? 2 : 1);
  b.opening(r, { side: bay.side, at, y: w.y, width, height, kind: w.kind, lit: w.lit, sill: w.sill });
  if (w.lintel !== undefined) {
    for (let i = 0; i < width; i++) setOnWall(b, r, bay.side, at + i, w.y + height, w.lintel);
  }
};

/** A small window with a timber lintel and a stone sill, both a cell wider than the opening on each side. */
export const framedWindow = (
  b: BlueprintBuilder, r: Rect, side: Dir, at: number, y: number, width: number, height: number, kind: OpeningKind, lit = false, frame: BlockRef = 'trim',
): void => {
  b.opening(r, { side, at, y, width, height, kind, lit });
  for (let i = -1; i <= width; i++) {
    setOnWall(b, r, side, at + i, y + height, frame);
    setOnWall(b, r, side, at + i, y - 1, 'wallBase');
  }
};

/** Sets a cell of a rectangle's wall: `t` along the wall from its start, on row y. */
export const setOnWall = (b: BlueprintBuilder, r: Rect, side: Dir, t: number, y: number, ref: BlockRef, state = 0): void => {
  switch (side) {
    case NORTH: b.set(r.x0 + t, y, r.z0, ref, state); break;
    case SOUTH: b.set(r.x0 + t, y, r.z1, ref, state); break;
    case WEST: b.set(r.x0, y, r.z0 + t, ref, state); break;
    default: b.set(r.x1, y, r.z0 + t, ref, state);
  }
};

/** Windows in every bay of a wall but those `skip` says no to. */
export const windowRow = (
  b: BlueprintBuilder, r: Rect, side: Dir, spacing: number, w: WindowSpec, skip: (bay: Bay, index: number, count: number) => boolean = () => false,
): void => {
  const all = bays(r, side, spacing);
  all.forEach((bay, i) => {
    if (!skip(bay, i, all.length)) bayWindow(b, r, bay, w);
  });
};

/** The bay closest to the middle of a wall. */
export const middleBay = (r: Rect, side: Dir, spacing: number): Bay => {
  const all = bays(r, side, spacing);
  const horizontal = side === NORTH || side === SOUTH;
  const mid = horizontal ? (r.x0 + r.x1) / 2 : (r.z0 + r.z1) / 2;
  return all.reduce((best, bay) => (Math.abs((bay.from + bay.to) / 2 - mid) < Math.abs((best.from + best.to) / 2 - mid) ? bay : best), all[0]);
};

// --- Roofs ---------------------------------------------------------------------------------------------------------

export type RoofKind = 'hip' | 'gable-x' | 'gable-z' | 'hip-gable';

export interface RoofSpec {
  kind: RoofKind;
  profile?: RoofProfile;
  tips?: number;
  gableWall?: BlockRef;
}

/** The profile that suits a roof across `span` blocks of wall: the flare needs room to curve. */
export const profileFor = (wallSpan: number, deep = false): RoofProfile => (wallSpan < 6 ? FLARED_TIGHT : deep && wallSpan >= 11 ? FLARED_DEEP : FLARED);

/**
 * How far to turn the eave corners up for a roof over `walls`: a pagoda's corners rise higher the bigger the roof, 1.5
 * blocks on a narrow house to 2.5 on a broad one, and sweep along the eave (`cornerTips`).
 */
export const tipsFor = (walls: Rect): number => {
  const span = Math.min(walls.x1 - walls.x0, walls.z1 - walls.z0) + 1;
  return span >= 12 ? 5 : span >= 8 ? 4 : 3;
};

export const roofOver = (b: BlueprintBuilder, walls: Rect, plateY: number, spec: RoofSpec): RoofInfo => {
  const profile = spec.profile ?? FLARED;
  const opts = { profile, tips: spec.tips ?? 2, gableWall: spec.gableWall };
  switch (spec.kind) {
    case 'hip': return b.hip(walls, plateY, opts);
    case 'gable-x': return b.gable(walls, plateY, { ...opts, axis: 'x' });
    case 'gable-z': return b.gable(walls, plateY, { ...opts, axis: 'z' });
    default: return b.hipGable(walls, plateY, opts);
  }
};

/**
 * A lean-to roof over the shop front or a porch, against the wall of `r` on `side` and along `from` to `to`: `depth`
 * 2 or 3 blocks out, a stair against the wall at row `y`, a stair a row lower and then a lifted lip of slab on the
 * outside (the eave of the shop fronts in the pictures). `posts` holds the lip up with a post every few blocks, down to
 * `postFrom`.
 */
export const pent = (
  b: BlueprintBuilder, r: Rect, side: Dir, from: number, to: number, y: number, depth = 3,
  options: { postFrom?: number; postEvery?: number; lanterns?: boolean } = {},
): void => {
  const horizontal = side === NORTH || side === SOUTH;
  const edge = side === NORTH ? r.z0 : side === SOUTH ? r.z1 : side === WEST ? r.x0 : r.x1;
  const at = (t: number, d: number): [number, number] => (horizontal ? [t, edge + DZ[side] * d] : [edge + DX[side] * d, t]);
  const face = opposite(side);
  for (let t = from; t <= to; t++) {
    for (let d = 1; d <= depth; d++) {
      const [x, z] = at(t, d);
      if (d === depth) b.set(x, y - (depth - 2), z, 'roofSlab', 1);
      else b.stair(x, y - (depth - 1 - d), z, face, 'roofStairs');
    }
  }
  if (options.postFrom !== undefined) {
    const every = options.postEvery ?? 3;
    for (let t = from; t <= to; t++) {
      if ((t - from) % every !== 0 && t !== to) continue;
      const [x, z] = at(t, depth);
      b.column(x, z, options.postFrom, y - (depth - 2) - 1, 'post');
    }
  }
  if (options.lanterns) {
    const every = options.postEvery ?? 3;
    for (let t = from + 1; t < to; t += 3) {
      // A lantern over a post would hang from its top and light nothing below: the lips of the roof between the posts carry them.
      if (options.postFrom !== undefined && ((t - from) % every === 0 || t === to)) continue;
      const [x, z] = at(t, depth);
      b.set(x, y - (depth - 2) - 1, z, 'light');
    }
  }
};

// --- Floors and stairs ---------------------------------------------------------------------------------------------

/** The cells a straight stair covers, from its foot at (x, z) climbing towards `dir`, `rise` blocks to the next floor. */
export const stairRun = (x: number, z: number, dir: Dir, rise: number): Array<[number, number]> =>
  Array.from({ length: rise }, (_, k) => [x + DX[dir] * k, z + DZ[dir] * k] as [number, number]);

/** A "door" that is really a stair's end or step: the furnisher keeps the cells round it free instead of treating it as an entrance. */
export interface StairDoor { x: number; z: number; inward: Dir; stair: boolean }

/**
 * The cells furniture must leave alone round a stair, as the "doors" `room` and `furnish` understand: the landing in front of
 * the foot, the run itself, and the landing at the top, which on the upper floor is just past the last step.
 */
export const stairDoors = (x: number, z: number, dir: Dir, rise: number): StairDoor[] => {
  const out: StairDoor[] = [];
  // The two ends are real doors: the landing the stair is climbed from and the one it arrives on stay joined to the rest of the
  // room (a counter or a shelf may never seal a stair off). The cells between are only kept clear.
  for (let k = -1; k <= rise + 1; k += 2) out.push({ x: x + DX[dir] * k, z: z + DZ[dir] * k, inward: dir, stair: k > -1 && k + 2 <= rise + 1 });
  return out;
};

/** The direction from one cell to a neighbouring cell. */
const dirBetween = (a: readonly [number, number], b: readonly [number, number]): Dir =>
  b[0] > a[0] ? EAST : b[0] < a[0] ? WEST : b[1] > a[1] ? SOUTH : NORTH;

/**
 * A wooden stair up a path of adjacent cells, one step in every cell, from floor row `floorY` up `path.length` rows to
 * the next floor: each stair climbs towards the next cell of the path, the last one the way the one before it did. The floor
 * above is carved open over the run and a block above it, so there is headroom. Build the floors and rooms first and this
 * last, so nothing lays a floor over the stairwell. A straight path is a flight; one that turns a corner is a spiral for a tower.
 */
export const stairPath = (b: BlueprintBuilder, path: ReadonlyArray<readonly [number, number]>, floorY: number): void => {
  const rise = path.length;
  path.forEach(([cx, cz], k) => {
    b.stair(cx, floorY + 1 + k, cz, climbFacing(path, k), WOOD_STAIRS);
    for (let y = floorY + 2 + k; y <= floorY + rise + 1; y++) b.carve(cx, y, cz);
  });
};

/** The way the stair at index k of a path climbs: towards the next cell, the last one as the one before it. */
const climbFacing = (path: ReadonlyArray<readonly [number, number]>, k: number): Dir => {
  const n = path.length;
  if (n < 2) return SOUTH;
  return k + 1 < n ? dirBetween(path[k], path[k + 1]) : dirBetween(path[k - 1], path[k]);
};

/** The "doors" that keep furniture off a stair path (see `stairDoors`). */
export const pathDoors = (path: ReadonlyArray<readonly [number, number]>): StairDoor[] =>
  path.map((c, k) => ({ x: c[0], z: c[1], inward: climbFacing(path, k), stair: k > 0 && k < path.length - 1 }));

/** A straight run of `rise` cells from (x, z) towards `dir`. */
export const straightPath = (x: number, z: number, dir: Dir, rise: number): Array<[number, number]> => stairRun(x, z, dir, rise);

/** A wooden stair along a straight run: `stairPath` over `straightPath`. */
export const staircase = (b: BlueprintBuilder, x: number, z: number, dir: Dir, floorY: number, rise: number): Array<[number, number]> => {
  const path = stairRun(x, z, dir, rise);
  stairPath(b, path, floorY);
  return path;
};

// --- Furnishing ------------------------------------------------------------------------------------------------------

export type RoomKind = 'living' | 'sleeping' | 'kitchen' | 'shop' | 'hall' | 'store' | 'forge' | 'weaving' | 'study' | 'barracks' | 'lobby' | 'empty';

/** What the interior furnisher calls each of the kits' room kinds ('empty' is left bare). */
const FURNISHED_AS = {
  living: 'living', sleeping: 'bedroom', kitchen: 'kitchen', shop: 'shop', hall: 'inn', store: 'storage',
  forge: 'forge', weaving: 'weaving', study: 'study', barracks: 'barracks', lobby: 'lobby',
} as const;

/**
 * Furniture for a room by what it is for, from the interior furnisher (worldgen/tempest/interiors): a hearth and low tables,
 * futons, counters with goods, shelves, lanterns hung from the ceiling. The doors and stairs stay clear, and the generator is
 * forked from the builder's by where the room is, so the same lot always gets the same rooms.
 */
export const furnishRoom = (b: BlueprintBuilder, room: Room, kind: RoomKind, options: { tatami?: boolean; lamp?: boolean; keepClear?: readonly Rect[] } = {}): void => {
  if (kind === 'empty') return;
  const rng = b.rng.fork(hash2(room.rect.x0 * 131 + room.rect.z0, room.floorY, 0x1f7a));
  // A stair's cells are not entrances: the stair, its landings and the cell on each side of the run stay free, and only the real doors steer the room.
  const r = room.rect;
  const inside = (d: { x: number; z: number }): boolean => d.x >= r.x0 && d.x <= r.x1 && d.z >= r.z0 && d.z <= r.z1;
  // (an end of a stair that lies in the wall, past the room, has no cell of the room to keep joined)
  const doors = room.doors.filter((d) => !d.stair && inside(d));
  const keepClear: Rect[] = [...(options.keepClear ?? [])];
  for (const d of room.doors) {
    if (!d.stair) continue;
    for (const k of [-1, 0, 1]) keepClear.push({ x0: d.x + DX[d.inward] * k, z0: d.z + DZ[d.inward] * k, x1: d.x + DX[d.inward] * k, z1: d.z + DZ[d.inward] * k });
  }
  furnish(b.bp, { rect: room.rect, floorY: room.floorY, doors, keepClear }, FURNISHED_AS[kind], rng, b.style);
  if (options.lamp) b.furnish(room, [{ block: 'light', count: 1, where: 'wall' }]);
};

// --- Street life -----------------------------------------------------------------------------------------------------

/** A planter box: a timber frame of soil under ferns or flowers, `cells` along x or z. */
export const planter = (b: BlueprintBuilder, x: number, y: number, z: number, length = 1, axis: 'x' | 'z' = 'x'): void => {
  const flowers = [NatureBlock.WILDFLOWER_WHITE, NatureBlock.WILDFLOWER_PINK, NatureBlock.FERN, NatureBlock.WILDFLOWER_BLUE];
  for (let i = 0; i < length; i++) {
    const cx = axis === 'x' ? x + i : x;
    const cz = axis === 'z' ? z + i : z;
    b.set(cx, y, cz, NatureBlock.MOSS);
    b.set(cx, y + 1, cz, flowers[(cx * 3 + cz * 5) & 3]);
  }
};

/** A little barrel stack: barrels, a crate, a bucket, standing on row y. */
export const goodsAt = (b: BlueprintBuilder, x: number, y: number, z: number, pick: number): void => {
  switch (pick % 5) {
    case 0: b.set(x, y, z, T.BARREL); break;
    case 1: b.set(x, y, z, T.CRATE); b.set(x, y + 1, z, T.BUCKET); break;
    case 2: b.set(x, y, z, T.RICE_BALE); break;
    case 3: b.set(x, y, z, T.BARREL); b.set(x, y + 1, z, T.VASE); break;
    default: b.set(x, y, z, T.CRATE); break;
  }
};

/** A blade sign hung from a bracket that sticks out of the wall cell (x, y, z) towards `side`. */
export const hangingSign = (b: BlueprintBuilder, x: number, y: number, z: number, side: Dir): void => {
  b.set(x, y, z, 'beam');
  const sx = x + DX[side];
  const sz = z + DZ[side];
  b.set(sx, y, sz, 'beam');
  b.signboard(sx, y - 1, sz, side === NORTH || side === SOUTH ? 'z' : 'x');
};

/** A chimney stack of mossy stone running through a roof: stands on `y0`, ends above `top` under a slab cap. */
export const chimneyStack = (b: BlueprintBuilder, x: number, z: number, y0: number, top: number): void => {
  b.column(x, z, y0, top, 'stone');
  b.set(x, top + 1, z, 'stoneSlab', 0);
};

/** A lantern hung on a short fence-post bracket from the wall cell next to (x, y, z): the post at (x, y, z), the lantern under it. */
export const lanternBracket = (b: BlueprintBuilder, x: number, y: number, z: number, lantern: BlockRef = 'light'): void => {
  b.set(x, y, z, 'fence');
  b.set(x, y - 1, z, lantern);
};

/**
 * Timber brackets under the eave: a short beam outside the wall at the plate row at every post, the stubs of the beams
 * that carry the roof. They stand under the first ring of the roof, so only walls whose eave comes down to the plate row
 * (the long sides of a gable, every side of a hip) should be given any.
 */
export const eaveBrackets = (b: BlueprintBuilder, r: Rect, plateY: number, sides: readonly Dir[], spacing: number): void => {
  for (const side of sides) {
    const horizontal = side === NORTH || side === SOUTH;
    const [a, z] = horizontal ? [r.x0, r.x1] : [r.z0, r.z1];
    const edge = side === NORTH ? r.z0 : side === SOUTH ? r.z1 : side === WEST ? r.x0 : r.x1;
    for (const p of postCoords(a, z, spacing)) {
      const x = horizontal ? p : edge + DX[side];
      const zz = horizontal ? edge + DZ[side] : p;
      b.setIfEmpty(x, plateY, zz, 'beam');
    }
  }
};

// --- Garden pieces -----------------------------------------------------------------------------------------------------

/** A bench of three plank slabs along x or z, seat height half a block above the ground row. */
export const bench = (b: BlueprintBuilder, x: number, z: number, axis: 'x' | 'z' = 'x', y = 1): void => {
  for (let i = 0; i < 3; i++) b.set(axis === 'x' ? x + i : x, y, axis === 'z' ? z + i : z, WOOD_SLAB, 0);
};

/**
 * A small arched bridge of mossy stone along `axis` from (x, z), `len` blocks long and `width` wide: a stair up at each end
 * and full blocks between, so the crown is a block above the ground row. The rail is a low fence on both edges.
 */
export const gardenBridge = (b: BlueprintBuilder, x: number, z: number, len: number, axis: 'x' | 'z', width = 1, y = 1): void => {
  for (let w = 0; w < width; w++) {
    for (let i = 0; i < len; i++) {
      const cx = axis === 'x' ? x + i : x + w;
      const cz = axis === 'z' ? z + i : z + w;
      if (i === 0) b.stair(cx, y, cz, axis === 'x' ? EAST : SOUTH, 'stoneStairs');
      else if (i === len - 1) b.stair(cx, y, cz, axis === 'x' ? WEST : NORTH, 'stoneStairs');
      else {
        b.set(cx, y, cz, 'stone');
        if (w === 0 || w === width - 1) b.set(cx, y + 1, cz, 'rail');
      }
    }
  }
};

/** A boulder: a lump of mossy stone one or two blocks high with a smaller one beside it. */
export const boulder = (b: BlueprintBuilder, x: number, z: number, size = 2, y = 1): void => {
  b.set(x, y, z, 'stone');
  if (size >= 2) b.set(x, y + 1, z, 'stoneSlab', 0);
  b.set(x + 1, y, z, 'stoneSlab', 0);
  if (size >= 3) b.set(x, y, z + 1, 'stone');
};

export const mirrorX = (bp: Blueprint, width: number): Blueprint => bp.mirrored('x').translated(width - 1, 0, 0);

/** A path of paving over the ground row, along a line, `width` cells wide. */
export const pavedPath = (b: BlueprintBuilder, x0: number, z0: number, x1: number, z1: number, width: number, role: 'path' | 'pathAlt' = 'path'): void => {
  const horizontal = z0 === z1;
  const half = Math.floor((width - 1) / 2);
  for (let t = horizontal ? Math.min(x0, x1) : Math.min(z0, z1); t <= (horizontal ? Math.max(x0, x1) : Math.max(z0, z1)); t++) {
    for (let w = -half; w < width - half; w++) {
      if (horizontal) b.set(t, 0, z0 + w, role);
      else b.set(x0 + w, 0, t, role);
    }
  }
};

export { turnLeft, turnRight, opposite, FLARED, FLARED_DEEP, FLARED_TIGHT };
