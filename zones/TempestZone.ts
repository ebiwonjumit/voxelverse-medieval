import { Zone, AtmosphereSettings } from './Zone';
import { BlockType, MILE } from '../constants';
import { noise } from '../utils/perlin';

export class TempestZone extends Zone {
  name = "Federation of Tempest";
  centerX = 3 * MILE; // East
  centerZ = 0;

  isInside(x: number, z: number): boolean {
    const dx = x - this.centerX;
    const dz = z - this.centerZ;
    return Math.sqrt(dx*dx + dz*dz) < 250;
  }

  getAtmosphere(): AtmosphereSettings {
    return {
      fogColor: '#a5d6a7', // Greenish tint (Forest magic vibe)
      skyTint: '#e8f5e9',
      fogDensity: 0.025
    };
  }

  getHeight(x: number, z: number, baseH: number): number {
    return 8; 
  }

  getBlock(x: number, y: number, z: number, groundH: number): BlockType {
    const dx = x - this.centerX;
    const dz = z - this.centerZ;
    const dist = Math.sqrt(dx*dx + dz*dz);

    if (dist < 30) {
        const moundH = 20 * (1 - dist/30);
        const ly = y - groundH;
        if (dx < -10 && Math.abs(dz) < 6 && ly < 10) return BlockType.AIR;
        if (ly <= moundH) return BlockType.MOSSY_COBBLESTONE;
        return BlockType.AIR;
    }

    if (Math.abs(dz) < 4 || Math.abs(dx) < 4) {
        if (y === groundH) return BlockType.PATH;
        return BlockType.AIR;
    }

    if (y > groundH) return this.getTempestHouse(x, y, z, groundH);
    if (y === groundH) return BlockType.GRASS;
    return BlockType.AIR;
  }

  private getTempestHouse(x: number, y: number, z: number, groundH: number): BlockType {
     const grid = 20;
     const plotX = Math.floor((x)/grid);
     const plotZ = Math.floor((z)/grid);
     const seed = noise.hash(plotX, plotZ);
     if (seed < 0.5) return BlockType.AIR;

     const centerX = plotX * grid + grid/2;
     const centerZ = plotZ * grid + grid/2;
     const dx = x - centerX;
     const dz = z - centerZ;
     const w = 6, d = 4; 
     const ly = y - groundH;

     if (Math.abs(dx) > w || Math.abs(dz) > d) return BlockType.AIR;
     if (ly <= 4) {
         if (Math.abs(dx) === w || Math.abs(dz) === d) return BlockType.DARK_PLANK;
         if (ly === 2 && Math.abs(dz) === d) return BlockType.GLASS;
         return BlockType.AIR;
     }
     if (ly === 5 && Math.abs(dx) <= w+1 && Math.abs(dz) <= d+1) return BlockType.WOOD_LOG;
     if (ly > 5 && ly <= 8) {
        if (Math.abs(dx) <= w-1 && Math.abs(dz) <= d-1) {
             if (Math.abs(dx) === w-1 || Math.abs(dz) === d-1) return BlockType.PLASTER;
             return BlockType.AIR;
        }
     }
     if (ly === 9 && Math.abs(dx) <= w && Math.abs(dz) <= d) return BlockType.WOOD_LOG;
     return BlockType.AIR;
  }
}