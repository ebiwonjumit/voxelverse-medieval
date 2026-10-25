import { Cell, packCell } from '../engine/cell';
import { BlockType, LodLevel } from '../worldConstants';

// LodLevel lives in worldConstants so the engine can name it without importing the zones.
export { LodLevel };

export interface AtmosphereSettings {
  fogColor: string;
  skyTint: string;
  fogDensity: number;
  fixedTime?: number;
  // How much of the sky the cloud layer covers, 0 (clear: no clouds are drawn) to 1 (overcast). Optional; the sky system's default is
  // used where a zone does not say (see DEFAULT_CLOUD_COVER in render/SkySystem.ts).
  clouds?: number;
}

export abstract class Zone {
  abstract name: string;
  
  // Should this zone handle this coordinate?
  abstract isInside(x: number, z: number): boolean;
  
  // Return a height modifier or absolute height for this x,z
  abstract getHeight(x: number, z: number, baseNoiseHeight: number): number;
  
  // Return a structure block or AIR
  abstract getBlock(x: number, y: number, z: number, groundH: number, lod: LodLevel): BlockType;
  
  // The same question with the block's state (a stair's facing) in the answer. Zones that place shaped blocks override it;
  // for the others a block is a cell with state 0.
  getCell(x: number, y: number, z: number, groundH: number, lod: LodLevel): Cell {
    return packCell(this.getBlock(x, y, z, groundH, lod));
  }

  // Visual atmosphere
  abstract getAtmosphere(): AtmosphereSettings;
}