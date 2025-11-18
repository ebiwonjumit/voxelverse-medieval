import { BlockType, WATER_LEVEL, MILE } from '../constants';
import { noise } from './perlin';

// --- ABSTRACT ZONE ARCHITECTURE ---

export interface AtmosphereSettings {
  fogColor: string; // The color of the fog at noon
  skyTint: string;  // A tint applied to the ambient light
  fogDensity: number;
}

abstract class Zone {
  abstract name: string;
  
  // Should this zone handle this coordinate?
  abstract isInside(x: number, z: number): boolean;
  
  // Return a height modifier or absolute height for this x,z
  abstract getHeight(x: number, z: number, baseNoiseHeight: number): number;
  
  // Return a structure block or AIR
  abstract getBlock(x: number, y: number, z: number, groundH: number): BlockType;
  
  // Visual atmosphere
  abstract getAtmosphere(): AtmosphereSettings;
}

// --- CONCRETE ZONES ---

class SAOTownZone extends Zone {
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

  getBlock(x: number, y: number, z: number, groundH: number): BlockType {
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

class TempestZone extends Zone {
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

class AmestrisZone extends Zone {
  name = "Amestris District";
  centerX = -3 * MILE; // West
  centerZ = 0;

  isInside(x: number, z: number): boolean {
    const dx = x - this.centerX;
    const dz = z - this.centerZ;
    return Math.sqrt(dx*dx + dz*dz) < 200;
  }

  getAtmosphere(): AtmosphereSettings {
    return {
      fogColor: '#90a4ae', // Industrial Grey/Smog
      skyTint: '#cfd8dc',
      fogDensity: 0.035
    };
  }

  getHeight(x: number, z: number, baseH: number): number {
    return 6;
  }

  getBlock(x: number, y: number, z: number, groundH: number): BlockType {
     const dx = x - this.centerX;
     const dz = z - this.centerZ;
     const streetW = 6;
     const blockW = 24;
     const modX = Math.abs(dx) % blockW;
     const modZ = Math.abs(dz) % blockW;
     
     if (modX < streetW || modZ < streetW) {
         if (y === groundH) return BlockType.COBBLESTONE;
         return BlockType.AIR;
     }
     
     if (y > groundH) {
         const localH = y - groundH;
         if (localH <= 8) {
             if (localH % 3 === 0 && (modX === streetW || modZ === streetW)) return BlockType.GLASS;
             return BlockType.FACTORY_BRICK;
         }
         if (localH > 8 && localH < 20) {
             const centerBlock = blockW / 2 + streetW / 2;
             if (Math.abs(Math.abs(dx) % blockW - centerBlock) < 2 && Math.abs(Math.abs(dz) % blockW - centerBlock) < 2) {
                 if (localH === 19) return BlockType.OBSIDIAN;
                 return BlockType.RED_BRICK;
             }
         }
     }
     if (y === groundH) return BlockType.STONE;
     return BlockType.AIR;
  }
}

class RankingZone extends Zone {
  name = "Kingdom of Bosse";
  centerX = 0;
  centerZ = -3 * MILE; // North (using negative Z as North for variety)

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

  getBlock(x: number, y: number, z: number, groundH: number): BlockType {
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

class WildernessZone extends Zone {
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
    
    if (this.isRoad(x, z)) return h * 0.2 + 6 * 0.8;
    return h;
  }

  getBlock(x: number, y: number, z: number, groundH: number): BlockType {
     if (y > groundH) {
         if (!this.isRoad(x,z)) return this.getNature(x, y, z, groundH);
         return BlockType.AIR;
     }
     if (y === groundH) {
         if (this.isRoad(x, z)) return BlockType.DIRT;
         if (groundH > 60) return BlockType.SNOW;
         if (groundH > 45) return BlockType.STONE;
         if (groundH < WATER_LEVEL + 1) return BlockType.SAND;
         return BlockType.GRASS;
     }
     return BlockType.AIR;
  }

  private isRoad(x: number, z: number): boolean {
      const absZ = Math.abs(z);
      const absX = Math.abs(x);
      // East/West Highway
      if (absZ < 4 && x > -4800 && x < 4800) return true;
      // South Road
      if (absX < 4 && z > 0 && z < 13000) return true;
      // North Road (To Ranking of Kings)
      if (absX < 4 && z > -6000 && z < 0) return true;
      return false;
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

// --- MANAGER ---

const zones: Zone[] = [
  new SAOTownZone(),
  new TempestZone(),
  new AmestrisZone(),
  new RankingZone()
];
const wilderness = new WildernessZone();

export const getZone = (x: number, z: number): Zone => {
  for (const zone of zones) {
    if (zone.isInside(x, z)) return zone;
  }
  return wilderness;
};

export const getCurrentZoneName = (x: number, z: number): string => {
    return getZone(x, z).name;
}

// --- EXPORTS ---

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