import { BlockType, WATER_LEVEL } from '../constants';
import { noise } from './perlin';

// Helper to get block at world coordinates
export const getBlockAt = (x: number, y: number, z: number): BlockType => {
  const height = getTerrainHeight(x, z);
  
  // 1. Water
  if (y <= WATER_LEVEL && y > height) {
    return BlockType.WATER;
  }

  // 2. Town & Structures (Above ground logic)
  if (y > height) {
    return getStructureBlock(x, y, z, height);
  }

  // 3. Surface Terrain
  if (y === height) {
    // Town Roads
    if (isTownRoad(x, z)) return BlockType.COBBLESTONE;
    if (isTownPlaza(x, z)) return BlockType.STONE_BRICK;

    if (height <= WATER_LEVEL + 1) return BlockType.SAND;
    if (height > 28) return BlockType.SNOW;
    
    return BlockType.GRASS;
  }

  // 4. Underground
  if (y < height) {
    if (y < height - 4) return BlockType.STONE;
    return BlockType.DIRT;
  }

  return BlockType.AIR;
};

export const getTerrainHeight = (x: number, z: number): number => {
  let baseHeight = 6;

  // Biomes
  if (x > 30) { // Mountains East
    const factor = Math.min((x - 30) / 40, 1);
    baseHeight += noise.octaveNoise(x * 0.05, z * 0.05, 4) * 40 * factor;
  }

  if (x < -30) { // Coast West
    const factor = Math.min(Math.abs(x + 30) / 30, 1);
    baseHeight -= factor * 10;
  }

  if (z > 30) { // Forest South (Rolling hills)
     baseHeight += noise.noise2D(x * 0.05, z * 0.05) * 5;
  }

  // Base noise
  baseHeight += noise.octaveNoise(x * 0.02, z * 0.02, 2) * 3;

  // Flatten Town Center (Radius 40)
  const dist = Math.sqrt(x*x + z*z);
  if (dist < 40) {
    const flatten = 1 - Math.min(dist / 40, 1);
    // Smoothly interpolate to height 6
    baseHeight = baseHeight * (1 - flatten) + 6 * flatten;
  }

  return Math.floor(baseHeight);
};

// --- Town Layout Logic ---

const isTownPlaza = (x: number, z: number) => Math.sqrt(x*x + z*z) < 12;

const isTownRoad = (x: number, z: number) => {
  // Main Roads (Cardinal directions)
  const absX = Math.abs(x);
  const absZ = Math.abs(z);
  
  // Central Cross
  if ((absX < 3 && absZ < 45) || (absZ < 3 && absX < 45)) return true;
  
  // Ring Road
  const dist = Math.sqrt(x*x + z*z);
  if (dist > 35 && dist < 39) return true;

  return false;
};

// --- Structure Generation ---

const getStructureBlock = (x: number, y: number, z: number, groundH: number): BlockType => {
  // 1. Forest Trees (South, away from town)
  if (z > 40) {
    return getTreeBlock(x, y, z, groundH);
  }

  // 2. Town Houses
  // Grid based checking for house plots
  // We define a virtual grid of 16x16 chunks for houses
  const plotSize = 16;
  // Offset coordinates to align grid
  const plotX = Math.floor((x + 1000) / plotSize);
  const plotZ = Math.floor((z + 1000) / plotSize);
  
  // Deterministic random for this plot
  const plotHash = noise.noise2D(plotX * 12.3, plotZ * 45.6);
  
  // Check if this plot is valid for a house
  // - Close to center (dist < 40)
  // - Not on a road
  // - Not in plaza
  const centerX = plotX * plotSize - 1000 + plotSize/2;
  const centerZ = plotZ * plotSize - 1000 + plotSize/2;
  const distToTownCenter = Math.sqrt(centerX*centerX + centerZ*centerZ);

  if (distToTownCenter < 45 && distToTownCenter > 15 && plotHash > 0.3) {
     // Avoid main roads logic roughly
     if (Math.abs(centerX) > 6 && Math.abs(centerZ) > 6) {
         return getHouseBlock(x, y, z, groundH, centerX, centerZ, plotHash);
     }
  }

  return BlockType.AIR;
};

const getTreeBlock = (x: number, y: number, z: number, groundH: number): BlockType => {
  // Simple sparse trees
  const hash = noise.noise2D(x, z);
  // Only check specific points for trunks to avoid density
  // This is a simplified per-block check. 
  // Real voxel engines generate the tree once. Here we infer it.
  
  // We need to find the "nearest" tree center.
  const gridS = 5;
  const localX = Math.round(x / gridS) * gridS;
  const localZ = Math.round(z / gridS) * gridS;
  
  if (noise.noise2D(localX, localZ) > 0.6) {
     // Tree exists at localX, localZ
     const dx = x - localX;
     const dz = z - localZ;
     const dist = Math.sqrt(dx*dx + dz*dz);
     
     const treeH = 5 + Math.floor(Math.abs(noise.noise2D(localX, localZ)) * 4);
     
     // Trunk
     if (dx === 0 && dz === 0 && y <= groundH + treeH) return BlockType.WOOD_LOG;
     
     // Leaves (Spherical-ish)
     if (y > groundH + 2 && y <= groundH + treeH + 2) {
        const radius = (y < groundH + treeH) ? 2.5 : 1.5;
        if (dist <= radius) return BlockType.LEAVES;
     }
  }
  return BlockType.AIR;
};

