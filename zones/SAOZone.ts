
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
    let h = 6; // City Flat Level

    // Blend to wilderness at edge (Radius 150 -> 200)
    if (dist > 150) {
        const t = (dist - 150) / 50;
        // If on main roads, keep flat (Widened to 12 to match getBlock)
        if ((Math.abs(x) < 12 || Math.abs(z) < 12)) {
             return h * (1 - t) + 7 * t; // Blend to Road Height (approx 7)
        }
        return h * (1 - t) + baseH * t;
    }
    return h;
  }

  getBlock(x: number, y: number, z: number, groundH: number, lod: LodLevel): BlockType {
    const dist = Math.sqrt(x*x + z*z);
    const ly = y - groundH;

    // --- FLOOR LAYER (y == groundH) ---
    if (ly === 0) {
        // 1. Center Tower Floor (Intricate Pattern)
        if (dist < 25) {
            if (dist < 22) {
                // Central Altar Base
                if (dist < 3) return BlockType.OBSIDIAN;
                // Radial Pattern
                if (Math.floor(dist) % 2 === 0) return BlockType.STONE_BRICK;
                return BlockType.OBSIDIAN;
            }
            // Wall Base
            return BlockType.OBSIDIAN;
        }
        
        // 2. Plaza
        if (dist < 40) return BlockType.COBBLESTONE;

        // 3. South Road Extension (Connects to Wilderness Road)
        if (z > 0 && Math.abs(x) < 12) return BlockType.COBBLESTONE;
        
        // North/East/West Roads
        if ((Math.abs(x) < 12 || Math.abs(z) < 12) && dist < 150) return BlockType.COBBLESTONE;

        // 4. Inside Walls (Paved)
        if (dist < 85) return BlockType.STONE_BRICK;
        
        // 5. Outside Walls (Grass)
        return BlockType.GRASS;
    }

    // --- STRUCTURE LAYER (y > groundH) ---
    if (ly > 0) {
        // 1. The Iron Great Dungeon (Center Tower)
        if (dist < 25) {
            // WALLS (Outer Shell)
            if (dist > 22 && ly < 60) {
                // South Entrance Arch (Parabolic)
                if (z > 0 && Math.abs(x) < 7) {
                    // Arch logic: Height = MaxH * (1 - (x/Width)^2)
                    const archH = 12 * (1 - Math.pow(x / 6, 2));
                    if (ly < archH) return BlockType.AIR;
                }
                
                // Wall Texture
                if ((y % 10 === 0) || (Math.abs(x) % 4 === 0)) return BlockType.OBSIDIAN;
                return BlockType.STONE_BRICK;
            }

            // INTERIOR (Ground Floor Details)
            if (dist <= 22) {
                // Central Altar
                if (dist < 4) {
                    if (ly === 1) return BlockType.OBSIDIAN;
                    if (ly === 2 && dist < 2) return BlockType.MAGIC_CRYSTAL; // Floating Crystal
                    if (ly === 3) return BlockType.AIR; // Clear space above
                }

                // Central Chandelier
                if (dist < 1) {
                    if (ly > 10 && ly < 15) return BlockType.IRON_BLOCK; // Chain
                    if (ly === 10) return BlockType.LANTERN; // Light
                }

                // Radial Pillars (8 around the center at radius 12-13)
                if (dist > 11 && dist < 14) {
                    const angle = Math.atan2(z, x);
                    // Normalize angle to 0-8 sectors
                    const sector = ((angle + Math.PI) / (2 * Math.PI)) * 8;
                    const distFromSectorCenter = Math.abs(sector - Math.round(sector));
                    
                    if (distFromSectorCenter < 0.12) {
                        if (ly < 15) {
                            if (ly === 4) return BlockType.LANTERN; // Eye-level lighting
                            return BlockType.OBSIDIAN;
                        }
                        if (ly === 15) return BlockType.LANTERN; // Light on top
                    }
                }

                // Spiral Staircase (Along inner wall radius 19-21)
                if (dist > 18 && dist < 22) {
                     // Angle 0 to 2PI
                     const angle = Math.atan2(z, x) + Math.PI;
                     // 1 Full rotation = 12 blocks high
                     const stairHeight = (angle / (2 * Math.PI)) * 12;
                     
                     // Generate stairs for first 2 loops (up to height 24)
                     const h1 = Math.floor(stairHeight);
                     const h2 = Math.floor(stairHeight + 12);

                     if (ly === h1 || ly === h2) return BlockType.STONE_BRICK;
                }

                // Second Floor Balcony / Ceiling
                if (ly === 20) {
                     if (dist > 10) return BlockType.STONE_BRICK;
                }
            }
            
            return BlockType.AIR;
        }

        // 2. Town Wall & Gate (Radius 85)
        if (dist > 83 && dist < 87) {
            // Gate Opening at South (z > 0, x near 0)
            if (z > 0 && Math.abs(x) < 12) {
                if (ly > 6 && ly <= 8) return BlockType.STONE_BRICK; // Arch top
                if (ly === 6 && (Math.abs(x) === 10 || Math.abs(x) === 11) && lod === LodLevel.HIGH) return BlockType.LANTERN;
                return BlockType.AIR;
            }

            // Wall Structure
            if (ly < 10) return BlockType.STONE_BRICK;
            if (ly === 10 && (Math.abs(x) + Math.abs(z)) % 2 === 0) return BlockType.STONE_BRICK; // Battlements
            
            // Gate Towers
            if (z > 0 && Math.abs(x) >= 12 && Math.abs(x) < 18 && dist > 84 && dist < 86) {
                if (ly >= 10 && ly < 15) return BlockType.STONE_BRICK;
            }
            return BlockType.AIR;
        }

        // 3. Houses (Inside Walls)
        if (dist < 80 && dist > 40) {
             // Don't build on main roads
             if (Math.abs(x) > 14 && Math.abs(z) > 14) {
                 return this.getMedievalHouse(x, y, z, groundH);
             }
        }
    }
    
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
     
     // Bounding Box
     if (Math.abs(dx) > w || Math.abs(dz) > d) return BlockType.AIR;
     
     const ly = y - groundH;
     
     // Walls
     if (ly <= h) {
         if (Math.abs(dx) === w || Math.abs(dz) === d) {
             // Corners
             if (Math.abs(dx) === w && Math.abs(dz) === d) return BlockType.WOOD_LOG;
             // Windows
             if (ly === 3 && (Math.abs(dx) === w || Math.abs(dz) === d)) return BlockType.GLASS;
             return BlockType.PLASTER;
         }
         return BlockType.AIR;
     }
     
     // Roof
     const roofH = ly - h;
     if (Math.abs(dx) <= w - roofH && Math.abs(dz) <= d) return BlockType.ROOF_BLUE;
     
     return BlockType.AIR;
  }
}
