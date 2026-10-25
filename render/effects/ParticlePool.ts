// A fixed-capacity pool of particles in structure-of-arrays form. Everything is allocated once, in the constructor: spawning
// claims the next free slot, killing moves the last live particle into the hole, so the live particles are always slots
// 0..count-1 and nothing is ever created or collected while the game runs. The arrays a vertex shader reads (position, params,
// colour) are part of the pool, written by the emitters as they update each particle, so the pool's live range can be handed to
// the GPU as it is.
//
// There is one pool per blend mode; a pool carries several kinds of particle, each with its own cap, so one kind running away
// (a hundred chimneys) cannot starve another.

/** The shapes the particle shader draws. A particle's kind is also its shape. */
export const PARTICLE_FIREFLY = 0;
export const PARTICLE_EMBER = 1;
export const PARTICLE_PETAL = 2;
export const PARTICLE_SMOKE = 3;
export const PARTICLE_HALO = 4;
export const PARTICLE_KINDS = 5;

export class ParticlePool {
  /** The most particles the pool holds: the sum of the kind caps. */
  readonly capacity: number;
  /** Live particles are slots 0 to count - 1. */
  count = 0;
  /** Live particles of each kind. */
  readonly kindCount = new Int32Array(PARTICLE_KINDS);

  readonly kind: Uint8Array;
  // Simulation state. What a field means depends on the kind (a firefly's h* is its home, a petal's hy the ground it lands on).
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly hx: Float32Array;
  readonly hy: Float32Array;
  readonly hz: Float32Array;
  readonly seed: Float32Array;

  // What the shader reads, per slot: position (3), params (4: size in blocks, alpha, shape, rotation) and colour (3). They are
  // `extra` slots longer than the pool so a caller can append sprites of its own after the live ones (the lamp halos).
  readonly position: Float32Array;
  readonly params: Float32Array;
  readonly color: Float32Array;

  private readonly kindCap: Int32Array;

  /** `kindCaps` is the most of each kind that may be alive at once; the capacity is their sum. */
  constructor(kindCaps: readonly number[], readonly extra = 0) {
    this.kindCap = new Int32Array(PARTICLE_KINDS);
    let capacity = 0;
    for (let k = 0; k < PARTICLE_KINDS; k++) {
      this.kindCap[k] = kindCaps[k] ?? 0;
      capacity += this.kindCap[k];
    }
    this.capacity = capacity;
    this.kind = new Uint8Array(capacity);
    const f = () => new Float32Array(capacity);
    this.x = f(); this.y = f(); this.z = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.age = f(); this.life = f();
    this.hx = f(); this.hy = f(); this.hz = f();
    this.seed = f();
    this.position = new Float32Array((capacity + extra) * 3);
    this.params = new Float32Array((capacity + extra) * 4);
    this.color = new Float32Array((capacity + extra) * 3);
  }

  capOf(kind: number): number {
    return this.kindCap[kind];
  }

  /** Claims a slot for a new particle of `kind` with its age at 0. Returns its index, or -1 when the pool or the kind is full. */
  spawn(kind: number): number {
    if (this.count >= this.capacity || this.kindCount[kind] >= this.kindCap[kind]) return -1;
    const i = this.count++;
    this.kindCount[kind]++;
    this.kind[i] = kind;
    this.age[i] = 0;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.vz[i] = 0;
    return i;
  }

  /** Frees slot `i` by moving the last live particle into it. The caller must look at slot `i` again. */
  kill(i: number): void {
    const last = this.count - 1;
    this.kindCount[this.kind[i]]--;
    if (i !== last) {
      this.kind[i] = this.kind[last];
      this.x[i] = this.x[last]; this.y[i] = this.y[last]; this.z[i] = this.z[last];
      this.vx[i] = this.vx[last]; this.vy[i] = this.vy[last]; this.vz[i] = this.vz[last];
      this.age[i] = this.age[last]; this.life[i] = this.life[last];
      this.hx[i] = this.hx[last]; this.hy[i] = this.hy[last]; this.hz[i] = this.hz[last];
      this.seed[i] = this.seed[last];
    }
    this.count = last;
  }

  /** Kills every particle of one kind (an effect switched off). */
  purge(kind: number): void {
    for (let i = 0; i < this.count;) {
      if (this.kind[i] === kind) this.kill(i);
      else i++;
    }
  }

  clear(): void {
    this.count = 0;
    this.kindCount.fill(0);
  }
}
