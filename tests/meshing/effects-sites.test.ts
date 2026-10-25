import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { NatureBlock } from '../../content/blocksNature';
import { TempestBlock, TempestFxBlock } from '../../content/blocksTempest';
import { BlockRegistry } from '../../engine/BlockRegistry';
import { BlockFx, FX_KINDS, FX_KIND_COUNT } from '../../engine/blockFx';
import { MeshData, SITE_DROP_MAX, SITE_LIMITS, SITE_STRIDE, meshChunk } from '../../meshing/ChunkMesher';
import { BlockType } from '../../worldConstants';
import { MapReader } from './helpers';

// The effect sites the mesher notes while it walks a chunk (MeshData.sites) and the flicker weights it writes: which blocks
// carry them (BlockDef.fx and BlockDef.flicker), what each kind of site needs of its surroundings, how many a chunk keeps.

const registry = createDefaultRegistry();
const KIND = Object.fromEntries(FX_KINDS.map((k, i) => [k, i])) as Record<(typeof FX_KINDS)[number], number>;
const mesh = (reader: MapReader, options = {}): MeshData => meshChunk(reader, 0, 0, registry, options);

// The sites of one kind as [x, y, z, id, drop].
const sitesOf = (m: MeshData, kind: number): Array<[number, number, number, number, number]> => {
  const list = m.sites[kind];
  const out: Array<[number, number, number, number, number]> = [];
  for (let o = 0; o < list.length; o += SITE_STRIDE) out.push([list[o], list[o + 1], list[o + 2], list[o + 3] & 0xfff, list[o + 3] >> 12]);
  return out;
};

describe('BlockDef.fx and BlockDef.flicker', () => {
  it('are read back from the registry, 0 for blocks that set none and for unknown ids', () => {
    expect(registry.fx(NatureBlock.SAKURA_LEAVES)).toBe(BlockFx.PETALS);
    expect(registry.fx(BlockType.STONE)).toBe(0);
    expect(registry.fx(4090)).toBe(0);
    expect(registry.flicker(BlockType.LANTERN)).toBeGreaterThan(0);
    expect(registry.flicker(BlockType.STONE)).toBe(0);
    expect(registry.flicker(4090)).toBe(0);
  });

  it('are validated: fx is a set of the known bits, flicker is 0 to 1', () => {
    const r = new BlockRegistry();
    const def = { id: 1, name: 'a:b', color: '#000000', solid: true, opaque: true, emits: 0 };
    expect(() => r.register({ ...def, fx: -1 })).toThrow(/fx/);
    expect(() => r.register({ ...def, fx: 1 << FX_KIND_COUNT })).toThrow(/fx/);
    expect(() => r.register({ ...def, fx: 1.5 })).toThrow(/fx/);
    expect(() => r.register({ ...def, flicker: -0.1 })).toThrow(/flicker/);
    expect(() => r.register({ ...def, flicker: 2 })).toThrow(/flicker/);
    expect(() => r.register({ ...def, flicker: Number.NaN })).toThrow(/flicker/);
    expect(() => r.register({ ...def, fx: BlockFx.LAMP | BlockFx.EMBERS, flicker: 1 })).not.toThrow();
  });

  it('put each effect on the right blocks and no others', () => {
    const byFlag = (flag: number): string[] => registry.all().filter((d) => (registry.fx(d.id) & flag) !== 0).map((d) => d.name.replace('voxelverse:', ''));
    expect(byFlag(BlockFx.PETALS)).toEqual(['sakura_leaves']);
    expect(byFlag(BlockFx.SMOKE)).toEqual(['smoke_vent']);
    expect(byFlag(BlockFx.EMBERS)).toEqual(['hearth']);
    expect(byFlag(BlockFx.LAMP).sort()).toEqual(['blue_ore_lamp', 'green_ore_lamp', 'lantern', 'paper_lantern_red', 'paper_lantern_striped', 'stone_lantern_light']);
    const habitat = byFlag(BlockFx.HABITAT);
    for (const name of ['tall_grass', 'flower_red', 'wheat', 'lily_pad', 'fern', 'reeds', 'wildflower_pink', 'koi_pond']) expect(habitat).toContain(name);
    for (const name of ['stone', 'grass', 'sakura_leaves', 'bamboo', 'timber_post']) expect(habitat).not.toContain(name);
  });

  it('give the smoke vent the id 200, outside the 72 blocks of the Tempest set', () => {
    expect(TempestFxBlock.SMOKE_VENT).toBe(200);
    expect(registry.get(200).name).toBe('voxelverse:smoke_vent');
    expect(registry.isSolid(200)).toBe(true);
  });
});

