import { TERRAIN_MAX_Y, TERRAIN_MIN_Y } from '../../engine/coords';
import { MILE } from '../../worldConstants';
import { SimplexNoise, domainWarp, fbm, hash2, ridged } from '../noise';

// The wilderness height W(x, z) as a float, before any zone is blended in. Same broad geography as the old
// world: gentle hills around the zones, rougher ground south of z = 4000, mountains east of x = 10000 and a
// coast with deep water far to the west. Everything is built from seeded noise and kept inside the world's
// terrain bounds by a smooth limiter rather than a clamp, so there are no flat plateaus at the limits.

const BASE = 11;

// Exported because the biome map follows the same geography: dense woods south of FOREST_START, mountains east of
// MOUNTAIN_START and the sea west of SHORE_X.
export const FOREST_START = 8 * MILE;       // z = 4000
const FOREST_RAMP = 800;
export const MOUNTAIN_START = 20 * MILE;    // x = 10000
const MOUNTAIN_RAMP = 1500;
// Past Amestris (which ends at x = -2200) so the district never meets the sea.
export const SHORE_X = -3000;
const SHORE_RAMP = 700;
const OCEAN_DROP = 75;

// The limiter leaves heights between these two alone and eases off towards the bounds.
const KNEE_HIGH = 64;
const KNEE_LOW = -16;

const smoothstep = (t: number): number => {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
};

// Identity inside the knees. Beyond them the height approaches the terrain bound along a tanh, so it is
// smooth, strictly monotonic and never reaches the bound for any realistic input.
export const softLimit = (h: number): number => {
  if (h > KNEE_HIGH) {
    const room = TERRAIN_MAX_Y - KNEE_HIGH;
    return KNEE_HIGH + room * Math.tanh((h - KNEE_HIGH) / room);
  }
  if (h < KNEE_LOW) {
    const room = KNEE_LOW - TERRAIN_MIN_Y;
    return KNEE_LOW - room * Math.tanh((KNEE_LOW - h) / room);
  }
  return h;
};

export class TerrainField {
  private readonly warp: SimplexNoise;
  private readonly macro: SimplexNoise;
  private readonly hills: SimplexNoise;
  private readonly rolling: SimplexNoise;
  private readonly detail: SimplexNoise;
  private readonly forest: SimplexNoise;
  private readonly peaks: SimplexNoise;
  private readonly peakDetail: SimplexNoise;
  private readonly seabed: SimplexNoise;
  private readonly scratch = { x: 0, z: 0 };

  constructor(readonly seed: number) {
    const make = (salt: number) => new SimplexNoise(hash2(salt, 0x7e11, seed) | 0);
    this.warp = make(1);
    this.macro = make(2);
    this.hills = make(3);
    this.rolling = make(4);
    this.detail = make(5);
    this.forest = make(6);
    this.peaks = make(7);
    this.peakDetail = make(8);
    this.seabed = make(9);
  }

  // Height before the limiter. Exposed for tests and tools that want to see what the limiter did.
  rawHeight(x: number, z: number): number {
    // Wander the large features so the coast and the mountain front are not straight lines.
    const w = domainWarp(this.warp, x, z, 260, 0.0009, this.scratch);

    // How far into the sea this column is, 0 on land and 1 in deep water.
    const sea = smoothstep((SHORE_X - w.x) / SHORE_RAMP);
    // Land noise dies away towards the open sea so the seabed is smooth.
    const landScale = 1 - 0.7 * sea;

    let h = BASE;
    h += 5 * fbm(this.macro, x * 0.0008, z * 0.0008, { octaves: 3 }) * landScale;
    h += 7 * fbm(this.hills, x * 0.0035, z * 0.0035, { octaves: 4 }) * landScale;
    h += 3 * fbm(this.rolling, x * 0.012, z * 0.012, { octaves: 2 }) * landScale;
    h += 1.2 * this.detail.noise2(x * 0.05, z * 0.05) * landScale;

    if (z > FOREST_START - FOREST_RAMP) {
      const rough = smoothstep((z - (FOREST_START - FOREST_RAMP)) / FOREST_RAMP);
      h += rough * (4 * this.forest.noise2(x * 0.02, z * 0.02) + 4 * fbm(this.forest, x * 0.025 + 91, z * 0.025, { octaves: 2 }));
    }

    if (w.x > MOUNTAIN_START) {
      const mask = smoothstep((w.x - MOUNTAIN_START) / MOUNTAIN_RAMP);
      const crest = ridged(this.peaks, x * 0.0007, z * 0.0007, { octaves: 3 });
      h += mask * (35 + 70 * crest + 8 * fbm(this.peakDetail, x * 0.01, z * 0.01, { octaves: 3 }));
    }

    if (sea > 0) {
      h -= OCEAN_DROP * sea;
      h += 6 * sea * fbm(this.seabed, x * 0.004, z * 0.004, { octaves: 2 });
    }
    return h;
  }

  // Wilderness height in blocks, as a float in [TERRAIN_MIN_Y, TERRAIN_MAX_Y].
  height(x: number, z: number): number {
    const h = softLimit(this.rawHeight(x, z));
    return h < TERRAIN_MIN_Y ? TERRAIN_MIN_Y : h > TERRAIN_MAX_Y ? TERRAIN_MAX_Y : h;
  }
}
