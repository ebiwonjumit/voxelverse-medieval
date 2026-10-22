import { BlockType, WATER_LEVEL } from '../worldConstants';
import { noise } from './perlin';
import { getZone } from '../zones';
import { LodLevel } from '../zones/Zone';
import { TERRAIN_MAX_Y, TERRAIN_MIN_Y } from '../engine/coords';

export { getZone, getCurrentZoneName } from '../zones';

export const getTerrainHeight = (x: number, z: number): number => {
  const baseHeight = 6 + noise.octaveNoise(x * 0.005, z * 0.005, 3) * 10;
  const zone = getZone(x, z);
  const height = Math.floor(zone.getHeight(x, z, baseHeight));
  // The old mountains and coast kept climbing or sinking without limit. The world has a fixed height now.
  return Math.min(TERRAIN_MAX_Y, Math.max(TERRAIN_MIN_Y, height));
};

export const getBlockAt = (x: number, y: number, z: number): BlockType => {
  const height = getTerrainHeight(x, z);
  if (y <= WATER_LEVEL && y > height) return BlockType.WATER;
  if (y < height) return BlockType.STONE;

  const zone = getZone(x, z);
  const block = zone.getBlock(x, y, z, height, LodLevel.HIGH); 
  if (block !== BlockType.AIR) return block;

  return BlockType.AIR;
};

export const getBlockOptimized = (x: number, y: number, z: number, groundH: number, lod: LodLevel): BlockType => {
  if (y <= WATER_LEVEL && y > groundH) return BlockType.WATER;
  if (y < groundH) return BlockType.STONE;

  const zone = getZone(x, z);
  const block = zone.getBlock(x, y, z, groundH, lod);
  if (block !== BlockType.AIR) return block;

  return BlockType.AIR;
};