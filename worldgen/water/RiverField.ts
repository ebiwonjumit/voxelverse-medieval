import { WATER_LEVEL } from '../../worldConstants';
import { SimplexNoise, domainWarp, fbm, hash2 } from '../noise';

// The channel floor. With the water level at WATER_LEVEL a channel is one block deep, which keeps the banks low
// and lets a player wade across.
export const RIVER_FLOOR = WATER_LEVEL - 1;

const smoothstep = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// How much of the ground a river valley takes, and where inside it a column is.
export interface RiverSample {
  carve: number;   // 0..1: 1 in the channel, easing to 0 across the banks
  edge: number;    // blocks from the channel edge, negative inside the channel; large when no river is near
}

// Rivers follow the zero contour of a slow, warped noise field. A contour of a smooth field never ends and never
// forks, so the rivers are continuous and meander without any path-finding. Two things keep them from being plain
// lines on the map: a presence field tapers a river down to nothing in places (a spring, a dry bed), and a width
// field makes it wider and narrower along its length. Smaller streams use a faster field and a patchy mask.
// The distance to the contour is |f| divided by the field's gradient, measured by finite differences on the whole
// warped field, so a river's width is in blocks however the noise is stretched.
export class RiverField {
  private readonly majorWarp: SimplexNoise;
  private readonly major: SimplexNoise;
  private readonly presence: SimplexNoise;
  private readonly width: SimplexNoise;
  private readonly minorWarp: SimplexNoise;
  private readonly minor: SimplexNoise;
  private readonly streamMask: SimplexNoise;
  private readonly scratch = { x: 0, z: 0 };

  constructor(readonly seed: number) {
    const make = (salt: number) => new SimplexNoise(hash2(salt, 0x51ee, seed) | 0);
    this.majorWarp = make(41);
    this.major = make(42);
    this.presence = make(43);
    this.width = make(44);
    this.minorWarp = make(45);
    this.minor = make(46);
    this.streamMask = make(47);
  }

  private fieldAt(n: SimplexNoise, warp: SimplexNoise, x: number, z: number, freq: number, amount: number): number {
    const w = domainWarp(warp, x, z, amount, 0.0028, this.scratch);
    return fbm(n, w.x * freq, w.z * freq, { octaves: 2 });
  }

  // Valley weight for one family of contours.
  private contour(
    n: SimplexNoise, warp: SimplexNoise, x: number, z: number, freq: number, amount: number,
    halfWidth: number, bankScale: number, ground: number,
  ): { carve: number; edge: number } {
    const depth = ground - RIVER_FLOOR;
    if (depth <= 0 || halfWidth <= 0.05) return { carve: 0, edge: 1e9 };
    const bank = Math.max(4, bankScale * depth);
    const f0 = this.fieldAt(n, warp, x, z, freq, amount);
    // The warp makes the field up to 0.03 per block steep in places (the median is 0.003), so |f| alone says
    // little about distance, except that a value this large is far from any contour.
    if (Math.abs(f0) > 0.9) return { carve: 0, edge: 1e9 };
    const e = 10;
    const gx = (this.fieldAt(n, warp, x + e, z, freq, amount) - f0) / e;
    const gz = (this.fieldAt(n, warp, x, z + e, freq, amount) - f0) / e;
    // Rounded off at the bottom: where the field is nearly flat (near a saddle) the estimate would otherwise blow up.
    const g = Math.sqrt(gx * gx + gz * gz + 0.0005 * 0.0005);
    const d = Math.abs(f0) / g;
    const edge = d - halfWidth;
    // A river that has dwindled to a trickle digs a shallower bed, so it fades out instead of stopping.
    const strength = halfWidth >= 0.5 ? 1 : halfWidth * 2;
    if (edge <= 0) return { carve: strength, edge };
    if (edge >= bank) return { carve: 0, edge };
    return { carve: strength * (1 - smoothstep(edge / bank)), edge };
  }

  // `ground` is the terrain height before the river is cut. Rivers only run through low ground and peter out
  // as it rises, so a spring and a dry gully sit where the hills are. Widening towards the coast in the west.
  sample(x: number, z: number, ground: number, out: RiverSample): RiverSample {
    out.carve = 0;
    out.edge = 1e9;
    // A wide ramp: the weight changes with the height, so a narrow one would multiply any roughness in the ground.
    const lowland = 1 - smoothstep((ground - 12) / 16);
    if (lowland <= 0) return out;

    // Major rivers: about one contour per 1,700 blocks, tapering where the presence field dips.
    const present = smoothstep((this.presence.noise2(x / 2600, z / 2600) + 0.55) / 0.6);
    const widthN = 0.5 + 0.5 * this.width.noise2(x / 900 + 7, z / 900);
    const widen = 1 + 1.8 * smoothstep((-1000 - x) / 1800);
    const hwMajor = (0.9 + 1.2 * widthN) * present * widen;
    const a = this.contour(this.major, this.majorWarp, x, z, 1 / 1400, 80, hwMajor, 4.2, ground);

    // Streams: faster contours, there only where the mask says so.
    const mask = smoothstep((this.streamMask.noise2(x / 900 - 3, z / 900 + 11) + 0.1) / 0.4);
    const hwMinor = (0.55 + 0.4 * widthN) * mask;
    const b = this.contour(this.minor, this.minorWarp, x, z, 1 / 600, 30, hwMinor, 3.2, ground);

    const pick = a.carve >= b.carve ? a : b;
    out.carve = pick.carve * lowland;
    out.edge = pick.edge;
    return out;
  }
}
