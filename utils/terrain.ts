import { BlockType, WATER_LEVEL } from '../constants';
import { noise } from './perlin';
import { getZone } from '../zones';

export { getZone, getCurrentZoneName } from '../zones';

export const getTerrainHeight = (x: number, z: number): number => {
  const baseHeight = 6 + noise.octaveNoise(x * 0.005, z * 0.005, 3) * 10;
  const zone = getZone(x, z);
  return Math.floor(zone.getHeight(x, z, baseHeight));
};

export const getBlockAt = (x: number, y: number, z: number): BlockType => {
  const height = getTerrainHeight(x, z);
  if (y <= WATER_LEVEL && y > height) return BlockType.WATER;
  if (y < height) return BlockType.STONE;

  const zone = getZone(x, z);
  const block = zone.getBlock(x, y, z, height); 
  if (block !== BlockType.AIR) return block;

  return BlockType.AIR;
};