import { Rng, hash2 } from '../noise';
import { Lot, NO_NEIGHBOUR, NeighbourInfo } from '../structures/Lot';
import { StylePack } from '../structures/StylePack';
import {
  BLOCKS, Block, Facing, LANDMARKS, Landmark, ROADS, RoadSegment, TEMPEST_CENTER_X, TEMPEST_CENTER_Z, TEMPEST_GROUND, blockAt, inBlock, inShape,
  localX, localZ, roadAt, sectorOfBlock, shapeBounds, worldZ,
} from './layout';
import { TEMPEST_STYLE } from './style';
import { Lean, TreeKind } from './trees';

// The district planner: it turns the layout of the town (worldgen/tempest/layout.ts, the owner's Tempest-6 plan) into the
// things a zone stamps: the lots every block is cut into, a street tree wherever two lots meet, a lamp post along the
// streets, and the lot of each landmark. Everything is a pure function of the world seed, so a worker and the main thread
// plan the same town, and a chunk that asks for a lot gets the same lot whichever chunk is generated first.
//
// A block (38 by 38 cells) is cut from its edges inwards: a verge one cell wide all round (street trees, a paved edge in
// the busy districts), then rows of lots facing the streets, and what is left in the middle is a courtyard garden. How a
// block is cut depends on its district (see `layoutStyle`): dense blocks get a ring of small lots round a courtyard or two
// deep rows, the large-lot districts get long plots or four big ones in a pinwheel, and the tourism sector a few big plots
// with parks and meadows between them. The result is varied (widths are jittered, kinds and storeys differ) and always
// regular enough to read as a planned grid.

/** What stands on a lot: a building from a kit, or one of the planner's own fillers. */
export type LotKind = 'building' | 'garden' | 'park' | 'meadow' | 'construction';

export interface PlannedLot {
  /** Position in `planner.lots`. */
  index: number;
  lot: Lot;
  kind: LotKind;
  /** The block it stands in, `c-2r3` style. */
  block: string;
  /** The plan's sector (layout.ts `SECTORS`). */
  sector: string;
}

export interface PlannedLandmark {
  index: number;
  landmark: Landmark;
  /** A lot over the landmark's bounding rectangle, with its id, facing and a ground height. */
  lot: Lot;
}

/** Something small stood on the street that is not a lot: a market stall on the boundary road. Built by the kit of that name. */
export interface PlannedProp {
  index: number;
  kit: string;
  lot: Lot;
}

export interface TreeSpot { x: number; z: number; kind: TreeKind; variant: number; lean: Lean }
export interface LampSpot { x: number; z: number; /** The side of the street the arm reaches towards. */ toward: Facing; striped: boolean }

export interface PlannerOptions {
  seed: number;
  /** The style the lots' palette families are drawn from (default the Tempest pack). */
  style?: StylePack;
  /** Ground height of a world position, for the landmarks' lots (default the town's flat ground). */
  groundAt?: (x: number, z: number) => number;
}

// --- The raster -------------------------------------------------------------------------------------------------------
// Roads, blocks and lots are looked up by cell all the time (every column of every chunk), so the built grid is rasterised
// once: three flat arrays over local -216..216 in both directions. A lookup is one array read.

const RADIUS = 216;
const SIDE = 2 * RADIUS + 1;
const X_BASE = TEMPEST_CENTER_X - RADIUS;
const Z_BASE = TEMPEST_CENTER_Z - RADIUS;

/** Width of the verge between a block's edge and its lots. */
export const VERGE = 1;
/** The smallest lot the planner makes, along either side. */
const MIN_LOT = 8;

const FAMILY_TRIES = 3;
/** The ordinary house (terracotta under dark timber): it may stand beside itself, the accent palettes may not. */
const BASE_FAMILY = 'timber-terracotta';
/** The chance that a lot given an accent palette gets the ordinary house instead, by district: the grander districts keep more accents. */
const BASE_BIAS: Record<string, number> = { residential: 0.55, commercial: 0.5, production: 0.5, storage: 0.3, public: 0.3, tourism: 0.3, government: 0.2, luxury: 0.15, guest: 0.15, civic: 0 };

type Plot = { x: number; z: number; w: number; d: number; facing: Facing; row: string };

/** Splits a length into pieces between `min` and `max` of about `avg`, with jittered boundaries. */
export const splitLength = (len: number, avg: number, min: number, max: number, rng: Rng): number[] => {
  let n = Math.max(1, Math.round(len / avg));
  while (n > 1 && len / n < min) n--;
  // Too long for one piece: split, unless the halves would be too short (then one piece a little over the limit is better).
  while (len / n > max && len / (n + 1) >= min) n++;
  const base = Math.floor(len / n);
  const sizes = Array.from({ length: n }, (_, i) => base + (i < len - base * n ? 1 : 0));
  for (let i = 0; i + 1 < n; i++) {
    const delta = rng.int(5) - 2;
    if (sizes[i] + delta >= min && sizes[i] + delta <= max && sizes[i + 1] - delta >= min && sizes[i + 1] - delta <= max) {
      sizes[i] += delta;
      sizes[i + 1] -= delta;
    }
  }
  return sizes;
};

