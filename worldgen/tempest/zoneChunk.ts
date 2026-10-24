import { Chunk } from '../../engine/Chunk';
import { packCell } from '../../engine/cell';
import { CHUNK_SIZE, TERRAIN_MAX_Y, TERRAIN_MIN_Y, WORLD_MAX_Y, WORLD_MIN_Y } from '../../engine/coords';
import { BlockType, WATER_LEVEL } from '../../worldConstants';
import { LodLevel } from '../../zones/Zone';
import { TerrainField } from '../terrain/TerrainField';
import { TempestCityZone } from './TempestCityZone';

// How a chunk of the Tempest zone is generated: the same loop VoxelverseGenerator runs for a column that a legacy zone owns
// (stone up to the ground, water up to the water level, then the zone's cell for every row from the ground up), written out
// for the zone alone so tests, the benchmark and the map tool can build chunks without the whole generator. The wilderness
// height the zone is given is the one the generator's blender passes: the seeded TerrainField.

const SCAN_ABOVE = 64;

const fields = new Map<number, TerrainField>();
const fieldFor = (seed: number): TerrainField => {
  let f = fields.get(seed);
  if (!f) { f = new TerrainField(seed); fields.set(seed, f); }
  return f;
};

/** The ground row the generator would use for a column of the zone. */
export const zoneGround = (zone: TempestCityZone, x: number, z: number): number => {
  const h = Math.floor(zone.getHeight(x, z, fieldFor(zone.seed).height(x, z)));
  return h < TERRAIN_MIN_Y ? TERRAIN_MIN_Y : h > TERRAIN_MAX_Y ? TERRAIN_MAX_Y : h;
};

/** Fills a chunk the way the generator does for the zone's columns. Only columns inside the zone are meaningful. */
export const generateZoneChunk = (zone: TempestCityZone, chunk: Chunk, lod: LodLevel = LodLevel.HIGH): void => {
  const x0 = chunk.cx * CHUNK_SIZE;
  const z0 = chunk.cz * CHUNK_SIZE;
  const stone = packCell(BlockType.STONE);
  const water = packCell(BlockType.WATER);
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const x = x0 + lx;
      const z = z0 + lz;
      const ground = zoneGround(zone, x, z);
      for (let y = WORLD_MIN_Y; y < ground && y <= WORLD_MAX_Y; y++) chunk.setCell(lx, y, lz, stone);
      for (let y = Math.max(ground + 1, WORLD_MIN_Y); y <= Math.min(WATER_LEVEL, WORLD_MAX_Y); y++) chunk.setCell(lx, y, lz, water);
      const top = Math.min(ground + SCAN_ABOVE, WORLD_MAX_Y);
      for (let y = ground; y <= top; y++) {
        if (y > ground && y <= WATER_LEVEL) continue;
        const cell = zone.getCell(x, y, z, ground, lod);
        if (cell !== 0) chunk.setCell(lx, y, lz, cell);
      }
    }
  }
};
