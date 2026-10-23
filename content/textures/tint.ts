import { RGB } from './Pixels';

/**
 * Multiply the masked pixels of a tile by a biome colour. This is what the renderer does per fragment
 * for tinted tiles; it exists here so tests and the contact sheet can show the same result.
 */
export const applyTint = (pixels: Uint8Array, mask: Uint8Array, tint: RGB): Uint8Array => {
  const out = new Uint8Array(pixels);
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    for (let k = 0; k < 3; k++) out[p * 4 + k] = Math.round((pixels[p * 4 + k] * tint[k]) / 255);
  }
  return out;
};
