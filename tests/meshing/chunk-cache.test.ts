import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { Chunk } from '../../engine/Chunk';
import { packCell } from '../../engine/cell';
import { GenerateOptions, WorldGenerator } from '../../engine/WorldGenerator';
import { ChunkCache } from '../../meshing/ChunkCache';
import { MeshData, meshChunk } from '../../meshing/ChunkMesher';
import { ChunkGrid, computeChunkLight } from '../../meshing/LightEngine';
import { NeighbourReader } from '../../meshing/NeighbourReader';
import { PaddedChunkReader } from '../../meshing/PaddedChunkReader';
import { runMeshJob } from '../../meshing/runMeshJob';
import { createWorkerGenerator } from '../../worldgen/createWorkerGenerator';
import { BlockType, LodLevel } from '../../worldConstants';

// A generator that counts what it is asked for: flat stone ground, and at LOW detail one block fewer.
class CountingGenerator implements WorldGenerator {
  generated: Array<{ cx: number; cz: number; lod: LodLevel | undefined }> = [];

  generateChunk(chunk: Chunk, options?: GenerateOptions): void {
    this.generated.push({ cx: chunk.cx, cz: chunk.cz, lod: options?.lod });
    for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) chunk.setCell(x, 0, z, packCell(BlockType.STONE));
    if (options?.lod !== LodLevel.LOW) chunk.setCell(1, 1, 1, packCell(BlockType.LANTERN));
  }

  sampleBlock(): number { return 0; }
  terrainHeight(): number { return 0; }
  zoneNameAt(): string { return ''; }
}

const registry = createDefaultRegistry();

describe('ChunkCache', () => {
  it('generates a chunk once and then hands back the same one', () => {
    const gen = new CountingGenerator();
    const cache = new ChunkCache(gen, 16);
    const a = cache.get(2, 3, LodLevel.HIGH);
    const b = cache.get(2, 3, LodLevel.HIGH);
    expect(b).toBe(a);
    expect(gen.generated).toHaveLength(1);
    expect([cache.generated, cache.hits]).toEqual([1, 1]);
  });

  it('keeps one chunk per detail level, generated at that level', () => {
    const gen = new CountingGenerator();
    const cache = new ChunkCache(gen, 16);
    const high = cache.get(0, 0, LodLevel.HIGH);
    const low = cache.get(0, 0, LodLevel.LOW);
    expect(low).not.toBe(high);
    expect(gen.generated.map((g) => g.lod)).toEqual([LodLevel.HIGH, LodLevel.LOW]);
    expect(high.getCell(1, 1, 1)).not.toBe(0); // the lantern, only at HIGH
    expect(low.getCell(1, 1, 1)).toBe(0);
  });

  it('forgets the least recently used chunk when it is full', () => {
    const gen = new CountingGenerator();
    const cache = new ChunkCache(gen, 10);
    for (let i = 0; i < 10; i++) cache.get(i, 0, LodLevel.HIGH);
    cache.get(0, 0, LodLevel.HIGH); // chunk 0 is now the newest, chunk 1 the oldest
    cache.get(10, 0, LodLevel.HIGH);
    expect(cache.size).toBe(10);
    expect(cache.has(1, 0, LodLevel.HIGH)).toBe(false);
    expect(cache.has(0, 0, LodLevel.HIGH)).toBe(true);
    cache.get(1, 0, LodLevel.HIGH);
    expect(gen.generated.filter((g) => g.cx === 1)).toHaveLength(2);
  });

  it('refuses to be smaller than one neighbourhood', () => {
    expect(() => new ChunkCache(new CountingGenerator(), 8)).toThrow();
  });

  it('returns the nine chunks around a chunk, north west first', () => {
    const cache = new ChunkCache(new CountingGenerator(), 16);
    const around = cache.neighbourhood(5, -2, LodLevel.HIGH);
    expect(around.map((c) => [c.cx, c.cz])).toEqual([
      [4, -3], [5, -3], [6, -3], [4, -2], [5, -2], [6, -2], [4, -1], [5, -1], [6, -1],
    ]);
  });
});

