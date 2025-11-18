import { BlockType, WATER_LEVEL, MILE } from '../constants';
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
    // Roads override terrain surface
    if (isRoad(x, z)) return BlockType.COBBLESTONE;
    if (isTownPlaza(x, z)) return BlockType.STONE_BRICK;

    if (height <= WATER_LEVEL + 1) return BlockType.SAND;
    
    // Snow peaks
    if (height > 60) return BlockType.SNOW;
    
    // Mountain Stone
    if (height > 45) return BlockType.STONE;
    
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
  // Base Plains Height
  let baseHeight = 6;
  
  // Gentle Rolling Hills (Global)
  baseHeight += noise.octaveNoise(x * 0.005, z * 0.005, 3) * 10;

  // --- Biomes Scale Modifiers ---

  // 1. Mountains (East > 20 Miles)
  const mountainStart = 20 * MILE;
  if (x > mountainStart) { 
    const factor = (x - mountainStart) / 500; // Rise over distance
    // Huge jagged mountains
    baseHeight += noise.octaveNoise(x * 0.01, z * 0.01, 4) * 80 * Math.min(factor, 1);
    baseHeight += Math.max(0, factor * 50); // General elevation rise
  }

  // 2. Coast (West < 3 Miles)
  const coastStart = -3 * MILE;
  if (x < coastStart) {
    const factor = (coastStart - x) / 500;
    // Slope down into ocean
    baseHeight -= factor * 20;
  }

  // 3. Forest (South > 8 Miles)
  // Terrain is hillier in the deep forest
  const forestStart = 8 * MILE;
  if (z > forestStart) {
     baseHeight += noise.noise2D(x * 0.02, z * 0.02) * 5;
  }

  // Flatten Town Center (Radius 50)
  const dist = Math.sqrt(x*x + z*z);
  if (dist < 50) {
    const flatten = 1 - Math.min(dist / 50, 1);
    baseHeight = baseHeight * (1 - flatten) + 6 * flatten;
  }

  // Road Smoothing (Long distance roads)
  if (isRoad(x, z)) {
    // Lerp height towards a stable level slightly to prevent crazy bumpy roads
    // But for simplicity, we just let roads follow terrain in this voxel engine
    // except we clamp extreme spikes? 
    // For now, roads follow terrain.
  }

  return Math.floor(baseHeight);
};

// --- Town & Road Layout ---

const isTownPlaza = (x: number, z: number) => Math.sqrt(x*x + z*z) < 15;

const isRoad = (x: number, z: number) => {
  const absX = Math.abs(x);
  const absZ = Math.abs(z);
  
  // Town Grid Roads
  if ((absX < 3 && absZ < 60) || (absZ < 3 && absX < 60)) return true;
  
  // Long Distance Roads to Biomes
  
  // West Road to Coast (3 Miles)
  if (x < 0 && x > -3.2 * MILE && absZ < 3) return true;
  
  // East Road to Mountains (20 Miles)
  if (x > 0 && x < 20.5 * MILE && absZ < 3) return true;
  
  // South Road to Forest (8 Miles)
  if (z > 0 && z < 8.5 * MILE && absX < 3) return true;

  return false;
};

// --- Structure Generation ---

const getStructureBlock = (x: number, y: number, z: number, groundH: number): BlockType => {
  // 1. Forest Trees 
  // Dense Forest Biome (> 8 Miles South)
  if (z > 8 * MILE) {
     return getTreeBlock(x, y, z, groundH, 0.7); // Dense
  }
  
  // Sparse Plains Trees
  // Avoid roads and water
  if (!isRoad(x, z) && groundH > WATER_LEVEL) {
      // Very sparse in plains
      return getTreeBlock(x, y, z, groundH, 0.98); // Very sparse threshold
  }

  // 2. Town Houses
  // Only near origin
  const distFromCenter = Math.sqrt(x*x + z*z);
  if (distFromCenter < 80 && distFromCenter > 18) {
       return getTownHouse(x, y, z, groundH);
  }

  return BlockType.AIR;
};

const getTreeBlock = (x: number, y: number, z: number, groundH: number, sparsity: number): BlockType => {
  const gridS = 5;
  const localX = Math.round(x / gridS) * gridS;
  const localZ = Math.round(z / gridS) * gridS;
  
  // Noise threshold determines density. Higher noise value needed = simpler/sparser
  // We use a different frequency for tree placement
  const treeNoise = noise.noise2D(localX * 0.1, localZ * 0.1);
  
  // Normalized 0..1 roughly
  const n = (treeNoise + 1) / 2;
  
  if (n > sparsity) {
     const dx = x - localX;
     const dz = z - localZ;
     const dist = Math.sqrt(dx*dx + dz*dz);
     
     const treeH = 5 + Math.floor(Math.abs(noise.noise2D(localX, localZ)) * 3);
     
     // Trunk
     if (dx === 0 && dz === 0 && y <= groundH + treeH) return BlockType.WOOD_LOG;
     
     // Leaves
     if (y > groundH + 2 && y <= groundH + treeH + 2) {
        const radius = (y < groundH + treeH) ? 2.5 : 1.5;
        if (dist <= radius) return BlockType.LEAVES;
     }
  }
  return BlockType.AIR;
};

