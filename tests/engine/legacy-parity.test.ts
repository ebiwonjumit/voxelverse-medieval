import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { VoxelWorld } from '../../engine/VoxelWorld';
import { cellState } from '../../engine/cell';
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from '../../engine/coords';
import { LegacyZoneAdapter } from '../../worldgen/LegacyZoneAdapter';
import { getBlockAt, getTerrainHeight } from '../../utils/terrain';

// Small seeded generator so the "random" points are the same on every run.
const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const registry = createDefaultRegistry();
const newWorld = () => new VoxelWorld(registry, new LegacyZoneAdapter(registry));

// Where the old zones keep their structures, plus the far country and the world's extremes.
const spots = [
  { x: 0, z: 0, r: 200 },          // Town of Beginnings
  { x: 0, z: 300, r: 80 },         // Greensom
  { x: 1500, z: 0, r: 700 },       // Tempest
  { x: -1500, z: 0, r: 700 },      // Amestris
  { x: 0, z: -1500, r: 700 },      // Bosse
  { x: 1600, z: -1600, r: 250 },   // Fremmevilla
  { x: -1600, z: 1600, r: 250 },   // Magnolia
  { x: 500, z: 500, r: 300 },      // open wilderness
  { x: 0, z: 2500, r: 600 },       // south road and forest
  { x: -5000, z: 0, r: 800 },      // coast
  { x: 12000, z: 0, r: 800 },      // mountains
];

// Chunks that hold landmarks the random picks might miss.
const landmarkChunks: Array<[number, number]> = [
  [0, 0], [-1, -1], [-1, 0], [0, -1],   // Great Tower
  [53, 0], [46, -4],                     // Tempest Coliseum and Town Hall
  [-1, 8], [0, 9],                       // Greensom houses and stream
  [0, -47], [-1, -47],                   // Bosse castle
  [50, -50],                             // Fremmevilla hangar
  [-50, 50],                             // Magnolia guild hall
];

describe('LegacyZoneAdapter parity with the old world', () => {
  it('matches getBlockAt at 10,000 points read from generated chunks', () => {
    const rng = mulberry32(20251122);
    const world = newWorld();

    const chunks: Array<[number, number]> = [...landmarkChunks];
    while (chunks.length < 50) {
      const spot = spots[chunks.length % spots.length];
      const angle = rng() * Math.PI * 2;
      const dist = Math.sqrt(rng()) * spot.r * 1.1;
      chunks.push([
        Math.floor((spot.x + Math.cos(angle) * dist) / CHUNK_SIZE),
        Math.floor((spot.z + Math.sin(angle) * dist) / CHUNK_SIZE),
      ]);
    }
    for (const [cx, cz] of chunks) world.loadChunk(cx, cz);

    let compared = 0;
    const mismatches: string[] = [];
    const perChunk = Math.ceil(10000 / chunks.length);
    for (const [cx, cz] of chunks) {
      for (let i = 0; i < perChunk; i++) {
        const x = cx * CHUNK_SIZE + Math.floor(rng() * CHUNK_SIZE);
        const z = cz * CHUNK_SIZE + Math.floor(rng() * CHUNK_SIZE);
        const h = getTerrainHeight(x, z);
        const pick = rng();
        const y = pick < 0.6 ? h - 8 + Math.floor(rng() * 80)      // surface and structures
          : pick < 0.8 ? WORLD_MIN_Y + Math.floor(rng() * (h - WORLD_MIN_Y + 1)) // underground
          : Math.floor(rng() * 10);                                // around sea level
        const clamped = Math.min(WORLD_MAX_Y, Math.max(WORLD_MIN_Y, y));
        const actual = world.getBlock(x, clamped, z);
        const expected = getBlockAt(x, clamped, z);
        compared++;
        if (actual !== expected && mismatches.length < 10) {
          mismatches.push(`(${x}, ${clamped}, ${z}) got ${actual}, expected ${expected}`);
        }
        expect(cellState(world.getCell(x, clamped, z))).toBe(0);
      }
    }
    expect(compared).toBeGreaterThanOrEqual(10000);
    expect(mismatches).toEqual([]);
  }, 120000);

  it('matches getBlockAt for every block above the ground in the landmark chunks', () => {
    const world = newWorld();
    let structureBlocks = 0;
    let compared = 0;
    for (const [cx, cz] of landmarkChunks) {
      world.loadChunk(cx, cz);
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const x = cx * CHUNK_SIZE + lx;
          const z = cz * CHUNK_SIZE + lz;
          const h = getTerrainHeight(x, z);
          const top = Math.min(WORLD_MAX_Y, h + 70);
          for (let y = h - 2; y <= top; y++) {
            const expected = getBlockAt(x, y, z);
            compared++;
            if (world.getBlock(x, y, z) !== expected) {
              throw new Error(`Mismatch at (${x}, ${y}, ${z}): got ${world.getBlock(x, y, z)}, expected ${expected}`);
            }
            if (y > h && expected !== 0 && expected !== 5) structureBlocks++; // anything standing above the ground
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(500000);
    expect(structureBlocks).toBeGreaterThan(20000); // towers, walls, houses and trees, not just open air
  }, 120000);

  it('matches getBlockAt for points in chunks that are not loaded', () => {
    const rng = mulberry32(7);
    const world = newWorld();
    for (let i = 0; i < 5000; i++) {
      const spot = spots[i % spots.length];
      const x = Math.round(spot.x + (rng() - 0.5) * spot.r * 2);
      const z = Math.round(spot.z + (rng() - 0.5) * spot.r * 2);
      const y = WORLD_MIN_Y + Math.floor(rng() * (WORLD_MAX_Y - WORLD_MIN_Y + 1));
      expect(world.getBlock(x, y, z)).toBe(getBlockAt(x, y, z));
    }
  });

  it('fills every column with stone up to the ground', () => {
    const world = newWorld();
    world.loadChunk(5, 5);
    for (let lx = 0; lx < CHUNK_SIZE; lx += 7) {
      for (let lz = 0; lz < CHUNK_SIZE; lz += 7) {
        const x = 5 * CHUNK_SIZE + lx;
        const z = 5 * CHUNK_SIZE + lz;
        const h = getTerrainHeight(x, z);
        expect(world.getBlock(x, h - 1, z)).toBe(getBlockAt(x, h - 1, z));
        expect(world.getBlock(x, WORLD_MIN_Y, z)).toBe(getBlockAt(x, WORLD_MIN_Y, z));
      }
    }
  });

  it('refuses to start if a block type is missing from the registry', () => {
    const empty = createDefaultRegistry();
    // Rebuild a registry that lacks one legacy block.
    const partial = new (empty.constructor as new () => typeof empty)();
    for (const def of empty.all()) if (def.id !== 13) partial.register(def);
    expect(() => new LegacyZoneAdapter(partial)).toThrow(/13/);
  });
});
