import { Vector3 } from 'three';

export const CHUNK_SIZE = 32;
export const RENDER_DISTANCE = 2; // chunks radius
export const BLOCK_SIZE = 1;
export const WORLD_HEIGHT = 32;
export const WATER_LEVEL = 3;

// Physics
export const GRAVITY = 30;
export const JUMP_FORCE = 10;
export const MOVE_SPEED = 8;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_RADIUS = 0.4;

// Colors
export const COLORS = {
  GRASS: '#4ade80',     // Tailwind green-400
  DIRT: '#855E42',      // Brown
  STONE: '#94a3b8',     // Slate-400
  SAND: '#fde047',      // Yellow-300
  WATER: '#3b82f6',     // Blue-500
  WOOD: '#451a03',      // Amber-950
  LEAVES: '#166534',    // Green-800
  SNOW: '#f8fafc',      // Slate-50
  ROOF: '#7f1d1d',      // Red-900
  PATH: '#d6d3d1',      // Stone-300
};

export enum BlockType {
  AIR = 0,
  GRASS = 1,
  DIRT = 2,
  STONE = 3,
  SAND = 4,
  WATER = 5,
  WOOD = 6,
  LEAVES = 7,
  SNOW = 8,
  ROOF = 9,
  PATH = 10
}

export const INITIAL_SPAWN = new Vector3(0, 20, 0); // High up to drop down safely
