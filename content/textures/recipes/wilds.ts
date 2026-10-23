import { Canvas, RGB, hex, mix, palette, ramp } from '../Pixels';
import { SeededRng } from '../Rng';
import { TILE_SIZE, TextureRecipe, Tiling } from '../TextureRecipe';
import { layers, ranks, voronoi } from '../noise';
import { dirtCanvas, Leaves } from './natural';

const N = TILE_SIZE;
const at = (x: number, y: number) => y * N + x;

// Foliage and ground for the wilderness blocks (content/blocksNature.ts): the trees of the cedar and sakura groves,
// snow-laden pine, and the soils and stones that border them.

/**
 * Cedar foliage: shingled rows of scale-like sprays in a blue-leaning green, a few gaps showing sky. The chevron
 * rows are four pixels apart and offset on alternate rows, so the tile repeats without a seam.
 */
export class CedarLeaves extends TextureRecipe {
  readonly id = 'cedar_leaves';
  readonly opaque = false;
  readonly tiling: Tiling = 'both';
  private static readonly SHADES = palette('#0f3a2c', '#1a5239', '#2c6e49', '#4a8c5e');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const [dark, low, mid, lit] = CedarLeaves.SHADES;
    c.fill(dark);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const x = col * 4 + (row % 2) * 2;
        const y = row * 4;
        const tone = rng.next();
        // A "v" of three pixels with the lit arm on the left, and a darker stroke under it.
        c.set(x, y + 1, tone > 0.5 ? mid : low);
        c.set(x + 1, y + 2, tone > 0.5 ? low : dark);
        c.set(x + 2, y + 1, low);
        c.set(x - 1, y, lit);
        c.set(x, y, tone > 0.3 ? mid : lit);
        c.set(x + 2, y, low);
        c.set(x + 1, y + 1, mid);
        c.set(x + 1, y + 3, dark);
      }
    }
    const holes = ranks(layers(rng, [[4, 4, 1], [8, 8, 0.8]]));
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (holes[at(x, y)] > 0.86) c.clear(x, y);
    return c.data;
  }
}

/** Cherry blossom canopy: pink leaf clusters with paler flowers scattered over them. */
export class Blossom extends Leaves {
  constructor() {
    super('sakura_leaves', palette('#b9507a', '#d9708f', '#ea8fae', '#f8b6cd'), 'clump', 0.15);
  }

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    c.data.set(super.generate(rng));
    const white = hex('#fff0f5');
    const rose = hex('#ffd2e1');
    // Single blossoms and a few pairs, only where there is a leaf to sit on.
    for (let i = 0; i < 9; i++) {
      const x = rng.int(N);
      const y = rng.int(N);
      if (!c.get(x, y)[3]) continue;
      c.set(x, y, white);
      if (rng.chance(0.4) && c.get(x + 1, y)[3]) c.set(x + 1, y, rose);
    }
    return c.data;
  }
}

/** Pine boughs under a load of snow: dark needles showing through, white and pale blue where the snow lies. */
export class SnowyPine extends Leaves {
  private static readonly SNOW = palette('#b6ccd4', '#d8e8ec', '#f2f9fa');

  constructor() {
    super('snowy_pine_leaves', palette('#0f3d28', '#1b5a39', '#2b7449'), 'needle', 0.14);
  }

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    c.data.set(super.generate(rng));
    const lay = ranks(layers(rng, [[3, 3, 1], [8, 8, 0.7]]));
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const v = lay[at(x, y)];
        if (v < 0.42 || !c.get(x, y)[3]) continue;
        // Snow rests on top of a bough, so a pixel with open air or bare needles above it is the bright one.
        const crest = !c.get(x, y - 1)[3] || lay[at(x, (y + N - 1) % N)] < 0.42;
        c.set(x, y, SnowyPine.SNOW[crest ? 2 : v > 0.75 ? 1 : 0]);
      }
    }
    return c.data;
  }
}

/** Mixed river and scree gravel: pebbles of several greys and browns, cooler and darker than the path. */
export class Gravel extends TextureRecipe {
  readonly id = 'gravel';
  private static readonly STONES = palette('#5b5f63', '#72767a', '#8a8d8f', '#a3a6a7', '#bfc0bf');
  private static readonly WARM = palette('#7a6f66', '#968a7f');
  private static readonly GAP = hex('#3f4245');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const cells = voronoi(rng, 5, 1);
    const tone = Array.from({ length: 25 }, () => rng.next());
    const warm = tone.map(() => rng.chance(0.2));
    c.paint((x, y) => {
      const cell = cells[at(x, y)];
      if (cell.d2 - cell.d1 < 0.85) return Gravel.GAP;
      const light = (-(cell.dx + cell.dy) / 4) * 0.4;
      const t = Math.min(0.99, Math.max(0, tone[cell.id] * 0.6 + 0.2 + light));
      return warm[cell.id] ? Gravel.WARM[t > 0.5 ? 1 : 0] : ramp(Gravel.STONES, t);
    });
    return c.data;
  }
}

const MOSS = palette('#35601f', '#477b2c', '#5b9638', '#76b448', '#96d062');

/** Moss in rounded cushions, each lit on its upper left and dark where two meet. */
const mossCanvas = (rng: SeededRng, lump: number, shades: readonly RGB[] = MOSS): Canvas => {
  const c = new Canvas();
  const cells = voronoi(rng, lump, 0.9);
  const size = N / lump;
  const tone = Array.from({ length: lump * lump }, () => rng.next());
  c.paint((x, y) => {
    const cell = cells[at(x, y)];
    // Dome: brightest at the centre, shifted toward the light, falling off to the rim.
    const dome = 1 - cell.d1 / (size * 0.75) - (cell.dx + cell.dy) / (size * 5);
    return ramp(shades, Math.min(0.99, Math.max(0, dome * 0.7 + tone[cell.id] * 0.25 + 0.08)));
  });
  return c;
};

