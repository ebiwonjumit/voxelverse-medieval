
import { Zone, AtmosphereSettings, LodLevel } from './Zone';
import { BlockType, MILE } from '../constants';
import { generatePlannedGrid, RoadMap } from '../utils/roadGenerators';

export class TempestZone extends Zone {
  name = "Federation of Tempest";
  centerX = 3 * MILE; // Moved to 1500 to match HUD/Visuals
  centerZ = 0;
  
  private roadMap: RoadMap;

  constructor() {
      super();
      // Expanded map size to 1200x1200 to cover larger radius
      // 24-block blocks, 10-block wide main avenues
      this.roadMap = generatePlannedGrid(1200, 24, 10);
  }

  isInside(x: number, z: number): boolean {
    const dx = x - this.centerX;
    const dz = z - this.centerZ;
    return Math.sqrt(dx*dx + dz*dz) < 700; // Increased radius
  }

  getAtmosphere(): AtmosphereSettings {
    return {
      fogColor: '#a5d6a7', // Lush Green tint
      skyTint: '#e8f5e9',
      fogDensity: 0.02
    };
  }

  getHeight(x: number, z: number, baseH: number): number {
    const dx = x - this.centerX;
    const dz = z - this.centerZ;
    const dist = Math.sqrt(dx*dx + dz*dz);
    
    let h = 8; // City Base Height

    // Blend to wilderness at edges (600 -> 700)
    if (dist > 600) {
        const t = (dist - 600) / 100;
        return h * (1 - t) + baseH * t;
    }

    return h; 
  }

  getBlock(x: number, y: number, z: number, groundH: number, lod: LodLevel): BlockType {
    const dx = x - this.centerX;
    const dz = z - this.centerZ;
    const dist = Math.sqrt(dx*dx + dz*dz);

    // --- LANDMARKS ---

    // 1. The Coliseum (East side, on main avenue)
    // Location: x > 150, z near 0 (Scaled up position)
    // Widened bounding box significantly to prevent any edge clipping
    if (dx > 145 && dx < 255 && Math.abs(dz) < 65) {
        const cx = 200; 
        const cz = 0;
        const cDist = Math.sqrt(Math.pow(dx - cx, 2) + Math.pow(dz - cz, 2));
        const ly = y - groundH;

        // Strictly define the structure area so we don't void the corners of the bounding box
        if (cDist <= 48) {
            // Arena Floor
            if (ly === 0) {
                if (cDist < 15) return BlockType.OBSIDIAN; 
                return BlockType.SAND;
            }
            
            // Walls / Stands
            if (cDist > 30 && cDist < 45) {
                const slopeH = (cDist - 30) * 1.2;
                if (ly <= slopeH) return BlockType.STONE_BRICK;
            }
            
            // Outer Wall
            if (cDist >= 45) {
                if (ly < 20) return BlockType.STONE_BRICK;
                if (ly === 20 && (Math.abs(dx) % 2 === 0)) return BlockType.STONE_BRICK; 
            }
            return BlockType.AIR; // Clear interior air
        }
        // If outside cDist but inside bounding box, fall through to allow roads/grass
    }

    // 2. Town Hall (North side)
    if (Math.abs(dx) < 45 && dz < -75 && dz > -145) {
        const ly = y - groundH;
        // Main Building
        if (ly < 25) {
            if (Math.abs(dx) === 39 || dz === -81 || dz === -139) return BlockType.PLASTER;
            if (ly % 6 === 0) return BlockType.WOOD_LOG; 
            return BlockType.AIR; 
        }
        // Roof
        if (ly >= 25) {
             const roofH = ly - 25;
             if (Math.abs(dx) <= 40 - roofH && Math.abs(dz - (-110)) <= 30 - roofH) return BlockType.ROOF_BLUE;
        }
        return BlockType.AIR;
    }

    // 3. Central Plaza
    if (dist < 50) {
        if (y === groundH) return BlockType.STONE_BRICK; 
        
        if (dist < 10) {
            if (y <= groundH + 3) return BlockType.MARBLE;
            if (y === groundH + 4 && dist < 3 && lod === LodLevel.HIGH) return BlockType.SLIME_BLOCK; 
        }
        if (dist > 40 && dist < 45 && lod === LodLevel.HIGH) {
             if ((Math.floor(dx) % 12 === 0) || (Math.floor(dz) % 12 === 0)) {
                 if (y === groundH + 1) return BlockType.WOOD_FENCE;
                 if (y === groundH + 2) return BlockType.SLIME_BLOCK;
             }
        }
        return BlockType.AIR;
    }

    // --- ROADS ---
    const isRoad = this.roadMap.isRoad(dx, dz);
    if (y === groundH) {
        if (isRoad) return BlockType.STONE_BRICK; 
        return BlockType.GRASS;
    }

    // --- HOUSING GRID ---
    if (y > groundH && !isRoad && dist > 50 && dist < 650) {
        // Don't build inside landmarks
        if (dx > 140 && dx < 260 && Math.abs(dz) < 70) return BlockType.AIR; // Near Coliseum
        if (Math.abs(dx) < 50 && dz < -70 && dz > -150) return BlockType.AIR; // Near Town Hall

        return this.getPlannedHouse(dx, dz, y, groundH, lod);
    }

    return BlockType.AIR;
  }

  private getPlannedHouse(dx: number, dz: number, y: number, groundH: number, lod: LodLevel): BlockType {
     // Snap to grid defined in constructor (24)
     const grid = 24;
     const plotX = Math.floor(dx/grid);
     const plotZ = Math.floor(dz/grid);
     
     // Local coords
     const localX = dx - (plotX * grid + grid/2);
     const localZ = dz - (plotZ * grid + grid/2);
     
     const w = 7;
     const d = 7;
     const h = 6;
     const ly = y - groundH;

     if (Math.abs(localX) > w || Math.abs(localZ) > d) return BlockType.AIR;

     // Foundation
     if (ly === 1) return BlockType.COBBLESTONE;

     // Structure
     if (ly <= h) {
         // Corners
         if (Math.abs(localX) === w && Math.abs(localZ) === d) return BlockType.WOOD_LOG;
         
         // Walls
         if (Math.abs(localX) === w || Math.abs(localZ) === d) {
             if (ly === 3 && (Math.abs(localX) < 3 || Math.abs(localZ) < 3)) return BlockType.GLASS;
             return BlockType.PLASTER;
         }
         return BlockType.AIR;
     }

     // Roof (Japanese Style flared?)
     const roofH = ly - h;
     if (Math.abs(localX) <= w - roofH + 1 && Math.abs(localZ) <= d - roofH + 1) return BlockType.DARK_PLANK;

     return BlockType.AIR;
  }
}
