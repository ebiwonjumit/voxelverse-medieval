import { NatureBlock } from '../../content/blocksNature';
import { TempestBlock as T } from '../../content/blocksTempest';
import { BlockType } from '../../worldConstants';
import { hash2, hash2f } from '../noise';
import {
  LANDMARKS, farmField, isWooded, landmarkAt, localX, localZ, openLandRadius, riverDistance, roadAt,
} from './layout';
import { POND_WATER_Y, RIVER_WATER_HALF, TempestTerrain, inPondWater } from './terrain';
import { TreeKind } from './trees';

// The land outside the built grid: the river and its banks, the ponds, the farms in their curved fields, the fenced
// pastures, the open meadows and the forest that hugs the edge. Every answer is a function of the cell and the seed (a hash
// per cell, never a running generator), so any chunk can ask about any cell in any order.

const smoothstep = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** What a column outside the grid looks like: the block at the ground, a prop on top of it, and the fluid a pond stands in. */
export interface Decor {
  surface: number;
  /** A block on the ground row + 1 (a crop, a flower, a fence), or 0. */
  prop: number;
  /** A block at the pond's water level (water, or water with koi), or 0 for none; and a lily pad above it, or 0. */
  fluid: number;
  lily: number;
}

export const newDecor = (): Decor => ({ surface: BlockType.GRASS, prop: 0, fluid: 0, lily: 0 });

export interface ForestTree { x: number; z: number; kind: TreeKind; variant: number; ground: number }

/** The furthest any forest tree's blocks reach from its trunk (the sakura's wide crown). */
/** Half the side of the square the built grid, its boundary road and its edge streets fill (cells from the Central Square). */
const GRID_HALF = 196;
export const FOREST_REACH = 8;
const CELL = 6;
const FOREST_CACHE = 40000;

const pastures = LANDMARKS.filter((l) => l.kind === 'pasture');

const WHEAT_STAGES = [BlockType.WHEAT_STAGE_1, BlockType.WHEAT_STAGE_2, BlockType.WHEAT];
const FLOWERS = [NatureBlock.WILDFLOWER_PINK, NatureBlock.WILDFLOWER_WHITE, NatureBlock.WILDFLOWER_BLUE, BlockType.FLOWER_YELLOW, NatureBlock.WILDFLOWER_PURPLE];

export class Countryside {
  private readonly forest = new Map<number, ForestTree | null>();

  constructor(readonly seed: number, private readonly terrain: TempestTerrain) {}

  private h(x: number, z: number, salt: number): number {
    return hash2(x, z, this.seed ^ salt);
  }

  private f(x: number, z: number, salt: number): number {
    return hash2f(x, z, this.seed ^ salt);
  }

