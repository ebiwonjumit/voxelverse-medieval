import { TempestBlock as T } from '../../../content/blocksTempest';
import { ShapedBlock } from '../../../content/blocksShaped';
import { NatureBlock } from '../../../content/blocksNature';
import { BlockType } from '../../../worldConstants';
import { BlueprintBuilder, BlockRef, Dir, DX, DZ, EAST, NORTH, Rect, SOUTH, WEST, opposite, rect } from '../../structures/BlueprintBuilder';

// Pieces the landmarks share: round and straight things drawn over and over, so each landmark reads as a sentence of
// them. Nothing here knows a layout position; every helper takes cells in the blueprint's frame.

/** Blocks the landmarks use that no style role covers: the plain stone of walls, steps and seating, sand, wood. */
export const STONE = {
  brick: BlockType.STONE_BRICK,
  brickSlab: ShapedBlock.STONE_BRICK_SLAB,
  brickStairs: ShapedBlock.STONE_BRICK_STAIRS,
  cobble: BlockType.COBBLESTONE,
  cobbleSlab: ShapedBlock.COBBLESTONE_SLAB,
  cobbleStairs: ShapedBlock.COBBLESTONE_STAIRS,
  mossyCobble: BlockType.MOSSY_COBBLESTONE,
  granite: NatureBlock.GRANITE,
  gravel: NatureBlock.GRAVEL,
  moss: NatureBlock.MOSS,
  basalt: BlockType.BASALT,
  sand: BlockType.SAND,
  dirt: BlockType.DIRT,
  grass: BlockType.GRASS,
  water: BlockType.WATER,
  stone: BlockType.STONE,
} as const;

export const WOOD = {
  plank: BlockType.WOOD_PLANK,
  plankSlab: ShapedBlock.WOOD_PLANK_SLAB,
  plankStairs: ShapedBlock.WOOD_PLANK_STAIRS,
  dark: BlockType.DARK_PLANK,
  darkSlab: ShapedBlock.DARK_PLANK_SLAB,
  darkStairs: ShapedBlock.DARK_PLANK_STAIRS,
  log: BlockType.WOOD_LOG,
  cedarLog: NatureBlock.CEDAR_LOG,
  fence: BlockType.WOOD_FENCE,
} as const;

export const TOP = 1; // a slab's state for the upper half

