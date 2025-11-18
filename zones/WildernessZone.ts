import { Zone, AtmosphereSettings, LodLevel } from './Zone';
import { BlockType, WATER_LEVEL, MILE } from '../constants';
import { noise } from '../utils/perlin';

export class WildernessZone extends Zone {
  name = "Wilderness";

  isInside(x: number, z: number): boolean { return true; }
  
  getAtmosphere(): AtmosphereSettings {
    return {
      fogColor: '#87CEEB', // Standard Blue
      skyTint: '#ffffff',
      fogDensity: 0.015
    };
  }

  getHeight(x: number, z: number, baseH: number): number {
     let h = baseH;
     // Mountains (East > 20 Miles)
     const mountainStart = 20 * MILE;
     if (x > mountainStart) { 
        const factor = (x - mountainStart) / 500; 
        h += noise.octaveNoise(x * 0.01, z * 0.01, 4) * 80 * Math.min(factor, 1);
        h += Math.max(0, factor * 50);
     }
    // Coast (West < 3 Miles)
    const coastStart = -3.5 * MILE;
    if (x < coastStart) {
        const factor = (coastStart - x) / 500;
        h -= factor * 20;
    }
    // Forest (South > 8 Miles)
    const forestStart = 8 * MILE;
    if (z > forestStart) h += noise.noise2D(x * 0.02, z * 0.02) * 5;
    
    const roadInfo = this.getRoadInfo(x, z);
    if (roadInfo.isRoad) return h * 0.2 + 6 * 0.8;
    
    return h;
  }

  getBlock(x: number, y: number, z: number, groundH: number, lod: LodLevel): BlockType {
     if (y > groundH) {
         const roadInfo = this.getRoadInfo(x, z);
         if (!roadInfo.isRoad) return this.getNature(x, y, z, groundH);
         return BlockType.AIR;
     }
     if (y === groundH) {
         const roadInfo = this.getRoadInfo(x, z);
         if (roadInfo.isRoad) {
             // Material Transition for Roads
             const dist = Math.sqrt(x*x + z*z);
             if (dist < 600) return BlockType.COBBLESTONE;
             if (dist < 1500) return BlockType.PATH;
             return BlockType.DIRT;
         }
         
         if (groundH > 60) return BlockType.SNOW;
         if (groundH > 45) return BlockType.STONE;
         if (groundH < WATER_LEVEL + 1) return BlockType.SAND;
         return BlockType.GRASS;
     }
     return BlockType.AIR;
  }

  private getRoadInfo(x: number, z: number): { isRoad: boolean } {
      const absZ = Math.abs(z);
      const absX = Math.abs(x);
      
      // Add noise to road width for organic feel (Dithering)
      const roadNoise = noise.noise2D(x * 0.15, z * 0.15) * 2.5;
      const baseWidth = 3.5;
      const w = baseWidth + roadNoise;

      // East/West Highway
      if (absZ < w && x > -4800 && x < 4800) return { isRoad: true };
      
      // South Road
      if (absX < w && z > 0 && z < 13000) return { isRoad: true };
      
      // North Road (To Ranking of Kings)
      if (absX < w && z > -6000 && z < 0) return { isRoad: true };
      
      return { isRoad: false };
  }

  private getNature(x: number, y: number, z: number, groundH: number): BlockType {
      if (groundH <= WATER_LEVEL) return BlockType.AIR;
      let sparsity = 0.99;
      if (z > 8 * MILE) sparsity = 0.85; // Forest
      const n = noise.noise2D(Math.floor(x/5)*5 * 0.1, Math.floor(z/5)*5 * 0.1);
      if ((n+1)/2 > sparsity) {
           if (x % 5 === 0 && z % 5 === 0) {
                const h = 5;
                if (y <= groundH + h) return BlockType.WOOD_LOG;
                if (y > groundH + 3 && y <= groundH + h + 2) return BlockType.LEAVES;
           }
      }
      if (y === groundH + 1) {
          const hash = noise.hash(x, z);
          if (hash > 0.98) return BlockType.FLOWER_YELLOW;
          if (hash > 0.96) return BlockType.SMALL_ROCK;
      }
      return BlockType.AIR;
  }
}