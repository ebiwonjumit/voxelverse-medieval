import { BlockType, WATER_LEVEL } from '../constants';
import { noise } from './perlin';

// Helper to get block at world coordinates
export const getBlockAt = (x: number, y: number, z: number): BlockType => {
  const height = getTerrainHeight(x, z);
  
  // Water
  if (y <= WATER_LEVEL && y > height) {
    return BlockType.WATER;
  }

  // Terrain surface
  if (y === height) {
    if (height <= WATER_LEVEL + 1) return BlockType.SAND;
    if (height > 25) return BlockType.SNOW;
    
    // Village Path logic (Center area)
    if (Math.abs(x) < 8 && Math.abs(z) < 8) {
        // Simple noise for path patches
        if (noise.noise2D(x * 0.5, z * 0.5) > 0.6) return BlockType.PATH;
    }
    
    return BlockType.GRASS;
  }

  // Underground
  if (y < height) {
    if (y < height - 3) return BlockType.STONE;
    return BlockType.DIRT;
  }

  // Trees & Structures (Above ground)
  // Only generate objects if we are directly on top of the terrain
  if (y > height) {
    return getObjectBlock(x, y, z, height);
  }

  return BlockType.AIR;
};

// Calculate terrain height based on biomes
export const getTerrainHeight = (x: number, z: number): number => {
  let baseHeight = 6;

  // Biome Weights
  // East (Positive X) -> Mountains
  // West (Negative X) -> Coast/Ocean
  // South (Positive Z) -> Forest (Hilly)
  // Center (0,0) -> Village (Flat)

  // Mountain Influence (East)
  if (x > 20) {
    const mountainFactor = Math.min((x - 20) / 50, 1); // 0 to 1 transition
    baseHeight += noise.octaveNoise(x * 0.05, z * 0.05, 4) * 30 * mountainFactor;
  }

  // Coast Influence (West)
  if (x < -20) {
    const coastFactor = Math.min(Math.abs(x + 20) / 40, 1);
    baseHeight -= coastFactor * 10; // Drop down to ocean
  }

  // Base noise for variation everywhere
  baseHeight += noise.octaveNoise(x * 0.03, z * 0.03, 2) * 4;

  // Flatten village area (Center)
  const distFromCenter = Math.sqrt(x * x + z * z);
  if (distFromCenter < 25) {
    const flattenFactor = 1 - Math.min(distFromCenter / 25, 1);
    // Lerp towards flat level (e.g., 6)
    baseHeight = baseHeight * (1 - flattenFactor) + 6 * flattenFactor;
  }

  return Math.floor(baseHeight);
};

// Procedural Object Generation (Trees, Houses)
const getObjectBlock = (x: number, y: number, z: number, groundHeight: number): BlockType => {
  // Don't place objects in water or too high
  if (groundHeight <= WATER_LEVEL) return BlockType.AIR;

  // Check if this x,z coordinate is a tree root
  // Use a hash to deterministically decide tree positions
  const treeNoise = noise.noise2D(x * 100, z * 100); // High frequency for random spots
  const isForest = z > 15; // South is forest
  const isVillage = Math.abs(x) < 20 && Math.abs(z) < 20;

  // FOREST TREES
  if (isForest && treeNoise > 0.85) {
    const treeHeight = 4 + Math.floor(noise.noise2D(x, z) * 3);
    // Trunk
    if (y > groundHeight && y <= groundHeight + treeHeight) {
      return BlockType.WOOD;
    }
    // Leaves
    if (y > groundHeight + 2 && y <= groundHeight + treeHeight + 2) {
      // Simple plus shape or block for leaves
      return BlockType.LEAVES; // This logic is flawed for single column checking. 
      // In a column-based generator, we can only place the trunk. 
      // A true voxel engine generates neighbors. 
      // For this simplifed version: we only render the trunk in this column check.
    }
  }
  
  // However, to render leaves over *other* blocks (neighbors), we'd need neighbor checking.
  // For this simplified specific implementation:
  // We will just render vertical stacks.
  // To make trees look like trees, we check if we are *near* a trunk.
  
  if (isForest) {
      // Check neighborhood for a "trunk" location
      for(let dx = -2; dx <= 2; dx++) {
          for (let dz = -2; dz <= 2; dz++) {
              if (dx === 0 && dz === 0) continue; // handled by trunk logic
              const targetX = x + dx;
              const targetZ = z + dz;
              const targetHash = noise.noise2D(targetX * 100, targetZ * 100);
              
              if (targetHash > 0.85) {
                  const neighborGround = getTerrainHeight(targetX, targetZ);
                  const treeH = 4 + Math.floor(noise.noise2D(targetX, targetZ) * 3);
                  // Leaf canopy logic
                  if (y > neighborGround + treeH - 2 && y <= neighborGround + treeH + 1) {
                      return BlockType.LEAVES;
                  }
              }
          }
      }
  }

  // VILLAGE HOUSES (Simple Boxes)
  if (isVillage) {
     // Define a few house locations manually or via noise
     const houseX = Math.round(x / 10) * 10; // Grid of potential houses
     const houseZ = Math.round(z / 10) * 10;
     
     // Check if we are within a house footprint (e.g. 4x4) centered at houseX, houseZ
     // And verify "house exists" there via noise
     if (noise.noise2D(houseX, houseZ) > 0.2 && Math.abs(houseX) > 5) { // Don't build on 0,0
         const dx = Math.abs(x - houseX);
         const dz = Math.abs(z - houseZ);
         
         if (dx <= 2 && dz <= 2) {
             const houseBase = getTerrainHeight(houseX, houseZ);
             // Walls
             if (y > houseBase && y <= houseBase + 3) {
                 // Window logic
                 if (y === houseBase + 2 && (dx === 0 || dz === 0)) return BlockType.AIR;
                 return BlockType.WOOD; 
             }
             // Roof
             if (y > houseBase + 3 && y <= houseBase + 5) {
                 // Pyramid roof
                 const roofHeight = y - (houseBase + 3);
                 if (dx <= 2 - roofHeight && dz <= 2 - roofHeight) {
                     return BlockType.ROOF;
                 }
             }
         }
     }
  }

  return BlockType.AIR;
};