type LayoutStyle = 'ring' | 'rows' | 'single' | 'quad' | 'column';

const layoutStyle = (b: Block, w: number, h: number, rng: Rng): LayoutStyle => {
  if (w < 24) return 'column';
  const r = rng.next();
  switch (b.district) {
    case 'residential': return w >= 34 && h >= 34 && r < 0.6 ? 'ring' : 'rows';
    case 'commercial': case 'production': return r < 0.25 && w >= 34 && h >= 34 ? 'ring' : 'rows';
    case 'storage': case 'government': return 'rows';
    case 'tourism': return b.density === 'empty' ? 'single' : r < 0.2 ? 'single' : r < 0.55 ? 'rows' : 'quad';
    case 'luxury': return b.density === 'empty' ? 'quad' : r < 0.55 ? 'rows' : r < 0.85 ? 'quad' : 'single';
    case 'guest': return r < 0.5 ? 'rows' : 'quad';
    case 'public': return r < 0.7 ? 'rows' : 'single';
    default: return 'rows';
  }
};

const avgFrontage = (b: Block): [number, number, number] => {
  if (b.lotSize === 'small') return [12, 9, 16];
  if (b.lotSize === 'medium') return [18, 13, 26];
  return [22, 15, 36];
};

/** True where a lot may not stand: a road, or the ground of a lot already planned (a diagonal's staircase). */
type Blocked = (x: number, z: number) => boolean;
const NEVER: Blocked = () => false;

/** The runs of consecutive integers in lo..hi for which `free` holds. */
const runs = (lo: number, hi: number, free: (t: number) => boolean): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  let start = -1;
  for (let t = lo; t <= hi + 1; t++) {
    const ok = t <= hi && free(t);
    if (ok && start < 0) start = t;
    if (!ok && start >= 0) { out.push([start, t - 1]); start = -1; }
  }
  return out;
};

/** A row of lots along x at row z, `depth` deep: the stretches not blocked, cut into lots. */
const rowN = (x0: number, x1: number, z: number, depth: number, facing: Facing, row: string, b: Block, rng: Rng, blocked: Blocked): Plot[] => {
  const [avg, min, max] = avgFrontage(b);
  // A column is usable when it and its two neighbours are free over the lot's depth and the verge round it.
  const free = (x: number): boolean => {
    for (let zz = z - 1; zz <= z + depth; zz++) for (let xx = x - 1; xx <= x + 1; xx++) if (blocked(xx, zz)) return false;
    return true;
  };
  const out: Plot[] = [];
  for (const [a, c] of runs(x0, x1, free)) {
    if (c - a + 1 < MIN_LOT) continue;
    let x = a;
    for (const w of splitLength(c - a + 1, avg, min, max, rng)) { out.push({ x, z, w, d: depth, facing, row }); x += w; }
  }
  return out;
};

/** A column of lots along z at column x, `depth` wide. */
const colE = (z0: number, z1: number, x: number, depth: number, facing: Facing, row: string, b: Block, rng: Rng, blocked: Blocked): Plot[] => {
  const [avg, min, max] = avgFrontage(b);
  const free = (z: number): boolean => {
    for (let xx = x - 1; xx <= x + depth; xx++) for (let zz = z - 1; zz <= z + 1; zz++) if (blocked(xx, zz)) return false;
    return true;
  };
  const out: Plot[] = [];
  for (const [a, c] of runs(z0, z1, free)) {
    if (c - a + 1 < MIN_LOT) continue;
    let z = a;
    for (const d of splitLength(c - a + 1, avg, min, max, rng)) { out.push({ x, z, w: depth, d, facing, row }); z += d; }
  }
  return out;
};

/** The facing that looks at the avenue a block borders, for the blocks round the Central Square; null elsewhere. */
const towardAvenue = (b: Block): Facing | null => {
  if (b.col === 1) return 3;
  if (b.col === -1) return 1;
  if (b.row === 1) return 0;
  if (b.row === -1) return 2;
  return null;
};

/** Two deep rows facing the north and south streets. */
const rowsOf = (b: Block, ax0: number, ax1: number, az0: number, h: number, id: string, rng: Rng, blocked: Blocked): Plot[] => {
  const d1 = b.lotSize === 'large' ? Math.floor(h / 2) : 15 + rng.int(6);
  const d2 = h - d1;
  return [...rowN(ax0, ax1, az0, d1, 0, `${id}:n`, b, rng, blocked), ...rowN(ax0, ax1, az0 + d1, d2, 2, `${id}:s`, b, rng, blocked)];
};

