// A small seeded generator for the effects (mulberry32). The emitters must not allocate and a screenshot must be repeatable,
// which Math.random is not; this has one number of state and returns plain numbers.
export class Rng {
  private state: number;

  constructor(seed = 1) {
    this.state = seed >>> 0 || 1;
  }

  /** The next number in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** A number in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
}
