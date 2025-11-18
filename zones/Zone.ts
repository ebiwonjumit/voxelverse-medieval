import { BlockType } from '../constants';

export enum LodLevel {
  LOW = 0,
  HIGH = 1
}

export interface AtmosphereSettings {
  fogColor: string;
  skyTint: string;
  fogDensity: number;
  fixedTime?: number;
}

export abstract class Zone {
  abstract name: string;
  
  // Should this zone handle this coordinate?
  abstract isInside(x: number, z: number): boolean;
  
  // Return a height modifier or absolute height for this x,z
  abstract getHeight(x: number, z: number, baseNoiseHeight: number): number;
  
  // Return a structure block or AIR
  abstract getBlock(x: number, y: number, z: number, groundH: number, lod: LodLevel): BlockType;
  
  // Visual atmosphere
  abstract getAtmosphere(): AtmosphereSettings;
}