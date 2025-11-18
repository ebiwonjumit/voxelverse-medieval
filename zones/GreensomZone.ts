import { Zone, AtmosphereSettings } from './Zone';
import { BlockType, WATER_LEVEL } from '../constants';

export class GreensomZone extends Zone {
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