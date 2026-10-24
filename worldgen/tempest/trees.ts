import { NatureBlock } from '../../content/blocksNature';
import { BlockType } from '../../worldConstants';
import { Biome } from '../biomes/Biome';
import { BambooClump } from '../features/BambooClump';
import { BlockList } from '../features/BlockList';
import { Feature } from '../features/Feature';
import { blob, disc, trunk } from '../features/shapes';
import { BirchTree, CedarTree, OakTree, SakuraTree } from '../features/trees';
import { Rng, hash2 } from '../noise';

// The trees of the town: small ones for the streets and the gardens (a crown that fits over a street, or inside a lot),
// and the wilderness's own features for the forest round the town. A tree is a list of blocks relative to its trunk, built
// once per kind and variant and shared by every tree of that kind, so a lookup for one column is a map read.

export type TreeKind = 'sakura' | 'cedar' | 'birch' | 'oak' | 'bamboo';
export const TREE_KINDS: readonly TreeKind[] = ['sakura', 'cedar', 'birch', 'oak', 'bamboo'];
/** Which way a street tree leans its crown (the side of the street): 0 north, 1 east, 2 south, 3 west, 4 straight up. */
export type Lean = 0 | 1 | 2 | 3 | 4;
export const VARIANTS = 8;

const LEAN_DX = [0, 1, 0, -1, 0];
const LEAN_DZ = [-1, 0, 1, 0, 0];

export interface TreeShape {
  readonly kind: TreeKind;
  readonly length: number;
  readonly dx: Int8Array;
  readonly dy: Int16Array;
  readonly dz: Int8Array;
  readonly id: Uint16Array;
  readonly place: Uint8Array;
  /** The furthest a block reaches from the trunk along x or z. */
  readonly reach: number;
  /** The highest block above the ground at the trunk. */
  readonly top: number;
  /** Indices of the blocks in a column offset from the trunk, by `columnKey`. */
  readonly columns: ReadonlyMap<number, readonly number[]>;
}

export const columnKey = (dx: number, dz: number): number => (dz + 32) * 64 + (dx + 32);

// A person is two blocks tall (rows 1 and 2 above the ground): no street or garden tree has a leaf lower than row 3 anywhere a
// person can stand beside the trunk, which `tests/tempest/trees.test.ts` checks.
const streetSakura = (out: BlockList, rng: Rng, lean: Lean, size: number): void => {
  const h = 5 + rng.int(2);
  const ox = LEAN_DX[lean], oz = LEAN_DZ[lean];
  trunk(out, 1, h, NatureBlock.SAKURA_LOG);
  if (lean !== 4) out.add(ox, h, oz, NatureBlock.SAKURA_LOG);
  // Over a street the crown sits to the side, so it clears the houses behind the trunk.
  blob(out, ox * 2, h + 1, oz * 2, 2.6 * size, 1.9, NatureBlock.SAKURA_LEAVES, rng);
  if (rng.chance(0.7)) blob(out, ox * 2 + (oz !== 0 ? 2 : 0), h, oz * 2 + (ox !== 0 ? 2 : 0), 1.7 * size, 1.4, NatureBlock.SAKURA_LEAVES, rng);
};

const streetCedar = (out: BlockList, rng: Rng, size: number): void => {
  const h = 7 + rng.int(4);
  trunk(out, 1, h, NatureBlock.CEDAR_LOG);
  out.add(0, h + 1, 0, NatureBlock.CEDAR_LEAVES);
  out.add(0, h + 2, 0, NatureBlock.CEDAR_LEAVES);
  for (let tier = 0, dy = h; dy >= 4; tier++, dy -= 2) {
    const r = Math.min(size > 1 ? 3 : 2, 1 + Math.floor(tier * 0.55));
    disc(out, dy, r, NatureBlock.CEDAR_LEAVES, rng, 0.2);
    if (r > 1) disc(out, dy - 1, r - 1, NatureBlock.CEDAR_LEAVES, rng, 0.1);
  }
};

const streetBirch = (out: BlockList, rng: Rng, lean: Lean): void => {
  const h = 5 + rng.int(3);
  const ox = LEAN_DX[lean], oz = LEAN_DZ[lean];
  trunk(out, 1, h, BlockType.BIRCH_LOG);
  blob(out, ox * 2, h + 2, oz * 2, 2.3, 2.5, BlockType.BIRCH_LEAVES, rng);
};

const FEATURES: Partial<Record<TreeKind, Feature>> = {
  cedar: new CedarTree(), oak: new OakTree(), birch: new BirchTree(), sakura: new SakuraTree(), bamboo: new BambooClump(),
};
const CTX = { x: 0, z: 0, ground: 0, biome: Biome.CEDAR_FOREST };

const cache = new Map<number, TreeShape>();

const finish = (kind: TreeKind, list: BlockList): TreeShape => {
  const columns = new Map<number, number[]>();
  let reach = 0, top = 0;
  for (let i = 0; i < list.length; i++) {
    const k = columnKey(list.dx[i], list.dz[i]);
    const at = columns.get(k);
    if (at) at.push(i); else columns.set(k, [i]);
    reach = Math.max(reach, Math.abs(list.dx[i]), Math.abs(list.dz[i]));
    top = Math.max(top, list.dy[i]);
  }
  return {
    kind, length: list.length, dx: list.dx.slice(0, list.length), dy: list.dy.slice(0, list.length), dz: list.dz.slice(0, list.length),
    id: list.id.slice(0, list.length), place: list.place.slice(0, list.length), reach, top, columns,
  };
};

/**
 * The shape of a street or garden tree: small, with the crown leaned to one side or upright. `size` 1 is the street
 * tree, a smaller 0.8 fits in a narrow garden. Cached by kind, variant, lean and size.
 */
export const smallTree = (kind: TreeKind, variant: number, lean: Lean = 4, size = 1): TreeShape => {
  const key = hash2(TREE_KINDS.indexOf(kind) * 64 + (variant % VARIANTS) * 8 + lean, Math.round(size * 10), 0x5d3a);
  let shape = cache.get(key);
  if (!shape) {
    const rng = new Rng(key);
    const out = new BlockList();
    if (kind === 'sakura') streetSakura(out, rng, lean, size);
    else if (kind === 'cedar') streetCedar(out, rng, size);
    else if (kind === 'birch') streetBirch(out, rng, lean);
    else FEATURES[kind]!.build(CTX, rng, out);
    shape = finish(kind, out);
    cache.set(key, shape);
  }
  return shape;
};

/** The shape of one of the wilderness's own trees (the forest round the town): the same features the wild uses, cached per variant. */
export const forestTree = (kind: TreeKind, variant: number): TreeShape => {
  const key = hash2(TREE_KINDS.indexOf(kind) * 64 + (variant % VARIANTS), 0xf0e5, 0x77);
  let shape = cache.get(key);
  if (!shape) {
    const out = new BlockList();
    FEATURES[kind]!.build(CTX, new Rng(key), out);
    shape = finish(kind, out);
    cache.set(key, shape);
  }
  return shape;
};