/** A ring of small lots round a courtyard. */
const ringOf = (b: Block, ax0: number, ax1: number, az0: number, az1: number, id: string, rng: Rng, blocked: Blocked): Plot[] => {
  const d1 = 12 + rng.int(2), d2 = 12 + rng.int(2), dw = 12 + rng.int(2), de = 12 + rng.int(2);
  return [
    ...rowN(ax0, ax1, az0, d1, 0, `${id}:n`, b, rng, blocked),
    ...rowN(ax0, ax1, az1 - d2 + 1, d2, 2, `${id}:s`, b, rng, blocked),
    ...colE(az0 + d1, az1 - d2, ax0, dw, 3, `${id}:w`, b, rng, blocked),
    ...colE(az0 + d1, az1 - d2, ax1 - de + 1, de, 1, `${id}:e`, b, rng, blocked),
  ];
};

const planBlock = (b: Block, rng: Rng, crossed: boolean): Plot[] => {
  const ax0 = b.rect.x0 + VERGE, ax1 = b.rect.x1 - VERGE, az0 = b.rect.z0 + VERGE, az1 = b.rect.z1 - VERGE;
  const w = ax1 - ax0 + 1;
  const h = az1 - az0 + 1;
  const style = layoutStyle(b, w, h, rng);
  const id = b.id;
  if (crossed) {
    // A block with a diagonal street through it: a staircase of lots down each side of the street first, then rows along the
    // block's own edges wherever the diagonal and its lots leave room.
    const stair = diagonalPlots(b, rng);
    const blocked: Blocked = (x, z) => roadAt(x, z) !== null || stair.some((o) => x >= o.x - 1 && x < o.x + o.w + 1 && z >= o.z - 1 && z < o.z + o.d + 1);
    const edge = w >= 34 && h >= 34 && b.lotSize === 'small' ? ringOf(b, ax0, ax1, az0, az1, id, rng, blocked) : rowsOf(b, ax0, ax1, az0, h, id, rng, blocked);
    return [...stair, ...edge];
  }
  switch (style) {
    case 'ring': return ringOf(b, ax0, ax1, az0, az1, id, rng, NEVER);
    case 'rows': return rowsOf(b, ax0, ax1, az0, h, id, rng, NEVER);
    case 'single': {
      const facing = towardAvenue(b) ?? (rng.int(4) as Facing);
      return [{ x: ax0, z: az0, w, d: h, facing, row: `${id}:o` }];
    }
    case 'quad': {
      const w1 = Math.floor(w / 2) + rng.int(3) - 1, h1 = Math.floor(h / 2) + rng.int(3) - 1;
      return [
        { x: ax0, z: az0, w: w1, d: h1, facing: 0, row: `${id}:q0` },
        { x: ax0 + w1, z: az0, w: w - w1, d: h1, facing: 1, row: `${id}:q1` },
        { x: ax0 + w1, z: az0 + h1, w: w - w1, d: h - h1, facing: 2, row: `${id}:q2` },
        { x: ax0, z: az0 + h1, w: w1, d: h - h1, facing: 3, row: `${id}:q3` },
      ];
    }
    default: // an annex: one column of lots along the street, fronts to the compound's side
      return colE(az0, az1, ax0, w, b.col < 0 ? 1 : 3, `${id}:a`, b, rng, NEVER);
  }
};

/** Shrinks a plot from the end that sticks out of a clipped corner, until its corners lie inside the block (or it is too small). */
const fitPlot = (b: Block, p: Plot): Plot | null => {
  let { x, z, w, d } = p;
  const along = p.facing === 0 || p.facing === 2;
  for (let guard = 0; guard < 64; guard++) {
    // The corners, each moved one more cell outwards, so a verge is left beside the clipped corner too.
    const nw = inBlock(b, x - 1, z - 1), ne = inBlock(b, x + w, z - 1), se = inBlock(b, x + w, z + d), sw = inBlock(b, x - 1, z + d);
    if (nw && ne && se && sw) return { ...p, x, z, w, d };
    if ((along ? w : d) <= MIN_LOT) return null;
    const first = along ? !nw || !sw : !nw || !ne;
    if (along) { if (first) x++; w--; } else { if (first) z++; d--; }
  }
  return null;
};

const overlaps = (a: Plot, b: Plot, gap = 0): boolean => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.z < b.z + b.d + gap && b.z < a.z + a.d + gap;

/** True when a rectangle grown by the verge holds a road cell. */
const touchesRoad = (x: number, z: number, w: number, d: number): boolean => {
  for (let zz = z - 1; zz <= z + d; zz++) for (let xx = x - 1; xx <= x + w; xx++) if (roadAt(xx, zz)) return true;
  return false;
};

/**
 * Lots along a diagonal street: a staircase of small squares down each side, a lot every few cells, a corner towards the
 * street and the front to the nearer of the two axis streets it could face.
 */
