// The wind, as plain numbers. The chunk shader's foliage sway (render/BlockMaterials.ts) and the particles (petals, smoke) read
// the same wind, so a petal drifts the way the grass leans. No three here: ChunkRenderer turns the heading into the shader's
// `uWind`, the emitters read it directly.

/** The wind blows toward this heading (radians, 0 is +x, positive turns toward +z) before it swings. */
export const WIND_HEADING = 0.64;

/** The heading at a time in seconds: it swings slowly (a period of about two minutes) with a small, faster drift on top. */
export const windHeading = (time: number): number =>
  WIND_HEADING + 0.4 * Math.sin(time * 0.05) + 0.15 * Math.sin(time * 0.13 + 1);

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * How hard the wind is blowing at a place and time, 0 in a lull to 1 at the crest of a gust. It is the `gust` of the sway
 * shader (`windPush` in BlockMaterials.ts), written out again so the CPU agrees with the GPU: a swell travelling downwind,
 * bent by a slower one across it. `wx` and `wz` are the unit wind vector.
 */
export const gustAt = (x: number, z: number, time: number, wx: number, wz: number): number => {
  const along = x * wx + z * wz;
  const across = -x * wz + z * wx;
  const front = Math.sin(along * 0.09 - time * 0.85 + Math.sin(across * 0.05 + time * 0.17) * 1.7);
  return smoothstep(-0.6, 0.9, front);
};
