// Which effects run at which time of day, as pure functions of what the sky system reports. Everything is a number from 0 to
// 1: an emitter multiplies its spawn rate by it, a halo its brightness. `elevation` is the height of the sun above the horizon
// (-1 to 1, SkyState.elevation), `daylight` the multiplier baked sky light gets (NIGHT_DAYLIGHT to 1, SkyState.daylight).

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Fireflies come out as the sun sets (from about 0.2 above the horizon) and are all out by the time it is just below it; none by day. */
export const fireflyActivity = (elevation: number): number => 1 - smoothstep(-0.02, 0.2, elevation);

/** Lamp halos show in the dark and fade out as the daylight takes over: full when baked sky light is under a quarter, none above three quarters. */
export const haloActivity = (daylight: number): number => 1 - smoothstep(0.25, 0.75, daylight);

/** Hearths and kitchens are lit more at the ends of the day and at night than at noon: the share of vents that smoke. */
export const smokeActivity = (elevation: number): number => 0.55 + 0.45 * (1 - smoothstep(0.0, 0.5, elevation));

/**
 * The colour of unlit-by-block-light particles (petals, smoke) as a multiplier, the same light an open-sky surface gets in a chunk
 * shader: sky light times daylight (and the sky's tint) over an ambient floor, scaled the way `bakedLighting()` scales it. A
 * petal is as dim at midnight as the ground it falls on.
 */
export const AMBIENT_FLOOR = 0.04;
export const LIGHT_SCALE = 0.5;
export const particleLight = (daylight: number, skyChannel: number): number =>
  Math.max(daylight * skyChannel, AMBIENT_FLOOR) * LIGHT_SCALE;

/**
 * The phase of a lamp's flicker, 0 to 2 pi, from the cell it hangs in. The chunk shader computes the same number from the same
 * constants (BlockMaterials.ts, `flameFlicker`), so the glow on a lantern and the halo drawn round it breathe together, and
 * neighbouring lamps are out of step. Built to stay accurate in a 32 bit float at world coordinates in the thousands.
 */
export const lampPhase = (x: number, y: number, z: number): number => {
  const v = x * 0.3183 + y * 0.4161 + z * 0.2713;
  return (v - Math.floor(v)) * 6.2831853;
};

/** A flame's brightness variation, -1 to 1: three sines at unrelated rates, so it never settles into a rhythm. Same as the shader's. */
export const flameFlicker = (time: number, phase: number): number =>
  0.5 * Math.sin(time * 7.1 + phase) + 0.3 * Math.sin(time * 11.7 + phase * 1.7) + 0.2 * Math.sin(time * 3.3 + phase * 2.3);

/** How much of its brightness a flame at full strength (BlockDef.flicker 1) gains or loses: 18 percent either way. */
export const FLICKER_DEPTH = 0.18;
