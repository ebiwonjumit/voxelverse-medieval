// Small seeded random source (mulberry32). One 32-bit state, no allocation per call, and the same
// sequence on every platform because it only uses integer maths until the final divide.
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  // Uniform in [0, 1).
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Integer in [0, n).
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  // Float in [min, max).
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  // An independent generator for a sub-task, so adding draws in one place never shifts another.
  fork(salt: number): Rng {
    return new Rng(hash2(this.state, salt, 0x51ed270b));
  }
}

// Murmur3 building blocks. Integer only, so there is none of the float rounding the old sine hash
// depended on, and the result is the same in a worker and on the main thread.
const rotl = (x: number, r: number) => (x << r) | (x >>> (32 - r));

const mixWord = (h: number, k: number): number => {
  k = Math.imul(k, 0xcc9e2d51);
  k = rotl(k, 15);
  k = Math.imul(k, 0x1b873593);
  h ^= k;
  h = rotl(h, 13);
  return (Math.imul(h, 5) + 0xe6546b64) | 0;
};

const finish = (h: number, length: number): number => {
  h ^= length;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};

// Hash of integer cell coordinates and a seed, as an unsigned 32-bit integer. Coordinates are truncated
// to int32, so pass whole numbers (negative ones are fine and do not mirror).
export const hash2 = (x: number, z: number, seed: number): number =>
  finish(mixWord(mixWord(seed | 0, x | 0), z | 0), 8);

export const hash3 = (x: number, y: number, z: number, seed: number): number =>
  finish(mixWord(mixWord(mixWord(seed | 0, x | 0), y | 0), z | 0), 12);

const INV_2_32 = 1 / 4294967296;

// The same hashes as a float in [0, 1).
export const hash2f = (x: number, z: number, seed: number): number => hash2(x, z, seed) * INV_2_32;
export const hash3f = (x: number, y: number, z: number, seed: number): number => hash3(x, y, z, seed) * INV_2_32;
