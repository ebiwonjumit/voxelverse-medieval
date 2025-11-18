// A simple pseudo-random noise generator to avoid external huge deps for this demo
// Based on a simple hashing of coordinates

class PseudoNoise {
  private seed: number;

  constructor(seed: number = Math.random()) {
    this.seed = seed;
  }

  // Simple hash function
  private hash(x: number, z: number): number {
    let h = Math.sin(x * 12.9898 + z * 78.233 + this.seed) * 43758.5453;
    return h - Math.floor(h);
  }

  // 2D Noise
  noise2D(x: number, z: number): number {
    const floorX = Math.floor(x);
    const floorZ = Math.floor(z);

    const s = this.hash(floorX, floorZ);
    const t = this.hash(floorX + 1, floorZ);
    const u = this.hash(floorX, floorZ + 1);
    const v = this.hash(floorX + 1, floorZ + 1);

    const fractX = x - floorX;
    const fractZ = z - floorZ;

    // Cubic interpolation (smoother than linear)
    const x1 = s + (t - s) * (3 * fractX * fractX - 2 * fractX * fractX * fractX);
    const x2 = u + (v - u) * (3 * fractX * fractX - 2 * fractX * fractX * fractX);
    
    return x1 + (x2 - x1) * (3 * fractZ * fractZ - 2 * fractZ * fractZ * fractZ);
  }
  
  // Octave Noise for more detail
  octaveNoise(x: number, z: number, octaves: number, persistence: number = 0.5): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;  // Used for normalizing result to 0.0 - 1.0
    for(let i = 0; i < octaves; i++) {
        total += this.noise2D(x * frequency, z * frequency) * amplitude;
        
        maxValue += amplitude;
        
        amplitude *= persistence;
        frequency *= 2;
    }
    
    return total / maxValue;
  }
}

export const noise = new PseudoNoise(12345); // Fixed seed for consistent world
