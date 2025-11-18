import { Zone, AtmosphereSettings, LodLevel } from './Zone';
import { BlockType } from '../constants';

export class FremmevillaZone extends Zone {
  name = "Kingdom of Fremmevilla";
  centerX = 1600; // Was 3200
  centerZ = -1600; // Was -3200

  isInside(x: number, z: number): boolean {
    const dx = x - this.centerX;
    const dz = z - this.centerZ;
    return Math.sqrt(dx*dx + dz*dz) < 250;
  }

  getAtmosphere(): AtmosphereSettings {
    return {
      fogColor: '#e3f2fd', // Cool technological blue
      skyTint: '#bbdefb',
      fogDensity: 0.015
    };
  }

  getHeight(x: number, z: number, baseH: number): number {
    return 5;
  }

  getBlock(x: number, y: number, z: number, groundH: number, lod: LodLevel): BlockType {
    const dx = x - this.centerX;
    const dz = z - this.centerZ;
    const dist = Math.sqrt(dx*dx + dz*dz);

    // Massive Hangar Walls
    if (dist < 150 && dist > 140) {
        if (y > groundH && y < groundH + 30) return BlockType.STONE_BRICK;
    }
    
    if (Math.abs(dx) < 50 && Math.abs(dz) < 80) {
        // Hangar Floor
        if (y === groundH) return BlockType.STONE;
        // Steel Beams
        if (y > groundH) {
            if (Math.abs(dx) % 20 === 0 && y < groundH + 25) return BlockType.IRON_BLOCK;
            if (y === groundH + 25) return BlockType.IRON_BLOCK;
        }
        return BlockType.AIR;
    }

    if (y === groundH) return BlockType.GRASS;
    return BlockType.AIR;
  }
}