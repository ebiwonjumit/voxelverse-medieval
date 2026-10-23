import { COLORS, MILE } from '../worldConstants';
import { hexToLinear } from './color';

// Grass and leaves take their colour from two sources. Near a zone it is the zone's grass colour: every zone centre
// contributes its colour weighted by 1 / (distance + 1), the blend World.tsx used to do per instance, ported so it can run
// in a worker. Away from the zones it is the natural colour of the wilderness there, which the generator supplies as a
// function (`WildTint`, see createLatticeTint and worldgen/biomes/BiomeTint.ts): bright meadow green, yellow-green birch
// wood, blue-green cedar and so on. The zone blend alone, far from every zone, averages the six colours into a dull grey, so
// the natural colour takes over with distance from the zone's edge (`naturalness`), smoothly, and leaves the zones and the
// land just outside them exactly as before. Output is linear rgb, like every other mesher colour.

// Where each zone's grass colour is strongest, and how far its edge is. Exported for the block sandbox, which meshes a
// block right at every centre to show the pure zone colour.
export const BIOME_ZONES: ReadonlyArray<{ name: string; x: number; z: number; radius: number; hex: string }> = [
  { name: 'Town of Beginnings', x: 0, z: 0, radius: 200, hex: COLORS.GRASS_SAO },
  { name: 'Tempest', x: 3 * MILE, z: 0, radius: 700, hex: COLORS.GRASS_TEMPEST },
  { name: 'Amestris', x: -3 * MILE, z: 0, radius: 700, hex: COLORS.GRASS_AMESTRIS },
  { name: 'Bosse', x: 0, z: -3 * MILE, radius: 700, hex: COLORS.GRASS_BOSSE },
  { name: 'Fremmevilla', x: 1600, z: -1600, radius: 250, hex: COLORS.GRASS_FREMMEVILLA },
  { name: 'Magnolia', x: -1600, z: 1600, radius: 250, hex: COLORS.GRASS_MAGNOLIA },
];

const CENTERS: ReadonlyArray<{ x: number; z: number; radius: number; rgb: [number, number, number] }> = BIOME_ZONES.map((zone) => {
  const rgb: [number, number, number] = [0, 0, 0];
  hexToLinear(zone.hex, rgb);
  return { x: zone.x, z: zone.z, radius: zone.radius, rgb };
});

const EPS = 1;

// Leaves are the grass blend darkened by this much.
export const LEAVES_TINT_SCALE = 0.7;

// The colour of the wilderness at a column, as linear rgb written to out[offset..offset + 2]. x and z are world coordinates.
export type WildTint = (x: number, z: number, out: { [i: number]: number }, offset: number) => void;

// What a caller that brings no generator gets: the meadow green, so a block anywhere is green and never grey.
export const DEFAULT_WILD_HEX = '#63c94b';
const DEFAULT_WILD_RGB: [number, number, number] = [0, 0, 0];
hexToLinear(DEFAULT_WILD_HEX, DEFAULT_WILD_RGB);
export const defaultWildTint: WildTint = (_x, _z, out, offset) => {
  out[offset] = DEFAULT_WILD_RGB[0];
  out[offset + 1] = DEFAULT_WILD_RGB[1];
  out[offset + 2] = DEFAULT_WILD_RGB[2];
};

// Blocks beyond the nearest zone's edge where the natural colour starts to show, and where it is all there is.
// Everything nearer than NATURAL_FROM, which covers the zones and the road in front of every gate, is the zone blend
// untouched; the smoothstep between the two has no corner at either end.
export const NATURAL_FROM = 60;
export const NATURAL_FULL = 650;

const smoothstep01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// How much of the natural colour a column takes, 0 to 1, from its distance to the edge of the nearest zone (negative inside).
export const naturalness = (edgeDistance: number): number =>
  smoothstep01((edgeDistance - NATURAL_FROM) / (NATURAL_FULL - NATURAL_FROM));

// The weight of the natural colour at a world position, for tests and tools.
export const naturalWeight = (x: number, z: number): number => {
  let edge = Infinity;
  for (const c of CENTERS) edge = Math.min(edge, Math.hypot(x - c.x, z - c.z) - c.radius);
  return naturalness(edge);
};