describe('effect sites', () => {
  it('has one array per kind, empty for a chunk with nothing', () => {
    const m = mesh(new MapReader([[3, 3, 3, BlockType.STONE]]));
    expect(m.sites).toHaveLength(FX_KIND_COUNT);
    for (const list of m.sites) expect(list.length).toBe(0);
  });

  it('notes every smoke vent, lamp and hearth with its world position and block', () => {
    const m = mesh(new MapReader([
      [5, 9, 6, TempestFxBlock.SMOKE_VENT], [8, 4, 2, TempestBlock.PAPER_LANTERN_RED], [9, 4, 2, TempestBlock.BLUE_ORE_LAMP],
      [2, 1, 12, TempestBlock.HEARTH], [3, 1, 12, BlockType.LANTERN],
    ]));
    expect(sitesOf(m, KIND.smoke)).toEqual([[5, 9, 6, TempestFxBlock.SMOKE_VENT, 0]]);
    expect(sitesOf(m, KIND.lamp)).toEqual(expect.arrayContaining([
      [8, 4, 2, TempestBlock.PAPER_LANTERN_RED, 0], [9, 4, 2, TempestBlock.BLUE_ORE_LAMP, 0], [3, 1, 12, BlockType.LANTERN, 0],
    ]));
    expect(sitesOf(m, KIND.lamp)).toHaveLength(3);
    expect(sitesOf(m, KIND.embers)).toEqual([[2, 1, 12, TempestBlock.HEARTH, 0]]);
  });

  it('uses the world position, not the chunk-local one', () => {
    const m = meshChunk(new MapReader([[70, 5, -30, TempestFxBlock.SMOKE_VENT]]), 2, -1, registry);
    expect(sitesOf(m, KIND.smoke)).toEqual([[70, 5, -30, TempestFxBlock.SMOKE_VENT, 0]]);
  });

  it('keeps petals sparse and only from leaves that are open underneath, and records the fall', () => {
    const blocks: Array<[number, number, number, number]> = [];
    for (let x = 0; x < 30; x++) {
      for (let z = 0; z < 30; z++) {
        blocks.push([x, 2, z, BlockType.STONE]);        // ground; its top is the cell above 2
        blocks.push([x, 12, z, NatureBlock.SAKURA_LEAVES]); // a canopy 9 cells of air above the ground
        blocks.push([x, 13, z, NatureBlock.SAKURA_LEAVES]); // a second layer: closed underneath, never a site
      }
    }
    const m = mesh(new MapReader(blocks));
    const sites = sitesOf(m, KIND.petals);
    expect(sites.length).toBeGreaterThan(20);
    expect(sites.length).toBeLessThanOrEqual(SITE_LIMITS[KIND.petals].cap);
    for (const [, y, , id, drop] of sites) {
      expect(y).toBe(12);
      expect(id).toBe(NatureBlock.SAKURA_LEAVES);
      expect(drop).toBe(9); // cells 3 to 11
    }
  });

  it('records no more fall than SITE_DROP_MAX', () => {
    const blocks: Array<[number, number, number, number]> = [];
    for (let x = 0; x < 30; x++) for (let z = 0; z < 30; z++) blocks.push([x, 150, z, NatureBlock.SAKURA_LEAVES]);
    const m = mesh(new MapReader(blocks));
    const sites = sitesOf(m, KIND.petals);
    expect(sites.length).toBeGreaterThan(0);
    for (const [, , , , drop] of sites) expect(drop).toBeLessThanOrEqual(SITE_DROP_MAX);
  });

  it('notes habitat only where there is air above, one cell in four, up to the cap', () => {
    const blocks: Array<[number, number, number, number]> = [];
    for (let x = 0; x < 32; x++) {
      for (let z = 0; z < 32; z++) {
        blocks.push([x, 3, z, BlockType.GRASS]);
        blocks.push([x, 4, z, BlockType.TALL_GRASS]);
        if (x >= 28) blocks.push([x, 5, z, BlockType.STONE]); // a ceiling over the last columns
      }
    }
    const m = mesh(new MapReader(blocks));
    const sites = sitesOf(m, KIND.habitat);
    expect(sites.length).toBeGreaterThan(40);
    expect(sites.length).toBeLessThanOrEqual(SITE_LIMITS[KIND.habitat].cap);
    for (const [x, y, , id] of sites) {
      expect(y).toBe(4);
      expect(id).toBe(BlockType.TALL_GRASS);
      expect(x).toBeLessThan(28);
    }
  });

  it('caps each kind per chunk', () => {
    const blocks: Array<[number, number, number, number]> = [];
    for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) {
      blocks.push([x, 5, z, BlockType.LANTERN]);
      blocks.push([x, 9, z, TempestFxBlock.SMOKE_VENT]);
    }
    const m = mesh(new MapReader(blocks));
    expect(sitesOf(m, KIND.lamp)).toHaveLength(SITE_LIMITS[KIND.lamp].cap);
    expect(sitesOf(m, KIND.smoke)).toHaveLength(SITE_LIMITS[KIND.smoke].cap);
  });

  it('picks the same sites however the chunk is met: the same blocks give the same sites', () => {
    const blocks: Array<[number, number, number, number]> = [];
    for (let x = 0; x < 20; x++) for (let z = 0; z < 20; z++) blocks.push([x, 3, z, BlockType.TALL_GRASS]);
    const a = sitesOf(mesh(new MapReader(blocks)), KIND.habitat);
    const b = sitesOf(mesh(new MapReader([...blocks].reverse())), KIND.habitat);
    expect(a).toEqual(b);
  });

  it('writes none, and no flicker weights, with options.effects false', () => {
    const reader = new MapReader([[5, 9, 6, TempestFxBlock.SMOKE_VENT], [8, 4, 2, TempestBlock.PAPER_LANTERN_RED], [2, 1, 12, TempestBlock.HEARTH]]);
    const m = mesh(reader, { effects: false });
    for (const list of m.sites) expect(list.length).toBe(0);
    expect(m.cutout.flicker.length).toBe(0);
    // and the rest of the mesh is the same as with them on
    const on = mesh(reader);
    expect(Array.from(m.cutout.positions)).toEqual(Array.from(on.cutout.positions));
    expect(Array.from(m.cutout.light)).toEqual(Array.from(on.cutout.light));
  });
});

