import { Zone, AtmosphereSettings, LodLevel } from './Zone';
import { BlockType, MILE } from '../constants';

export class RankingZone extends Zone {
  name = "Kingdom of Bosse";
  centerX = 0;
  centerZ = -3 * MILE; // North

  isInside(x: number, z: number): boolean {
    const dx = x - this.centerX;
    const dz = z - this.centerZ;
    return Math.sqrt(dx*dx + dz*dz) < 200;
  }

  getAtmosphere(): AtmosphereSettings {
    return {
      fogColor: '#fff176', // Bright, almost heavenly/gold tint
      skyTint: '#fff9c4',
      fogDensity: 0.01 // Very clear air
    };
  }

  getHeight(x: number, z: number, baseH: number): number {
    // A huge raised platform/castle mount
    return 30;
  }

  getBlock(x: number, y: number, z: number, groundH: number, lod: LodLevel): BlockType {
    const dx = x - this.centerX;
    const dz = z - this.centerZ;
    
    // Main Castle Walls
    if (y > groundH) {
       const ly = y - groundH;
       // Simple Castle shape
       if (Math.abs(dx) < 20 && Math.abs(dz) < 20) {
           if (ly < 15) {
               if (Math.abs(dx) === 19 || Math.abs(dz) === 19) return BlockType.MARBLE;
               return BlockType.AIR;
           }
           // Gold spires
           if (ly >= 15 && ly < 25) {
                if (Math.abs(dx) < 5 && Math.abs(dz) < 5) return BlockType.GOLD_BLOCK;
           }
       }
    }

    if (y === groundH) return BlockType.MARBLE;
    return BlockType.AIR;
  }
}