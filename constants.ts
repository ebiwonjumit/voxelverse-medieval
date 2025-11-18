import { Vector3 } from 'three';

export const CHUNK_SIZE = 32;
export const RENDER_DISTANCE = 4; 
export const BLOCK_SIZE = 1;
export const WORLD_HEIGHT = 60; // Increased for towers
export const WATER_LEVEL = 3;
export const MILE = 1600; 

// Physics
export const GRAVITY = 30;
export const JUMP_FORCE = 10;
export const MOVE_SPEED = 14; 
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_RADIUS = 0.4;

// Colors
export const COLORS = {
  GRASS: '#4ade80',       
  DIRT: '#5D4037',        
  STONE: '#64748b',       
  SAND: '#fde047',        
  WATER: '#3b82f6',       
  SNOW: '#f8fafc',        
  
  // Architecture
  STONE_BRICK: '#475569', 
  RED_BRICK: '#8D4E46',   
  WOOD_LOG: '#3E2723',    
  WOOD_PLANK: '#8D6E63',  
  DARK_PLANK: '#5D4037',  
  PLASTER: '#EFEBE9',     
  ROOF_RED: '#B71C1C',    
  ROOF_BLUE: '#1A237E',   
  GLASS: '#81D4FA',       
  COBBLESTONE: '#9CA3AF', 
  MOSSY_COBBLESTONE: '#7E8F78', 
  PATH: '#d6d3d1',        
  LEAVES: '#1b5e20',      
  
  // Industrial / Anime Themes
  FACTORY_BRICK: '#7f2e2e', // Dark Red Industrial
  IRON_BLOCK: '#cfd8dc',    // Light Metallic
  OBSIDIAN: '#212121',      // Dark Black/Purple
  BASALT: '#424242',        // Dark Grey column
  SLIME_BLOCK: '#00e676',   // Translucent Green
  MAGIC_CRYSTAL: '#d500f9', // Glowing Purple

  // New Trees
  BIRCH_LOG: '#d4c5a2',   
  BIRCH_LEAVES: '#66bb6a', 
  PINE_LEAVES: '#0a3d0f', 

  // Decorations
  FLOWER_YELLOW: '#FBC02D',
  FLOWER_RED: '#D32F2F',
  SMALL_ROCK: '#78909c'
};

export enum BlockType {
  AIR = 0,
  GRASS = 1,
  DIRT = 2,
  STONE = 3,
  SAND = 4,
  WATER = 5,
  SNOW = 6,
  
  // Architecture
  STONE_BRICK = 7,
  WOOD_LOG = 8,
  WOOD_PLANK = 9,
  PLASTER = 10,
  ROOF_RED = 11,
  ROOF_BLUE = 12,
  GLASS = 13,
  COBBLESTONE = 14,
  PATH = 15,
  LEAVES = 16,
  
  // Variants
  RED_BRICK = 17,
  DARK_PLANK = 18,
  MOSSY_COBBLESTONE = 19,
  
  // Decorations
  FLOWER_YELLOW = 20,
  FLOWER_RED = 21,
  SMALL_ROCK = 22,
  
  // Tree Variants
  BIRCH_LOG = 23,
  BIRCH_LEAVES = 24,
  PINE_LEAVES = 25,

  // New Special Blocks
  FACTORY_BRICK = 26,
  IRON_BLOCK = 27,
  OBSIDIAN = 28,
  BASALT = 29,
  SLIME_BLOCK = 30,
  MAGIC_CRYSTAL = 31
}

export const INITIAL_SPAWN = new Vector3(0, 20, 10); // Offset slightly so we face the tower