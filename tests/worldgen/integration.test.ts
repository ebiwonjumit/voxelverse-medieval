import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blockRegistry, voxelWorld, worldGenerator } from '../../gameWorld';
import { createDefaultRegistry } from '../../content/blocks';
import { Chunk } from '../../engine/Chunk';
import { cellId } from '../../engine/cell';
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y, chunkCoord, localCoord } from '../../engine/coords';
import { standingEyeY } from '../../engine/spawn';
import { ChunkCache } from '../../meshing/ChunkCache';
import { CellReader } from '../../meshing/CellReader';
import { meshChunk } from '../../meshing/ChunkMesher';
import { NeighbourReader } from '../../meshing/NeighbourReader';
import { createWorkerGenerator } from '../../worldgen/createWorkerGenerator';
import { Rng } from '../../worldgen/noise';
import { LegacyZoneAdapter } from '../../worldgen/LegacyZoneAdapter';
import { VoxelverseGenerator } from '../../worldgen/VoxelverseGenerator';
import { INITIAL_SPAWN } from '../../constants';
import { BlockType, LodLevel, PLAYER_HEIGHT } from '../../worldConstants';

const root = join(__dirname, '..', '..');

describe('the game runs on the Phase 6 generator', () => {
  it('builds a VoxelverseGenerator for the main thread and for the workers', () => {
    expect(worldGenerator).toBeInstanceOf(VoxelverseGenerator);
    expect(createWorkerGenerator(createDefaultRegistry())).toBeInstanceOf(VoxelverseGenerator);
  });

  it('keeps LegacyZoneAdapter out of the game: only tests, tools and the adapter itself use it', () => {
    const files = readdirSync(root, { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.(ts|tsx|mjs)$/.test(f) && !/^(node_modules|dist|tests|docs|tools)\//.test(f) && !f.includes('node_modules'));
    expect(files).toContain('gameWorld.ts');
    const users = files.filter((f) => readFileSync(join(root, f), 'utf8').includes('LegacyZoneAdapter'));
    // The adapter's own file and comments that only name it are fine; nothing else may import it.
    for (const f of users) {
      const importsIt = /from\s+'[^']*LegacyZoneAdapter'/.test(readFileSync(join(root, f), 'utf8'));
      expect(importsIt, `${relative(root, join(root, f))} imports LegacyZoneAdapter`).toBe(false);
    }
  });

  it('shows the generator\'s zone names and heights on the main thread', () => {
    for (const [x, z, name] of [[0, 300, 'Greensom Village'], [0, 0, 'Town of Beginnings'], [1500, 0, 'Federation of Tempest'], [-1500, 0, 'Amestris District'], [0, -1500, 'Kingdom of Bosse'], [400, 150, 'Wilderness']] as const) {
      expect(voxelWorld.zoneNameAt(x, z)).toBe(name);
      expect(voxelWorld.terrainHeight(x, z)).toBe(worldGenerator.terrainHeight(x, z));
    }
  });
});

// What a mesh worker holds: its own registry, its own generator, a cache of chunks it generated. What the player's
// collision and the HUD read: voxelWorld, answered by the main thread's generator one block at a time.
describe('main thread and worker agree', () => {
  const workerRegistry = createDefaultRegistry();
  const workerGenerator = createWorkerGenerator(workerRegistry);
  const cache = new ChunkCache(workerGenerator, 64);

  // Places that exercise the new generator: spawn, the Great Tower, the Town and Tempest, a road with posts and a bridge,
  // the cedar belt, forest, a river, the Bosse edge, the coast and the mountains.
  const PLACES: [string, number, number][] = [
    ['Greensom', 0, 300], ['Great Tower', 0, 120], ['Town plaza', 0, 0], ['Tempest', 1400, 0], ['Amestris', -1500, 0],
    ['Bosse castle', 0, -1400], ['Bosse edge', 0, -1580], ['highway', 400, -8], ['cedar belt', 1000, 400],
    ['south forest', 300, 3600], ['coast', -2900, 100], ['mountains', 10800, 0], ['Greensom to Magnolia road', -700, 760],
  ];

  it('give the same block at random points of chunks the worker built', () => {
    const rng = new Rng(7);
    let compared = 0;
    let nonAir = 0;
    for (const [, px, pz] of PLACES) {
      const cx = chunkCoord(px);
      const cz = chunkCoord(pz);
      for (let n = 0; n < 8; n++) {
        const ox = cx + rng.int(5) - 2;
        const oz = cz + rng.int(5) - 2;
        const chunk = cache.get(ox, oz, LodLevel.HIGH);
        for (let k = 0; k < 60; k++) {
          const lx = rng.int(CHUNK_SIZE);
          const lz = rng.int(CHUNK_SIZE);
          // Mostly the first 90 blocks of height, where terrain, trees and buildings are; some anywhere.
          const y = k % 4 === 0 ? WORLD_MIN_Y + rng.int(WORLD_MAX_Y - WORLD_MIN_Y + 1) : -20 + rng.int(110);
          const x = ox * CHUNK_SIZE + lx;
          const z = oz * CHUNK_SIZE + lz;
          const fromWorker = cellId(chunk.getCell(lx, y, lz));
          expect(voxelWorld.getBlock(x, y, z), `${x},${y},${z}`).toBe(fromWorker);
          compared++;
          if (fromWorker !== BlockType.AIR) nonAir++;
        }
      }
    }
    expect(compared).toBe(PLACES.length * 8 * 60);
    expect(nonAir).toBeGreaterThan(compared / 4);
  });

  it('give the same block down whole columns at chunk borders, where trees and roads cross', () => {
    for (const [name, px, pz] of PLACES) {
      const cx = chunkCoord(px);
      const cz = chunkCoord(pz);
      const chunk = cache.get(cx, cz, LodLevel.HIGH);
      for (const [lx, lz] of [[0, 0], [CHUNK_SIZE - 1, 0], [0, CHUNK_SIZE - 1], [CHUNK_SIZE - 1, CHUNK_SIZE - 1], [CHUNK_SIZE >> 1, 0]]) {
        const x = cx * CHUNK_SIZE + lx;
        const z = cz * CHUNK_SIZE + lz;
        const top = voxelWorld.terrainHeight(x, z) + 70;
        for (let y = WORLD_MIN_Y; y <= top; y++) {
          if (cellId(chunk.getCell(lx, y, lz)) !== voxelWorld.getBlock(x, y, z)) {
            throw new Error(`${name}: ${x},${y},${z} worker ${cellId(chunk.getCell(lx, y, lz))} main ${voxelWorld.getBlock(x, y, z)}`);
          }
        }
      }
    }
  });

  it('mesh to the same geometry from the worker\'s chunks as from the main thread\'s block-by-block answers', () => {
    // The mesher reads the chunk and a one block ring around it. A worker reads them from the nine chunks it generated;
    // here the same chunk is meshed again from a reader that asks voxelWorld, the main thread's generator, block by block.
    const mainThread: CellReader = {
      getCell: (x, y, z) => voxelWorld.getCell(x, y, z),
      yRange: () => ({ minY: WORLD_MIN_Y, maxY: 140 }),
    };
    for (const [name, px, pz] of [PLACES[0], PLACES[7], PLACES[8], PLACES[12]]) {
      const cx = chunkCoord(px);
      const cz = chunkCoord(pz);
      const fromWorker = meshChunk(new NeighbourReader(cache.neighbourhood(cx, cz, LodLevel.HIGH)), cx, cz, workerRegistry);
      const fromMain = meshChunk(mainThread, cx, cz, blockRegistry);
      for (const bucket of ['opaque', 'cutout', 'water'] as const) {
        expect(fromWorker[bucket].indices.length, `${name} ${bucket}`).toBe(fromMain[bucket].indices.length);
        expect(Array.from(fromWorker[bucket].positions), `${name} ${bucket}`).toEqual(Array.from(fromMain[bucket].positions));
        expect(Array.from(fromWorker[bucket].layers), `${name} ${bucket}`).toEqual(Array.from(fromMain[bucket].layers));
      }
      expect(fromWorker.opaque.indices.length).toBeGreaterThan(0);
    }
  });

  it('use the same chunk at LOD 0: only ground plants differ from full detail', () => {
    const rng = new Rng(11);
    const high = cache.get(chunkCoord(300), chunkCoord(3600), LodLevel.HIGH);
    const low = cache.get(chunkCoord(300), chunkCoord(3600), LodLevel.LOW);
    let differing = 0;
    for (let k = 0; k < 20000; k++) {
      const lx = rng.int(CHUNK_SIZE);
      const lz = rng.int(CHUNK_SIZE);
      const y = rng.int(60);
      const a = cellId(high.getCell(lx, y, lz));
      const b = cellId(low.getCell(lx, y, lz));
      if (a === b) continue;
      // What full detail adds is ground cover (a plant, not solid). Where the ground cover that took priority over
      // a bamboo clump is gone at LOD 0, the clump shows through, so the low cell can be a plant of another kind.
      expect(blockRegistry.isSolid(a)).toBe(false);
      expect(blockRegistry.isSolid(b)).toBe(false);
      differing++;
    }
    expect(differing).toBeGreaterThan(0);
  });
});

describe('the spawn', () => {
  it('is on the ground at Greensom, with room for the body, and a void fall does not trigger there', () => {
    const eye = standingEyeY(voxelWorld, INITIAL_SPAWN.x, INITIAL_SPAWN.z);
    const feet = eye - PLAYER_HEIGHT;
    const x = INITIAL_SPAWN.x;
    const z = INITIAL_SPAWN.z;
    const floor = Math.round(feet - 0.5);
    expect(voxelWorld.isSolid(x, floor, z)).toBe(true);
    for (let h = 1; h <= 3; h++) expect(voxelWorld.isSolid(x, floor + h, z)).toBe(false);
    expect(feet - (floor + 0.5)).toBeLessThan(0.1);
    expect(eye).toBeGreaterThan(-20);
    expect(voxelWorld.zoneNameAt(x, z)).toBe('Greensom Village');
  });

  it('puts the player on top of whatever stands there, never inside it', () => {
    // Under the Great Tower's roof, on the Town's plaza, in a Tempest street, in a forest (a trunk), on a bridge deck.
    const rng = new Rng(3);
    for (let k = 0; k < 400; k++) {
      const x = rng.int(3000) - 1500;
      const z = rng.int(3000) - 1500;
      const eye = standingEyeY(voxelWorld, x, z);
      const floor = Math.round(eye - PLAYER_HEIGHT - 0.5 - 0.02);
      expect(voxelWorld.isSolid(x, floor + 1, z) || voxelWorld.isSolid(x, floor + 2, z)).toBe(false);
    }
  });
});

describe('the legacy adapter is still a working reference', () => {
  it('still builds, and still agrees with the new generator inside the Town core', () => {
    const legacy = new LegacyZoneAdapter(createDefaultRegistry());
    const a = new Chunk(0, 0);
    legacy.generateChunk(a);
    for (let k = 0; k < 200; k++) {
      const lx = k % CHUNK_SIZE;
      const lz = (k * 7) % CHUNK_SIZE;
      const y = 5 + (k % 12);
      // The Town's core is the legacy zone, except where the new roads are painted over the zone.
      if (worldGenerator.roads.isRoad(lx, lz, 3)) continue;
      expect(cellId(a.getCell(lx, y, lz))).toBe(voxelWorld.getBlock(localCoord(lx), y, localCoord(lz)));
    }
  });
});
