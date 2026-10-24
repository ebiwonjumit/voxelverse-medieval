import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { NatureBlock } from '../../content/blocksNature';
import { Chunk } from '../../engine/Chunk';
import { cellId } from '../../engine/cell';
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from '../../engine/coords';
import { BlockType, WATER_LEVEL } from '../../worldConstants';
import { Biome } from '../../worldgen/biomes/Biome';
import { BlockList } from '../../worldgen/features/BlockList';
import { BambooClump } from '../../worldgen/features/BambooClump';
import { Boulder } from '../../worldgen/features/Boulder';
import { FallenLog } from '../../worldgen/features/FallenLog';
import { ReedBed } from '../../worldgen/features/ReedBed';
import { RoadMask } from '../../worldgen/features/RoadField';
import { UndergrowthPatch } from '../../worldgen/features/UndergrowthPatch';
import { canReplace } from '../../worldgen/features/blockClass';
import { BirchTree, CedarTree, OakTree, PineTree, SakuraTree } from '../../worldgen/features/trees';
import { Feature } from '../../worldgen/features/Feature';
import { Rng } from '../../worldgen/noise';
import { createVoxelverseGenerator } from '../../worldgen/VoxelverseGenerator';
import { timeoutMs, tolerant } from '../perf';

const registry = createDefaultRegistry();
const gen = createVoxelverseGenerator(registry);

const TREE_BLOCKS = new Set<number>([
  BlockType.WOOD_LOG, BlockType.LEAVES, BlockType.BIRCH_LOG, BlockType.BIRCH_LEAVES, BlockType.PINE_LEAVES,
  NatureBlock.CEDAR_LOG, NatureBlock.CEDAR_LEAVES, NatureBlock.SAKURA_LOG, NatureBlock.SAKURA_LEAVES,
  NatureBlock.PINE_LOG, NatureBlock.SNOWY_PINE_LEAVES,
]);
const LOGS = new Set<number>([BlockType.WOOD_LOG, BlockType.BIRCH_LOG, NatureBlock.CEDAR_LOG, NatureBlock.SAKURA_LOG, NatureBlock.PINE_LOG]);

const make = (cx: number, cz: number, options?: { lod?: number }): Chunk => {
  const chunk = new Chunk(cx, cz);
  gen.generateChunk(chunk, options);
  return chunk;
};

const hashChunk = (g: ReturnType<typeof createVoxelverseGenerator>, cx: number, cz: number): number => {
  const chunk = new Chunk(cx, cz);
  g.generateChunk(chunk);
  let h = 2166136261;
  for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let y = WORLD_MIN_Y; y <= WORLD_MAX_Y; y++) h = Math.imul(h ^ chunk.getCell(lx, y, lz), 16777619);
  }
  return h >>> 0;
};

// Chunk spots in woods of every kind: the Tempest belt, the dense south, the north, home country and wetland.
const FOREST_SPOTS: Array<[number, number]> = [[40, 26], [46, 28], [10, 140], [-5, 150], [20, 142], [0, -75], [-30, 60]];