describe('flicker weights', () => {
  it('give every vertex of a flickering block its strength, and nothing else any', () => {
    const m = mesh(new MapReader([[4, 4, 4, TempestBlock.PAPER_LANTERN_RED], [8, 4, 4, TempestBlock.TIMBER_POST], [12, 4, 4, BlockType.GLASS]]));
    expect(m.cutout.flicker.length).toBe(m.cutout.positions.length / 3);
    const strength = registry.flicker(TempestBlock.PAPER_LANTERN_RED);
    let flickering = 0;
    for (let v = 0; v < m.cutout.flicker.length; v++) {
      const x = m.cutout.positions[v * 3];
      if (x < 6) {
        expect(m.cutout.flicker[v]).toBeCloseTo(strength, 6);
        flickering++;
      } else {
        expect(m.cutout.flicker[v]).toBe(0);
      }
    }
    expect(flickering).toBeGreaterThan(0);
    expect(m.opaque.flicker.length).toBe(0); // the post is opaque and does not flicker
    expect(m.water.flicker.length).toBe(0);
  });

  it('leave a bucket with no flickering block without the buffer', () => {
    const m = mesh(new MapReader([[4, 4, 4, BlockType.GLASS], [8, 4, 4, BlockType.STONE]]));
    expect(m.cutout.flicker.length).toBe(0);
    expect(m.opaque.flicker.length).toBe(0);
  });

  it('do not leak from one block or one call to the next', () => {
    const a = mesh(new MapReader([[4, 4, 4, BlockType.LANTERN]]));
    const b = mesh(new MapReader([[4, 4, 4, BlockType.GLASS]]));
    expect(a.cutout.flicker.length).toBeGreaterThan(0);
    expect(b.cutout.flicker.length).toBe(0);
  });

  it('are the same strength on a hearth, a stone lantern and a shoji lamp as the table says', () => {
    for (const id of [TempestBlock.HEARTH, TempestBlock.STONE_LANTERN_LIGHT, TempestBlock.SHOJI_PANE_LIT]) {
      const m = mesh(new MapReader([[4, 4, 4, id]]));
      const w = Array.from(m.cutout.flicker);
      expect(w.length, registry.get(id).name).toBeGreaterThan(0);
      for (const x of w) expect(x).toBeCloseTo(registry.flicker(id), 6);
    }
  });
});
