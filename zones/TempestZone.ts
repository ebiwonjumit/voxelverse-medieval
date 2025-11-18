
import { Zone, AtmosphereSettings, LodLevel } from './Zone';
import { BlockType, MILE } from '../constants';
import { generatePlannedGrid, RoadMap } from '../utils/roadGenerators';

export class TempestZone extends Zone {
  name = "Federation of Tempest";
  centerX = 1.5 * MILE; 
  centerZ = 0;
  
  private roadMap: RoadMap;

  constructor() {
      super();
      // 500x500 Map, 24-block blocks, 10-block wide main avenues
      this.roadMap = generatePlannedGrid(500, 24, 10);
  }

  isInside(x: number, z: number): boolean {
    const dx = x - this.centerX;
    const dz = z - this.centerZ;
    return Math.sqrt(dx*dx + dz*dz) < 300;
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

    // Blend to wilderness at edges (250 -> 300)
    if (dist > 250) {
        const t = (dist - 250) / 50;
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
    // Location: x > 80, z near 0
    if (dx > 100 && dx < 180 && Math.abs(dz) < 40) {
        const cx = 140; // Center of Coliseum
        const cz = 0;
        const cDist = Math.sqrt(Math.pow(dx - cx, 2) + Math.pow(dz - cz, 2));
        const ly = y - groundH;

        // Arena Floor (Dungeon Entrance)
        if (ly === 0) {
            if (cDist < 10) return BlockType.OBSIDIAN; // The Hole
            return BlockType.SAND;
        }
        
        // Walls / Stands
        if (cDist > 25 && cDist < 35) {
            // Sloped stands
            const slopeH = (cDist - 25) * 1.5;
            if (ly <= slopeH) return BlockType.STONE_BRICK;
        }
        
        // Outer Wall
        if (cDist >= 35 && cDist <= 38) {
            if (ly < 15) return BlockType.STONE_BRICK;
            if (ly === 15 && (Math.abs(dx) % 2 === 0)) return BlockType.STONE_BRICK; // Battlements
        }
        return BlockType.AIR;
    }

    // 2. Town Hall (North side, end of avenue)
    // Location: x near 0, z < -80
    if (Math.abs(dx) < 30 && dz < -60 && dz > -100) {
        const ly = y - groundH;
        // Main Building
        if (ly < 20) {
            if (Math.abs(dx) === 29 || dz === -61 || dz === -99) return BlockType.PLASTER;
            if (ly % 5 === 0) return BlockType.WOOD_LOG; // Beams
            return BlockType.AIR; 
        }
        // Roof
        if (ly >= 20) {
             const roofH = ly - 20;
             if (Math.abs(dx) <= 30 - roofH && Math.abs(dz - (-80)) <= 20 - roofH) return BlockType.ROOF_BLUE;
        }
        return BlockType.AIR;
    }

    // 3. Central Plaza Details
    if (dist < 35) {
        if (y === groundH) return BlockType.STONE_BRICK; // Paved
        
        // Central Fountain / Platform
        if (dist < 8) {
            if (y <= groundH + 2) return BlockType.MARBLE;
            if (y === groundH + 3 && dist < 2 && lod === LodLevel.HIGH) return BlockType.SLIME_BLOCK; // Rimuru Statue representation
        }
        // Decorative Slime Lamps around plaza
        if (dist > 30 && dist < 34 && lod === LodLevel.HIGH) {
             if ((Math.floor(dx) % 10 === 0) || (Math.floor(dz) % 10 === 0)) {
                 if (y === groundH + 1) return BlockType.WOOD_FENCE;
                 if (y === groundH + 2) return BlockType.SLIME_BLOCK;
             }
        }
        return BlockType.AIR;
    }

    // --- ROADS ---
    const isRoad = this.roadMap.isRoad(dx, dz);
    if (y === groundH) {
        if (isRoad) return BlockType.STONE_BRICK; // Paved roads
        return BlockType.GRASS;
    }

    // --- HOUSING GRID ---
    if (y > groundH && !isRoad && dist > 35 && dist < 250) {
        // Don't build inside landmarks
        if (dx > 90 && Math.abs(dz) < 50) return BlockType.AIR; // Near Coliseum
        if (Math.abs(dx) < 40 && dz < -50) return BlockType.AIR; // Near Town Hall

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