/** A deterministic value in [0, 1) from two integers and a salt: for the roughness of rock and ground, where a generator's order must not matter. */
export const hash01 = (x: number, y: number, salt = 0): number => {
  let h = Math.imul(x | 0, 0x1b873593) ^ Math.imul(y | 0, 0xcc9e2d51) ^ Math.imul(salt | 0, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

// --- Shapes on the plan -----------------------------------------------------------------------------------------------

/** Calls `fn` for every cell whose centre is within `r` of (cx, cz), with its distance. */
export const disc = (cx: number, cz: number, r: number, fn: (x: number, z: number, d: number) => void): void => {
  const lo = Math.floor(cx - r);
  const hi = Math.ceil(cx + r);
  const loz = Math.floor(cz - r);
  const hiz = Math.ceil(cz + r);
  for (let z = loz; z <= hiz; z++) {
    for (let x = lo; x <= hi; x++) {
      const d = Math.hypot(x - cx, z - cz);
      if (d <= r + 1e-9) fn(x, z, d);
    }
  }
};

/** Calls `fn` for the cells with distance in (r0, r1] from the centre. */
export const annulus = (cx: number, cz: number, r0: number, r1: number, fn: (x: number, z: number, d: number) => void): void =>
  disc(cx, cz, r1, (x, z, d) => { if (d > r0) fn(x, z, d); });

/** Angle of a cell about a centre in turns, 0 at east, increasing towards south, in [0, 1). */
export const turnsOf = (cx: number, cz: number, x: number, z: number): number => {
  const a = Math.atan2(z - cz, x - cx) / (2 * Math.PI);
  return a < 0 ? a + 1 : a;
};

/** A cell on a circle: `n` equally spaced points of radius r from angle `start` (turns). Duplicate cells are dropped. */
export const circlePoints = (cx: number, cz: number, r: number, n: number, start = 0): Array<[number, number, number]> => {
  const out: Array<[number, number, number]> = [];
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    const t = start + i / n;
    const x = Math.round(cx + r * Math.cos(t * 2 * Math.PI));
    const z = Math.round(cz + r * Math.sin(t * 2 * Math.PI));
    const k = `${x},${z}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push([x, z, t]);
  }
  return out;
};

export const inflate = (r: Rect, n: number): Rect => ({ x0: r.x0 - n, z0: r.z0 - n, x1: r.x1 + n, z1: r.z1 + n });
export const widthOf = (r: Rect): number => r.x1 - r.x0 + 1;
export const depthOf = (r: Rect): number => r.z1 - r.z0 + 1;
export const centreX = (r: Rect): number => Math.floor((r.x0 + r.x1) / 2);
export const centreZ = (r: Rect): number => Math.floor((r.z0 + r.z1) / 2);

/**
 * The cells of a closed ring about a centre, joined face to face (a fence along it has no gaps): every cell of the disc of
 * radius r that has a neighbour, diagonals included, outside it.
 */
export const ringCells = (cx: number, cz: number, r: number): Array<[number, number]> => {
  const inside = (x: number, z: number): boolean => Math.hypot(x - cx, z - cz) <= r;
  const out: Array<[number, number]> = [];
  disc(cx, cz, r, (x, z) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!inside(x + dx, z + dz)) { out.push([x, z]); return; }
  });
  return out;
};

/** The cell one step along a direction. */
export const step = (x: number, z: number, d: Dir, n = 1): [number, number] => [x + DX[d] * n, z + DZ[d] * n];

/**
 * The shape of a round arch on a grid, a cell at a time. `dx` is the cell's offset from the arch's middle, `rel` its row above
 * the springing line (the rows up to 0 are the straight sides) and `half` half the span: the opening narrows by a cell a row,
 * and in each row the cell just outside the opening is where an upside-down stair goes, its tall back to the outside, so the
 * corner is cut. Beyond that the wall is solid.
 */
export const archCell = (dx: number, rel: number, half: number): 'open' | 'stair' | 'solid' => {
  const a = Math.abs(dx);
  const w = rel <= 0 ? half : half - rel;
  if (a <= w) return 'open';
  if (rel > 0 && rel <= half && a === w + 1) return 'stair';
  return 'solid';
};

// --- Light and street furniture ---------------------------------------------------------------------------------------

/** A line of bollards along x or z, every `every` cells, skipping the cells listed. */
export const bollardLine = (b: BlueprintBuilder, x0: number, z0: number, x1: number, z1: number, y: number, every = 2, skip: ReadonlyArray<number> = []): void => {
  const along = z0 === z1 ? 'x' : 'z';
  const a = along === 'x' ? Math.min(x0, x1) : Math.min(z0, z1);
  const c = along === 'x' ? Math.max(x0, x1) : Math.max(z0, z1);
  for (let t = a; t <= c; t += every) {
    if (skip.includes(t)) continue;
    b.set(along === 'x' ? t : x0, y, along === 'x' ? z0 : t, T.STONE_BOLLARD);
  }
};

/** A slim street lamp: a bamboo mast, a rail arm out to `arm` and a red lantern hanging under its end. `y` is the first row of the mast. */
export const streetLamp = (b: BlueprintBuilder, x: number, y: number, z: number, arm: Dir = SOUTH, height = 4, lamp: BlockRef = 'light'): void => {
  b.column(x, z, y, y + height - 1, T.BAMBOO_POLE);
  b.set(x, y + height, z, 'rail');
  b.set(x + DX[arm], y + height, z + DZ[arm], 'rail');
  b.set(x + DX[arm], y + height - 1, z + DZ[arm], lamp);
};

/** A post carrying a glowing lump of ore, blue or green. */
export const oreLamp = (b: BlueprintBuilder, x: number, y: number, z: number, height = 3, green = false): void => {
  b.column(x, z, y, y + height - 1, 'post');
  b.set(x, y + height, z, green ? T.GREEN_ORE_LAMP : T.BLUE_ORE_LAMP);
};

/** A flag or banner: cloth hanging down from y, `length` cells, in the plane along x or z. */
export const banner = (b: BlueprintBuilder, x: number, y: number, z: number, length: number, axis: 'x' | 'z', cloth: BlockRef = T.NOREN_RED): void => {
  for (let k = 0; k < length; k++) b.set(x, y - k, z, cloth, axis === 'x' ? 0 : 1);
};

/** A bench of upright half blocks: a slab seat on two end blocks. `axis` is the way it runs. */
export const bench = (b: BlueprintBuilder, x: number, y: number, z: number, len: number, axis: 'x' | 'z', slab: number = WOOD.darkSlab): void => {
  for (let i = 0; i < len; i++) {
    const cx = axis === 'x' ? x + i : x;
    const cz = axis === 'z' ? z + i : z;
    b.set(cx, y, cz, slab, 0);
    if (i === 0 || i === len - 1) b.set(cx, y - 1, cz, 'wallBase');
  }
};

/** Marks a room by a standing cell near its middle that nothing stands in, so a test can walk there. */
export const markRoom = (b: BlueprintBuilder, r: Rect, floorY: number, tag: string): void => {
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (let z = r.z0; z <= r.z1; z++) {
    for (let x = r.x0; x <= r.x1; x++) {
      if (b.bp.solid(x, floorY + 1, z) || b.bp.solid(x, floorY + 2, z)) continue;
      const d = Math.hypot(x - cx, z - cz);
      if (d < bestD) { bestD = d; best = [x, z]; }
    }
  }
  if (best) b.mark({ kind: 'room', x: best[0], y: floorY + 1, z: best[1], tag });
};

// --- Walls ------------------------------------------------------------------------------------------------------------

/**
 * A garden wall along x or z: a stone footing, a plaster body and a tile cap, with a post every `spacing` cells. `y` is the
 * ground row (the footing lies at y + 1), `height` counts the body.
 */
export const wallRun = (
  b: BlueprintBuilder, x0: number, z0: number, x1: number, z1: number, y: number, height: number,
  options: { spacing?: number; footing?: BlockRef; body?: BlockRef; cap?: boolean } = {},
): void => {
  if (x0 !== x1 && z0 !== z1) throw new RangeError('A wall runs along x or along z');
  const { spacing = 5, footing = 'wallBase', body = 'wall', cap = true } = options;
  const axis = z0 === z1 ? 'x' : 'z';
  const a = axis === 'x' ? Math.min(x0, x1) : Math.min(z0, z1);
  const c = axis === 'x' ? Math.max(x0, x1) : Math.max(z0, z1);
  for (let t = a; t <= c; t++) {
    const x = axis === 'x' ? t : x0;
    const z = axis === 'z' ? t : z0;
    b.set(x, y + 1, z, footing);
    for (let k = 2; k <= height; k++) b.set(x, y + k, z, body);
    if (cap) b.set(x, y + height + 1, z, 'roofSlab', 0);
    if ((t - a) % spacing === 0 || t === c) for (let k = 2; k <= height; k++) b.set(x, y + k, z, 'post');
  }
};

// --- Trees and gardens ------------------------------------------------------------------------------------------------

/** Marks a place for a tree, the way the kits do: the zone grows it with its own tree features. */
export const tree = (b: BlueprintBuilder, x: number, z: number, species: 'sakura' | 'cedar' | 'bamboo' | 'any' = 'any', y = 1): void => {
  b.treeSpot(x, z, species, y);
};

/**
 * A sakura built into the blueprint: a trunk and a rounded crown of pink leaves, a little different for each seed. `y` is the
 * ground row; the trunk starts above it.
 */
export const sakura = (b: BlueprintBuilder, x: number, z: number, y = 0, height = 4): void => {
  for (let k = 1; k <= height; k++) b.set(x, y + k, z, NatureBlock.SAKURA_LOG);
  const layers = [2, 3, 3, 2, 1];
  layers.forEach((r, i) => {
    const cy = y + height - 1 + i;
    disc(x, z, r + 0.2, (cx, cz, d) => {
      // Ragged edge: the outermost ring loses some cells, by a hash of the position, so every crown is its own.
      if (d > r - 0.4 && ((cx * 7 + cz * 13 + cy * 5 + b.rng.int(3)) & 3) === 0) return;
      b.setIfEmpty(cx, cy, cz, NatureBlock.SAKURA_LEAVES);
    });
  });
};

/** A cedar: a tall trunk and a narrow cone of dark leaves. */
export const cedar = (b: BlueprintBuilder, x: number, z: number, y = 0, height = 7): void => {
  for (let k = 1; k <= height; k++) b.set(x, y + k, z, NatureBlock.CEDAR_LOG);
  const layers = [3, 3, 2, 2, 1, 1, 0];
  layers.forEach((r, i) => {
    const cy = y + height - 4 + i + 1;
    disc(x, z, r + 0.1, (cx, cz) => b.setIfEmpty(cx, cy, cz, NatureBlock.CEDAR_LEAVES));
  });
};

/** A low hedge or flower bed cell: moss with a flower on it, from a handful of the wilderness plants. */
export const FLOWERS: readonly number[] = [
  NatureBlock.WILDFLOWER_BLUE, NatureBlock.WILDFLOWER_WHITE, NatureBlock.WILDFLOWER_PINK, NatureBlock.WILDFLOWER_PURPLE,
];

// --- Re-exports the landmarks lean on --------------------------------------------------------------------------------

export { EAST, NORTH, SOUTH, WEST, opposite, rect };