const wildScratch = new Float64Array(3);

// x and z are the block's world coordinates. `wild` is the natural colour field from the generator.
export const grassTint = (
  x: number, z: number, out: { [i: number]: number }, offset = 0, wild: WildTint = defaultWildTint,
): void => {
  let total = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  let edge = Infinity;
  for (const c of CENTERS) {
    const dx = x - c.x;
    const dz = z - c.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const w = 1 / (d + EPS);
    total += w;
    r += c.rgb[0] * w;
    g += c.rgb[1] * w;
    b += c.rgb[2] * w;
    if (d - c.radius < edge) edge = d - c.radius;
  }
  r /= total;
  g /= total;
  b /= total;
  const f = naturalness(edge);
  if (f > 0) {
    wild(x, z, wildScratch, 0);
    r += (wildScratch[0] - r) * f;
    g += (wildScratch[1] - g) * f;
    b += (wildScratch[2] - b) * f;
  }
  out[offset] = r;
  out[offset + 1] = g;
  out[offset + 2] = b;
};

export const leavesTint = (
  x: number, z: number, out: { [i: number]: number }, offset = 0, wild: WildTint = defaultWildTint,
): void => {
  grassTint(x, z, out, offset, wild);
  out[offset] *= LEAVES_TINT_SCALE;
  out[offset + 1] *= LEAVES_TINT_SCALE;
  out[offset + 2] *= LEAVES_TINT_SCALE;
};

// The step of the biome lattice, in blocks. A biome is asked for at every lattice point and a column mixes the four
// around it, so colours change over this many blocks at a biome border and never from one block to the next.
export const LATTICE_STEP = 8;
// Biomes remembered per worker. A chunk touches 25 lattice points and shares its edges with its neighbours.
const LATTICE_CACHE_MAX = 20000;
const KEY_BIAS = 1 << 20;

/**
 * The natural colour field over a biome function: `biomeAt` gives a biome number, `palette[biome]` its #rrggbb colour.
 * The biome is read on a lattice (`step` blocks apart, anchored at world 0 so every chunk sees the same points) and the
 * colour at a column is the bilinear mix of the four lattice colours around it. That makes it continuous, so a biome
 * border is a soft band and not a line, costs about 25 biome lookups per chunk instead of 1024, and gives the same answer
 * whichever chunk asks, in whichever thread, as long as `biomeAt` is the same function (it is a pure function of the seed).
 */
export const createLatticeTint = (
  biomeAt: (x: number, z: number) => number, palette: readonly string[], step: number = LATTICE_STEP,
): WildTint => {
  const colours = palette.map((hex) => {
    const rgb: [number, number, number] = [0, 0, 0];
    hexToLinear(hex, rgb);
    return rgb;
  });
  const cache = new Map<number, number>();
  const at = (ix: number, iz: number): number => {
    const key = (ix + KEY_BIAS) * 4194304 + (iz + KEY_BIAS);
    let biome = cache.get(key);
    if (biome === undefined) {
      if (cache.size >= LATTICE_CACHE_MAX) cache.clear();
      biome = biomeAt(ix * step, iz * step);
      cache.set(key, biome);
    }
    return biome;
  };
  const fallback = colours[0] ?? [0, 0, 0];
  const colour = (biome: number): [number, number, number] => colours[biome] ?? fallback;
  return (x, z, out, offset) => {
    const gx = (x + 0.5) / step;
    const gz = (z + 0.5) / step;
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const c00 = colour(at(ix, iz));
    const c10 = colour(at(ix + 1, iz));
    const c01 = colour(at(ix, iz + 1));
    const c11 = colour(at(ix + 1, iz + 1));
    const w00 = (1 - fx) * (1 - fz);
    const w10 = fx * (1 - fz);
    const w01 = (1 - fx) * fz;
    const w11 = fx * fz;
    out[offset] = c00[0] * w00 + c10[0] * w10 + c01[0] * w01 + c11[0] * w11;
    out[offset + 1] = c00[1] * w00 + c10[1] * w10 + c01[1] * w01 + c11[1] * w11;
    out[offset + 2] = c00[2] * w00 + c10[2] * w10 + c01[2] * w01 + c11[2] * w11;
  };
};