describe('features across chunk borders', () => {
  const seamColumns = (a: Chunk, b: Chunk, alongX: boolean): { checked: number; treeBlocks: number; mismatches: string[] } => {
    // Compare both chunks' columns on each side of the seam with sampleBlock, above the ground.
    let checked = 0, treeBlocks = 0;
    const mismatches: string[] = [];
    for (let k = 0; k < CHUNK_SIZE; k++) {
      for (const [chunk, local] of [[a, CHUNK_SIZE - 1], [a, CHUNK_SIZE - 2], [b, 0], [b, 1]] as Array<[Chunk, number]>) {
        const lx = alongX ? local : k;
        const lz = alongX ? k : local;
        const x = chunk.cx * CHUNK_SIZE + lx;
        const z = chunk.cz * CHUNK_SIZE + lz;
        const ground = gen.terrainHeight(x, z);
        for (let y = ground - 1; y <= ground + 32; y++) {
          const cell = cellId(chunk.getCell(lx, y, lz));
          const sampled = gen.sampleBlock(x, y, z);
          checked++;
          if (TREE_BLOCKS.has(cell)) treeBlocks++;
          if (cell !== sampled && mismatches.length < 5) mismatches.push(`${x},${y},${z}: chunk ${cell}, sampleBlock ${sampled}`);
        }
      }
    }
    return { checked, treeBlocks, mismatches };
  };

  it('agree with sampleBlock on both sides of every seam between adjacent chunks', () => {
    let trees = 0, checked = 0;
    for (const [cx, cz] of FOREST_SPOTS) {
      const here = make(cx, cz);
      const east = make(cx + 1, cz);
      const south = make(cx, cz + 1);
      for (const [a, b, alongX] of [[here, east, true], [here, south, false]] as Array<[Chunk, Chunk, boolean]>) {
        const r = seamColumns(a, b, alongX);
        expect(r.mismatches, `seam at chunk ${cx},${cz}`).toEqual([]);
        trees += r.treeBlocks;
        checked += r.checked;
      }
    }
    console.info(`${checked} seam cells compared, ${trees} of them tree blocks`);
    // The test means something only if trees really do stand on the seams.
    expect(trees).toBeGreaterThan(300);
  });

  it('place a tree that crosses a seam identically in both chunks', () => {
    // Find a tree whose canopy has blocks in both chunks, by looking for leaves on both sides of a seam in the same row.
    let found = 0;
    for (const [cx, cz] of FOREST_SPOTS) {
      const a = make(cx, cz);
      const b = make(cx + 1, cz);
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const ground = gen.terrainHeight(cx * CHUNK_SIZE + CHUNK_SIZE - 1, cz * CHUNK_SIZE + lz);
        for (let y = ground + 3; y < ground + 30; y++) {
          const left = cellId(a.getCell(CHUNK_SIZE - 1, y, lz));
          const right = cellId(b.getCell(0, y, lz));
          if (TREE_BLOCKS.has(left) && TREE_BLOCKS.has(right)) found++;
        }
      }
    }
    expect(found).toBeGreaterThan(50);
  });

  it('agree with sampleBlock for whole columns in a 2 x 2 block of chunks around a forest crossing', () => {
    const [cx, cz] = [10, 140];
    const chunks = [make(cx, cz), make(cx + 1, cz), make(cx, cz + 1), make(cx + 1, cz + 1)];
    let checked = 0;
    for (const chunk of chunks) {
      for (let lz = 0; lz < CHUNK_SIZE; lz += 3) for (let lx = 0; lx < CHUNK_SIZE; lx += 3) {
        const x = chunk.cx * CHUNK_SIZE + lx, z = chunk.cz * CHUNK_SIZE + lz;
        const ground = gen.terrainHeight(x, z);
        for (let y = ground - 2; y <= ground + 30; y++) {
          expect(cellId(chunk.getCell(lx, y, lz)), `at ${x},${y},${z}`).toBe(gen.sampleBlock(x, y, z));
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(10000);
  });
});

describe('where features may grow', () => {
  it('never puts a tree in water', () => {
    // Chunks that hold both open water and trees: look for them across the country between the zones and the south.
    const candidates: Array<[number, number]> = [];
    for (let cz = -30; cz < 160; cz += 2) for (let cx = -60; cx < 80; cx += 2) {
      const x = cx * CHUNK_SIZE + 16, z = cz * CHUNK_SIZE + 16;
      if (gen.zoneNameAt(x, z) !== 'Wilderness') continue;
      let wet = 0;
      for (let k = 0; k < 8; k++) if (gen.terrainHeight(x - 16 + k * 4, z - 16 + (k * 7) % 32) < WATER_LEVEL) wet++;
      if (wet > 0) candidates.push([cx, cz]);
    }
    expect(candidates.length).toBeGreaterThan(40);

    let treeBlocks = 0, waterColumns = 0, nearWater = 0, inWater = 0;
    for (const [cx, cz] of candidates.slice(0, 120)) {
      const chunk = make(cx, cz);
      const grounds: number[] = [];
      for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const g = gen.terrainHeight(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz);
        grounds.push(g);
        if (g < WATER_LEVEL) waterColumns++;
      }
      for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const ground = grounds[lz * CHUNK_SIZE + lx];
        for (let y = ground + 1; y <= ground + 30; y++) {
          const id = cellId(chunk.getCell(lx, y, lz));
          if (!TREE_BLOCKS.has(id)) continue;
          treeBlocks++;
          // A tree block in a column whose ground is under water and low enough to stand in it.
          if (ground <= WATER_LEVEL && y <= WATER_LEVEL + 2) inWater++;
          if (y <= WATER_LEVEL) inWater++;
          if (LOGS.has(id) && y <= ground + 2 && ground <= WATER_LEVEL) inWater++;
          // Trunks must stand on dry land.
          if (LOGS.has(id) && y === ground + 1 && ground < WATER_LEVEL + 1) inWater++;
          if (ground >= WATER_LEVEL && ground <= WATER_LEVEL + 4) nearWater++;
        }
      }
    }
    console.info(`${treeBlocks} tree blocks, ${waterColumns} water columns, ${nearWater} tree blocks on low shore ground, ${inWater} in water`);
    expect(treeBlocks).toBeGreaterThan(2000);
    expect(waterColumns).toBeGreaterThan(500);
    expect(inWater).toBe(0);
  }, timeoutMs(30000));

  it('keeps wilderness features out of every legacy zone footprint', () => {
    // Chunks along each zone's edge. Features stay a radius and a little more away from the footprint, so nothing the
    // wilderness grows is ever cut by the edge, and nothing of it is inside.
    const zones: Array<[string, number, number, number]> = [
      ['Federation of Tempest', 1500, 0, 700], ['Town of Beginnings', 0, 0, 200], ['Kingdom of Bosse', 0, -1500, 700],
      ['Kingdom of Fremmevilla', 1600, -1600, 250], ['Magnolia Town', -1600, 1600, 250], ['Amestris District', -1500, 0, 700],
    ];
    let wildernessFeatures = 0, inside = 0;
    for (const [name, zx, zz, r] of zones) {
      for (let a = 0; a < 24; a++) {
        const t = (a / 24) * Math.PI * 2;
        const x = zx + Math.cos(t) * (r + 6), z = zz + Math.sin(t) * (r + 6);
        const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
        const chunk = make(cx, cz);
        for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const wx = cx * CHUNK_SIZE + lx, wz = cz * CHUNK_SIZE + lz;
          const owner = gen.zoneNameAt(wx, wz);
          const ground = gen.terrainHeight(wx, wz);
          for (let y = ground + 1; y <= ground + 30; y++) {
            const id = cellId(chunk.getCell(lx, y, lz));
            if (owner === 'Wilderness') { if (id !== 0 && id !== BlockType.WATER) wildernessFeatures++; continue; }
            // Nothing the legacy zones build uses the nature blocks, and the zone's own blocks are what sampleBlock says.
            // (Tempest builds with them on purpose: its trees, moss and farms are the nature blocks.)
            if (name !== 'Federation of Tempest' && id >= NatureBlock.CEDAR_LOG && id <= NatureBlock.PODZOL) inside++;
            if (id !== gen.sampleBlock(wx, y, wz)) inside++;
          }
          if (owner === name && wx === 12345678) inside++;
        }
      }
    }
    expect(wildernessFeatures).toBeGreaterThan(1000);
    expect(inside).toBe(0);
  });

  it('keeps trees and everything else off roads, using the RoadField it is given', () => {
    // A circular "road" of radius 70 in the middle of a forest. With it nothing may stand inside; without it the
    // same place is full of trees.
    const centre = { x: 10 * CHUNK_SIZE + 40, z: 140 * CHUNK_SIZE + 40 };
    const radius = 70;
    const roads: RoadMask = { isRoad: (x, z, margin = 0) => Math.hypot(x - centre.x, z - centre.z) < radius + margin };
    const blocked = createVoxelverseGenerator(registry, undefined, roads);
    let withRoad = 0, without = 0;
    for (let cz = 137; cz <= 143; cz++) for (let cx = 7; cx <= 13; cx++) {
      const a = new Chunk(cx, cz), b = new Chunk(cx, cz);
      blocked.generateChunk(a);
      gen.generateChunk(b);
      for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = cx * CHUNK_SIZE + lx, z = cz * CHUNK_SIZE + lz;
        if (Math.hypot(x - centre.x, z - centre.z) >= radius) continue;
        const ground = gen.terrainHeight(x, z);
        for (let y = ground + 1; y <= ground + 30; y++) {
          const ida = cellId(a.getCell(lx, y, lz));
          const idb = cellId(b.getCell(lx, y, lz));
          if (ida !== 0 && ida !== BlockType.WATER) withRoad++;
          if (idb !== 0 && idb !== BlockType.WATER) without++;
          if ((lx + lz) % 4 === 0) expect(blocked.sampleBlock(x, y, z)).toBe(ida);
        }
      }
    }
    console.info(`blocks above the ground inside the road circle: ${withRoad} with the road, ${without} without`);
    expect(without).toBeGreaterThan(1500);
    expect(withRoad).toBe(0);
  }, timeoutMs(30000));
});

