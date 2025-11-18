import { Zone, AtmosphereSettings, LodLevel } from './Zone';
import { BlockType, MILE } from '../constants';

export class AmestrisZone extends Zone {
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

  getBlock(x: number, y: number, z: number, groundH: number, lod: LodLevel): BlockType {
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