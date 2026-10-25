import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { NatureBlock } from '../../content/blocksNature';
import { TempestBlock } from '../../content/blocksTempest';
import { BlockRegistry } from '../../engine/BlockRegistry';
import { BucketData, MeshData, WATER_DEPTH_MAX, meshChunk } from '../../meshing/ChunkMesher';
import { BlockType } from '../../worldConstants';
import { MapReader, quadsOf } from './helpers';

// The wind weights the mesher writes into the `sway` buffer: how each block's BlockDef.sway turns into a weight per
// vertex (docs/effects.md). Weights are worked out from the shape alone, so nothing here needs a clock.

const registry = createDefaultRegistry();
registry.register({ id: 4001, name: 'test:swaying_cube', color: '#00ff00', solid: true, opaque: false, emits: 0, sway: 0.5 });
const SWAYING_CUBE = 4001;

const mesh = (reader: MapReader, options = {}): MeshData => meshChunk(reader, 0, 0, registry, options);
const weights = (bucket: BucketData): number[] => Array.from(bucket.sway);
const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;

// Vertices of a bucket as [localY, weight] pairs.
const heightsAndWeights = (bucket: BucketData): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  for (let v = 0; v < bucket.sway.length; v++) out.push([bucket.positions[v * 3 + 1], bucket.sway[v]]);
  return out;
};

describe('BlockDef.sway', () => {
  it('is read back from the registry, 0 for blocks that do not set it and for unknown ids', () => {
    expect(registry.sway(BlockType.LEAVES)).toBeGreaterThan(0);
    expect(registry.sway(BlockType.STONE)).toBe(0);
    expect(registry.sway(NatureBlock.CEDAR_LOG)).toBe(0);
    expect(registry.sway(4090)).toBe(0);
  });

  it('is rejected outside 0 to 1', () => {
    const r = new BlockRegistry();
    const def = { id: 1, name: 'a:b', color: '#000000', solid: true, opaque: true, emits: 0 };
    expect(() => r.register({ ...def, sway: -0.1 })).toThrow(/sway/);
    expect(() => r.register({ ...def, sway: 1.5 })).toThrow(/sway/);
    expect(() => r.register({ ...def, sway: Number.NaN })).toThrow(/sway/);
    expect(() => r.register({ ...def, sway: 1 })).not.toThrow();
  });

  it('is set on leaves, grass, bamboo and reeds, and not on trunks, ground, litter, mushrooms or Tempest timber', () => {
    for (const id of [BlockType.LEAVES, BlockType.BIRCH_LEAVES, BlockType.PINE_LEAVES, NatureBlock.CEDAR_LEAVES,
      NatureBlock.SAKURA_LEAVES, NatureBlock.SNOWY_PINE_LEAVES, BlockType.TALL_GRASS, BlockType.FLOWER_RED,
      NatureBlock.BAMBOO, NatureBlock.BAMBOO_LEAVES, NatureBlock.REEDS, NatureBlock.FERN, BlockType.WHEAT]) {
      expect(registry.sway(id), registry.get(id).name).toBeGreaterThan(0);
      expect(registry.sway(id)).toBeLessThanOrEqual(1);
    }
    for (const id of [BlockType.WOOD_LOG, BlockType.GRASS, BlockType.DIRT, BlockType.STONE, BlockType.WATER,
      BlockType.LILY_PAD, NatureBlock.CEDAR_LOG, NatureBlock.FALLEN_LEAVES, NatureBlock.SAKURA_PETALS,
      NatureBlock.MUSHROOM_RED, TempestBlock.BAMBOO_POLE, TempestBlock.BAMBOO_FENCE]) {
      expect(registry.sway(id), registry.get(id).name).toBe(0);
    }
  });
});