const getTownHouse = (x: number, y: number, z: number, groundH: number): BlockType => {
    const plotSize = 16;
    const plotX = Math.floor((x + 1000) / plotSize);
    const plotZ = Math.floor((z + 1000) / plotSize);
    const plotHash = noise.noise2D(plotX * 12.3, plotZ * 45.6);
    
    const centerX = plotX * plotSize - 1000 + plotSize/2;
    const centerZ = plotZ * plotSize - 1000 + plotSize/2;
    
    // Avoid building on roads
    if (isRoad(centerX, centerZ)) return BlockType.AIR;

    if (plotHash > 0.3) {
        return getHouseArchitecture(x, y, z, groundH, centerX, centerZ, plotHash);
    }
    return BlockType.AIR;
}

const getHouseArchitecture = (x: number, y: number, z: number, groundH: number, houseX: number, houseZ: number, seed: number): BlockType => {
    const width = 6 + Math.floor((seed * 100) % 3); 
    const depth = 6 + Math.floor((seed * 200) % 3);
    const height = 5;
    const floors = seed > 0.6 ? 2 : 1;
    
    const dx = x - Math.floor(houseX);
    const dz = z - Math.floor(houseZ);
    const halfW = Math.floor(width / 2);
    const halfD = Math.floor(depth / 2);
    
    const localY = y - groundH;
    
    // 1st Floor
    if (Math.abs(dx) <= halfW && Math.abs(dz) <= halfD) {
        if (localY === 1) return BlockType.STONE_BRICK;
        if (localY > 1 && localY <= height) {
            if (Math.abs(dx) === halfW && Math.abs(dz) === halfD) return BlockType.WOOD_LOG;
            if (localY === 3 && (Math.abs(dx) === halfW || Math.abs(dz) === halfD)) {
               if (Math.abs(dx) !== halfW || Math.abs(dz) !== halfD) {
                   if ((dx + dz) % 2 !== 0) return BlockType.GLASS;
               }
            }
            if (Math.abs(dx) === halfW || Math.abs(dz) === halfD) return BlockType.PLASTER;
            return BlockType.AIR; 
        }
        if (localY === height + 1) return BlockType.WOOD_PLANK;
    }
    
    // 2nd Floor
    if (floors === 2) {
        const overhang = 1;
        const w2 = halfW + overhang;
        const d2 = halfD + overhang;
        const h1 = height + 1;
        const h2 = height + 5;
        
        if (Math.abs(dx) <= w2 && Math.abs(dz) <= d2) {
            if (localY > h1 && localY <= h2) {
                 if (Math.abs(dx) === w2 && Math.abs(dz) === d2) return BlockType.WOOD_LOG;
                 if ((Math.abs(dx) === w2 || Math.abs(dz) === d2) && localY === Math.floor((h1+h2)/2)) return BlockType.WOOD_LOG;
                 if (localY === h1 + 2 && (Math.abs(dx) === w2 || Math.abs(dz) === d2)) {
                      if (Math.abs(dx) < w2 - 1 || Math.abs(dz) < d2 - 1) return BlockType.GLASS;
                 }
                 if (Math.abs(dx) === w2 || Math.abs(dz) === d2) return BlockType.PLASTER;
                 return BlockType.AIR;
            }
        }
        
        // Roof
        const roofStart = h2 + 1;
        if (localY >= roofStart) {
            const roofH = localY - roofStart;
            const currentW = w2 + 1 - roofH;
            const currentD = d2 + 1 - roofH;
            if (currentW >= 0 && currentD >= 0) {
                if (Math.abs(dx) <= currentW && Math.abs(dz) <= currentD) {
                    if (Math.abs(dx) === currentW || Math.abs(dz) === currentD) {
                        return seed > 0.5 ? BlockType.ROOF_RED : BlockType.ROOF_BLUE;
                    }
                }
            }
        }
    } else {
        // 1 Floor Roof
        const roofStart = height + 2;
         if (localY >= roofStart) {
            const roofH = localY - roofStart;
            const currentW = halfW + 1 - roofH;
            const currentD = halfD + 1 - roofH;
            if (currentW >= 0 && currentD >= 0) {
                 if (Math.abs(dx) <= currentW && Math.abs(dz) <= currentD) {
                     if (Math.abs(dx) === currentW || Math.abs(dz) === currentD) return BlockType.WOOD_PLANK;
                 }
            }
         }
    }
    return BlockType.AIR;
};