import { Canvas, RGB, hex, mix, palette, ramp, scale } from '../Pixels';
import { SeededRng } from '../Rng';
import { TILE_SIZE, TextureRecipe, Tiling, TintKind } from '../TextureRecipe';
import { layers, ranks, voronoi } from '../noise';

const N = TILE_SIZE;
const at = (x: number, y: number) => y * N + x;

/** Plain clustered noise in a palette, with a few accent pixels. The base for simple materials. */
export class Speckle extends TextureRecipe {
  constructor(
    readonly id: string,
    private readonly shades: readonly RGB[],
    private readonly accents: readonly RGB[] = [],
    private readonly accentCount = 0,
  ) {
    super();
  }

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const v = ranks(layers(rng, [[4, 4, 1], [8, 8, 0.7]]));
    c.paint((x, y) => ramp(this.shades, v[at(x, y)]));
    for (let i = 0; i < this.accentCount && this.accents.length; i++) c.set(rng.int(N), rng.int(N), rng.pick(this.accents));
    return c.data;
  }
}

const DIRT = palette('#46301f', '#573a26', '#684730', '#7a5638', '#8b6746');

/** Brown soil as a canvas, shared with the grass side. */
const dirtCanvas = (rng: SeededRng): Canvas => {
  const c = new Canvas();
  const v = ranks(layers(rng, [[4, 4, 1], [8, 8, 0.8]]));
  c.paint((x, y) => ramp(DIRT, v[at(x, y)]));
  // Little stones and dark clumps, one or two pixels each.
  for (let i = 0; i < 5; i++) {
    const x = rng.int(N);
    const y = rng.int(N);
    const pebble = hex(i % 2 ? '#9b8c79' : '#826f5a');
    c.set(x, y, pebble);
    if (rng.chance(0.5)) c.set(x + 1, y, mix(pebble, DIRT[2], 0.4));
  }
  for (let i = 0; i < 5; i++) {
    const x = rng.int(N);
    const y = rng.int(N);
    c.set(x, y, DIRT[0]);
    c.set(x + 1, y + 1, DIRT[0]);
  }
  return c;
};

export class Dirt extends TextureRecipe {
  readonly id = 'dirt';
  generate(rng: SeededRng): Uint8Array {
    return dirtCanvas(rng).data;
  }
}

export class Stone extends TextureRecipe {
  readonly id = 'stone';
  private static readonly SHADES = palette('#5d6067', '#6a6d74', '#777a82', '#868991', '#9497a0');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const v = ranks(layers(rng, [[3, 3, 1], [6, 6, 0.8], [16, 16, 0.25]]));
    // Emboss: a pixel brighter than its lower-right neighbour is on a lit ridge, darker means in shadow.
    // That turns soft clouds into chunky, hard-edged rock faces.
    c.paint((x, y) => {
      const here = v[at(x, y)];
      const next = v[at((x + 1) % N, (y + 1) % N)];
      return ramp(Stone.SHADES, Math.min(0.99, Math.max(0, here + (here - next) * 1.1)));
    });
    // A few hairline cracks and chips so the tile reads as rock rather than grey fog.
    for (let i = 0; i < 3; i++) {
      let x = rng.int(N);
      let y = rng.int(N);
      const dir = rng.chance(0.5) ? 1 : -1;
      for (let s = 0; s < 3 + rng.int(3); s++) {
        c.set(x, y, Stone.SHADES[0]);
        if (rng.chance(0.6)) x += dir;
        else y += 1;
      }
    }
    for (let i = 0; i < 4; i++) c.set(rng.int(N), rng.int(N), Stone.SHADES[4]);
    return c.data;
  }
}

export class Sand extends TextureRecipe {
  readonly id = 'sand';
  private static readonly SHADES = palette('#cdbc82', '#d9c98f', '#e4d59d', '#eee0ae');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    // Wind ripples: noise stretched along x, then a slow diagonal sweep.
    const v = ranks(layers(rng, [[2, 8, 1], [8, 8, 0.7], [16, 16, 0.3]]));
    c.paint((x, y) => ramp(Sand.SHADES, v[at(x, y)]));
    const grain = palette('#b9a76b', '#fff3c2');
    for (let i = 0; i < 9; i++) c.set(rng.int(N), rng.int(N), grain[i % 2]);
    return c.data;
  }
}

export class Snow extends TextureRecipe {
  readonly id = 'snow';
  private static readonly SHADES = palette('#c4d5e8', '#d9e6f2', '#eaf2f9', '#f8fbfe');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const v = ranks(layers(rng, [[3, 3, 1], [8, 8, 0.6]]));
    // Squared so most of the tile is the bright end and the blue shade only pools in dips.
    c.paint((x, y) => ramp(Snow.SHADES, Math.sqrt(v[at(x, y)])));
    for (let i = 0; i < 4; i++) {
      const x = rng.int(N);
      const y = rng.int(N);
      c.set(x, y, Snow.SHADES[0]);
      c.set(x + 1, y, Snow.SHADES[1]);
    }
    for (let i = 0; i < 6; i++) c.set(rng.int(N), rng.int(N), hex('#ffffff'));
    return c.data;
  }
}

