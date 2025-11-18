import { Zone, AtmosphereSettings, LodLevel } from './Zone';
import { BlockType } from '../constants';
import { noise } from '../utils/perlin';

export class SAOZone extends Zone {
  name = "Town of Beginnings";
  
  isInside(x: number, z: number): boolean {
    const dist = Math.sqrt(x*x + z*z);
    return dist < 200;
  }

  getAtmosphere(): AtmosphereSettings {
    return {
      fogColor: '#87CEEB', // Standard Blue Sky
      skyTint: '#ffffff',
      fogDensity: 0.02
    };
  }

  getHeight(x: number, z: number, baseH: number): number {
    const dist = Math.sqrt(x*x + z*z);
    if (dist < 100) return 6; 
    return 6 + (dist - 100) * 0.1; 
  }

  getBlock(x: number, y: number, z: number, groundH: number, lod: LodLevel): BlockType {
    const dist = Math.sqrt(x*x + z*z);
    
    // 1. The Iron Great Dungeon (Center Tower)
    if (dist < 25) {
        if (y <= groundH) return BlockType.OBSIDIAN;
        if (dist > 22 && y < groundH + 60) {
           if ((y % 10 === 0) || (Math.abs(x) % 4 === 0)) return BlockType.OBSIDIAN;
           return BlockType.STONE_BRICK;
        }
        if (z > 20 && Math.abs(x) < 4 && y < groundH + 8) return BlockType.AIR;
        if (y === groundH + 1) return BlockType.STONE_BRICK;
        return BlockType.AIR;
    }

    // 2. Town Plazas
    if (dist < 40) {
        if (y === groundH) return BlockType.COBBLESTONE;
        return BlockType.AIR;
    }
    
    // 3. Houses
    if (y > groundH) return this.getMedievalHouse(x, y, z, groundH);
    
    if (y === groundH) return BlockType.STONE_BRICK;
    return BlockType.AIR;
  }

  private getMedievalHouse(x: number, y: number, z: number, groundH: number): BlockType {
     const grid = 16;
     const plotX = Math.floor((x+500)/grid);
     const plotZ = Math.floor((z+500)/grid);
     const seed = noise.hash(plotX, plotZ);
     if (seed < 0.4) return BlockType.AIR;

     const centerX = plotX * grid - 500 + grid/2;
     const centerZ = plotZ * grid - 500 + grid/2;
     const dx = x - centerX;
     const dz = z - centerZ;
     const w = 5, d = 6, h = 6;
     if (Math.abs(dx) > w || Math.abs(dz) > d) return BlockType.AIR;
     const ly = y - groundH;
     if (ly <= h) {
         if (Math.abs(dx) === w || Math.abs(dz) === d) {
             if (Math.abs(dx) === w && Math.abs(dz) === d) return BlockType.WOOD_LOG;
             if (ly === 3 && (Math.abs(dx) === w || Math.abs(dz) === d)) return BlockType.GLASS;
             return BlockType.PLASTER;
         }
         return BlockType.AIR;
     }
     const roofH = ly - h;
     if (Math.abs(dx) <= w - roofH && Math.abs(dz) <= d) return BlockType.ROOF_BLUE;
     return BlockType.AIR;
  }
}