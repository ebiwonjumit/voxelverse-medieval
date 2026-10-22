import { BlockRegistry } from '../engine/BlockRegistry';
import { Chunk } from '../engine/Chunk';
import { WorldGenerator } from '../engine/WorldGenerator';
import { packCell } from '../engine/cell';
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from '../engine/coords';
import { LodLevel } from '../zones/Zone';
import { BlockType, WATER_LEVEL, WORLD_SEED } from '../worldConstants';
import { Biome } from './biomes/Biome';
import { FeaturePlacer } from './features/FeaturePlacer';
import { NO_ROADS, RoadField } from './features/RoadField';
import { Column, ColumnSampler, newColumn } from './terrain/ColumnSampler';

// How far above the ground a legacy zone is asked for blocks. The Great Tower, the tallest thing the old zones
// build, reaches 59 above the ground.
const ZONE_SCAN_ABOVE = 64;

export interface GenerateOptions {
  // 0 is far away and may skip small decorations; anything else (or nothing) is full detail.
  // sampleBlock always answers at full detail, so a chunk made at LOD 0 can differ from it in those details.
  lod?: number;
}

export class VoxelverseGenerator implements WorldGenerator {
  private readonly columns: ColumnSampler;
  private readonly pool: Column[];
  private readonly scratch: Column;
  private readonly features: FeaturePlacer;

  // `roads` says where trees must not grow. Step 6.4 supplies the real road network; nothing is a road until then.
  constructor(registry: BlockRegistry, readonly seed: number = WORLD_SEED, readonly roads: RoadField = NO_ROADS) {
    for (const type of Object.values(BlockType)) {
      if (typeof type === 'number' && !registry.has(type)) {
        throw new Error(`VoxelverseGenerator needs block id ${type} (${BlockType[type]}) in the registry`);
      }
    }
    this.columns = new ColumnSampler(seed);
    const zone = this.columns.blender.zoneAt(0, 0);
    this.pool = Array.from({ length: CHUNK_SIZE * CHUNK_SIZE }, () => newColumn(zone));
    this.scratch = newColumn(zone);
    this.features = new FeaturePlacer(seed, (x, z, out) => this.columns.sample(x, z, out), roads, newColumn(zone));
  }

  // One rule for every block of the terrain itself, so sampleBlock and generateChunk cannot drift apart.
  private terrainBlock(col: Column, x: number, y: number, z: number, lod: LodLevel): number {
    const ground = col.ground;
    if (col.wild) {
      if (y < ground - col.depth) return BlockType.STONE;
      if (y < ground) return col.subsoil;
      if (y === ground) return col.surface;
      return y <= WATER_LEVEL ? BlockType.WATER : BlockType.AIR;
    }
    if (y < ground) return BlockType.STONE;
    if (y > ground && y <= WATER_LEVEL) return BlockType.WATER;
    if (y - ground > ZONE_SCAN_ABOVE) return BlockType.AIR;
    return col.zone.getBlock(x, y, z, ground, lod);
  }

  generateChunk(chunk: Chunk, options?: GenerateOptions): void {
    const lod = options?.lod === 0 ? LodLevel.LOW : LodLevel.HIGH;
    const x0 = chunk.cx * CHUNK_SIZE;
    const z0 = chunk.cz * CHUNK_SIZE;
    const stone = packCell(BlockType.STONE);
    const water = packCell(BlockType.WATER);
    const waterTop = Math.min(WATER_LEVEL, WORLD_MAX_Y);
    let anyWild = false;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = x0 + lx;
        const z = z0 + lz;
        const col = this.columns.sample(x, z, this.pool[lz * CHUNK_SIZE + lx]);
        const ground = col.ground;

        if (col.wild) {
          anyWild = true;
          const soilBottom = ground - col.depth;
          for (let y = WORLD_MIN_Y; y < soilBottom && y <= WORLD_MAX_Y; y++) chunk.setCell(lx, y, lz, stone);
          const subsoil = packCell(col.subsoil);
          for (let y = Math.max(soilBottom, WORLD_MIN_Y); y < ground; y++) chunk.setCell(lx, y, lz, subsoil);
          chunk.setCell(lx, ground, lz, packCell(col.surface));
          for (let y = ground + 1; y <= waterTop; y++) chunk.setCell(lx, y, lz, water);
          continue;
        }

        for (let y = WORLD_MIN_Y; y < ground && y <= WORLD_MAX_Y; y++) chunk.setCell(lx, y, lz, stone);
        for (let y = Math.max(ground + 1, WORLD_MIN_Y); y <= waterTop; y++) chunk.setCell(lx, y, lz, water);
        const top = Math.min(ground + ZONE_SCAN_ABOVE, WORLD_MAX_Y);
        for (let y = ground; y <= top; y++) {
          if (y > ground && y <= WATER_LEVEL) continue; // already water
          const block = col.zone.getBlock(x, y, z, ground, lod);
          if (block !== BlockType.AIR) chunk.setCell(lx, y, lz, packCell(block));
        }
      }
    }

    if (anyWild) {
      const placed = this.features.collect(x0, z0, x0 + CHUNK_SIZE - 1, z0 + CHUNK_SIZE - 1, lod === LodLevel.LOW);
      this.features.paint(chunk, placed, this.pool);
    }
  }

  sampleBlock(x: number, y: number, z: number): number {
    const col = this.columns.sample(x, z, this.scratch);
    const terrain = this.terrainBlock(col, x, y, z, LodLevel.HIGH);
    return col.wild ? this.features.blockAt(x, y, z, col, terrain) : terrain;
  }

  terrainHeight(x: number, z: number): number {
    return this.columns.height(x, z);
  }

  zoneNameAt(x: number, z: number): string {
    return this.columns.blender.zoneAt(x, z).name;
  }

  // Full description of one column, for tools and tests (the biome map, the map renderer).
  columnAt(x: number, z: number): Column {
    return this.columns.sample(x, z, newColumn(this.scratch.zone));
  }

  biomeAt(x: number, z: number): Biome {
    return this.columns.biomes.biomeAt(x, z);
  }
}

export const createVoxelverseGenerator = (registry: BlockRegistry, seed: number = WORLD_SEED, roads: RoadField = NO_ROADS): VoxelverseGenerator =>
  new VoxelverseGenerator(registry, seed, roads);
