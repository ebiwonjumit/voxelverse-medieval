import { BlockRegistry } from '../engine/BlockRegistry';
import { Chunk } from '../engine/Chunk';
import { GenerateOptions, WorldGenerator } from '../engine/WorldGenerator';
import { packCell } from '../engine/cell';
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from '../engine/coords';
import { getBlockAt, getCurrentZoneName, getTerrainHeight, getZone } from '../utils/terrain';
import { BlockType, LodLevel, WATER_LEVEL } from '../worldConstants';

// The tallest structure the old zones build is the Great Tower, whose walls reach 59 blocks above the ground.
// The terrain clamp leaves this much headroom below WORLD_MAX_Y.
export const LEGACY_SCAN_ABOVE = 64;

// Lets the existing zones fill the new chunks. It follows getBlockAt exactly: stone below the ground,
// water above it up to the water level, and whatever the zone returns from the ground upward.
export class LegacyZoneAdapter implements WorldGenerator {
  constructor(registry: BlockRegistry) {
    // Legacy block ids are the BlockType numbers, so every one of them has to be registered.
    for (const type of Object.values(BlockType)) {
      if (typeof type === 'number' && !registry.has(type)) {
        throw new Error(`LegacyZoneAdapter needs block id ${type} (${BlockType[type]}) in the registry`);
      }
    }
  }

  generateChunk(chunk: Chunk, options?: GenerateOptions): void {
    const lod = options?.lod ?? LodLevel.HIGH;
    const x0 = chunk.cx * CHUNK_SIZE;
    const z0 = chunk.cz * CHUNK_SIZE;
    const stone = packCell(BlockType.STONE);
    const water = packCell(BlockType.WATER);
    const waterTop = Math.min(WATER_LEVEL, WORLD_MAX_Y);

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = x0 + lx;
        const z = z0 + lz;
        const ground = getTerrainHeight(x, z);
        const zone = getZone(x, z);

        for (let y = WORLD_MIN_Y; y < ground && y <= WORLD_MAX_Y; y++) chunk.setCell(lx, y, lz, stone);
        for (let y = Math.max(ground + 1, WORLD_MIN_Y); y <= waterTop; y++) chunk.setCell(lx, y, lz, water);

        const top = Math.min(ground + LEGACY_SCAN_ABOVE, WORLD_MAX_Y);
        for (let y = Math.max(ground, WORLD_MIN_Y); y <= top; y++) {
          if (y > ground && y <= WATER_LEVEL) continue; // already water
          const block = zone.getBlock(x, y, z, ground, lod);
          if (block !== BlockType.AIR) chunk.setCell(lx, y, lz, packCell(block));
        }
      }
    }
  }

  sampleBlock(x: number, y: number, z: number): number {
    return getBlockAt(x, y, z);
  }

  terrainHeight(x: number, z: number): number {
    return getTerrainHeight(x, z);
  }

  zoneNameAt(x: number, z: number): string {
    return getCurrentZoneName(x, z);
  }
}