export class Moss extends TextureRecipe {
  readonly id = 'moss';

  generate(rng: SeededRng): Uint8Array {
    const c = mossCanvas(rng, 5);
    for (let i = 0; i < 7; i++) c.set(rng.int(N), rng.int(N), MOSS[0]);
    for (let i = 0; i < 6; i++) c.set(rng.int(N), rng.int(N), hex('#c4e78a'));
    return c.data;
  }
}

/** Pink-grey granite with black and white crystals pressed through it. */
export class Granite extends TextureRecipe {
  readonly id = 'granite';
  private static readonly ROCK = palette('#8c7d78', '#a0918a', '#b3a49c', '#c6b8af');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const v = ranks(layers(rng, [[4, 4, 1], [8, 8, 0.8], [16, 16, 0.5]]));
    c.paint((x, y) => ramp(Granite.ROCK, v[at(x, y)]));
    // Dark mica flecks, mostly in pairs, quartz glints and a few salmon feldspar crystals.
    const mica = hex('#4a4040');
    const quartz = hex('#ebe0d8');
    const salmon = hex('#c98f80');
    for (let i = 0; i < 12; i++) {
      const x = rng.int(N);
      const y = rng.int(N);
      c.set(x, y, mica);
      if (rng.chance(0.5)) c.set(x + 1, y, mica);
    }
    for (let i = 0; i < 9; i++) c.set(rng.int(N), rng.int(N), quartz);
    for (let i = 0; i < 6; i++) {
      const x = rng.int(N);
      const y = rng.int(N);
      c.set(x, y, salmon);
      c.set(x + 1, y, salmon);
    }
    return c.data;
  }
}

/** Wet mud: dark, smooth, with a few shiny pools and the odd pit. */
export class Mud extends TextureRecipe {
  readonly id = 'mud';
  private static readonly SHADES = palette('#3a2b1f', '#47362a', '#5a4636', '#6c5644');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const v = ranks(layers(rng, [[3, 3, 1], [6, 6, 0.45]]));
    c.paint((x, y) => ramp(Mud.SHADES, v[at(x, y)]));
    const shine = hex('#85705a');
    const gloss = hex('#cdb99c');
    for (let i = 0; i < 4; i++) {
      const x = rng.int(N);
      const y = rng.int(N);
      c.set(x, y, shine);
      c.set(x + 1, y, shine);
      c.set(x, y + 1, shine);
      if (rng.chance(0.6)) c.set(x, y, gloss);
    }
    for (let i = 0; i < 6; i++) c.set(rng.int(N), rng.int(N), Mud.SHADES[0]);
    return c.data;
  }
}

const PODZOL = palette('#47301e', '#5b3a22', '#6b4a2f', '#7d5a3a');

const podzolCanvas = (rng: SeededRng): Canvas => {
  const c = new Canvas();
  const v = ranks(layers(rng, [[4, 4, 1], [8, 8, 0.8]]));
  const ash = ranks(layers(rng, [[3, 3, 1], [6, 6, 0.6]]));
  const ashShade = palette('#7c756a', '#9a9486');
  c.paint((x, y) => {
    // Grey ash pools where the second noise is highest.
    if (ash[at(x, y)] > 0.84) return ashShade[v[at(x, y)] > 0.5 ? 1 : 0];
    return ramp(PODZOL, v[at(x, y)]);
  });
  // Pine needles lying about: short orange strokes.
  const needle = hex('#b8672a');
  for (let i = 0; i < 9; i++) {
    const x = rng.int(N);
    const y = rng.int(N);
    const dir = rng.chance(0.5) ? 1 : -1;
    c.set(x, y, needle);
    c.set(x + dir, y + 1, mix(needle, PODZOL[1], 0.35));
  }
  return c;
};

export class Podzol extends TextureRecipe {
  readonly id = 'podzol';

  generate(rng: SeededRng): Uint8Array {
    return podzolCanvas(rng).data;
  }
}

/** Three shades of dark needle litter with a little grey ash, for the cap of a podzol side. */
const podzolCap = (rng: SeededRng): Canvas => {
  const c = new Canvas();
  const shades = [PODZOL[0], PODZOL[1], hex('#7c756a')];
  const v = ranks(layers(rng, [[4, 4, 1], [8, 8, 0.8]]));
  c.paint((x, y) => shades[v[at(x, y)] > 0.88 ? 2 : v[at(x, y)] > 0.4 ? 1 : 0]);
  return c;
};

export type SoilTop = 'moss' | 'podzol';

/**
 * The side of a block with a living top: dirt with a ragged cap of moss or podzol along the upper edge, the way
 * the grass side has its fringe, so a slope of mossy ground does not read as a wall of moss.
 */
export class SoilSide extends TextureRecipe {
  readonly tiling: Tiling = 'x';

  constructor(readonly id: string, private readonly top: SoilTop) {
    super();
  }

  generate(rng: SeededRng): Uint8Array {
    const c = dirtCanvas(rng);
    // The cap uses only three shades of its own: the dirt under it already has up to nine colours.
    const cap = this.top === 'moss' ? mossCanvas(rng, 4, MOSS.slice(1, 4)) : podzolCap(rng);
    const depth = layers(rng, [[4, 1, 1], [8, 1, 0.6]]);
    for (let x = 0; x < N; x++) {
      let h = 3 + Math.round(depth[at(x, 0)] * 2.2);
      if (rng.chance(0.2)) h += 2;
      for (let y = 0; y < Math.min(h, N); y++) {
        const px = cap.get(x, y);
        c.set(x, y, [px[0], px[1], px[2]]);
      }
    }
    return c.data;
  }
}
