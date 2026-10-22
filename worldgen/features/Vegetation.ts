import { WATER_LEVEL } from '../../worldConstants';
import { Biome } from '../biomes/Biome';
import { Rng } from '../noise';
import { Column } from '../terrain/ColumnSampler';
import { BambooClump } from './BambooClump';
import { Boulder } from './Boulder';
import { FallenLog } from './FallenLog';
import { Feature } from './Feature';
import { ReedBed } from './ReedBed';
import { UndergrowthPatch } from './UndergrowthPatch';
import { BirchTree, CedarTree, OakTree, PineTree, SakuraTree } from './trees';

const oak = new OakTree();
const birch = new BirchTree();
const pine = new PineTree();
const cedar = new CedarTree();
const sakura = new SakuraTree();
const bamboo = new BambooClump();
const boulder = new Boulder();
const fallenLog = new FallenLog();
const undergrowth = new UndergrowthPatch();
const reeds = new ReedBed();

type Weighted = ReadonlyArray<readonly [Feature, number]>;

// Species by biome, as weights.
const TREES: Record<Biome, Weighted> = {
  [Biome.MEADOW]: [[oak, 1]],
  [Biome.BIRCH_WOOD]: [[birch, 8], [oak, 2]],
  [Biome.OAK_WOOD]: [[oak, 7], [birch, 3]],
  [Biome.CEDAR_FOREST]: [[cedar, 17], [birch, 2], [oak, 1]],
  [Biome.PINE_FOREST]: [[pine, 9], [birch, 1]],
  [Biome.BAMBOO_GROVE]: [[cedar, 5], [sakura, 3], [oak, 2]],
  [Biome.SAKURA_GROVE]: [[sakura, 8], [cedar, 1], [oak, 1]],
  [Biome.WETLAND]: [[oak, 7], [birch, 3]],
  [Biome.ROCKY_HILLS]: [[pine, 1]],
  [Biome.ALPINE]: [[pine, 1]],
  [Biome.BEACH]: [[oak, 1]],
};

// Chance that a 5 x 5 block cell of the tree grid holds a tree, before the climate's density multiplier.
const TREE_P: Record<Biome, number> = {
  [Biome.MEADOW]: 0.02, [Biome.BIRCH_WOOD]: 0.3, [Biome.OAK_WOOD]: 0.27, [Biome.CEDAR_FOREST]: 0.3,
  [Biome.PINE_FOREST]: 0.28, [Biome.BAMBOO_GROVE]: 0.05, [Biome.SAKURA_GROVE]: 0.17, [Biome.WETLAND]: 0.02,
  [Biome.ROCKY_HILLS]: 0.04, [Biome.ALPINE]: 0.02, [Biome.BEACH]: 0,
};

const BAMBOO_P: Record<Biome, number> = {
  [Biome.MEADOW]: 0, [Biome.BIRCH_WOOD]: 0, [Biome.OAK_WOOD]: 0, [Biome.CEDAR_FOREST]: 0.05, [Biome.PINE_FOREST]: 0,
  [Biome.BAMBOO_GROVE]: 0.5, [Biome.SAKURA_GROVE]: 0.03, [Biome.WETLAND]: 0.04, [Biome.ROCKY_HILLS]: 0, [Biome.ALPINE]: 0,
  [Biome.BEACH]: 0,
};

const BOULDER_P: Record<Biome, number> = {
  [Biome.MEADOW]: 0.05, [Biome.BIRCH_WOOD]: 0.04, [Biome.OAK_WOOD]: 0.04, [Biome.CEDAR_FOREST]: 0.06, [Biome.PINE_FOREST]: 0.1,
  [Biome.BAMBOO_GROVE]: 0.04, [Biome.SAKURA_GROVE]: 0.03, [Biome.WETLAND]: 0.02, [Biome.ROCKY_HILLS]: 0.45, [Biome.ALPINE]: 0.35,
  [Biome.BEACH]: 0.08,
};

