import { Rng } from './Rng';

// 12 edge midpoints of a cube, the 3D gradients.
const GRAD3 = new Int8Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

// 16 unit vectors for 2D. Reusing the 3D table would mix gradient lengths and favour the axes.
const GRAD2 = new Float64Array(32);
for (let i = 0; i < 16; i++) {
  GRAD2[i * 2] = Math.cos((i * Math.PI) / 8);
  GRAD2[i * 2 + 1] = Math.sin((i * Math.PI) / 8);
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const F3 = 1 / 3;
const G3 = 1 / 6;

// Scales chosen from a sweep over many seeds so the true extremes land just inside [-1, 1];
// the final clamp is only a guard for the rare sample that rounds past it.
// The 3D kernel radius is sqrt(0.5), not the common 0.6: at 0.6 a corner still contributes when the point
// crosses into the next tetrahedron, which leaves a small visible step (about 0.0035) in the field.
const SCALE_2D = 98;
const SCALE_3D = 76;

// Seeded simplex noise. Both samplers return values in [-1, 1] with a mean of about 0.
// The seed shuffles the permutation table, so each seed is a different, repeatable world.
export class SimplexNoise {
  private readonly perm = new Uint8Array(512);
  private readonly perm12 = new Uint8Array(512); // perm mod 12, the 3D gradient index
  private readonly perm16 = new Uint8Array(512); // perm mod 16, the 2D gradient index

  constructor(readonly seed: number) {
    const rng = new Rng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = rng.int(i + 1);
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.perm12[i] = this.perm[i] % 12;
      this.perm16[i] = this.perm[i] & 15;
    }
  }

  // x and z are the two ground axes, matching how the rest of the world names them.
  noise2(x: number, z: number): number {
    const perm = this.perm;
    const grad = this.perm16;

    const s = (x + z) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(z + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const z0 = z - (j - t);

    // Which of the two triangles of the skewed square the point is in.
    const i1 = x0 > z0 ? 1 : 0;
    const j1 = 1 - i1;

    const x1 = x0 - i1 + G2;
    const z1 = z0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const z2 = z0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;
    let n = 0;

    let a = 0.5 - x0 * x0 - z0 * z0;
    if (a > 0) {
      const g = grad[ii + perm[jj]] * 2;
      a *= a;
      n += a * a * (GRAD2[g] * x0 + GRAD2[g + 1] * z0);
    }
    a = 0.5 - x1 * x1 - z1 * z1;
    if (a > 0) {
      const g = grad[ii + i1 + perm[jj + j1]] * 2;
      a *= a;
      n += a * a * (GRAD2[g] * x1 + GRAD2[g + 1] * z1);
    }
    a = 0.5 - x2 * x2 - z2 * z2;
    if (a > 0) {
      const g = grad[ii + 1 + perm[jj + 1]] * 2;
      a *= a;
      n += a * a * (GRAD2[g] * x2 + GRAD2[g + 1] * z2);
    }

    n *= SCALE_2D;
    return n > 1 ? 1 : n < -1 ? -1 : n;
  }

  noise3(x: number, y: number, z: number): number {
    const perm = this.perm;
    const grad = this.perm12;

    const s = (x + y + z) * F3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);
    const t = (i + j + k) * G3;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const z0 = z - (k - t);

    // Which of the six tetrahedra of the skewed cube the point is in.
    let i1: number, j1: number, k1: number, i2: number, j2: number, k2: number;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }

    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    let n = 0;

    let a = 0.5 - x0 * x0 - y0 * y0 - z0 * z0;
    if (a > 0) {
      const g = grad[ii + perm[jj + perm[kk]]] * 3;
      a *= a;
      n += a * a * (GRAD3[g] * x0 + GRAD3[g + 1] * y0 + GRAD3[g + 2] * z0);
    }
    a = 0.5 - x1 * x1 - y1 * y1 - z1 * z1;
    if (a > 0) {
      const g = grad[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
      a *= a;
      n += a * a * (GRAD3[g] * x1 + GRAD3[g + 1] * y1 + GRAD3[g + 2] * z1);
    }
    a = 0.5 - x2 * x2 - y2 * y2 - z2 * z2;
    if (a > 0) {
      const g = grad[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
      a *= a;
      n += a * a * (GRAD3[g] * x2 + GRAD3[g + 1] * y2 + GRAD3[g + 2] * z2);
    }
    a = 0.5 - x3 * x3 - y3 * y3 - z3 * z3;
    if (a > 0) {
      const g = grad[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
      a *= a;
      n += a * a * (GRAD3[g] * x3 + GRAD3[g + 1] * y3 + GRAD3[g + 2] * z3);
    }

    n *= SCALE_3D;
    return n > 1 ? 1 : n < -1 ? -1 : n;
  }
}