describe('determinism', () => {
  it('gives the same chunk hash twice, whatever order chunks were generated in', () => {
    const a = createVoxelverseGenerator(createDefaultRegistry());
    const b = createVoxelverseGenerator(createDefaultRegistry());
    const spots: Array<[number, number]> = [[40, 26], [41, 26], [10, 140], [11, 140], [10, 141], [-30, 60]];
    const forward = spots.map(([cx, cz]) => hashChunk(a, cx, cz));
    // The other generator visits them in reverse, with its feature cache filled in a different order.
    const backward = [...spots].reverse().map(([cx, cz]) => hashChunk(b, cx, cz)).reverse();
    expect(backward).toEqual(forward);
    expect(spots.map(([cx, cz]) => hashChunk(a, cx, cz))).toEqual(forward);
  });

  it('gives another world for another seed', () => {
    const other = createVoxelverseGenerator(createDefaultRegistry(), 777);
    for (const [cx, cz] of [[40, 26], [10, 140]]) expect(hashChunk(other, cx, cz)).not.toBe(hashChunk(gen, cx, cz));
  });
});

describe('what grows where', () => {
  it('has the species of every biome somewhere in the world', () => {
    const present = new Set<number>();
    // Belt and groves, the dense south, pine country in the north, the west coast, the mountains and wetland.
    const spots: Array<[number, number]> = [
      [40, 26], [44, 30], [46, 28], [37, 20], [10, 140], [14, 150], [-5, 150], [0, -75], [-10, -90], [-30, 60],
      [-60, 10], [-80, -5], [340, 0], [360, 10], [12, 3], [18, 8], [28, -20],
    ];
    // The snowy peaks: the first chunk of alpine country in the far east.
    for (let cx = 340; cx < 460; cx += 2) {
      if (gen.biomeAt(cx * CHUNK_SIZE + 16, 16) === Biome.ALPINE) { spots.push([cx, 0]); break; }
    }
    expect(spots.length).toBe(18);
    for (const [cx, cz] of spots) {
      const chunk = make(cx, cz);
      for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const ground = gen.terrainHeight(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz);
        present.add(cellId(chunk.getCell(lx, ground, lz)));
        for (let y = ground + 1; y <= ground + 30; y++) present.add(cellId(chunk.getCell(lx, y, lz)));
      }
    }
    const missing = [
      BlockType.WOOD_LOG, BlockType.LEAVES, BlockType.BIRCH_LOG, BlockType.BIRCH_LEAVES, BlockType.PINE_LEAVES,
      NatureBlock.CEDAR_LOG, NatureBlock.CEDAR_LEAVES, NatureBlock.SAKURA_LOG, NatureBlock.SAKURA_LEAVES,
      NatureBlock.PINE_LOG, NatureBlock.BAMBOO, NatureBlock.BAMBOO_LEAVES, NatureBlock.FERN, NatureBlock.REEDS,
      NatureBlock.GRAVEL, NatureBlock.MOSS, NatureBlock.MUD, NatureBlock.GRANITE, NatureBlock.PODZOL,
      NatureBlock.MUSHROOM_BROWN, NatureBlock.WILDFLOWER_BLUE, NatureBlock.WILDFLOWER_WHITE, NatureBlock.FALLEN_LEAVES,
      NatureBlock.SAKURA_PETALS, BlockType.TALL_GRASS, BlockType.SMALL_ROCK, BlockType.SAND, BlockType.SNOW,
    ].filter((id) => !present.has(id));
    expect(missing.map((id) => registry.get(id).name)).toEqual([]);
  }, timeoutMs(30000));
});