const diagonalPlots = (b: Block, rng: Rng): Plot[] => {
  const out: Plot[] = [];
  const A = { x0: b.rect.x0 + VERGE, x1: b.rect.x1 - VERGE, z0: b.rect.z0 + VERGE, z1: b.rect.z1 - VERGE };
  for (const seg of ROADS) {
    const l = seg.line;
    if (seg.kind !== 'diagonal' || !l) continue;
    const dx = l.x1 - l.x0, dz = l.z1 - l.z0;
    const len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    for (const side of [1, -1]) {
      // The side's normal points away from the street; the lots face back towards it.
      const nx = -uz * side, nz = ux * side;
      const faceX = (nx < 0 ? 1 : 3) as Facing, faceZ = (nz < 0 ? 2 : 0) as Facing;
      for (let t = 0, n = 0; t < len; t += 1, n++) {
        const size = 9 + rng.int(3);
        const half = Math.floor(size / 2);
        // Stand the square as close to the street as the verge allows: the nearest corner (the normal is at 45 degrees) is
        // 2.5 + a verge + a little rounding from the centre-line, tried in steps until no road is within a cell of it.
        let plot: Plot | null = null;
        const facing = Math.abs(nx) > Math.abs(nz) + 0.01 ? faceX : Math.abs(nz) > Math.abs(nx) + 0.01 ? faceZ : n % 2 ? faceZ : faceX;
        for (let extra = 0.2; extra <= 3 && !plot; extra += 0.4) {
          const off = 2.5 + VERGE + extra + half * (Math.abs(nx) + Math.abs(nz));
          const cx = Math.round(l.x0 + ux * t + nx * off), cz = Math.round(l.z0 + uz * t + nz * off);
          const cand: Plot = { x: cx - half, z: cz - half, w: size, d: size, facing, row: `${b.id}:d${out.length}` };
          if (cand.x < A.x0 || cand.z < A.z0 || cand.x + cand.w - 1 > A.x1 || cand.z + cand.d - 1 > A.z1) continue;
          if (blockAt(cx, cz)?.id !== b.id) continue;
          const fitted = fitPlot(b, cand);
          if (!fitted || fitted.w !== cand.w || fitted.d !== cand.d || touchesRoad(cand.x, cand.z, cand.w, cand.d)) continue;
          plot = cand;
        }
        if (!plot) continue;
        if (out.some((o) => overlaps(plot, o, 1))) continue;
        out.push(plot);
        t += size - 2;
      }
    }
  }
  return out;
};

/** True when a diagonal street runs through the block. */
const crossedByDiagonal = (b: Block): boolean => {
  for (let z = b.rect.z0; z <= b.rect.z1; z += 2) for (let x = b.rect.x0; x <= b.rect.x1; x += 2) if (roadAt(x, z)?.kind === 'diagonal') return true;
  return false;
};

/** Fewest and most storeys a district builds; the fewest only counts in the middle of the town. */
const FLOORS_BY_DISTRICT: Record<string, [number, number]> = {
  civic: [2, 3], guest: [1, 2], government: [2, 3], public: [2, 3], luxury: [1, 2], commercial: [2, 3], production: [1, 2], storage: [1, 2],
  residential: [1, 3], tourism: [1, 3],
};

const chooseKind = (b: Block, rng: Rng): LotKind => {
  const r = rng.next();
  if (b.density === 'empty') return b.district === 'luxury' ? 'garden' : r < 0.5 ? 'meadow' : 'park';
  if (b.underConstruction && r < 0.55) return 'construction';
  switch (b.district) {
    case 'guest': return r < 0.22 ? 'park' : r < 0.27 ? 'garden' : 'building';
    case 'tourism': return r < 0.16 ? 'park' : r < 0.24 ? 'garden' : r < 0.28 ? 'meadow' : 'building';
    case 'luxury': return r < 0.12 ? 'garden' : 'building';
    case 'residential': return r < 0.05 ? 'garden' : 'building';
    case 'public': return r < 0.08 ? 'meadow' : 'building';
    default: return 'building';
  }
};

const floorsOf = (b: Block, x: number, z: number, rng: Rng): number => {
  const [lo, hi] = FLOORS_BY_DISTRICT[b.district] ?? [1, 2];
  // Two to three storeys in the centre, one to two near the forest edge: how likely a storey is depends on the distance from
  // the Central Square, in cells.
  const d = Math.max(Math.abs(localX(x)), Math.abs(localZ(z)));
  const centre = d < 80 ? 0.9 : d < 130 ? 0.5 : 0.12;
  const f = 1 + (rng.next() < 0.35 + 0.6 * centre ? 1 : 0) + (rng.next() < 0.6 * centre ? 1 : 0);
  return Math.max(d < 130 ? lo : 1, Math.min(f, hi));
};