describe('runMeshJob with a cache', () => {
  it('generates each chunk of a block of neighbourhoods once, not nine times', () => {
    const gen = new CountingGenerator();
    const cache = new ChunkCache(gen, 64);
    // 3 x 3 chunks meshed in turn need the 5 x 5 chunks around them.
    for (let cz = 0; cz < 3; cz++) for (let cx = 0; cx < 3; cx++) runMeshJob(cx, cz, LodLevel.HIGH, gen, registry, undefined, cache);
    expect(gen.generated).toHaveLength(25);
    expect(new Set(gen.generated.map((g) => `${g.cx},${g.cz}`)).size).toBe(25);
    // Without a cache the same nine jobs would have generated 81.
    const lone = new CountingGenerator();
    for (let cz = 0; cz < 3; cz++) for (let cx = 0; cx < 3; cx++) runMeshJob(cx, cz, LodLevel.HIGH, lone, registry);
    expect(lone.generated).toHaveLength(81);
  });

  it('gives the same mesh with the cache warm, cold or absent: one job per chunk, whatever the cache holds', () => {
    const gen = createWorkerGenerator(registry);
    const cache = new ChunkCache(gen);
    runMeshJob(1, 0, LodLevel.HIGH, gen, registry, undefined, cache); // warms the neighbourhood
    const warm = runMeshJob(0, 0, LodLevel.HIGH, gen, registry, undefined, cache);
    const cold = runMeshJob(0, 0, LodLevel.HIGH, gen, registry);
    const same = (a: MeshData, b: MeshData) => {
      for (const name of ['opaque', 'cutout', 'water'] as const) {
        for (const key of ['positions', 'normals', 'light', 'tints', 'uvs', 'layers', 'indices'] as const) {
          expect(Array.from(a[name][key])).toEqual(Array.from(b[name][key]));
        }
      }
    };
    same(warm, cold);
  });

  it('reports where the time went and how many chunks it had to generate', () => {
    const gen = new CountingGenerator();
    const cache = new ChunkCache(gen, 64);
    const first = runMeshJob(0, 0, LodLevel.HIGH, gen, registry, undefined, cache);
    expect(first.timing!.generated).toBe(9);
    const second = runMeshJob(1, 0, LodLevel.HIGH, gen, registry, undefined, cache);
    expect(second.timing!.generated).toBe(3); // the new column of three
    const third = runMeshJob(1, 0, LodLevel.HIGH, gen, registry, undefined, cache);
    expect(third.timing).toMatchObject({ generated: 0 });
    for (const t of [first.timing!, second.timing!, third.timing!]) {
      for (const ms of [t.generate, t.light, t.mesh]) {
        expect(Number.isFinite(ms)).toBe(true);
        expect(ms).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('lights a chunk from lanterns in the chunk next to it', () => {
    // Every chunk has a lantern at local (1, 1, 1). The one in chunk (1, 0), at world x = 33, reaches back across the
    // border to the east edge of chunk (0, 0) (15 blocks of light), so that edge is lit only because the job read its
    // neighbour. Take the neighbours' lanterns away and the edge goes dark.
    const withLantern = new CountingGenerator();
    const mesh = runMeshJob(0, 0, LodLevel.HIGH, withLantern, registry);
    const floorEast = (m: MeshData) => {
      let best = 0;
      for (let i = 0; i < m.opaque.positions.length / 3; i++) {
        if (m.opaque.normals[i * 3 + 1] === 1 && m.opaque.positions[i * 3] >= 31.5 && m.opaque.positions[i * 3 + 1] === 1) {
          best = Math.max(best, m.opaque.light[i * 4 + 1]);
        }
      }
      return best;
    };
    class NoNeighbourLanterns extends CountingGenerator {
      generateChunk(chunk: Chunk, options?: GenerateOptions): void {
        super.generateChunk(chunk, options);
        if (chunk.cx !== 0 || chunk.cz !== 0) chunk.setCell(1, 1, 1, 0);
      }
    }
    const without = runMeshJob(0, 0, LodLevel.HIGH, new NoNeighbourLanterns(), registry);
    expect(floorEast(mesh)).toBeGreaterThan(floorEast(without));
    expect(floorEast(without)).toBe(0);
  });
});

describe('NeighbourReader', () => {
  it('meshes a real chunk exactly like the padded reader, which samples the generator for the ring', () => {
    const gen = createWorkerGenerator(registry);
    for (const [cx, cz] of [[0, 9], [0, 0], [-1, -1]]) {
      const cache = new ChunkCache(gen);
      const around = cache.neighbourhood(cx, cz, LodLevel.HIGH);
      const light = computeChunkLight(new ChunkGrid(around), cx, cz, registry);
      const viaNeighbours = meshChunk(new NeighbourReader(around), cx, cz, registry, { light });
      const viaGenerator = meshChunk(new PaddedChunkReader(around[4], gen), cx, cz, registry, { light });
      expect(viaNeighbours.opaque.indices.length).toBeGreaterThan(1000);
      for (const name of ['opaque', 'cutout', 'water'] as const) {
        for (const key of ['positions', 'normals', 'light', 'tints', 'uvs', 'layers', 'indices'] as const) {
          expect(Array.from(viaNeighbours[name][key])).toEqual(Array.from(viaGenerator[name][key]));
        }
      }
    }
  });

  it('reads the ring from the chunk beside it and refuses anything further', () => {
    const chunks = Array.from({ length: 9 }, (_, i) => new Chunk((i % 3) - 1, Math.floor(i / 3) - 1));
    chunks[5].setCell(0, 7, 4, packCell(BlockType.GLASS)); // chunk (1, 0), local (0, 7, 4)
    const reader = new NeighbourReader(chunks);
    expect(reader.getCell(32, 7, 4)).toBe(packCell(BlockType.GLASS));
    expect(reader.getCell(31, 7, 4)).toBe(0);
    expect(() => reader.getCell(64, 7, 4)).toThrow();
    expect(() => new NeighbourReader(chunks.slice(1))).toThrow();
  });
});
