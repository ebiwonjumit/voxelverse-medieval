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

class GreensomZone extends Zone {
  name = "Greensom Village";
  centerZ = 600; // South of SAO

  isInside(x: number, z: number): boolean {
    return Math.abs(x) < 70 && Math.abs(z - this.centerZ) < 70;
  }

  getAtmosphere(): AtmosphereSettings {
    return {
      fogColor: '#87CEEB', // Clear Blue
      skyTint: '#ffffff',
      fogDensity: 0.015
    };
  }

  private getStreamDistance(x: number, z: number): number {
    const dx = x;
    // Meandering stream roughly West->East at z offset +25
    const streamPath = 25 + Math.sin(dx * 0.05) * 10 + Math.cos(dx * 0.02) * 5;
    return Math.abs((z - this.centerZ) - streamPath);
  }

  getHeight(x: number, z: number, baseH: number): number {
    const streamDist = this.getStreamDistance(x, z);
    
    // Carve River
    if (streamDist < 3.5) return 3; // Deep riverbed
    if (streamDist < 6) return 4 + (streamDist - 3.5); // River banks slope up

    // Village Flattening with gentle hills
    const dx = x;
    const dz = z - this.centerZ;
    const dist = Math.sqrt(dx*dx + dz*dz);
    
    if (dist < 50) return 7; // Central flat area
    return 7 + (dist - 50) * 0.1; // Gentle slope out
  }

  getBlock(x: number, y: number, z: number, groundH: number): BlockType {
    const dx = x;
    const dz = z - this.centerZ;
    const streamDist = this.getStreamDistance(x, z);

    // --- STREAM & BRIDGE ---
    if (streamDist < 4.5) {
        // Bridge Intersection with Main Road (dx < 3)
        if (Math.abs(dx) < 3) {
            if (y === 7) return BlockType.WOOD_PLANK; // Bridge Deck
            // Bridge supports
            if (Math.abs(dx) === 2 && y < 7 && y >= groundH) return BlockType.WOOD_LOG;
            if (y < 7 && y > groundH) return BlockType.AIR; // Tunnel under bridge
        }

        // Water Logic
        if (y <= 6 && y > groundH) return BlockType.WATER; // Water surface at y=6
        if (y === groundH) return BlockType.SAND; // Sandy bed
        return BlockType.AIR;
    }

    // --- MAIN ROAD ---
    // Main Road (Dirt/Path) - Overrides Wilderness logic locally
    if (Math.abs(dx) < 3) {
      if (y === groundH) return BlockType.PATH;
      return BlockType.AIR;
    }

    // --- VILLAGE CENTER ---
    // Well at (0, 0) relative to center
    if (Math.abs(dx) < 4 && Math.abs(dz) < 4) {
        if (y === groundH) return BlockType.COBBLESTONE; // Plaza floor
        const wellDist = Math.sqrt(dx*dx + dz*dz);
        if (wellDist < 2.5) {
             if (y <= groundH + 1 && y > groundH - 2) {
                 if (wellDist > 1.5) return BlockType.STONE_BRICK; // Well wall
                 return BlockType.WATER; // Water inside well
             }
             if (y > groundH + 1 && y < groundH + 4) {
                 if (Math.abs(dx) > 1.5 && Math.abs(dx) < 2.5 && Math.abs(dz) < 0.5) return BlockType.WOOD_FENCE; // Supports
                 return BlockType.AIR;
             }
             if (y === groundH + 4) return BlockType.ROOF_RED;
        }
        return BlockType.AIR;
    }

    // --- HOUSES ---
    // Refined Cottage Generation
    const houseLocations = [
      { x: -18, z: -18, rot: 0 },
      { x: 18, z: -18, rot: 0 },
      { x: -18, z: 18, rot: 0 },
      { x: 18, z: 18, rot: 0 },
      // Extra houses
      { x: -25, z: 0, rot: 1 } 
    ];

    for (const loc of houseLocations) {
      const hx = dx - loc.x;
      const hz = dz - loc.z;
      
      // Check bounds for a 6x6 house (radius 3) plus porch
      const w = 4; 
      const d = 4;
      
      if (Math.abs(hx) <= w + 1 && Math.abs(hz) <= d + 1) {
         const ly = y - groundH;

         // Porch / Foundation
         if (ly === 0) return BlockType.COBBLESTONE;

         // House Structure
         if (Math.abs(hx) <= w && Math.abs(hz) <= d) {
             // Walls
             if (ly > 0 && ly <= 4) {
                 // Corners
                 if (Math.abs(hx) === w && Math.abs(hz) === d) return BlockType.WOOD_LOG;
                 // Walls
                 if (Math.abs(hx) === w || Math.abs(hz) === d) {
                     // Windows
                     if (ly === 2 && (Math.abs(hx) === 2 || Math.abs(hz) === 2)) return BlockType.GLASS;
                     // Door (Face center)
                     if (ly < 3 && Math.abs(hx) < 1 && ((loc.x < 0 && hx > 0) || (loc.x > 0 && hx < 0))) return BlockType.AIR;
                     
                     return BlockType.WOOD_PLANK;
                 }
                 return BlockType.AIR; // Interior
             }
             // Roof
             if (ly > 4) {
                 const roofH = ly - 4;
                 if (Math.abs(hx) <= w - roofH + 1 && Math.abs(hz) <= d - roofH + 1) return BlockType.ROOF_RED;
             }
         }
         
         // Porch Roof / Supports
         if (Math.abs(hz) === d + 1 && loc.z * hz < 0 && Math.abs(hx) <= w) {
             if (ly === 1) return BlockType.WOOD_FENCE; // Railing
             if (ly === 3) return BlockType.WOOD_FENCE; // Pillars
             if (ly === 4) return BlockType.WOOD_PLANK; // Roof
         }
      }
    }
    
    // --- FARMING AREA ---
    // West side of village (-40 to -20)
    if (dx < -25 && dx > -55 && Math.abs(dz) < 20) {
        // Farm rows
        if (y === groundH) {
            if (Math.abs(dx) % 3 === 0) return BlockType.WATER; // Irrigation
            return BlockType.FARMLAND;
        }
        if (y === groundH + 1) {
            if (Math.abs(dx) % 3 !== 0) return BlockType.WHEAT;
        }
        return BlockType.AIR;
    }

    if (y === groundH) return BlockType.GRASS;
    return BlockType.AIR;
  }
}

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
    
    const roadInfo = this.getRoadInfo(x, z);
    if (roadInfo.isRoad) return h * 0.2 + 6 * 0.8;
    
    return h;
  }

  getBlock(x: number, y: number, z: number, groundH: number): BlockType {
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

// --- MANAGER ---

const zones: Zone[] = [
  new SAOTownZone(),
  new GreensomZone(), 
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
  const block = zone.getBlock(x, y, z, height); // Passing height (7)
  if (block !== BlockType.AIR) return block;

  return BlockType.AIR;
};