describe('sway weights in the mesher', () => {
  it('writes one weight per vertex in a bucket that sways, and nothing in one that does not', () => {
    const m = mesh(new MapReader([[3, 3, 3, BlockType.LEAVES], [6, 3, 3, BlockType.TALL_GRASS], [9, 3, 3, BlockType.STONE]]));
    expect(m.cutout.sway.length).toBe(m.cutout.positions.length / 3);
    expect(m.cutout.sway.length).toBeGreaterThan(0);
    expect(m.opaque.positions.length).toBeGreaterThan(0);
    expect(m.opaque.sway.length).toBe(0);
    expect(m.water.sway.length).toBe(0);
  });

  it('writes a weight for a swaying block that is opaque, so the opaque material can move it too', () => {
    const own = createDefaultRegistry();
    own.register({ id: 4002, name: 'test:swaying_opaque', color: '#00ff00', solid: true, opaque: true, emits: 0, sway: 0.25 });
    const m = meshChunk(new MapReader([[3, 3, 3, 4002]]), 0, 0, own);
    expect(m.opaque.sway.length).toBe(24);
    expect(m.cutout.sway.length).toBe(0);
    for (const w of weights(m.opaque)) expect(near(w, 0.25)).toBe(true);
  });

  it('gives a leaf cube the block strength on every vertex of every face', () => {
    const m = mesh(new MapReader([[3, 3, 3, BlockType.LEAVES]]));
    expect(m.cutout.sway.length).toBe(24);
    for (const w of weights(m.cutout)) expect(near(w, registry.sway(BlockType.LEAVES))).toBe(true);
    // The strength is the block's own: another cube with another strength gets that one.
    const other = mesh(new MapReader([[3, 3, 3, SWAYING_CUBE]]));
    for (const w of weights(other.cutout)) expect(near(w, 0.5)).toBe(true);
  });

  it('does not sway a trunk, a stone or the ground: they get no weights at all', () => {
    const m = mesh(new MapReader([[3, 3, 3, BlockType.WOOD_LOG], [5, 3, 3, BlockType.STONE], [7, 3, 3, BlockType.GRASS]]));
    expect(m.opaque.positions.length).toBeGreaterThan(0);
    expect(m.opaque.sway.length).toBe(0);
  });

  it('writes a zero for a block that does not sway in a bucket that does', () => {
    // Glass and leaves share the cutout bucket.
    const m = mesh(new MapReader([[3, 3, 3, BlockType.LEAVES], [6, 3, 3, BlockType.GLASS]]));
    const hw = weights(m.cutout);
    expect(hw.length).toBe(m.cutout.positions.length / 3);
    expect(hw.filter((w) => w === 0).length).toBe(24);
    expect(hw.filter((w) => w > 0).length).toBe(24);
  });

  it('keeps the base of a plant still and moves its top most', () => {
    const m = mesh(new MapReader([[4, 5, 4, BlockType.TALL_GRASS]]));
    const hw = heightsAndWeights(m.cutout);
    expect(hw.length).toBeGreaterThan(0);
    const base = hw.filter(([h]) => near(h, 5));
    const top = hw.filter(([h]) => h > 5.8);
    expect(base.length).toBeGreaterThan(0);
    expect(top.length).toBeGreaterThan(0);
    for (const [, w] of base) expect(w).toBe(0);
    for (const [, w] of top) {
      expect(w).toBeGreaterThan(0.7 * registry.sway(BlockType.TALL_GRASS));
      expect(w).toBeLessThanOrEqual(registry.sway(BlockType.TALL_GRASS) + 1e-6);
    }
    // Weight never falls as the vertex rises.
    const sorted = [...hw].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i][1]).toBeGreaterThanOrEqual(sorted[i - 1][1] - 1e-9);
  });

  it('makes a stack of bamboo one stalk: the weight at the top of a cell is the weight at the bottom of the next', () => {
    const column = [0, 1, 2, 3, 4, 5].map((k): [number, number, number, number] => [4, 10 + k, 4, NatureBlock.BAMBOO]);
    const m = mesh(new MapReader(column));
    const hw = heightsAndWeights(m.cutout);
    const at = (h: number): number[] => hw.filter(([y]) => near(y, h)).map(([, w]) => w);
    // The stalk is rooted at its lowest block and the weight rises with height up it.
    for (const w of at(10)) expect(w).toBe(0);
    // The cross model is one block tall, so the vertices at a whole height are shared by two cells: top of one, base of the next.
    for (let h = 11; h <= 16; h++) {
      const ws = at(h);
      expect(ws.length).toBeGreaterThan(0);
      for (const w of ws) expect(near(w, ws[0])).toBe(true);
      // It rises for the first four blocks of the stalk, and has reached the strength of the block by 14.
      if (h <= 14) expect(ws[0]).toBeGreaterThan(at(h - 1)[0]);
      else expect(near(ws[0], registry.sway(NatureBlock.BAMBOO))).toBe(true);
    }
  });

  it('roots a lone plant on its own cell, however many of the same block stand elsewhere in the chunk', () => {
    const lone = mesh(new MapReader([[4, 5, 4, NatureBlock.BAMBOO], [8, 5, 4, NatureBlock.BAMBOO]]));
    const hw = heightsAndWeights(lone.cutout);
    for (const [h, w] of hw) if (near(h, 5)) expect(w).toBe(0);
    const topWeights = hw.filter(([h]) => h > 5.9).map(([, w]) => w);
    expect(Math.max(...topWeights)).toBeGreaterThan(0.9 * registry.sway(NatureBlock.BAMBOO));
  });

  it('writes the same weights for the same blocks wherever they are', () => {
    const a = mesh(new MapReader([[3, 6, 3, NatureBlock.REEDS], [3, 7, 3, NatureBlock.REEDS]]));
    const b = mesh(new MapReader([[20, 40, 17, NatureBlock.REEDS], [20, 41, 17, NatureBlock.REEDS]]));
    expect(weights(a.cutout)).toEqual(weights(b.cutout));
  });

  it('leaves the rest of the mesh exactly as it was', () => {
    const reader = new MapReader([
      [3, 3, 3, BlockType.LEAVES], [3, 3, 4, BlockType.LEAVES], [5, 3, 3, NatureBlock.BAMBOO], [5, 4, 3, NatureBlock.BAMBOO],
      [7, 3, 3, BlockType.STONE], [8, 3, 3, BlockType.WATER], [8, 4, 3, BlockType.WATER],
    ]);
    const on = mesh(reader);
    const off = mesh(reader, { sway: false });
    for (const name of ['opaque', 'cutout', 'water'] as const) {
      for (const key of ['positions', 'normals', 'light', 'tints', 'uvs', 'layers', 'indices'] as const) {
        expect(Array.from(on[name][key]), `${name}.${key}`).toEqual(Array.from(off[name][key]));
      }
    }
  });

  it('is empty, not zeros, when sway is turned off', () => {
    const reader = new MapReader([[3, 3, 3, BlockType.LEAVES], [5, 3, 3, BlockType.TALL_GRASS], [7, 3, 3, BlockType.STONE]]);
    const off = mesh(reader, { sway: false });
    for (const name of ['opaque', 'cutout', 'water'] as const) expect(off[name].sway.length).toBe(0);
    // And it is not just a matter of nothing swaying: with it on, the same blocks do have weights.
    expect(weights(mesh(reader).cutout).some((w) => w > 0)).toBe(true);
  });

  it('is empty when nothing in the registry sways, even with sway asked for', () => {
    const bare = new BlockRegistry();
    bare.register({ id: 1, name: 'a:stone', color: '#808080', solid: true, opaque: true, emits: 0 });
    bare.register({ id: 2, name: 'a:glass', color: '#aaccff', solid: true, opaque: false, emits: 0 });
    const m = meshChunk(new MapReader([[3, 3, 3, 1], [5, 3, 3, 2]]), 0, 0, bare);
    for (const name of ['opaque', 'cutout', 'water'] as const) expect(m[name].sway.length).toBe(0);
    expect(m.opaque.positions.length).toBeGreaterThan(0);
  });

  it('does not leave weights behind from one chunk to the next', () => {
    const leaves = new MapReader([[3, 3, 3, BlockType.LEAVES]]);
    const stone = new MapReader([[3, 3, 3, BlockType.STONE]]);
    mesh(leaves);
    const after = mesh(stone);
    expect(after.opaque.sway.length).toBe(0);
    mesh(leaves, { sway: false });
    const again = mesh(leaves);
    for (const w of weights(again.cutout)) expect(w).toBeGreaterThan(0);
  });

  it('does not change what is drawn: faces culled between leaves stay culled, the light is the same', () => {
    const reader = new MapReader([[3, 3, 3, BlockType.LEAVES], [4, 3, 3, BlockType.LEAVES]]);
    const m = mesh(reader);
    // Two leaf cubes side by side: ten faces, the two shared ones culled.
    expect(m.cutout.indices.length / 6).toBe(10);
    expect(quadsOf(m.cutout).every((q) => q.corners.every((c) => c.sky === 1 && c.block === 0))).toBe(true);
  });
});

