import { BlockRegistry } from '../engine/BlockRegistry';
import { Chunk } from '../engine/Chunk';
import { WorldGenerator } from '../engine/WorldGenerator';
import { cellId, packCell } from '../engine/cell';
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from '../engine/coords';
import { LodLevel } from '../zones/Zone';
import { BlockType, WATER_LEVEL, WORLD_SEED } from '../worldConstants';
import { Biome } from './biomes/Biome';
import { FeaturePlacer } from './features/FeaturePlacer';
import { RoadMask } from './features/RoadField';
import { canReplace } from './features/blockClass';
import { DECK_HALF } from './roads/RoadField';
import { RoadNetwork } from './roads/RoadNetwork';
import { Column, ColumnSampler, newColumn } from './terrain/ColumnSampler';

// How far above the ground a legacy zone is asked for blocks. The Great Tower, the tallest thing the old zones
// build, reaches 59 above the ground.
const ZONE_SCAN_ABOVE = 64;
// A waypoint is a post of fence blocks with a lantern on top.
const POST_FENCE = 3;
// Bridge piers stand every this many blocks along the road.
const PIER_EVERY = 8;
const NO_BLOCK = -1;

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
  readonly roads: RoadNetwork;

  // The road network is part of the world and comes from the seed. `keepClear` is an extra mask for features only (a
  // test uses it to clear a circle); it changes where trees stand and nothing else.
  constructor(registry: BlockRegistry, readonly seed: number = WORLD_SEED, keepClear?: RoadMask) {
    for (const type of Object.values(BlockType)) {
      if (typeof type === 'number' && !registry.has(type)) {
        throw new Error(`VoxelverseGenerator needs block id ${type} (${BlockType[type]}) in the registry`);
      }
    }
    this.columns = new ColumnSampler(seed);
    const zone = this.columns.blender.zoneAt(0, 0);
    this.pool = Array.from({ length: CHUNK_SIZE * CHUNK_SIZE }, () => newColumn(zone));
    this.scratch = newColumn(zone);
    this.roads = this.columns.roads;
    const network = this.roads;
    const mask: RoadMask = keepClear ? { isRoad: (x, z, margin) => network.isRoad(x, z, margin) || keepClear.isRoad(x, z, margin) } : network;
    this.features = new FeaturePlacer(seed, (x, z, out) => this.columns.sample(x, z, out), mask, newColumn(zone));
  }

  // The block of a bridge at this height, or NO_BLOCK where the bridge has nothing: a deck of planks one block above
  // the water, rails on its edges, log beams under the edges and log piers every few blocks down to the bed.
  private bridgeBlock(col: Column, y: number): number {
    const road = col.road;
    const deck = Math.floor(road.level);
    if (y === deck) return BlockType.WOOD_PLANK;
    const edge = road.distance > DECK_HALF - 1;
    if (!edge) return NO_BLOCK;
    if (y === deck + 1) return BlockType.WOOD_FENCE;
    if (y > col.ground && y === deck - 1) return BlockType.WOOD_LOG;
    if (y > col.ground && y < deck && Math.floor(road.arc) % PIER_EVERY === 0) return BlockType.WOOD_LOG;
    return NO_BLOCK;
  }

  // What a waypoint leaves at one height above the ground in its column, or NO_BLOCK.
  private static postBlock(col: Column, y: number): number {
    const dy = y - col.ground;
    if (dy < 1 || dy > POST_FENCE + 1) return NO_BLOCK;
    return dy > POST_FENCE ? BlockType.LANTERN : BlockType.WOOD_FENCE;
  }

  // One rule for every block of the terrain itself, so sampleBlock and generateChunk cannot drift apart.
  private terrainBlock(col: Column, x: number, y: number, z: number, lod: LodLevel): number {
    const ground = col.ground;
    if (col.wild) {
      if (col.road.bridge && col.road.onRoad) {
        const b = this.bridgeBlock(col, y);
        if (b !== NO_BLOCK) return b;
      }
      if (y < ground - col.depth) return BlockType.STONE;
      if (y < ground) return col.subsoil;
      if (y === ground) return col.surface;
      return y <= WATER_LEVEL ? BlockType.WATER : BlockType.AIR;
    }
    if (y < ground) return BlockType.STONE;
    if (y > ground && y <= WATER_LEVEL) return BlockType.WATER;
    // A road painted onto a zone's ground clears everything above it, houses and factories included.
    if (col.road.onRoad) return y === ground ? col.surface : BlockType.AIR;
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
          if (col.road.bridge && col.road.onRoad) {
            const deck = Math.floor(col.road.level);
            for (let y = Math.max(ground + 1, WORLD_MIN_Y); y <= deck + 1 && y <= WORLD_MAX_Y; y++) {
              const b = this.bridgeBlock(col, y);
              if (b !== NO_BLOCK) chunk.setCell(lx, y, lz, packCell(b));
            }
          }
          continue;
        }

        for (let y = WORLD_MIN_Y; y < ground && y <= WORLD_MAX_Y; y++) chunk.setCell(lx, y, lz, stone);
        for (let y = Math.max(ground + 1, WORLD_MIN_Y); y <= waterTop; y++) chunk.setCell(lx, y, lz, water);
        if (col.road.onRoad) {
          chunk.setCell(lx, ground, lz, packCell(col.surface));
          continue;
        }
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
      this.paintPosts(chunk);
    }
  }

  private paintPosts(chunk: Chunk): void {
    const x0 = chunk.cx * CHUNK_SIZE;
    const z0 = chunk.cz * CHUNK_SIZE;
    for (const post of this.roads.postsIn(x0, z0, x0 + CHUNK_SIZE - 1, z0 + CHUNK_SIZE - 1)) {
      const lx = post.x - x0;
      const lz = post.z - z0;
      const col = this.pool[lz * CHUNK_SIZE + lx];
      if (!col.wild || col.ground <= WATER_LEVEL) continue;
      for (let y = col.ground + 1; y <= col.ground + POST_FENCE + 1 && y <= WORLD_MAX_Y; y++) {
        const id = VoxelverseGenerator.postBlock(col, y);
        if (canReplace(cellId(chunk.getCell(lx, y, lz)), id)) chunk.setCell(lx, y, lz, packCell(id));
      }
    }
  }

  sampleBlock(x: number, y: number, z: number): number {
    const col = this.columns.sample(x, z, this.scratch);
    const terrain = this.terrainBlock(col, x, y, z, LodLevel.HIGH);
    if (!col.wild) return terrain;
    const block = this.features.blockAt(x, y, z, col, terrain);
    if (col.ground > WATER_LEVEL && this.roads.hasPost(x, z)) {
      const post = VoxelverseGenerator.postBlock(col, y);
      if (post !== NO_BLOCK && canReplace(block, post)) return post;
    }
    return block;
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

export const createVoxelverseGenerator = (registry: BlockRegistry, seed: number = WORLD_SEED, keepClear?: RoadMask): VoxelverseGenerator =>
  new VoxelverseGenerator(registry, seed, keepClear);
