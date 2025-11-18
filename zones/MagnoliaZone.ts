import { Zone, AtmosphereSettings } from './Zone';
import { BlockType } from '../constants';

export class MagnoliaZone extends Zone {
  name = "Magnolia Town";
  centerX = -3200;
  centerZ = 3200;

  isInside(x: number, z: number): boolean {
    const dx = x - this.centerX;
    const dz = z - this.centerZ;
    return Math.sqrt(dx*dx + dz*dz) < 250;
  }

  getAtmosphere(): AtmosphereSettings {
    return {
      fogColor: '#fce4ec', // Pinkish magic
      skyTint: '#f8bbd0',
      fogDensity: 0.02
    };
  }

  getHeight(x: number, z: number, baseH: number): number {
    return 8;
  }

  getBlock(x: number, y: number, z: number, groundH: number): BlockType {
    const dx = x - this.centerX;
    const dz = z - this.centerZ;
    
    // Guild Hall Center
    if (Math.abs(dx) < 30 && Math.abs(dz) < 30) {
        if (y === groundH) return BlockType.WOOD_PLANK;
        // Main Building
        if (y > groundH && y < groundH + 15 && Math.abs(dx) < 20 && Math.abs(dz) < 20) {
            if (Math.abs(dx) === 19 || Math.abs(dz) === 19) return BlockType.PLASTER;
            return BlockType.AIR;
        }
        if (y === groundH + 15 && Math.abs(dx) < 21 && Math.abs(dz) < 21) return BlockType.ROOF_RED;
        return BlockType.AIR;
    }

    if (y === groundH) return BlockType.GRASS;
    return BlockType.AIR;
  }
}