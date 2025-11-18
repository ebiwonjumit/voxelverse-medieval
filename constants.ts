import { Vector3 } from 'three';

export const CHUNK_SIZE = 32;
export const RENDER_DISTANCE = 2; // chunks radius
export const BLOCK_SIZE = 1;
export const WORLD_HEIGHT = 40;
export const WATER_LEVEL = 3;

// Physics
export const GRAVITY = 30;
export const JUMP_FORCE = 10;
export const MOVE_SPEED = 8;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_RADIUS = 0.4;

// Colors
export const COLORS = {
  GRASS: '#4ade80',       // Vibrant Green
  DIRT: '#5D4037',        // Dark Brown
  STONE: '#64748b',       // Slate Gray
  SAND: '#fde047',        // Yellow
  WATER: '#3b82f6',       // Blue
  SNOW: '#f8fafc',        // White
  
  // Architecture
  STONE_BRICK: '#475569', // Darker Slate
  WOOD_LOG: '#3E2723',    // Very Dark Brown
  WOOD_PLANK: '#8D6E63',  // Light Brown
  PLASTER: '#EFEBE9',     // Off-white / Cream
  ROOF_RED: '#B71C1C',    // Dark Red
  ROOF_BLUE: '#1A237E',   // Dark Blue
  GLASS: '#81D4FA',       // Light Blue Transparent-ish
  COBBLESTONE: '#9CA3AF', // Gray
  PATH: '#d6d3d1',        // Light Gray
  LEAVES: '#1b5e20'       // Deep Green
};

export enum BlockType {
  AIR = 0,
  GRASS = 1,
  DIRT = 2,
  STONE = 3,
  SAND = 4,
  WATER = 5,
  SNOW = 6,
  // New Architecture Blocks
  STONE_BRICK = 7,
  WOOD_LOG = 8,
  WOOD_PLANK = 9,
  PLASTER = 10,
  ROOF_RED = 11,
  ROOF_BLUE = 12,
  GLASS = 13,
  COBBLESTONE = 14,
  PATH = 15,
  LEAVES = 16
}

export const INITIAL_SPAWN = new Vector3(0, 20, 0);