import { Vector3 } from 'three';

export const CHUNK_SIZE = 32;
export const RENDER_DISTANCE = 3; 
export const BLOCK_SIZE = 1;
export const WORLD_HEIGHT = 60; // Increased for towers
export const WATER_LEVEL = 3;
export const MILE = 500; 
export const MAX_BUILD_HEIGHT = 60;  // Use this to limit vertical scanning
export const MIN_BUILD_HEIGHT = -30; // Use this too

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
  
  // Biome Variations (Grass)
  GRASS_SAO: '#4ade80',      // Vibrant
  GRASS_TEMPEST: '#2e7d32',  // Dark Jungle
  GRASS_AMESTRIS: '#8d8d8d', // Dead/Desaturated
  GRASS_BOSSE: '#cddc39',    // Golden/Lime
  GRASS_FREMMEVILLA: '#81d4fa', // Cool Blue-Green
  GRASS_MAGNOLIA: '#f48fb1',    // Pinkish Green
  
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
  
  // Ranking of Kings
  MARBLE: '#f5f5f5',        // Pure white stone
  GOLD_BLOCK: '#ffd700',    // Gold accents

  // Knights & Magic
  STEEL_BEAM: '#37474f',    // Dark Steel
  HANGAR_WALL: '#546e7a',   // Reinforced Stone

  // Fairy Tail
  GUILD_WOOD: '#ffcc80',    // Light Orange Wood
  MAGIC_STONE: '#f8bbd0',   // Pinkish Stone

  // New Trees
  BIRCH_LOG: '#d4c5a2',   
  BIRCH_LEAVES: '#66bb6a', 
  PINE_LEAVES: '#0a3d0f', 

  // Decorations
  FLOWER_YELLOW: '#FBC02D',
  FLOWER_RED: '#D32F2F',
  SMALL_ROCK: '#78909c',
  WOOD_FENCE: '#8D6E63',
  FARMLAND: '#4E342E',
  WHEAT: '#E4D00A',
  WHEAT_GREEN: '#7cb342',   // Stage 1
  WHEAT_GROWING: '#aed581', // Stage 2

  // Greensom Polish
  LILY_PAD: '#2e7d32',
  SUGARCANE: '#9ccc65',
  TALL_GRASS: '#558b2f',
  LANTERN: '#ffeb3b',
  RED_APPLE: '#d32f2f'
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
  MAGIC_CRYSTAL = 31,
  
  // Ranking of Kings
  MARBLE = 32,
  GOLD_BLOCK = 33,

  // Missing
  WOOD_FENCE = 34,
  FARMLAND = 35,
  WHEAT = 36,

  // Knights & Magic
  STEEL_BEAM = 37,
  HANGAR_WALL = 38,

  // Fairy Tail
  GUILD_WOOD = 39,
  MAGIC_STONE = 40,

  // Greensom Polish
  LILY_PAD = 41,
  SUGARCANE = 42,
  TALL_GRASS = 43,
  LANTERN = 44,
  RED_APPLE = 45,
  
  WHEAT_STAGE_1 = 46,
  WHEAT_STAGE_2 = 47
}

// Start at Greensom (South of SAO)
export const INITIAL_SPAWN = new Vector3(0, 15, 300);