describe('features', () => {
  const all: Array<[Feature, Biome]> = [
    [new OakTree(), Biome.OAK_WOOD], [new BirchTree(), Biome.BIRCH_WOOD], [new PineTree(), Biome.PINE_FOREST],
    [new PineTree(), Biome.ALPINE], [new CedarTree(), Biome.CEDAR_FOREST], [new SakuraTree(), Biome.SAKURA_GROVE],
    [new BambooClump(), Biome.BAMBOO_GROVE], [new Boulder(), Biome.ROCKY_HILLS], [new Boulder(), Biome.ALPINE],
    [new FallenLog(), Biome.CEDAR_FOREST], [new ReedBed(), Biome.WETLAND],
    ...[Biome.MEADOW, Biome.WETLAND, Biome.ROCKY_HILLS, Biome.SAKURA_GROVE].map((b): [Feature, Biome] => [new UndergrowthPatch(), b]),
  ];

  it('never reach further from the origin than their declared radius, so a chunk finds every one that touches it', () => {
    for (const [feature, biome] of all) {
      let widest = 0, tallest = 0, blocks = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const out = new BlockList();
        feature.build({ x: 0, z: 0, ground: 10, biome }, new Rng(seed), out);
        blocks += out.length;
        for (let n = 0; n < out.length; n++) {
          widest = Math.max(widest, Math.abs(out.dx[n]), Math.abs(out.dz[n]));
          tallest = Math.max(tallest, out.dy[n]);
          expect(out.dy[n], feature.name).toBeGreaterThanOrEqual(1);
        }
      }
      expect(blocks, feature.name).toBeGreaterThan(300);
      expect(widest, `${feature.name} in ${Biome[biome]}`).toBeLessThanOrEqual(feature.radius);
      expect(tallest, feature.name).toBeLessThanOrEqual(40);
    }
  });

  it('are the same for the same seed and different for another', () => {
    for (const [feature, biome] of all) {
      const build = (seed: number): string => {
        const out = new BlockList();
        feature.build({ x: 0, z: 0, ground: 10, biome }, new Rng(seed), out);
        return Array.from(out.id.subarray(0, out.length)).join(',') + '|' + Array.from(out.dx.subarray(0, out.length)).join(',');
      };
      expect(build(5)).toBe(build(5));
      const variants = new Set<string>();
      for (let seed = 1; seed <= 12; seed++) variants.add(build(seed));
      expect(variants.size, feature.name).toBeGreaterThan(3);
    }
  });

  it('build trees of the right size and shape', () => {
    const height = (feature: Feature, biome: Biome, seed: number): { h: number; r: number } => {
      const out = new BlockList();
      feature.build({ x: 0, z: 0, ground: 10, biome }, new Rng(seed), out);
      let h = 0, r = 0;
      for (let n = 0; n < out.length; n++) {
        h = Math.max(h, out.dy[n]);
        r = Math.max(r, Math.abs(out.dx[n]), Math.abs(out.dz[n]));
      }
      return { h, r };
    };
    const stats = (f: Feature, b: Biome) => {
      let hs = 0, rs = 0;
      for (let s = 1; s <= 60; s++) { const { h, r } = height(f, b, s); hs += h; rs += r; }
      return { h: hs / 60, r: rs / 60 };
    };
    const oak = stats(new OakTree(), Biome.OAK_WOOD);
    const cedar = stats(new CedarTree(), Biome.CEDAR_FOREST);
    const sakura = stats(new SakuraTree(), Biome.SAKURA_GROVE);
    const birch = stats(new BirchTree(), Biome.BIRCH_WOOD);
    // Cedars are tall and slim, sakura wide and low.
    expect(cedar.h).toBeGreaterThan(oak.h * 1.8);
    expect(cedar.r).toBeLessThanOrEqual(3);
    expect(sakura.r).toBeGreaterThan(oak.r + 1.5);
    expect(sakura.h).toBeLessThan(cedar.h * 0.6);
    expect(birch.r).toBeLessThan(oak.r);
  });
});