/** Packed gravel: small round pebbles with thin dark gaps. Smaller and warmer than cobblestone. */
export class Path extends TextureRecipe {
  readonly id = 'path';
  private static readonly PEBBLE = palette('#a39d90', '#b4aea1', '#c4bfb3', '#d4cfc4');
  private static readonly GAP = hex('#7e796d');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const cells = voronoi(rng, 5, 1);
    const tone = Array.from({ length: 25 }, () => rng.next());
    c.paint((x, y) => {
      const cell = cells[at(x, y)];
      if (cell.d2 - cell.d1 < 0.9) return Path.GAP;
      const light = (-(cell.dx + cell.dy) / 6) * 0.35;
      return ramp(Path.PEBBLE, Math.min(0.99, Math.max(0, tone[cell.id] * 0.75 + 0.12 + light)));
    });
    return c.data;
  }
}

export class Water extends TextureRecipe {
  readonly id = 'water';
  private static readonly SHADES = palette('#2a63c8', '#3375dc', '#4688ee', '#5f9cfa');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    // Long horizontal ripples. The water material supplies the see-through, so the tile stays opaque.
    const v = ranks(layers(rng, [[2, 6, 1], [4, 8, 0.5]]));
    c.paint((x, y) => ramp(Water.SHADES, v[at(x, y)]));
    for (let i = 0; i < 5; i++) {
      const x = rng.int(N);
      const y = rng.int(N);
      const len = 2 + rng.int(2);
      for (let k = 0; k < len; k++) c.set(x + k, y, hex(k === 0 ? '#9cc4ff' : '#c6dcff'));
    }
    return c.data;
  }
}

/**
 * Grass top. The tile is neutral grey on purpose: the renderer multiplies it by the biome's grass colour,
 * so the blade pattern survives and the hue comes from the zone.
 */
export class GrassTop extends TextureRecipe {
  readonly id = 'grass_top';
  readonly tint = 'grass' as const;
  private static readonly SHADES = [168, 190, 212, 232, 250].map((g): RGB => [g, g, g]);

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const v = ranks(layers(rng, [[4, 4, 1], [8, 8, 0.8]]));
    c.paint((x, y) => ramp(GrassTop.SHADES, v[at(x, y)]));
    // Short upright blades: a dark stem pixel with a bright tip above it.
    for (let i = 0; i < 10; i++) {
      const x = rng.int(N);
      const y = rng.int(N);
      c.set(x, y, GrassTop.SHADES[0]);
      c.set(x, y - 1, GrassTop.SHADES[4]);
    }
    return c.data;
  }

  tintMask(): Uint8Array {
    return new Uint8Array(N * N).fill(255);
  }
}

/** Dirt with a fringe of grass along the top. The fringe is neutral grey so it takes the biome tint. */
export class GrassSide extends TextureRecipe {
  readonly id = 'grass_side';
  readonly tiling: Tiling = 'x';
  readonly tint = 'grass' as const;
  private static readonly FRINGE = [150, 178, 204, 230].map((g): RGB => [g, g, g]);

  private build(rng: SeededRng): { canvas: Canvas; mask: Uint8Array } {
    const canvas = dirtCanvas(rng);
    const mask = new Uint8Array(N * N);
    const heights = layers(rng, [[4, 1, 1], [8, 1, 0.6]]);
    for (let x = 0; x < N; x++) {
      let h = 3 + Math.round(heights[at(x, 0)] * 2.4);
      if (rng.chance(0.22)) h += 2; // a few hanging blades
      for (let y = 0; y < Math.min(h, N); y++) {
        const edge = y === h - 1;
        const shade = edge ? GrassSide.FRINGE[0] : y === 0 ? GrassSide.FRINGE[3] : GrassSide.FRINGE[1 + ((x + y) % 2)];
        canvas.set(x, y, shade);
        mask[at(x, y)] = 255;
      }
    }
    return { canvas, mask };
  }

  generate(rng: SeededRng): Uint8Array {
    return this.build(rng).canvas.data;
  }

  tintMask(rng: SeededRng): Uint8Array {
    return this.build(rng).mask;
  }
}

/** Tilled soil in dark furrows and raised ridges. */
export class Farmland extends TextureRecipe {
  readonly id = 'farmland';
  private static readonly FURROW = palette('#33200f', '#412a17', '#4d331d');
  private static readonly RIDGE = palette('#5e3d25', '#6c472c', '#7b5434');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const v = ranks(layers(rng, [[4, 8, 1], [16, 16, 0.5]]));
    c.paint((x, y) => {
      const ridge = (y >> 1) % 2 === 1;
      // The lower pixel of each ridge row is in its own shadow.
      const shade = ridge && y % 2 === 1 ? v[at(x, y)] * 0.6 : v[at(x, y)];
      return ramp(ridge ? Farmland.RIDGE : Farmland.FURROW, shade);
    });
    for (let i = 0; i < 6; i++) c.set(rng.int(N), rng.int(N), hex('#8c6a45'));
    return c.data;
  }
}