  /** Fills `out` for a column that is not in the grid, not on a road and not in a lot. `ground` is the column's ground row. */
  surface(x: number, z: number, ground: number, high: boolean, out: Decor): void {
    out.surface = BlockType.GRASS;
    out.prop = 0;
    out.fluid = 0;
    out.lily = 0;
    const lx = localX(x);

    // Ponds: mud under shallow water one block below the street, koi in some of it, lily pads on some; a muddy bank round it.
    if (inPondWater(x, z)) {
      out.surface = NatureBlock.MUD;
      const r = this.f(x, z, 0x9011);
      out.fluid = r < 0.12 ? T.KOI_POND : BlockType.WATER;
      if (r > 0.82) out.lily = BlockType.LILY_PAD;
      return;
    }
    if (ground < 8 && ground >= POND_WATER_Y - 1 && lx > 150 && lx < 260) {
      out.surface = ground <= POND_WATER_Y ? NatureBlock.MUD : BlockType.SAND;
      return;
    }

    // The river: sand with a little gravel (the tile is dark, so a half-and-half bank reads as a checkerboard) in the channel and on its shelves, moss and grass up the bank, reeds at the water's edge.
    if (lx > 100 && lx < 400) {
      const rd = riverDistance(x, z);
      if (rd < 18) {
        const q = this.f(x, z, 0x71e1);
        if (ground <= 3) out.surface = q > 0.8 ? NatureBlock.GRAVEL : BlockType.SAND;
        else if (ground <= 5) { out.surface = q > 0.9 ? NatureBlock.GRAVEL : BlockType.SAND; if (high && ground === 4 && q < 0.14) out.prop = NatureBlock.REEDS; }
        else if (rd < RIVER_WATER_HALF + 12) { out.surface = q < 0.3 ? NatureBlock.MOSS : BlockType.GRASS; if (high && q > 0.93) out.prop = NatureBlock.FERN; }
        if (rd < 14) return;
      }
    }

    // Pastures: a fence ring round the circle with a gap on the side that faces the road.
    for (const p of pastures) {
      const c = p.shape as { cx: number; cz: number; r: number };
      const dx = x - c.cx, dz = z - c.cz;
      const dist = Math.hypot(dx, dz);
      if (dist > c.r + 1) continue;
      if (dist >= c.r - 0.5) {
        // The gap faces the avenue (z = 0): north for the pasture south of it, south for the paddock north of it.
        const gate = Math.abs(dx) <= 1.5 && (c.cz > 0 ? dz < 0 : dz > 0);
        if (!gate) out.prop = BlockType.WOOD_FENCE;
        else out.surface = BlockType.PATH;
      } else if (high) {
        const q = this.f(x, z, 0x9a57);
        if (q < 0.08) out.prop = BlockType.TALL_GRASS;
        else if (q > 0.997) out.prop = T.RICE_BALE;
      }
      return;
    }

    // Farms: fields in rings and sectors about the town, a path along every field's edge, and by field wheat in rows that
    // follow the rings (so they curve), a fallow meadow of flowers, or rough grass.
    const field = farmField(x, z);
    if (field && ground >= 8) {
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oz]) => {
        const n = farmField(x + ox, z + oz);
        return !n || n.ring !== field.ring || n.sector !== field.sector;
      });
      if (edge) { out.surface = BlockType.PATH; return; }
      const kind = this.h(field.ring, field.sector, 0xfa12) % 8;
      if (kind < 4) {
        out.surface = BlockType.FARMLAND;
        const row = Math.floor(Math.hypot(lx, localZ(z)));
        if (row % 3 !== 2) out.prop = WHEAT_STAGES[(field.ring + field.sector + (kind & 1)) % 3];
      } else if (high) {
        const q = this.f(x, z, 0xf10e);
        out.prop = kind < 6 ? (q < 0.3 ? FLOWERS[this.h(field.ring, field.sector, 0xf1) % FLOWERS.length] : q < 0.45 ? BlockType.TALL_GRASS : 0) : (q < 0.35 ? BlockType.TALL_GRASS : 0);
      }
      return;
    }

    // The forest floor and the open land.
    if (isWooded(x, z)) {
      const p = this.f(Math.floor(x / 5), Math.floor(z / 5), 0xf0);
      out.surface = p < 0.1 ? NatureBlock.PODZOL : p < 0.3 ? NatureBlock.MOSS : BlockType.GRASS;
      if (high) {
        const q = this.f(x, z, 0xfe);
        if (q < 0.05) out.prop = NatureBlock.FERN;
        else if (q < 0.056) out.prop = NatureBlock.MUSHROOM_BROWN;
        else if (q < 0.066) out.prop = FLOWERS[this.h(x, z, 0xff) % FLOWERS.length];
      }
      return;
    }
    if (high) {
      const q = this.f(x, z, 0x0e);
      if (q < 0.05) out.prop = BlockType.TALL_GRASS;
      else if (q < 0.065) out.prop = FLOWERS[this.h(x, z, 0x0f) % FLOWERS.length];
    }
  }

  /** The forest trees whose blocks may reach the column: candidates on a jittered grid of 6 cells, each kept or dropped by its own hash. */
  forestTrees(x: number, z: number, out: ForestTree[]): void {
    out.length = 0;
    const g0x = Math.floor((x - FOREST_REACH) / CELL), g1x = Math.floor((x + FOREST_REACH) / CELL);
    const g0z = Math.floor((z - FOREST_REACH) / CELL), g1z = Math.floor((z + FOREST_REACH) / CELL);
    for (let gz = g0z; gz <= g1z; gz++) {
      for (let gx = g0x; gx <= g1x; gx++) {
        const t = this.candidate(gx, gz);
        if (t) out.push(t);
      }
    }
  }

  private candidate(gx: number, gz: number): ForestTree | null {
    const key = (gx + 8192) * 16384 + (gz + 8192);
    const cached = this.forest.get(key);
    if (cached !== undefined) return cached;
    const t = this.makeTree(gx, gz);
    if (this.forest.size >= FOREST_CACHE) this.forest.clear();
    this.forest.set(key, t);
    return t;
  }

  private makeTree(gx: number, gz: number): ForestTree | null {
    const h = this.h(gx, gz, 0xf0e57);
    const x = gx * CELL + (h & 7) % CELL;
    const z = gz * CELL + ((h >>> 4) & 7) % CELL;
    const lx = localX(x), lz = localZ(z);
    const d = Math.hypot(lx, lz);
    // Never in the built grid (a lot's corner is 256 cells out on the diagonal, beyond the circle of 200): a tree in a house is a bug.
    if (d < 200 || (Math.abs(lx) < GRID_HALF && Math.abs(lz) < GRID_HALF)) return null;
    const wooded = isWooded(x, z);
    const roll = ((h >>> 8) & 255) / 256;
    const r = ((h >>> 17) & 127) / 128;
    let kind: TreeKind;
    if (wooded) {
      // Thicker the deeper into the forest, thin where it meets the fields.
      const depth = smoothstep((d - openLandRadius(Math.atan2(lz, lx))) / 40);
      if (roll > 0.28 + 0.3 * depth) return null;
      kind = r < 0.4 ? 'cedar' : r < 0.65 ? 'sakura' : r < 0.8 ? 'oak' : r < 0.9 ? 'birch' : 'bamboo';
    } else {
      // Open land: copses and lone trees on the meadows between the grid, the farms and the forest, a clump where the coarse
      // noise says so and almost nothing elsewhere. Not on farms (they have their own pattern) or pastures.
      if (d < 215 || farmField(x, z)) return null;
      const clump = hash2f(Math.floor(gx / 4), Math.floor(gz / 4), this.seed ^ 0xc109);
      if (roll > (clump < 0.22 ? 0.4 : 0.012)) return null;
      kind = r < 0.4 ? 'sakura' : r < 0.75 ? 'oak' : 'birch';
    }
    // Clear of the roads, so that no crown hangs low over one: the trunk stands at least as far from every road as the crown
    // reaches (probes along the axes and the diagonals), and out of the landmarks. The strips where the RoadNetwork's roads
    // arrive at the west and north gates count as roads (beyond d = 600 the layout has no road, the network paints one).
    const clear = kind === 'sakura' ? 7 : 4;
    const diag = Math.round(clear * 0.7);
    if (d > 585 - clear && ((lx < 0 && Math.abs(lz) < 4 + clear) || (lz < 0 && Math.abs(lx) < 4 + clear))) return null;
    if (landmarkAt(x, z) || roadAt(x, z)) return null;
    for (const [ox, oz] of [[clear, 0], [-clear, 0], [0, clear], [0, -clear], [diag, diag], [-diag, diag], [diag, -diag], [-diag, -diag]]) if (roadAt(x + ox, z + oz)) return null;
    const ground = this.terrain.ground(x, z);
    if (ground <= 5 || (lx > 100 && riverDistance(x, z) < RIVER_WATER_HALF + 8)) return null;
    return { x, z, kind, variant: (h >>> 24) & 7, ground };
  }
}