describe('overlap rules', () => {
  it('let a trunk grow through leaves and plants, but never replace terrain, water or another trunk', () => {
    expect(canReplace(BlockType.AIR, BlockType.WOOD_LOG)).toBe(true);
    expect(canReplace(BlockType.LEAVES, BlockType.WOOD_LOG)).toBe(true);
    expect(canReplace(NatureBlock.FERN, BlockType.WOOD_LOG)).toBe(true);
    expect(canReplace(NatureBlock.FERN, BlockType.LEAVES)).toBe(true);
    expect(canReplace(BlockType.WOOD_LOG, BlockType.LEAVES)).toBe(false);
    expect(canReplace(BlockType.WOOD_LOG, BlockType.WOOD_LOG)).toBe(false);
    expect(canReplace(BlockType.STONE, BlockType.LEAVES)).toBe(false);
    expect(canReplace(BlockType.GRASS, BlockType.WOOD_LOG)).toBe(false);
    expect(canReplace(BlockType.WATER, BlockType.WOOD_LOG)).toBe(false);
    expect(canReplace(BlockType.LEAVES, NatureBlock.FERN)).toBe(false);
    expect(canReplace(BlockType.AIR, NatureBlock.FERN)).toBe(true);
  });
});

describe('level of detail', () => {
  it('drops only ground cover at LOD 0 and keeps trees, rocks and logs', () => {
    let fullPlants = 0, farPlants = 0, fullSolid = 0, farSolid = 0;
    for (const [cx, cz] of FOREST_SPOTS) {
      const full = make(cx, cz);
      const far = make(cx, cz, { lod: 0 });
      for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const ground = gen.terrainHeight(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz);
        for (let y = ground + 1; y <= ground + 40; y++) {
          const a = cellId(full.getCell(lx, y, lz)), b = cellId(far.getCell(lx, y, lz));
          if (a !== 0 && a !== BlockType.WATER) {
            if (registry.isSolid(a)) fullSolid++; else fullPlants++;
          }
          if (b !== 0 && b !== BlockType.WATER) {
            if (registry.isSolid(b)) farSolid++; else farPlants++;
          }
          // Wherever the two differ the far chunk is missing something that is not solid.
          if (a !== b) expect(registry.isSolid(a), `${a} vs ${b}`).toBe(false);
        }
      }
    }
    console.info(`LOD 0: plants ${fullPlants} -> ${farPlants}, solid blocks ${fullSolid} -> ${farSolid}`);
    expect(farPlants).toBeLessThan(fullPlants * 0.7);
    expect(farSolid).toBeGreaterThan(fullSolid * 0.8);
  });
});