export type WheatStage = 'sprout' | 'growing' | 'ripe';

/** A cross-quad crop: stalks rising from the bottom edge on a transparent tile. */
export class Wheat extends TextureRecipe {
  readonly opaque = false;
  readonly tiling: Tiling = 'none';

  constructor(readonly id: string, private readonly stage: WheatStage) {
    super();
  }

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const spec = {
      sprout: { min: 4, max: 7, stalk: palette('#4d8a26', '#6aa534', '#8fc653'), head: null },
      growing: { min: 8, max: 11, stalk: palette('#78a63a', '#9cc450', '#bfdc78'), head: null },
      ripe: { min: 11, max: 14, stalk: palette('#b08d1c', '#cfae2a', '#e4c94a'), head: palette('#c49a14', '#e9cf3a', '#f6e676') },
    }[this.stage];

    for (let x = 1; x < N; x += 2) {
      const h = spec.min + rng.int(spec.max - spec.min + 1);
      const lean = rng.chance(0.3) ? (rng.chance(0.5) ? 1 : -1) : 0;
      for (let k = 0; k < h; k++) {
        const y = N - 1 - k;
        const sx = x + (k > h / 2 ? lean : 0);
        c.set(sx, y, spec.stalk[k < 2 ? 0 : k > h - 3 ? 2 : 1]);
      }
      const topX = x + lean;
      const topY = N - h;
      if (spec.head) {
        // A grain head: a zigzag of paired kernels at the top of the stalk.
        for (let k = 0; k < 4; k++) {
          const y = topY - 1 + k;
          c.set(topX, y, spec.head[1]);
          c.set(topX + (k % 2 ? 1 : -1), y, spec.head[k % 3 === 0 ? 2 : 0]);
        }
      } else if (this.stage === 'growing') {
        c.set(topX + 1, topY + 1, spec.stalk[2]);
      } else {
        c.set(topX + (x % 4 === 1 ? 1 : -1), topY + 1, spec.stalk[2]);
      }
    }
    return c.data;
  }
}

export type LeafStyle = 'clump' | 'needle';

/**
 * Foliage with real holes (alpha 0) for cutout rendering. With tint 'grass' the palette should be neutral grey:
 * the renderer multiplies every visible pixel by the biome colour, so the leaf pattern survives and the hue
 * follows the zone.
 */
export class Leaves extends TextureRecipe {
  readonly opaque = false;
  readonly tiling: Tiling = 'both';
  readonly tint: TintKind;

  constructor(
    readonly id: string,
    private readonly shades: readonly RGB[],
    private readonly style: LeafStyle = 'clump',
    private readonly holeRate = 0.2,
    tint: TintKind = 'none',
  ) {
    super();
    this.tint = tint;
  }

  tintMask(rng: SeededRng): Uint8Array {
    const pixels = this.generate(rng);
    const mask = new Uint8Array(N * N);
    for (let p = 0; p < mask.length; p++) mask[p] = pixels[p * 4 + 3] ? 255 : 0;
    return mask;
  }

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const dark = this.shades[0];
    if (this.style === 'clump') {
      // Roughly 3 pixel leaf clusters: lit in the middle, dark at the seams, a few cells missing entirely.
      const cells = voronoi(rng, 5, 0.9);
      const tone = Array.from({ length: 25 }, () => rng.next());
      const hole = tone.map(() => rng.chance(this.holeRate));
      if (!hole.some(Boolean)) hole[rng.int(hole.length)] = true; // a leaf tile always has some sky in it
      c.paint((x, y) => {
        const cell = cells[at(x, y)];
        if (hole[cell.id]) return null;
        if (cell.d2 - cell.d1 < 0.8) return dark;
        const light = (-(cell.dx + cell.dy) / 5) * 0.3 + (cell.d1 < 1.1 ? 0.2 : 0);
        return ramp(this.shades, Math.min(0.99, Math.max(0.05, tone[cell.id] * 0.7 + 0.1 + light)));
      });
    } else {
      // Pine: dark body with drooping diagonal needle strokes in lighter greens.
      const holes = ranks(layers(rng, [[4, 4, 1], [8, 8, 0.8]]));
      c.paint((x, y) => (holes[at(x, y)] > 1 - this.holeRate ? null : dark));
      for (let i = 0; i < 26; i++) {
        const x = rng.int(N);
        const y = rng.int(N);
        const dir = rng.chance(0.5) ? 1 : -1;
        const shade = this.shades[1 + rng.int(this.shades.length - 1)];
        for (let k = 0; k < 3; k++) {
          const px = x + k * dir;
          const py = y + k;
          if (c.get(px, py)[3]) c.set(px, py, k === 2 ? scale(shade, 0.8) : shade);
        }
      }
    }
    return c.data;
  }
}
