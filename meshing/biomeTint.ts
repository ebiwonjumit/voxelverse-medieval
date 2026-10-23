import { COLORS, MILE } from '../worldConstants';
import { hexToLinear } from './color';

// Grass and leaves take the colour of whichever zone centres are near, weighted by 1 / (distance + 1).
// This is the blend World.tsx used to do per instance, ported so it can run in a worker.
// Output is linear rgb, like every other mesher colour.

// Where each zone's grass colour is strongest. Exported for the block sandbox, which meshes a block right at
// every centre to show the pure zone colour.
export const BIOME_ZONES: ReadonlyArray<{ name: string; x: number; z: number; hex: string }> = [
  { name: 'Town of Beginnings', x: 0, z: 0, hex: COLORS.GRASS_SAO },
  { name: 'Tempest', x: 3 * MILE, z: 0, hex: COLORS.GRASS_TEMPEST },
  { name: 'Amestris', x: -3 * MILE, z: 0, hex: COLORS.GRASS_AMESTRIS },
  { name: 'Bosse', x: 0, z: -3 * MILE, hex: COLORS.GRASS_BOSSE },
  { name: 'Fremmevilla', x: 1600, z: -1600, hex: COLORS.GRASS_FREMMEVILLA },
  { name: 'Magnolia', x: -1600, z: 1600, hex: COLORS.GRASS_MAGNOLIA },
];

const CENTERS: ReadonlyArray<{ x: number; z: number; rgb: [number, number, number] }> = BIOME_ZONES.map((zone) => {
  const rgb: [number, number, number] = [0, 0, 0];
  hexToLinear(zone.hex, rgb);
  return { x: zone.x, z: zone.z, rgb };
});

const EPS = 1;

// Leaves are the grass blend darkened by this much.
export const LEAVES_TINT_SCALE = 0.7;

// x and z are the block's world coordinates.
export const grassTint = (x: number, z: number, out: { [i: number]: number }, offset = 0): void => {
  let total = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const c of CENTERS) {
    const dx = x - c.x;
    const dz = z - c.z;
    const w = 1 / (Math.sqrt(dx * dx + dz * dz) + EPS);
    total += w;
    r += c.rgb[0] * w;
    g += c.rgb[1] * w;
    b += c.rgb[2] * w;
  }
  out[offset] = r / total;
  out[offset + 1] = g / total;
  out[offset + 2] = b / total;
};

export const leavesTint = (x: number, z: number, out: { [i: number]: number }, offset = 0): void => {
  grassTint(x, z, out, offset);
  out[offset] *= LEAVES_TINT_SCALE;
  out[offset + 1] *= LEAVES_TINT_SCALE;
  out[offset + 2] *= LEAVES_TINT_SCALE;
};
