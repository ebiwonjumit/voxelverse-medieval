import { COLORS, MILE } from '../worldConstants';
import { hexToLinear } from './color';

// Grass and leaves take the colour of whichever zone centres are near, weighted by 1 / (distance + 1).
// This is the blend World.tsx used to do per instance, ported so it can run in a worker.
// Output is linear rgb, like every other mesher colour.

const CENTERS: ReadonlyArray<{ x: number; z: number; rgb: [number, number, number] }> = (() => {
  const make = (x: number, z: number, hex: string) => {
    const rgb: [number, number, number] = [0, 0, 0];
    hexToLinear(hex, rgb);
    return { x, z, rgb };
  };
  return [
    make(0, 0, COLORS.GRASS_SAO),
    make(3 * MILE, 0, COLORS.GRASS_TEMPEST),
    make(-3 * MILE, 0, COLORS.GRASS_AMESTRIS),
    make(0, -3 * MILE, COLORS.GRASS_BOSSE),
    make(1600, -1600, COLORS.GRASS_FREMMEVILLA),
    make(-1600, 1600, COLORS.GRASS_MAGNOLIA),
  ];
})();

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
