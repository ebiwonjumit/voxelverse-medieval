import { SeededRng } from './Rng';
import { TILE_SIZE } from './TextureRecipe';

// Noise that wraps at the tile edge, so anything built from it tiles for free.

const N = TILE_SIZE;
const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Value noise with `cx` by `cy` lattice cells across the tile. Few cells give big soft clusters,
 * many give fine grain. Stretching (cx != cy) gives streaks, which is how wood grain is made.
 */
export const tileNoise = (rng: SeededRng, cx: number, cy: number): Float32Array => {
  const lattice = new Float32Array(cx * cy);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next();
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    const v = ((y + 0.5) * cy) / N;
    const y0 = Math.floor(v);
    const fy = smooth(v - y0);
    for (let x = 0; x < N; x++) {
      const u = ((x + 0.5) * cx) / N;
      const x0 = Math.floor(u);
      const fx = smooth(u - x0);
      const at = (ix: number, iy: number) => lattice[(iy % cy) * cx + (ix % cx)];
      const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
      const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
      out[y * N + x] = top + (bottom - top) * fy;
    }
  }
  return out;
};

/** Weighted sum of several noise layers, `[cellsX, cellsY, weight]` each, still in about [0, 1]. */
export const layers = (rng: SeededRng, spec: ReadonlyArray<readonly [number, number, number]>): Float32Array => {
  const out = new Float32Array(N * N);
  let total = 0;
  for (const [cx, cy, w] of spec) {
    const n = tileNoise(rng, cx, cy);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * w;
    total += w;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
};

/**
 * Replace each value by its rank, 0 to 1. Value noise bunches up around the middle; ranks make every
 * palette shade cover a predictable share of the tile.
 */
export const ranks = (values: Float32Array): Float32Array => {
  const order = Array.from(values.keys()).sort((a, b) => values[a] - values[b] || a - b);
  const out = new Float32Array(values.length);
  for (let r = 0; r < order.length; r++) out[order[r]] = (r + 0.5) / order.length;
  return out;
};

export interface VoronoiCell {
  /** Index of the nearest seed point. */
  id: number;
  /** Distance to the nearest and second nearest seed, with wrap-around. */
  d1: number;
  d2: number;
  /** Offset from the nearest seed to the pixel centre, wrapped, so lighting can depend on direction. */
  dx: number;
  dy: number;
}

/** Jittered-grid Voronoi cells over the wrapped tile: `grid` seeds per axis, so about `grid`^2 cells. */
export const voronoi = (rng: SeededRng, grid: number, jitter = 0.8): VoronoiCell[] => {
  const size = N / grid;
  const seeds: Array<[number, number]> = [];
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      seeds.push([(gx + 0.5 + (rng.next() - 0.5) * jitter) * size, (gy + 0.5 + (rng.next() - 0.5) * jitter) * size]);
    }
  }
  const out: VoronoiCell[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let id = 0;
      let d1 = Infinity;
      let d2 = Infinity;
      let bx = 0;
      let by = 0;
      for (let s = 0; s < seeds.length; s++) {
        let dx = x + 0.5 - seeds[s][0];
        let dy = y + 0.5 - seeds[s][1];
        if (dx > N / 2) dx -= N;
        else if (dx < -N / 2) dx += N;
        if (dy > N / 2) dy -= N;
        else if (dy < -N / 2) dy += N;
        const d = Math.hypot(dx, dy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          id = s;
          bx = dx;
          by = dy;
        } else if (d < d2) {
          d2 = d;
        }
      }
      out.push({ id, d1, d2, dx: bx, dy: by });
    }
  }
  return out;
};

/**
 * Distance of each pixel from the nearest crest of a warped diagonal wave, 0 on the vein and up to 1
 * between veins. `a` and `b` are whole numbers of wave cycles across the tile in x and y, which is what
 * lets the pattern wrap; `warp` bends the lines with noise so they wander like mineral veins.
 */
export const waveVeins = (rng: SeededRng, a: number, b: number, warp = 0.7): Float32Array => {
  const bend = layers(rng, [[2, 2, 1], [4, 4, 0.5]]);
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const phase = ((x * a + y * b) / N) * Math.PI * 2 + (bend[y * N + x] - 0.5) * warp * Math.PI;
      out[y * N + x] = Math.abs(Math.sin(phase));
    }
  }
  return out;
};
