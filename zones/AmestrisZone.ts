
import { Zone, AtmosphereSettings, LodLevel } from './Zone';
import { BlockType, MILE } from '../constants';
import { generateIndustrialGrid, RoadMap } from '../utils/roadGenerators';
import { noise } from '../utils/perlin';

export class AmestrisZone extends Zone {
  name = "Amestris District";
  centerX = -3 * MILE; // Moved to -1500
  centerZ = 0;
  
  private roadMap: RoadMap;

  constructor() {
      super();
      // Expanded to 1000x1000, 36 block blocks, road width 5
      this.roadMap = generateIndustrialGrid(1000, 36, 5);
  }

  isInside(x: number, z: number): boolean {
    const dx = x - this.centerX;
    const dz = z - this.centerZ;
    return Math.sqrt(dx*dx + dz*dz) < 700;
  }

  getAtmosphere(): AtmosphereSettings {
    return {
      fogColor: '#90a4ae', // Industrial Grey/Smog
      skyTint: '#cfd8dc',
      fogDensity: 0.035
    };
  }

  getHeight(x: number, z: number, baseH: number): number {
    const dx = x - this.centerX;
    const dz = z - this.centerZ;
    const dist = Math.sqrt(dx*dx + dz*dz);
    
    let h = 6;

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
     
     const isRoad = this.roadMap.isRoad(dx, dz);

     // Ground Layer
     if (y === groundH) {
         if (isRoad) return BlockType.COBBLESTONE;
         return BlockType.STONE; // Industrial pavement everywhere
     }
     
     // Buildings (Factories)
     if (y > groundH && !isRoad) {
         // Use noise to create "Factory Complexes" instead of single houses
         // We group blocks together
         const blockIdX = Math.floor(dx / 36);
         const blockIdZ = Math.floor(dz / 36);
         const complexType = noise.hash(blockIdX, blockIdZ); // 0-1
         
         const localX = Math.abs(dx) % 36;
         const localZ = Math.abs(dz) % 36;
         
         const ly = y - groundH;

         // Type A: Warehouse (Low, Large)
         if (complexType < 0.4) {
             if (ly < 8) return BlockType.FACTORY_BRICK;
             if (ly === 8) return BlockType.OBSIDIAN; // Roof
         }
         // Type B: Chimney Stack (Tall, Narrow)
         else if (complexType < 0.7) {
             const cx = 18, cz = 18; // Center of block
             if (Math.abs(localX - cx) < 4 && Math.abs(localZ - cz) < 4) {
                 if (ly < 25) return BlockType.RED_BRICK;
                 if (ly === 25) return BlockType.COBBLESTONE; // Top rim
             }
             // Base building
             if (ly < 6) return BlockType.FACTORY_BRICK;
         }
         // Type C: Open Yard (Empty with fences)
         else {
             if (ly === 1 && (localX < 2 || localX > 34 || localZ < 2 || localZ > 34)) return BlockType.IRON_BLOCK; // Fence
         }
     }

     return BlockType.AIR;
  }
}
