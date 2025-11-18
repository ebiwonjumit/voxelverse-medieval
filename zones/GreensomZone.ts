import { Zone, AtmosphereSettings, LodLevel} from './Zone';
import { BlockType, WATER_LEVEL } from '../constants';
import { noise } from '../utils/perlin';

export class GreensomZone extends Zone {
  name = "Greensom Village";
  centerZ = 300; // South of SAO, adjusted for halved world scale

  isInside(x: number, z: number): boolean {
    return Math.abs(x) < 70 && Math.abs(z - this.centerZ) < 70;
  }

  getAtmosphere(): AtmosphereSettings {
    return {
      fogColor: '#87CEEB', // Clear Blue
      skyTint: '#ffffff',
      fogDensity: 0.015,
      fixedTime: 0.25 // Always Noon
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

  getBlock(x: number, y: number, z: number, groundH: number, lod: LodLevel): BlockType {
    const dx = x;
    const dz = z - this.centerZ;
    const streamDist = this.getStreamDistance(x, z);

    // --- STREAM & VEGETATION ---
    if (streamDist < 4.5) {
        // Bridge Intersection
        if (Math.abs(dx) < 3) {
            if (y === 7) return BlockType.WOOD_PLANK; 
            if (Math.abs(dx) === 2 && y < 7 && y >= groundH) return BlockType.WOOD_LOG;
            if (y < 7 && y > groundH) return BlockType.AIR; 
        }

        // Water & Decor
        if (y <= 6 && y > groundH) {
            if (y === 6 && lod === LodLevel.HIGH && noise.hash(x, z) > 0.95) return BlockType.LILY_PAD;
            return BlockType.WATER; 
        }
        if (y === groundH) {
            if (streamDist > 3 && lod === LodLevel.HIGH && noise.hash(x, z) > 0.85) return BlockType.SUGARCANE;
            return BlockType.SAND; 
        }
        return BlockType.AIR;
    }

    // --- MAIN ROAD & STREET LIGHTS ---
    if (Math.abs(dx) < 3) {
      if (y === groundH) return BlockType.PATH;
      
      if (dz < 0 && Math.abs(dz) % 15 === 0 && Math.abs(dx) === 2 && lod === LodLevel.HIGH) {
          if (y > groundH && y <= groundH + 3) return BlockType.WOOD_FENCE;
          if (y === groundH + 4) return BlockType.LANTERN;
      }
      return BlockType.AIR;
    }

    // --- VILLAGE CENTER ---
    if (Math.abs(dx) < 4 && Math.abs(dz) < 4) {
        if (y === groundH) return BlockType.COBBLESTONE; 
        const wellDist = Math.sqrt(dx*dx + dz*dz);
        if (wellDist < 2.5) {
             if (y <= groundH + 1 && y > groundH - 2) {
                 if (wellDist > 1.5) return BlockType.STONE_BRICK; 
                 return BlockType.WATER; 
             }
             if (y > groundH + 1 && y < groundH + 4) {
                 if (Math.abs(dx) > 1.5 && Math.abs(dx) < 2.5 && Math.abs(dz) < 0.5) return BlockType.WOOD_FENCE; 
                 return BlockType.AIR;
             }
             if (y === groundH + 4) return BlockType.ROOF_RED;
        }
        return BlockType.AIR;
    }

    // --- HOUSES ---
    const houseLocations = [
      { x: -18, z: -18, rot: 0 },
      { x: 18, z: -18, rot: 0 },
      { x: -18, z: 18, rot: 0 },
      { x: 18, z: 18, rot: 0 },
      { x: -25, z: 0, rot: 1 } 
    ];

    for (const loc of houseLocations) {
      const hx = dx - loc.x;
      const hz = dz - loc.z;
      const w = 4, d = 4;
      
      if (Math.abs(hx) <= w + 1 && Math.abs(hz) <= d + 1) {
         const ly = y - groundH;
         if (ly === 0) return BlockType.COBBLESTONE; 

         if (Math.abs(hx) <= w && Math.abs(hz) <= d) {
             if (ly > 0 && ly <= 4) {
                 if (Math.abs(hx) === w && Math.abs(hz) === d) return BlockType.WOOD_LOG; 
                 if (Math.abs(hx) === w || Math.abs(hz) === d) {
                     if (ly === 2 && (Math.abs(hx) === 2 || Math.abs(hz) === 2)) return BlockType.GLASS;
                     if (ly === 1 && (Math.abs(hx) === 2 || Math.abs(hz) === 2) && lod === LodLevel.HIGH) return BlockType.DIRT; 
                     if (ly < 3 && Math.abs(hx) < 1 && ((loc.x < 0 && hx > 0) || (loc.x > 0 && hx < 0))) return BlockType.AIR;
                     return BlockType.WOOD_PLANK;
                 }
                 return BlockType.AIR;
             }
             if (ly > 4) {
                 if (ly < 9 && Math.abs(hx - 2) < 1 && Math.abs(hz - 2) < 1) return BlockType.COBBLESTONE; // Chimney
                 const roofH = ly - 4;
                 if (Math.abs(hx) <= w - roofH + 1 && Math.abs(hz) <= d - roofH + 1) return BlockType.ROOF_RED;
             }
         }
         
         if (Math.abs(hz) === d + 1 && loc.z * hz < 0 && Math.abs(hx) <= w) {
             if (ly === 1) return BlockType.WOOD_FENCE;
             if (ly === 3) return BlockType.WOOD_FENCE;
             if (ly === 4) return BlockType.WOOD_PLANK;
         }
      }
    }
    
    // --- FARMING ---
    if (dx < -25 && dx > -55 && Math.abs(dz) < 20) {
        if (y === groundH) {
            if (Math.abs(dx) % 3 === 0) return BlockType.WATER;
            return BlockType.FARMLAND;
        }
        if (y === groundH + 1) {
            if (Math.abs(dx) % 3 !== 0) return BlockType.WHEAT;
        }
        return BlockType.AIR;
    }

    // --- TREES ---
    // Scan for nearby tree centers
    if (y > groundH) {
        const treeGrid = 9;
        const centerTreeX = Math.floor(x / treeGrid) * treeGrid;
        const centerTreeZ = Math.floor(z / treeGrid) * treeGrid;
        
        // Avoid spawning inside houses/roads/river
        const tdx = centerTreeX; 
        const tdz = centerTreeZ - this.centerZ;
        const tsDist = this.getStreamDistance(centerTreeX, centerTreeZ);
        
        if (tsDist > 6 && Math.abs(tdx) > 6 && Math.abs(tdz) > 6 && !(tdx < -20 && tdx > -60 && Math.abs(tdz) < 25)) {
            const treeNoise = noise.noise2D(centerTreeX * 0.1, centerTreeZ * 0.1);
            if (treeNoise > 0.5) {
                const th = 5;
                const ly = y - groundH;
                const distToTrunk = Math.sqrt(Math.pow(x - centerTreeX, 2) + Math.pow(z - centerTreeZ, 2));
                
                if (ly <= th && distToTrunk < 0.5) return BlockType.WOOD_LOG;
                if (ly >= 3 && ly <= th + 2) {
                    const radius = ly > th ? 1.5 : 2.5;
                    if (distToTrunk <= radius) {
                        // Apples
                        if (lod === LodLevel.HIGH && ly === 4 && (x + z) % 3 === 0) return BlockType.RED_APPLE;
                        return BlockType.LEAVES;
                    }
                }
            }
        }
    }

    // --- GROUND VEGETATION ---
    if (y === groundH) return BlockType.GRASS;
    if (y === groundH + 1 && lod === LodLevel.HIGH) {
        const n = noise.hash(x, z);
        if (n > 0.95) return BlockType.TALL_GRASS;
        if (n > 0.92) return BlockType.FLOWER_YELLOW;
        if (n > 0.90) return BlockType.SMALL_ROCK;
    }

    return BlockType.AIR;
  }
}