const LOG_P: Record<Biome, number> = {
  [Biome.MEADOW]: 0, [Biome.BIRCH_WOOD]: 0.1, [Biome.OAK_WOOD]: 0.1, [Biome.CEDAR_FOREST]: 0.1, [Biome.PINE_FOREST]: 0.1,
  [Biome.BAMBOO_GROVE]: 0.06, [Biome.SAKURA_GROVE]: 0.08, [Biome.WETLAND]: 0.03, [Biome.ROCKY_HILLS]: 0, [Biome.ALPINE]: 0,
  [Biome.BEACH]: 0,
};

const UNDERGROWTH_P: Record<Biome, number> = {
  [Biome.MEADOW]: 0.55, [Biome.BIRCH_WOOD]: 0.6, [Biome.OAK_WOOD]: 0.6, [Biome.CEDAR_FOREST]: 0.6, [Biome.PINE_FOREST]: 0.5,
  [Biome.BAMBOO_GROVE]: 0.6, [Biome.SAKURA_GROVE]: 0.6, [Biome.WETLAND]: 0.5, [Biome.ROCKY_HILLS]: 0.3, [Biome.ALPINE]: 0.12,
  [Biome.BEACH]: 0,
};

const DENSITY_CAP = 2.4;
const max = (t: Record<number, number>): number => Math.max(...Object.values(t));

const choose = (mix: Weighted, rng: Rng): Feature => {
  let total = 0;
  for (const [, w] of mix) total += w;
  let roll = rng.next() * total;
  for (const [f, w] of mix) {
    roll -= w;
    if (roll <= 0) return f;
  }
  return mix[0][0];
};

// Where something can take root: soil, or bare rock and snow in the mountains.
const rooted = (c: Column): boolean =>
  c.ground >= WATER_LEVEL + 2 && (c.soil || c.biome === Biome.ROCKY_HILLS || c.biome === Biome.ALPINE);

export interface LayerDef {
  readonly name: string;
  readonly salt: number;
  readonly cell: number;      // grid cell size in blocks: one candidate origin per cell
  readonly radius: number;    // largest radius of any feature the layer places
  readonly detail: boolean;   // skipped in LOD 0 chunks
  // Highest chance the layer can have anywhere, so most cells are rejected before the terrain is sampled.
  readonly maxChance: number;
  // The feature for a cell given the roll u in [0, 1) and the column at the origin, or null for nothing.
  pick(c: Column, u: number, rng: Rng): Feature | null;
}

// In the order they are placed, which is the order they win overlaps in: ground cover first, trees last.
export const LAYERS: readonly LayerDef[] = [
  {
    name: 'undergrowth', salt: 11, cell: 6, radius: 6, detail: true, maxChance: max(UNDERGROWTH_P),
    pick: (c, u) => (c.soil && u < UNDERGROWTH_P[c.biome] ? undergrowth : null),
  },
  {
    name: 'reeds', salt: 12, cell: 6, radius: 5, detail: true, maxChance: 0.5,
    pick: (c, u) => {
      if (!c.shore) return null;
      const p = c.pond > 0.1 ? 0.5 : c.river > 0.2 ? 0.45 : c.biome === Biome.WETLAND ? 0.35 : 0;
      return u < p ? reeds : null;
    },
  },
  {
    name: 'logs', salt: 13, cell: 18, radius: 4, detail: false, maxChance: max(LOG_P),
    pick: (c, u) => (c.soil && c.ground > WATER_LEVEL + 1 && u < LOG_P[c.biome] ? fallenLog : null),
  },
  {
    name: 'boulders', salt: 14, cell: 16, radius: 4, detail: false, maxChance: max(BOULDER_P),
    pick: (c, u) => (c.ground > WATER_LEVEL + 1 && u < BOULDER_P[c.biome] ? boulder : null),
  },
  {
    name: 'bamboo', salt: 15, cell: 7, radius: 4, detail: false, maxChance: max(BAMBOO_P),
    pick: (c, u) => (c.soil && c.ground >= WATER_LEVEL + 2 && u < BAMBOO_P[c.biome] ? bamboo : null),
  },
  {
    name: 'trees', salt: 16, cell: 5, radius: 8, detail: false, maxChance: Math.min(0.85, max(TREE_P) * DENSITY_CAP),
    pick: (c, u, rng) => {
      if (!rooted(c)) return null;
      const p = Math.min(0.85, TREE_P[c.biome] * c.density);
      return u < p ? choose(TREES[c.biome], rng) : null;
    },
  },
];
