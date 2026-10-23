// Pure colour helpers. Three.js converts #rrggbb from sRGB to linear when it builds a Color, and its
// vertex and instance colours are read as linear, so the mesher has to store linear values to look the same.

const srgbToLinear = (c: number): number =>
  c < 0.04045 ? c * 0.0773993808049536 : Math.pow(c * 0.9478672985781991 + 0.0521327014218009, 2.4);

// Writes the linear r, g, b of a #rrggbb string into out at offset.
export const hexToLinear = (hex: string, out: ArrayLike<number> & { [i: number]: number }, offset = 0): void => {
  const n = parseInt(hex.slice(1, 7), 16);
  out[offset] = srgbToLinear(((n >> 16) & 255) / 255);
  out[offset + 1] = srgbToLinear(((n >> 8) & 255) / 255);
  out[offset + 2] = srgbToLinear((n & 255) / 255);
};