describe('water depth in the tint channel', () => {
  // A pool: water from y 2 to y `top` on a floor of stone, in a 5x5 patch; the rest of the chunk is air.
  const pool = (depth: number, extra: Array<[number, number, number, number]> = []): MeshData => {
    const blocks: Array<[number, number, number, number]> = [];
    for (let x = 4; x < 9; x++) {
      for (let z = 4; z < 9; z++) {
        blocks.push([x, 1, z, BlockType.STONE]);
        for (let k = 0; k < depth; k++) blocks.push([x, 2 + k, z, BlockType.WATER]);
      }
    }
    return mesh(new MapReader([...blocks, ...extra]));
  };

  const topQuads = (m: MeshData) => quadsOf(m.water).filter((q) => q.normal[1] === 1);

  it('writes how deep the water is under each corner of its surface, 0 to 1', () => {
    const shallow = topQuads(pool(1));
    const deep = topQuads(pool(4));
    const centre = (qs: ReturnType<typeof topQuads>) => qs.find((q) => q.corners.every((c) => c.pos[0] > 5 && c.pos[0] < 8 && c.pos[2] > 5 && c.pos[2] < 8))!;
    // Water 1 cell deep reads as 1 / WATER_DEPTH_MAX under a vertex surrounded by water, 4 cells deep as 4 / WATER_DEPTH_MAX.
    expect(centre(shallow).corners[0].tint[0]).toBeCloseTo(1 / WATER_DEPTH_MAX, 6);
    expect(centre(deep).corners[0].tint[0]).toBeCloseTo(4 / WATER_DEPTH_MAX, 6);
    for (const q of [...shallow, ...deep]) {
      for (const c of q.corners) {
        expect(c.tint[0]).toBeGreaterThanOrEqual(0);
        expect(c.tint[0]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('caps the depth at WATER_DEPTH_MAX cells', () => {
    const m = pool(WATER_DEPTH_MAX + 4);
    const deepest = Math.max(...topQuads(m).flatMap((q) => q.corners.map((c) => c.tint[0])));
    expect(deepest).toBe(1);
  });

  it('marks the shore: 0 in open water, up to 1 at a corner where the other three cells are land', () => {
    const quads = topQuads(pool(2));
    const shore = (x: number, z: number): number => {
      const hits = quads.flatMap((q) => q.corners).filter((c) => Math.abs(c.pos[0] - x) < 1e-6 && Math.abs(c.pos[2] - z) < 1e-6);
      expect(hits.length).toBeGreaterThan(0);
      return hits[0].tint[1];
    };
    expect(shore(6, 6)).toBe(0);   // surrounded by water
    expect(shore(4, 6)).toBeCloseTo(2 / 3, 6); // on the edge: two of the four cells around the corner are water
    expect(shore(4, 4)).toBeCloseTo(1, 6);     // the corner of the pool: only one is
    expect(shore(9, 9)).toBeCloseTo(1, 6);
  });

  it('gives a vertical face its own column depth and no shore', () => {
    // A water cell with air at its east side: one wall face, in a column two deep.
    const m = mesh(new MapReader([[5, 1, 5, BlockType.STONE], [5, 2, 5, BlockType.WATER], [5, 3, 5, BlockType.WATER]]));
    const wall = quadsOf(m.water).filter((q) => q.normal[0] === 1 && q.corners[0].pos[1] >= 3 - 1e-6);
    expect(wall.length).toBe(1);
    for (const c of wall[0].corners) {
      expect(c.tint[0]).toBeCloseTo(2 / WATER_DEPTH_MAX, 6);
      expect(c.tint[1]).toBe(0);
    }
  });

  it('counts a lily pad as water and does not read below the bottom of the grid', () => {
    const m = mesh(new MapReader([[5, 0, 5, BlockType.WATER], [5, 1, 5, BlockType.LILY_PAD]]));
    const tops = topQuads(m);
    expect(tops.length).toBeGreaterThan(0);
    for (const q of tops) for (const c of q.corners) expect(Number.isFinite(c.tint[0])).toBe(true);
  });

  it('does not change which water faces are drawn', () => {
    const m = pool(3);
    // A 5x5x3 block of water: top 25 faces and a ring of side faces 4 x 5 x 3, nothing against the stone floor.
    expect(m.water.indices.length / 6).toBe(25 + 4 * 5 * 3);
  });
});