export class DistrictPlanner {
  readonly seed: number;
  readonly lots: readonly PlannedLot[];
  readonly landmarkLots: readonly PlannedLandmark[];
  readonly props: readonly PlannedProp[];
  readonly trees: readonly TreeSpot[];
  readonly lamps: readonly LampSpot[];
  private readonly style: StylePack;
  private readonly roadRaster = new Uint8Array(SIDE * SIDE);
  private readonly blockRaster = new Uint8Array(SIDE * SIDE);
  private readonly lotRaster = new Int16Array(SIDE * SIDE);
  private readonly lampAtCell = new Map<number, LampSpot>();
  private readonly treeCells = new Map<number, TreeSpot[]>();
  private readonly roadIndex = new Map<RoadSegment, number>();

  constructor(options: PlannerOptions) {
    this.seed = options.seed | 0;
    this.style = options.style ?? TEMPEST_STYLE;
    ROADS.forEach((r, i) => this.roadIndex.set(r, i + 1));
    this.rasterise();
    this.lots = this.planLots();
    this.landmarkLots = this.planLandmarks(options.groundAt ?? (() => TEMPEST_GROUND));
    for (const p of this.lots) {
      const { x, z, w, d } = p.lot;
      for (let zz = z; zz < z + d; zz++) {
        const row = (zz - Z_BASE) * SIDE;
        for (let xx = x; xx < x + w; xx++) this.lotRaster[row + xx - X_BASE] = p.index + 1;
      }
    }
    this.props = this.planProps();
    this.trees = this.planTrees();
    for (const t of this.trees) {
      const key = this.cellKey(t.x >> 4, t.z >> 4);
      const at = this.treeCells.get(key);
      if (at) at.push(t); else this.treeCells.set(key, [t]);
    }
    this.lamps = this.planLamps();
    for (const l of this.lamps) this.lampAtCell.set(l.x * 8192 + l.z, l);
  }

  // --- Lookups ------------------------------------------------------------------------------------------------------

  private static inRaster(x: number, z: number): boolean {
    return x >= X_BASE && z >= Z_BASE && x < X_BASE + SIDE && z < Z_BASE + SIDE;
  }

  private cellKey(a: number, b: number): number {
    return (a + 4096) * 8192 + (b + 4096);
  }

  /** The lot whose rectangle holds the cell, or null (a street, a verge, a courtyard, outside the grid). O(1). */
  lotAt(x: number, z: number): PlannedLot | null {
    if (!DistrictPlanner.inRaster(x, z)) return null;
    const i = this.lotRaster[(z - Z_BASE) * SIDE + x - X_BASE];
    return i === 0 ? null : this.lots[i - 1];
  }

  /** The road covering the cell (the layout's `roadAt`, answered from the raster inside the grid), or null. */
  roadOf(x: number, z: number): RoadSegment | null {
    if (!DistrictPlanner.inRaster(x, z)) return roadAt(x, z);
    const i = this.roadRaster[(z - Z_BASE) * SIDE + x - X_BASE];
    return i === 0 ? null : ROADS[i - 1];
  }

  /** The block the cell is in (outside its clipped corners), or null. */
  blockOf(x: number, z: number): Block | null {
    if (!DistrictPlanner.inRaster(x, z)) return blockAt(x, z);
    const i = this.blockRaster[(z - Z_BASE) * SIDE + x - X_BASE];
    return i === 0 ? null : BLOCKS[i - 1];
  }

  /** Every lot with a cell in the rectangle (inclusive), in plan order: what a chunk needs. */
  lotsIntersecting(minX: number, minZ: number, maxX: number, maxZ: number): PlannedLot[] {
    const out: PlannedLot[] = [];
    if (maxX < X_BASE || maxZ < Z_BASE || minX >= X_BASE + SIDE || minZ >= Z_BASE + SIDE) return out;
    for (const p of this.lots) {
      const l = p.lot;
      if (l.x <= maxX && l.x + l.w - 1 >= minX && l.z <= maxZ && l.z + l.d - 1 >= minZ) out.push(p);
    }
    return out;
  }

  /** The landmark lots whose rectangle, grown by `margin`, touches the rectangle. */
  landmarksIntersecting(minX: number, minZ: number, maxX: number, maxZ: number, margin = 0): PlannedLandmark[] {
    return this.landmarkLots.filter(({ lot }) =>
      lot.x - margin <= maxX && lot.x + lot.w - 1 + margin >= minX && lot.z - margin <= maxZ && lot.z + lot.d - 1 + margin >= minZ);
  }

  lampAt(x: number, z: number): LampSpot | undefined {
    return this.lampAtCell.size === 0 ? undefined : this.lampAtCell.get(x * 8192 + z);
  }

  /** The street trees whose trunk is in the 16 by 16 cell tile (tx, tz) (world coordinates shifted right by 4). */
  treesInTile(tx: number, tz: number): readonly TreeSpot[] | undefined {
    return this.treeCells.get(this.cellKey(tx, tz));
  }

  /** The planned lot or landmark with this id (a lot id is `block.n`, a landmark's is its layout id). */
  lotById(id: string): PlannedLot | undefined {
    return this.lots.find((p) => p.lot.id === id);
  }

