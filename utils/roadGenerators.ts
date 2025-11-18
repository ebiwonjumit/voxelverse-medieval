
import { noise } from './perlin';

export class RoadMap {
  width: number;
  height: number;
  data: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height);
  }

  isRoad(x: number, z: number): boolean {
    const mapX = Math.floor(x + this.width / 2);
    const mapZ = Math.floor(z + this.height / 2);
    
    if (mapX < 0 || mapX >= this.width || mapZ < 0 || mapZ >= this.height) return false;
    
    return this.data[mapZ * this.width + mapX] === 1;
  }

  setRoad(x: number, z: number) {
    const mapX = Math.floor(x + this.width / 2);
    const mapZ = Math.floor(z + this.height / 2);
    
    if (mapX >= 0 && mapX < this.width && mapZ >= 0 && mapZ < this.height) {
      this.data[mapZ * this.width + mapX] = 1;
    }
  }
}

export const generateOrganicRoads = (size: number, walkerCount: number, steps: number): RoadMap => {
  const map = new RoadMap(size, size);
  
  // Main Plaza
  for(let x = -8; x <= 8; x++) {
      for(let z = -8; z <= 8; z++) {
          if(x*x + z*z < 64) map.setRoad(x, z);
      }
  }

  // Walkers
  for (let i = 0; i < walkerCount; i++) {
    let x = 0;
    let z = 0;
    // Bias direction based on walker index to ensure coverage
    const angle = (i / walkerCount) * Math.PI * 2;
    let dx = Math.cos(angle);
    let dz = Math.sin(angle);

    for (let s = 0; s < steps; s++) {
      // Mark road with thickness
      map.setRoad(x, z);
      map.setRoad(x+1, z);
      map.setRoad(x-1, z);
      map.setRoad(x, z+1);
      map.setRoad(x, z-1);
      
      // Add randomness to direction
      dx += (Math.random() - 0.5) * 0.5;
      dz += (Math.random() - 0.5) * 0.5;
      
      // Normalize
      const len = Math.sqrt(dx*dx + dz*dz);
      dx /= len;
      dz /= len;

      x += dx;
      z += dz;
      
      // Branching chance
      if (Math.random() < 0.02) {
          let bx = x;
          let bz = z;
          let bdx = -dz; // 90 degree turn
          let bdz = dx;
          for(let b = 0; b < 50; b++) {
              map.setRoad(bx, bz);
              bx += bdx;
              bz += bdz;
          }
      }
    }
  }
  return map;
};

export const generateIndustrialGrid = (size: number, blockSize: number, streetWidth: number): RoadMap => {
  const map = new RoadMap(size, size);
  
  // Draw Grids
  for (let x = -size/2; x < size/2; x++) {
      for (let z = -size/2; z < size/2; z++) {
          // Main Grid
          const onGridX = Math.abs(x) % blockSize < streetWidth;
          const onGridZ = Math.abs(z) % blockSize < streetWidth;
          
          if (onGridX || onGridZ) {
              map.setRoad(x, z);
          }
          
          // Random alleyways inside blocks
          if (!onGridX && !onGridZ) {
              if (noise.hash(Math.floor(x/4), Math.floor(z/4)) > 0.95) {
                   map.setRoad(x, z);
              }
          }
      }
  }
  
  return map;
};

export const generatePlannedGrid = (size: number, blockSize: number, mainAvenueWidth: number): RoadMap => {
  const map = new RoadMap(size, size);
  const halfSize = size / 2;

  for (let x = -halfSize; x < halfSize; x++) {
    for (let z = -halfSize; z < halfSize; z++) {
      const dist = Math.sqrt(x*x + z*z);

      // Central Plaza
      if (dist < 35) {
        map.setRoad(x, z);
        continue;
      }

      // Main Avenues (N, S, E, W)
      if (Math.abs(x) < mainAvenueWidth / 2 || Math.abs(z) < mainAvenueWidth / 2) {
        map.setRoad(x, z);
        continue;
      }

      // City Grid
      // Offset coordinates to align grid centers
      const gx = Math.abs(x);
      const gz = Math.abs(z);
      
      // Create grid lines
      // 4 is the width of side streets
      if (gx % blockSize < 4 || gz % blockSize < 4) {
         map.setRoad(x, z);
      }
    }
  }
  return map;
};