// Complex House Generator (SAO / Medieval Style)
const getHouseBlock = (x: number, y: number, z: number, groundH: number, houseX: number, houseZ: number, seed: number): BlockType => {
    // House Params derived from seed
    const width = 6 + Math.floor((seed * 100) % 3); // 6 to 8
    const depth = 6 + Math.floor((seed * 200) % 3); // 6 to 8
    const height = 5 + Math.floor((seed * 300) % 2); // 1st floor height
    const floors = seed > 0.6 ? 2 : 1;
    
    const dx = x - Math.floor(houseX);
    const dz = z - Math.floor(houseZ);
    
    // Local coords relative to house center
    const halfW = Math.floor(width / 2);
    const halfD = Math.floor(depth / 2);
    
    // 1st Floor
    if (Math.abs(dx) <= halfW && Math.abs(dz) <= halfD) {
        const localY = y - groundH;
        
        // Foundation
        if (localY === 1) return BlockType.STONE_BRICK;
        
        // Walls
        if (localY > 1 && localY <= height) {
            // Corners -> Logs
            if (Math.abs(dx) === halfW && Math.abs(dz) === halfD) return BlockType.WOOD_LOG;
            // Windows
            if (localY === 3 && (Math.abs(dx) === halfW || Math.abs(dz) === halfD)) {
               // Don't put windows on corners
               if (Math.abs(dx) !== halfW || Math.abs(dz) !== halfD) {
                   // periodic windows
                   if ((dx + dz) % 2 !== 0) return BlockType.GLASS;
               }
            }
            // Walls
            if (Math.abs(dx) === halfW || Math.abs(dz) === halfD) return BlockType.PLASTER;
            
            // Interior
            return BlockType.AIR; 
        }
        
        // Ceiling / Floor 2 base
        if (localY === height + 1) return BlockType.WOOD_PLANK;
    }
    
    // 2nd Floor (Overhang)
    if (floors === 2) {
        const overhang = 1;
        const w2 = halfW + overhang;
        const d2 = halfD + overhang;
        const h1 = height + 1;
        const h2 = height + 5; // 2nd floor height
        
        if (Math.abs(dx) <= w2 && Math.abs(dz) <= d2) {
            const localY = y - groundH;
            
            if (localY > h1 && localY <= h2) {
                // Frame supports (corners)
                 if (Math.abs(dx) === w2 && Math.abs(dz) === d2) return BlockType.WOOD_LOG;
                 
                 // Timber framing (crosses)
                 if ((Math.abs(dx) === w2 || Math.abs(dz) === d2) && localY === Math.floor((h1+h2)/2)) return BlockType.WOOD_LOG;
                 
                 // Windows
                 if (localY === h1 + 2 && (Math.abs(dx) === w2 || Math.abs(dz) === d2)) {
                      if (Math.abs(dx) < w2 - 1 || Math.abs(dz) < d2 - 1) return BlockType.GLASS;
                 }

                 // Walls
                 if (Math.abs(dx) === w2 || Math.abs(dz) === d2) return BlockType.PLASTER;
                 
                 return BlockType.AIR;
            }
        }
        
        // Roof (Pyramid style)
        const roofStart = h2 + 1;
        const localY = y - groundH;
        if (localY >= roofStart) {
            const roofH = localY - roofStart;
            const currentW = w2 + 1 - roofH;
            const currentD = d2 + 1 - roofH;
            
            if (currentW >= 0 && currentD >= 0) {
                if (Math.abs(dx) <= currentW && Math.abs(dz) <= currentD) {
                    // Outer shell is roof, inner is air or attic
                    if (Math.abs(dx) === currentW || Math.abs(dz) === currentD) {
                        return seed > 0.5 ? BlockType.ROOF_RED : BlockType.ROOF_BLUE;
                    }
                }
            }
        }
    } else {
        // 1 Floor Roof
        const roofStart = height + 2;
        const localY = y - groundH;
         if (localY >= roofStart) {
            const roofH = localY - roofStart;
            const currentW = halfW + 1 - roofH;
            const currentD = halfD + 1 - roofH;
            
            if (currentW >= 0 && currentD >= 0) {
                 if (Math.abs(dx) <= currentW && Math.abs(dz) <= currentD) {
                     if (Math.abs(dx) === currentW || Math.abs(dz) === currentD) {
                         return BlockType.WOOD_PLANK; // Simple wood roof for small huts
                     }
                 }
            }
         }
    }

    return BlockType.AIR;
};