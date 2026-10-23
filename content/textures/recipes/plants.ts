import { Canvas, RGB, hex, palette } from '../Pixels';
import { SeededRng } from '../Rng';
import { TILE_SIZE, TextureRecipe, Tiling } from '../TextureRecipe';

const N = TILE_SIZE;

// Small plants and fruit, drawn on a transparent tile for the shaped blocks that stand in a cell by themselves.
// They are cutouts: alpha is 0 or 255, never between.

const STEM = palette('#2c6122', '#3a7a2c', '#4f9a3b');

/** Two or three flowers on stalks, with a pair of leaves each. Petals are lit from the upper left. */
export class Flower extends TextureRecipe {
  readonly opaque = false;
  readonly tiling: Tiling = 'none';

  constructor(readonly id: string, private readonly petals: readonly RGB[], private readonly heart: RGB) {
    super();
  }

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const stalks = [3 + rng.int(2), 8 + rng.int(2), 12 + rng.int(2)];
    stalks.forEach((x, k) => {
      const top = 4 + rng.int(3) + (k === 1 ? 0 : 3);
      for (let y = N - 1; y > top; y--) c.set(x, y, STEM[y % 3 === 0 ? 0 : 1]);
      c.set(x - 1, N - 5 - k, STEM[2]);
      c.set(x + 1, N - 7 - k, STEM[2]);
      // Bloom: a plus of petals around a heart, with the lit petal toward the upper left.
      c.set(x, top, this.heart);
      c.set(x, top - 1, this.petals[3]);
      c.set(x - 1, top, this.petals[2]);
      c.set(x + 1, top, this.petals[1]);
      c.set(x, top + 1, this.petals[0]);
      if (k !== 2) c.set(x - 1, top - 1, this.petals[2]);
    });
    return c.data;
  }
}

/** A tuft of blades, wide at the root and leaning, rising from the bottom edge. */
export class TallGrass extends TextureRecipe {
  readonly id = 'tall_grass';
  readonly opaque = false;
  readonly tiling: Tiling = 'none';
  private static readonly BLADE = palette('#3d6e1f', '#53882a', '#6ba337', '#8cc454');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    for (let x = 0; x < N; x += 2) {
      const height = 7 + rng.int(8);
      const lean = rng.int(3) - 1;
      for (let k = 0; k < height; k++) {
        const bx = x + (k > height / 2 ? lean : 0) + (k > height - 3 ? lean : 0);
        const shade = TallGrass.BLADE[Math.min(3, Math.floor((k / height) * 4))];
        c.set(bx, N - 1 - k, shade);
        if (k < height / 2) c.set(bx + 1, N - 1 - k, TallGrass.BLADE[Math.max(0, Math.floor((k / height) * 4) - 1)]);
      }
    }
    return c.data;
  }
}

/** Two jointed green stalks with a few long leaves at the top. */
export class Sugarcane extends TextureRecipe {
  readonly id = 'sugarcane';
  readonly opaque = false;
  readonly tiling: Tiling = 'none';
  private static readonly CANE = palette('#5c8a2c', '#78a83c', '#9ccc5a', '#bfe481');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    for (const x0 of [2, 9]) {
      const offset = rng.int(3);
      for (let y = 0; y < N; y++) {
        const joint = (y + offset) % 5 === 0;
        for (let k = 0; k < 4; k++) {
          c.set(x0 + k, y, joint ? Sugarcane.CANE[0] : Sugarcane.CANE[k === 0 ? 3 : k === 3 ? 0 : k === 1 ? 2 : 1]);
        }
      }
    }
    // Leaves sweeping out from the top of each stalk.
    for (let k = 0; k < 4; k++) {
      c.set(1 - k, 2 + k, Sugarcane.CANE[2]);
      c.set(6 + k, 1 + k, Sugarcane.CANE[2]);
      c.set(8 - k, 5 + k, Sugarcane.CANE[1]);
      c.set(13 + k, 4 + k, Sugarcane.CANE[1]);
    }
    return c.data;
  }
}

/** A round pad seen from above with a notch cut in it and a few veins. */
export class LilyPad extends TextureRecipe {
  readonly id = 'lily_pad';
  readonly opaque = false;
  readonly tiling: Tiling = 'none';
  private static readonly PAD = palette('#1f5a2a', '#2b7a37', '#3f9a47', '#5bb85a');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const notch = rng.int(8) * (Math.PI / 4);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const dx = x - 7.5;
        const dy = y - 7.5;
        const d = Math.hypot(dx, dy);
        if (d > 7.2) continue;
        let da = Math.abs(Math.atan2(dy, dx) - notch);
        if (da > Math.PI) da = 2 * Math.PI - da;
        if (da < 0.22 && d > 1.5) continue;
        // Lit toward the upper left, darker rim.
        const light = -(dx + dy) / 14 + 0.5 - (d > 6.2 ? 0.35 : 0);
        c.set(x, y, LilyPad.PAD[Math.min(3, Math.max(0, Math.floor(light * 4)))]);
      }
    }
    for (let k = 0; k < 6; k++) {
      const a = notch + 0.7 + k * 0.95;
      for (let r = 2; r < 6; r++) c.set(Math.round(7.5 + Math.cos(a) * r), Math.round(7.5 + Math.sin(a) * r), LilyPad.PAD[0]);
    }
    return c.data;
  }
}

/** One red apple with a stalk and a leaf. */
export class Apple extends TextureRecipe {
  readonly id = 'red_apple';
  readonly opaque = false;
  readonly tiling: Tiling = 'none';
  private static readonly SKIN = palette('#7a1414', '#a82020', '#cf3030', '#ea5a4a');

  generate(): Uint8Array {
    const c = new Canvas();
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const dx = x - 7.5;
        const dy = y - 9;
        if (Math.hypot(dx * 0.92, dy) > 5.6) continue;
        const light = 0.55 - (dx + dy) / 11;
        c.set(x, y, Apple.SKIN[Math.min(3, Math.max(0, Math.floor(light * 4)))]);
      }
    }
    c.set(5, 7, hex('#f8d2c8'));
    c.set(6, 7, hex('#f8d2c8'));
    c.set(5, 8, hex('#f8d2c8'));
    c.set(7, 3, hex('#4a3320'));
    c.set(7, 4, hex('#4a3320'));
    c.set(8, 2, hex('#4a3320'));
    c.set(9, 3, hex('#4f9a3b'));
    c.set(10, 3, hex('#3a7a2c'));
    c.set(10, 2, hex('#4f9a3b'));
    return c.data;
  }
}