describe('speed', () => {
  it('generates wilderness chunks, forests included, in under 40 ms on average', () => {
    const spots: Array<[number, number]> = [];
    // 20 chunks: two blocks of dense forest, a block of belt, and open country.
    for (let i = 0; i < 6; i++) spots.push([10 + (i % 3), 140 + Math.floor(i / 3)]);
    for (let i = 0; i < 6; i++) spots.push([40 + (i % 3), 26 + Math.floor(i / 3)]);
    for (let i = 0; i < 4; i++) spots.push([20 + (i % 2), 20 + Math.floor(i / 2)]);
    for (let i = 0; i < 4; i++) spots.push([-30 + (i % 2), 60 + Math.floor(i / 2)]);
    expect(spots.length).toBe(20);
    const g = createVoxelverseGenerator(createDefaultRegistry());
    for (let i = 0; i < 3; i++) g.generateChunk(new Chunk(300 + i, 300)); // warm up the JIT
    const t0 = performance.now();
    for (const [cx, cz] of spots) g.generateChunk(new Chunk(cx, cz));
    const ms = (performance.now() - t0) / spots.length;
    console.info(`wilderness chunk with biomes and features: ${ms.toFixed(1)} ms average over ${spots.length} chunks`);
    expect(ms).toBeLessThan(tolerant(40));
  });
});
