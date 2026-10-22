import { BlockRegistry } from '../engine/BlockRegistry';
import { Chunk } from '../engine/Chunk';
import { WorldGenerator } from '../engine/WorldGenerator';
import { packCell } from '../engine/cell';
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from '../engine/coords';
import { Zone, LodLevel } from '../zones/Zone';
import { BlockType, WATER_LEVEL, WORLD_SEED } from '../worldConstants';
import { TerrainField } from './terrain/TerrainField';
import { ZoneBlender } from './terrain/ZoneBlender';
import { WILDERNESS_NAME } from './zones/ZoneInfo';

// How far above the ground a legacy zone is asked for blocks. The Great Tower, the tallest thing the old zones
// build, reaches 59 above the ground.
const ZONE_SCAN_ABOVE = 64;

export interface GenerateOptions {
  // 0 is far away and may skip small decorations; anything else (or nothing) is full detail.
  // sampleBlock always answers at full detail, so a chunk made at LOD 0 can differ from it in those details.
  lod?: number;
}

// Placeholder until biomes give the wilderness its own surface blocks.
const wildernessSurface = (ground: number): number => {
  if (ground > 60) return BlockType.SNOW;
  if (ground > 45) return BlockType.STONE;
  if (ground < WATER_LEVEL + 1) return BlockType.SAND;
  return BlockType.GRASS;
};

export class VoxelverseGenerator implements WorldGenerator {
  private readonly blender: ZoneBlender;

  constructor(registry: BlockRegistry, readonly seed: number = WORLD_SEED) {
    for (const type of Object.values(BlockType)) {
      if (typeof type === 'number' && !registry.has(type)) {
        throw new Error(`VoxelverseGenerator needs block id ${type} (${BlockType[type]}) in the registry`);
      }
    }
    this.blender = new ZoneBlender(new TerrainField(seed));
  }

  // One rule for every block, so sampleBlock and generateChunk cannot drift apart.
  private blockAt(x: number, y: number, z: number, ground: number, zone: Zone, lod: LodLevel): number {
    if (y < ground) return BlockType.STONE;
    if (y > ground && y <= WATER_LEVEL) return BlockType.WATER;
    if (y - ground > ZONE_SCAN_ABOVE) return BlockType.AIR;
    if (zone.name === WILDERNESS_NAME) return y === ground ? wildernessSurface(ground) : BlockType.AIR;
    return zone.getBlock(x, y, z, ground, lod);
  }

  generateChunk(chunk: Chunk, options?: GenerateOptions): void {
    const lod = options?.lod === 0 ? LodLevel.LOW : LodLevel.HIGH;
    const x0 = chunk.cx * CHUNK_SIZE;
    const z0 = chunk.cz * CHUNK_SIZE;
    const stone = packCell(BlockType.STONE);
    const water = packCell(BlockType.WATER);
    const waterTop = Math.min(WATER_LEVEL, WORLD_MAX_Y);

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = x0 + lx;
        const z = z0 + lz;
        const zone = this.blender.zoneAt(x, z);
        const ground = this.blender.height(x, z, zone);

        for (let y = WORLD_MIN_Y; y < ground && y <= WORLD_MAX_Y; y++) chunk.setCell(lx, y, lz, stone);
        for (let y = Math.max(ground + 1, WORLD_MIN_Y); y <= waterTop; y++) chunk.setCell(lx, y, lz, water);

        if (zone.name === WILDERNESS_NAME) {
          chunk.setCell(lx, ground, lz, packCell(wildernessSurface(ground)));
          continue;
        }
        const top = Math.min(ground + ZONE_SCAN_ABOVE, WORLD_MAX_Y);
        for (let y = ground; y <= top; y++) {
          if (y > ground && y <= WATER_LEVEL) continue; // already water
          const block = this.blockAt(x, y, z, ground, zone, lod);
          if (block !== BlockType.AIR) chunk.setCell(lx, y, lz, packCell(block));
        }
      }
    }
  }

  sampleBlock(x: number, y: number, z: number): number {
    const zone = this.blender.zoneAt(x, z);
    return this.blockAt(x, y, z, this.blender.height(x, z, zone), zone, LodLevel.HIGH);
  }

  terrainHeight(x: number, z: number): number {
    return this.blender.height(x, z);
  }

  zoneNameAt(x: number, z: number): string {
    return this.blender.zoneAt(x, z).name;
  }
}

export const createVoxelverseGenerator = (registry: BlockRegistry, seed: number = WORLD_SEED): VoxelverseGenerator =>
  new VoxelverseGenerator(registry, seed);