  /** A 32 bit hash of the whole plan: lots, landmark lots, trees and lamps. Two planners with the same seed agree on it. */
  hash(): number {
    let h = 0x811c9dc5;
    const mix = (v: number): void => { h = Math.imul(h ^ (v | 0), 0x01000193); };
    const mixStr = (s: string): void => { for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i)); };
    for (const p of this.lots) {
      const l = p.lot;
      mixStr(l.id); mix(l.x); mix(l.z); mix(l.w); mix(l.d); mix(l.facing); mix(l.seed); mix(l.floors); mixStr(p.kind); mixStr(l.family ?? '');
    }
    for (const p of this.landmarkLots) { mixStr(p.lot.id); mix(p.lot.seed); mix(p.lot.groundY); }
    for (const t of this.trees) { mix(t.x); mix(t.z); mixStr(t.kind); mix(t.variant); mix(t.lean); }
    for (const l of this.lamps) { mix(l.x); mix(l.z); mix(l.toward); mix(l.striped ? 1 : 0); }
    return h >>> 0;
  }

  // --- Building the plan ----------------------------------------------------------------------------------------------

  private rasterise(): void {
    for (let z = Z_BASE; z < Z_BASE + SIDE; z++) {
      const row = (z - Z_BASE) * SIDE;
      for (let x = X_BASE; x < X_BASE + SIDE; x++) {
        const road = roadAt(x, z);
        if (road) { this.roadRaster[row + x - X_BASE] = this.roadIndex.get(road)!; continue; }
        const block = blockAt(x, z);
        if (block) this.blockRaster[row + x - X_BASE] = BLOCKS.indexOf(block) + 1;
      }
    }
  }

  private planLots(): PlannedLot[] {
    const lots: PlannedLot[] = [];
    for (let bi = 0; bi < BLOCKS.length; bi++) {
      const b = BLOCKS[bi];
      const rng = new Rng(hash2(bi + 1, 0x107, this.seed));
      const sector = sectorOfBlock(b).id;
      const plots: Plot[] = [];
      const crossed = crossedByDiagonal(b);
      for (const p of planBlock(b, rng, crossed)) {
        const fitted = p.w >= MIN_LOT && p.d >= MIN_LOT ? fitPlot(b, p) : null;
        if (fitted && fitted.w >= MIN_LOT && fitted.d >= MIN_LOT) plots.push(fitted);
      }
      // What each plot becomes: a seed of its own, a kind, storeys, and a palette family that differs from the lot before it in its row.
      const lastFamily = new Map<string, string>();
      const drafts = plots.map((p, n) => {
        const seed = hash2(bi * 64 + n, 0x10705, this.seed) | 0;
        const lrng = new Rng(seed);
        const kind = chooseKind(b, lrng);
        const floors = kind === 'building' ? floorsOf(b, p.x, p.z, lrng) : 1;
        let family = this.style.pickFamily(lrng.fork(1), b.district);
        // The town reads as one terracotta mass: the accent palettes (dark tile, green glaze, thatch) are kept to accents.
        if (family !== BASE_FAMILY && lrng.fork(9).chance(BASE_BIAS[b.district] ?? 0.3)) family = BASE_FAMILY;
        for (let t = 0; t < FAMILY_TRIES && family === lastFamily.get(p.row) && family !== BASE_FAMILY; t++) family = this.style.pickFamily(lrng.fork(2 + t), b.district);
        lastFamily.set(p.row, family);
        return { plot: p, seed, kind, floors, family };
      });
      const infoOf = (d: (typeof drafts)[number] | undefined): NeighbourInfo =>
        !d ? NO_NEIGHBOUR : { kind: d.kind === 'building' ? b.district : null, height: d.kind === 'building' ? d.floors * 4 + 3 : 0, family: d.family };
      drafts.forEach((d, n) => {
        const p = d.plot;
        // The lots beside it in its row, as seen from the street, and the one behind.
        const row = drafts.filter((o) => o.plot.row === p.row).sort((a, c) => (p.facing === 0 || p.facing === 2 ? a.plot.x - c.plot.x : a.plot.z - c.plot.z));
        const at = row.indexOf(d);
        const prev = row[at - 1], next = row[at + 1];
        const nextIsLeft = p.facing === 0 || p.facing === 1;
        const behind = drafts.find((o) => o !== d && o.plot.facing !== p.facing && behindCell(p, o.plot));
        const lot = new Lot({
          id: `${b.id}.${n}`, x: p.x, z: p.z, w: p.w, d: p.d, facing: p.facing, district: b.district, seed: d.seed, floors: d.floors, family: d.family,
          groundY: TEMPEST_GROUND,
          neighbours: { left: infoOf(nextIsLeft ? next : prev), right: infoOf(nextIsLeft ? prev : next), back: infoOf(behind) },
        });
        lots.push({ index: lots.length, lot, kind: d.kind, block: b.id, sector });
      });
    }
    return lots;
  }

  private planLandmarks(groundAt: (x: number, z: number) => number): PlannedLandmark[] {
    return LANDMARKS.map((landmark, index) => {
      const b = shapeBounds(landmark.shape);
      const w = b.x1 - b.x0 + 1;
      const d = b.z1 - b.z0 + 1;
      const cx = b.x0 + Math.floor(w / 2);
      const cz = b.z0 + Math.floor(d / 2);
      const lot = new Lot({
        id: landmark.id, x: b.x0, z: b.z0, w, d, facing: (landmark.facing ?? 2) as Facing, district: landmark.district ?? landmark.kind,
        // A bridge stands at the height of the road it carries, which is the ground at its end and not the river bed under its middle.
        seed: hash2(index + 1, 0x1a4d, this.seed) | 0, floors: 1, groundY: Math.round(landmark.kind === 'bridge' ? groundAt(b.x0, cz) : groundAt(cx, cz)),
      });
      return { index, landmark, lot };
    });
  }

  // Market stalls on the boundary road's east shoulder, every 24 cells, with their fronts to the road.
  private planProps(): PlannedProp[] {
    const props: PlannedProp[] = [];
    const boundary = ROADS.find((r) => r.id === 'boundary-east')!.rect!;
    for (let lz = -160, n = 0; lz <= 150; lz += 24, n++) {
      if (Math.abs(lz) < 16) continue;
      const lot = new Lot({
        id: `stall.${n}`, x: boundary.x1 - 1, z: worldZ(lz), w: 2, d: 4, facing: 3, district: 'commercial', seed: hash2(n + 1, 0x57a1, this.seed) | 0, floors: 1,
        groundY: TEMPEST_GROUND,
      });
      props.push({ index: props.length, kit: 'street-stall', lot });
    }
    return props;
  }

  private planTrees(): TreeSpot[] {
    const trees: TreeSpot[] = [];
    // A tree in the verge wherever two lots meet along a side of a block, thinned so they stand about ten cells apart.
    for (const b of BLOCKS) {
      const mine = this.lots.filter((p) => p.block === b.id);
      for (const facing of [0, 1, 2, 3] as Facing[]) {
        const side = mine.filter((p) => p.lot.facing === facing).sort((a, c) => (facing === 0 || facing === 2 ? a.lot.x - c.lot.x : a.lot.z - c.lot.z));
        let last = -Infinity;
        for (const { lot } of side) {
          const along = facing === 0 || facing === 2 ? lot.x : lot.z;
          if (along - last < 8) continue;
          // The cell in the verge in front of the lot's first column.
          const x = facing === 1 ? b.rect.x1 : facing === 3 ? b.rect.x0 : lot.x;
          const z = facing === 0 ? b.rect.z0 : facing === 2 ? b.rect.z1 : lot.z;
          if (!inBlock(b, x, z) || this.lotAt(x, z) || roadAt(x, z)) continue;
          last = along;
          const h = hash2(x, z, this.seed);
          const r = h % 100;
          trees.push({ x, z, kind: r < 55 ? 'sakura' : r < 80 ? 'cedar' : 'birch', variant: (h >>> 8) % 8, lean: facing });
        }
      }
    }
    // Trees in the ground the lots leave open (courtyards, the wedges beside a diagonal street): a jittered lattice of seven
    // cells over each block, a tree where the ground is clear of lots and roads and no tree stands near.
    for (const b of BLOCKS) {
      if (b.rect.x1 - b.rect.x0 < 30) continue;
      for (let z0 = b.rect.z0 + 3; z0 <= b.rect.z1 - 3; z0 += 7) {
        for (let x0 = b.rect.x0 + 3; x0 <= b.rect.x1 - 3; x0 += 7) {
          const h = hash2(x0, z0, this.seed ^ 0xc0);
          const x = x0 + (h & 3) - 1, z = z0 + ((h >>> 2) & 3) - 1;
          if (((h >>> 8) & 255) / 256 > 0.6 || !inBlock(b, x, z) || this.roadNear(x, z, 3) || this.lotNear(x, z, 3)) continue;
          if (trees.some((t) => Math.abs(t.x - x) < 5 && Math.abs(t.z - z) < 5)) continue;
          trees.push({ x, z, kind: (h >>> 12) % 3 === 0 ? 'cedar' : (h >>> 12) % 3 === 1 ? 'sakura' : 'birch', variant: (h >>> 16) % 8, lean: 4 });
        }
      }
    }
    return trees;
  }

  private roadNear(x: number, z: number, r: number): boolean {
    for (let dz = -r; dz <= r; dz += 1) for (let dx = -r; dx <= r; dx += 1) if (this.roadOf(x + dx, z + dz)) return true;
    return false;
  }

  private lotNear(x: number, z: number, r: number): boolean {
    for (let dz = -r; dz <= r; dz += 1) for (let dx = -r; dx <= r; dx += 1) if (this.lotAt(x + dx, z + dz)) return true;
    return false;
  }

  private planLamps(): LampSpot[] {
    const lamps: LampSpot[] = [];
    const isRoad = (x: number, z: number, seg: RoadSegment): boolean => roadAt(x, z) === seg;
    const inLandmark = (x: number, z: number): boolean => LANDMARKS.some((l) => (l.kind === 'roundabout' || l.kind === 'gate' || l.kind === 'stalls' || l.kind === 'bridge') && inShape(l.shape, x, z));
    for (const seg of ROADS) {
      const r = seg.rect;
      if (!r || seg.kind === 'link') continue;
      const alongZ = r.z1 - r.z0 > r.x1 - r.x0; // a north-south road
      const spacing = seg.kind === 'avenue' ? 10 : seg.kind === 'road' ? 24 : 12;
      const start = alongZ ? r.z0 : r.x0;
      const end = alongZ ? r.z1 : r.x1;
      const edges = alongZ ? [[r.x0, 1], [r.x1, 3]] : [[r.z0, 2], [r.z1, 0]];
      edges.forEach(([edge, toward], side) => {
        // The two sides are staggered by half a spacing; the phase differs per road so the lamps of neighbouring streets do not line up.
        const phase = (seg.id.length * 3 + side * (spacing / 2) + 5) % spacing;
        for (let t = start + phase; t <= end; t += spacing) {
          const x = alongZ ? edge : t;
          const z = alongZ ? t : edge;
          // Outer roads only carry lamps inside the open land, in the town's own part of the footprint.
          if (seg.kind === 'road' && Math.hypot(localX(x), localZ(z)) > 262) continue;
          if (!isRoad(x, z, seg) || this.props.some((p) => x >= p.lot.x - 1 && x < p.lot.x + p.lot.w + 1 && z >= p.lot.z - 1 && z < p.lot.z + p.lot.d + 1)) continue;
          // Not at an intersection, in the Central Square, or where a gate stands: the cell beyond the edge must not be road.
          const ox = alongZ ? x + (edge === r.x0 ? -1 : 1) : x;
          const oz = alongZ ? z : z + (edge === r.z0 ? -1 : 1);
          if (roadAt(ox, oz) || inLandmark(x, z)) continue;
          lamps.push({ x, z, toward: toward as Facing, striped: (Math.floor(t / spacing) + side) % 2 === 1 });
        }
      });
    }
    // Diagonal streets: a post on the edge cell every 12 cells down each side, its arm along whichever axis reaches over the road.
    for (const seg of ROADS) {
      const l = seg.line;
      if (seg.kind !== 'diagonal' || !l) continue;
      const dx = l.x1 - l.x0, dz = l.z1 - l.z0, len = Math.hypot(dx, dz);
      const ux = dx / len, uz = dz / len;
      [1, -1].forEach((side, si) => {
        for (let t = 5 + si * 6, n = 0; t < len; t += 12, n++) {
          const nx = -uz * side, nz = ux * side;
          const x = Math.round(l.x0 + ux * t + nx * 2), z = Math.round(l.z0 + uz * t + nz * 2);
          if (roadAt(x, z) !== seg || this.props.some((p) => x >= p.lot.x && x < p.lot.x + p.lot.w && z >= p.lot.z && z < p.lot.z + p.lot.d)) continue;
          // The arm goes towards the street's middle: an axis direction whose cell is road and whose opposite cell is not.
          const options: Facing[] = Math.abs(nx) >= Math.abs(nz) ? [nx > 0 ? 3 : 1, nz > 0 ? 0 : 2] as Facing[] : [nz > 0 ? 0 : 2, nx > 0 ? 3 : 1] as Facing[];
          const toward = options.find((f) => roadAt(x + DX4[f], z + DZ4[f]) && !roadAt(x - DX4[f], z - DZ4[f]));
          if (toward === undefined || lamps.some((o) => Math.abs(o.x - x) < 3 && Math.abs(o.z - z) < 3)) continue;
          lamps.push({ x, z, toward, striped: (n + si) % 2 === 1 });
        }
      });
    }
    return lamps;
  }
}

const DX4 = [0, 1, 0, -1];
const DZ4 = [-1, 0, 1, 0];

// True when `other` stands directly behind `lot`: the cell just beyond the middle of its back edge is in `other`.
const behindCell = (lot: Plot, other: Plot): boolean => {
  const cx = lot.x + Math.floor(lot.w / 2);
  const cz = lot.z + Math.floor(lot.d / 2);
  const [x, z] = lot.facing === 0 ? [cx, lot.z + lot.d] : lot.facing === 2 ? [cx, lot.z - 1] : lot.facing === 1 ? [lot.x - 1, cz] : [lot.x + lot.w, cz];
  return x >= other.x && x < other.x + other.w && z >= other.z && z < other.z + other.d;
};
