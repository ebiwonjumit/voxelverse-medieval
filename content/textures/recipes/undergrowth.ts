import { Canvas, RGB, hex, palette, scale } from '../Pixels';
import { SeededRng } from '../Rng';
import { TILE_SIZE, TextureRecipe, Tiling } from '../TextureRecipe';

const N = TILE_SIZE;

// The plants and ground cover of the wilderness. All of them are cutouts (alpha 0 or 255), drawn on a transparent
// tile: the crossing-plane plants wear it on two diagonal planes (CrossModel), the carpets on a thin plate. Pixels
// outside the tile are dropped rather than wrapped, because a frond that leaves the right edge must not come back
// on the left. Light is from the upper left, as everywhere in the catalog.

const put = (c: Canvas, x: number, y: number, col: RGB): void => {
  if (x >= 0 && x < N && y >= 0 && y < N) c.set(x, y, col);
};

const STEM = palette('#2c5e22', '#3a7a2c', '#4f9a3b', '#6cb84f');

/** Plants that stand on a transparent tile. */
abstract class Cutout extends TextureRecipe {
  readonly opaque = false;
  readonly tiling: Tiling = 'none';
}

/**
 * Two thin canes and a third slimmer one, jointed. The nodes sit on the same rows at the top and the bottom of the
 * tile, so blocks stacked up a stalk read as one long cane.
 */
export class Bamboo extends Cutout {
  readonly id = 'bamboo';
  private static readonly CANE = palette('#3f6a1b', '#5b8c27', '#7db83d', '#a6d95e');
  private static readonly NODE = hex('#30501a');
  private static readonly RING = hex('#cdeb91');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const canes = [{ x: 2, w: 3 }, { x: 7, w: 2 }, { x: 11, w: 3 }];
    for (const cane of canes) {
      const node = rng.int(8);
      for (let y = 0; y < N; y++) {
        const joint = y % 8 === node;
        const below = y % 8 === (node + 1) % 8;
        for (let k = 0; k < cane.w; k++) {
          const lit = k === 0 ? 2 : k === cane.w - 1 ? 0 : 1;
          let col = Bamboo.CANE[lit];
          // A pale gloss runs down the lit edge in short dashes.
          if (k === 0 && y % 3 === 0) col = Bamboo.CANE[3];
          if (joint) col = Bamboo.NODE;
          else if (below && k === 0) col = Bamboo.RING;
          put(c, cane.x + k, y, col);
        }
        // The joint swells a pixel on each side.
        if (joint) {
          put(c, cane.x - 1, y, Bamboo.CANE[0]);
          put(c, cane.x + cane.w, y, Bamboo.CANE[0]);
        }
      }
    }
    return c.data;
  }
}

/** A spray of long narrow leaves drooping from a dozen points, for the tuft at the top of a cane. */
export class BambooLeaves extends Cutout {
  readonly id = 'bamboo_leaves';
  private static readonly LEAF = palette('#2f6a1d', '#4a8c2a', '#6cb038', '#a0d85c');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const [base, low, mid, tip] = BambooLeaves.LEAF;
    for (let gy = 0; gy < 3; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        const ox = 3 + gx * 5 + rng.int(3) - 1;
        const oy = 2 + gy * 4 + rng.int(3) - 1;
        for (const side of [-1, 1, 0]) {
          if (side === 0 && !rng.chance(0.5)) continue;
          const len = 4 + rng.int(3);
          for (let i = 0; i < len; i++) {
            // A drooping line: sideways one pixel per step, down every second step, sagging a little more at the end.
            const x = ox + side * i;
            const y = oy + (side === 0 ? i : Math.floor(i * 0.55 + i * i * 0.04));
            put(c, x, y, i === 0 ? base : i === len - 1 ? tip : i < 2 ? low : mid);
          }
          // The widest part of the leaf, one pixel below its middle.
          put(c, ox + side * 2, oy + Math.floor(1.1 + 0.16) + 1, low);
        }
      }
    }
    return c.data;
  }
}

/**
 * A rosette of arching fronds. Each is a rib drawn along a curve that rises and bends over towards the ground, with
 * leaflets sweeping forward off both sides at every other step, shorter towards the tip. Outer fronds are drawn
 * first so the inner ones overlap them.
 */
export class Fern extends Cutout {
  readonly id = 'fern';
  private static readonly FROND = palette('#25521c', '#3a7a2a', '#55a03a', '#7dc656');
  /** Root, control point and tip of each frond, back to front. */
  private static readonly CURVES: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
    [7, 15, 2, 12, 0, 15],
    [9, 15, 13, 12, 15, 15],
    [7, 15, 4, 4, 0, 6],
    [9, 15, 12, 4, 15, 6],
    [8, 15, 7, 8, 9, 1],
  ];

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const [rib, low, mid, lit] = Fern.FROND;
    for (const [x0, y0, x1, y1, x2, y2] of Fern.CURVES) {
      const jx = rng.range(-0.6, 0.6);
      const steps = 15;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        const bx = u * u * x0 + 2 * u * t * (x1 + jx) + t * t * x2;
        const by = u * u * y0 + 2 * u * t * y1 + t * t * y2;
        // Tangent of the curve, for the leaflets.
        const tx = 2 * u * (x1 + jx - x0) + 2 * t * (x2 - x1 - jx);
        const ty = 2 * u * (y1 - y0) + 2 * t * (y2 - y1);
        const len = Math.hypot(tx, ty) || 1;
        const fx = tx / len;
        const fy = ty / len;
        put(c, Math.round(bx), Math.round(by), i < 2 ? rib : low);
        if (i < 2 || i % 2) continue;
        const reach = Math.max(1, Math.round(2.4 * Math.sqrt(1 - t)));
        for (let r = 1; r <= reach; r++) {
          // Perpendicular to the rib, swept forward by 0.6 of a pixel per pixel of reach.
          const ox = -fy * r + fx * r * 0.6;
          const oy = fx * r + fy * r * 0.6;
          const px = ox < 0 ? 0 : 1; // which side is the lit one: the left
          put(c, Math.round(bx + ox), Math.round(by + oy), px ? mid : r === reach ? lit : mid);
          put(c, Math.round(bx - ox + fx * r * 1.2), Math.round(by - oy + fy * r * 1.2), r === reach ? mid : low);
        }
      }
    }
    return c.data;
  }
}

/**
 * Tall slim stalks that sway a pixel and come back, so stacked blocks join into one reed; one stalk carries a
 * brown cattail head partway up.
 */
export class Reeds extends Cutout {
  readonly id = 'reeds';
  private static readonly BLADE = palette('#5e6a26', '#7c8a34', '#9aa848', '#bdc872');
  private static readonly HEAD = palette('#4c3018', '#6e4a28', '#8d6639');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    // Stalks one pixel wide, a few two wide, spaced so each reads on its own.
    const stalks: Array<[number, number]> = [[1, 1], [4, 2], [8, 1], [11, 2], [14, 1]];
    for (const [x0, w] of stalks) {
      const phase = rng.range(0, Math.PI * 2);
      const tone = rng.int(2);
      for (let y = 0; y < N; y++) {
        // sin is 0 and a full turn apart at both ends of the tile, so the stalk meets itself across the seam.
        const x = x0 + Math.round(Math.sin((y / N) * Math.PI * 2 + phase) * 0.9);
        for (let k = 0; k < w; k++) put(c, x + k, y, Reeds.BLADE[k === 0 ? tone + 1 : tone]);
      }
      // A long leaf leaves the stalk, rising to the right and bending over.
      const ly = 6 + rng.int(7);
      for (let i = 1; i <= 4; i++) put(c, x0 + w - 1 + i, ly - Math.floor(i * 0.75), Reeds.BLADE[i === 4 ? 3 : 2]);
    }
    // Cattail: a dark brown spike two pixels wide on one stalk, with a thin tip above it.
    const hx = 8;
    for (let y = 3; y <= 8; y++) {
      put(c, hx, y, Reeds.HEAD[y === 3 ? 2 : 1]);
      put(c, hx + 1, y, Reeds.HEAD[y % 2 ? 0 : 1]);
    }
    put(c, hx, 2, Reeds.HEAD[2]);
    put(c, hx, 1, Reeds.BLADE[2]);
    return c.data;
  }
}

export type WildflowerStyle = 'bell' | 'daisy' | 'cluster' | 'spike';

/**
 * A small wildflower on a stem. The four styles have different outlines so they read apart at a glance:
 * drooping bells, flat daisy heads, a round cluster of blossoms and an upright spike of florets.
 */
export class Wildflower extends Cutout {
  /** `petals` runs dark to light; `heart` is the centre colour of daisies and clusters. */
  constructor(
    readonly id: string,
    private readonly style: WildflowerStyle,
    private readonly petals: readonly RGB[],
    private readonly heart: RGB = petals[3],
  ) {
    super();
  }

  private stem(c: Canvas, x: number, top: number, bend = 0): number[] {
    // A stem from the ground to `top`, curving `bend` pixels to the right over its upper half.
    const xs: number[] = [];
    for (let y = N - 1; y >= top; y--) {
      const f = Math.max(0, (N - 1 - y) / (N - 1 - top) - 0.5) * 2;
      const sx = x + Math.round(f * f * bend);
      put(c, sx, y, STEM[y % 3 === 0 ? 0 : 1]);
      xs.push(sx);
    }
    return xs;
  }

  private leaves(c: Canvas, x: number, y: number, dir: number): void {
    put(c, x + dir, y, STEM[2]);
    put(c, x + dir * 2, y - 1, STEM[3]);
    put(c, x + dir * 2, y, STEM[1]);
  }

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const [dark, low, mid, lit] = this.petals;
    const xs = [3 + rng.int(2), 8 + rng.int(2), 12 + rng.int(2)];

    if (this.style === 'bell') {
      xs.forEach((x, k) => {
        const top = 2 + rng.int(3) + (k === 1 ? 0 : 2);
        const stem = this.stem(c, x, top, 2);
        const end = stem[stem.length - 1];
        // Three bells hang from the arch, each two pixels wide and two tall, lit at the top left.
        for (let b = 0; b < 3; b++) {
          const bx = end + 1 - (b === 1 ? 1 : 0);
          const by = top + b * 3;
          put(c, bx, by, mid);
          put(c, bx + 1, by, lit);
          put(c, bx, by + 1, low);
          put(c, bx + 1, by + 1, dark);
          if (b > 0) put(c, end, by, STEM[1]);
        }
        this.leaves(c, x, N - 4 - k, k % 2 ? 1 : -1);
      });
    } else if (this.style === 'daisy') {
      xs.forEach((x, k) => {
        const top = 3 + rng.int(3) + k * 2;
        this.stem(c, x, top + 2);
        const big = k !== 2;
        // A ring of petals round a yellow heart: 3x3 for the small head, a plus of long petals for the big ones.
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) put(c, x + dx, top + dy, dx + dy < 0 ? lit : mid);
        if (big) {
          put(c, x, top - 2, lit);
          put(c, x - 2, top, lit);
          put(c, x + 2, top, mid);
          put(c, x, top + 2, low);
        }
        put(c, x, top, this.heart);
        this.leaves(c, x, N - 5 - k, k % 2 ? -1 : 1);
      });
    } else if (this.style === 'cluster') {
      const stems = [5 + rng.int(2), 11 + rng.int(2)];
      stems.forEach((x, k) => {
        const top = 5 + rng.int(2) - k * 2;
        this.stem(c, x, top + 3, 0);
        // Blossoms in a loose ball: a plus of petals around a pale heart, so they sit in front of each other.
        const spots: Array<[number, number]> = [[0, 0], [-3, 2], [3, 2], [0, 4], [-2, -2], [2, -2]];
        spots.forEach(([dx, dy], i) => {
          const bx = x + dx;
          const by = top + dy;
          put(c, bx, by, this.heart);
          put(c, bx, by - 1, lit);
          put(c, bx - 1, by, mid);
          put(c, bx + 1, by, i % 2 ? low : mid);
          put(c, bx, by + 1, dark);
        });
        this.leaves(c, x, N - 4 - k * 2, k ? -1 : 1);
      });
    } else {
      xs.forEach((x, k) => {
        const top = 1 + k * 2 + rng.int(2);
        this.stem(c, x, top + 7, 0);
        // The spike: pairs of florets up the top of the stem, a bud on the end.
        for (let i = 0; i < 8; i++) {
          const y = top + i;
          const side = i % 2 ? 1 : -1;
          put(c, x, y, i < 2 ? lit : i % 3 === 0 ? mid : low);
          if (i > 0) put(c, x + side, y, i % 3 === 1 ? lit : mid);
          if (i > 3) put(c, x - side, y, dark);
        }
        this.leaves(c, x, N - 3 - k, k === 1 ? -1 : 1);
      });
    }
    return c.data;
  }
}

export type MushroomStyle = 'spotted' | 'plain';

interface Cap {
  x: number; // left edge of the cap
  w: number;
  h: number;
  stem: number; // stem height
  stemW: number;
}

/**
 * Small toadstools in a huddle: a domed cap lit on the left and dark underneath, on a pale stem. The red ones have
 * white spots and the brown ones are flatter, wider and plain.
 */
export class Mushroom extends Cutout {
  private static readonly STEM = palette('#a89a78', '#cfc2a0', '#eadfc4');

  constructor(
    readonly id: string,
    private readonly style: MushroomStyle,
    private readonly cap: readonly RGB[],
    private readonly spot: RGB,
  ) {
    super();
  }

  private draw(c: Canvas, m: Cap, jitter: number): void {
    const baseY = N - 1;
    const stemX = m.x + Math.floor((m.w - m.stemW) / 2);
    for (let i = 0; i < m.stem; i++) {
      for (let k = 0; k < m.stemW; k++) put(c, stemX + k, baseY - i, Mushroom.STEM[k === 0 ? 2 : k === m.stemW - 1 && m.stemW > 1 ? 0 : 1]);
    }
    const top = baseY - m.stem - m.h + 1;
    for (let r = 0; r < m.h; r++) {
      const fraction = Math.sqrt(1 - ((m.h - 1 - r) / m.h) ** 2);
      const half = Math.max(1, Math.round((m.w / 2) * fraction));
      const centre = m.x + (m.w - 1) / 2;
      for (let x = Math.ceil(centre - half + 0.5); x <= Math.floor(centre + half - 0.5); x++) {
        const rel = (x - centre) / (m.w / 2);
        let shade = 2;
        if (r === m.h - 1) shade = 0;
        else if (rel < -0.25 && r < m.h - 1) shade = 3;
        else if (rel > 0.45) shade = 1;
        put(c, x, top + r, this.cap[shade]);
      }
    }
    if (this.style === 'spotted') {
      put(c, m.x + 1 + jitter, top + 1, this.spot);
      if (m.w >= 6) put(c, m.x + m.w - 3, top + 2, this.spot);
      if (m.w >= 8) put(c, m.x + 3, top + 2, this.spot);
    }
  }

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const j = rng.int(2);
    const caps: Cap[] = this.style === 'spotted'
      ? [
        { x: 1 + j, w: 8, h: 4, stem: 5, stemW: 2 },
        { x: 9, w: 6, h: 3, stem: 4, stemW: 2 },
        { x: 5 + j, w: 4, h: 2, stem: 3, stemW: 1 },
      ]
      : [
        { x: 0 + j, w: 6, h: 3, stem: 5, stemW: 1 },
        { x: 6, w: 7, h: 3, stem: 3, stemW: 2 },
        { x: 11 + j, w: 4, h: 2, stem: 2, stemW: 1 },
        { x: 3, w: 4, h: 2, stem: 2, stemW: 1 },
      ];
    for (const m of caps) this.draw(c, m, j);
    return c.data;
  }
}

/**
 * Loose litter on the ground, drawn on a transparent tile and laid on a thin plate: small leaves or petals in a few
 * colours, with the ground showing between them. Shapes wrap at the edge, so neighbouring blocks continue each other.
 */
export class Litter extends TextureRecipe {
  readonly opaque = false;
  readonly tiling: Tiling = 'both';

  /** `density` is pieces per 4x4 pixel cell: placing them cell by cell keeps the cover even, so the tile repeats cleanly. */
  constructor(
    readonly id: string,
    private readonly colors: readonly RGB[],
    private readonly shapes: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
    private readonly density: number,
  ) {
    super();
  }

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    for (let cy = 0; cy < N; cy += 4) {
      for (let cx = 0; cx < N; cx += 4) {
        const pieces = Math.floor(this.density) + (rng.chance(this.density % 1) ? 1 : 0);
        for (let i = 0; i < pieces; i++) {
          const x = cx + rng.int(4);
          const y = cy + rng.int(4);
          const shape = rng.pick(this.shapes);
          const col = rng.pick(this.colors);
          shape.forEach(([dx, dy], k) => {
            // The last pixel of each piece is its shaded end.
            c.set(x + dx, y + dy, k === shape.length - 1 && shape.length > 2 ? scale(col, 0.78) : col);
          });
        }
      }
    }
    return c.data;
  }
}

/** Autumn leaves: oak and maple pieces two to three pixels long in orange, rust, brown and a little yellow. */
export const fallenLeaves = (): Litter => new Litter(
  'fallen_leaves',
  palette('#9a4a14', '#c0651d', '#d98a2b', '#a1301f', '#6e4524', '#e8b14a'),
  [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[0, 1], [1, 1], [1, 0], [2, 0]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [2, 0]],
  ],
  2.6,
);

/** Cherry petals: pink pieces one to two pixels across, scattered thinly so the ground shows through. */
export const sakuraPetals = (): Litter => new Litter(
  'sakura_petals',
  palette('#e88aa8', '#f4a7c1', '#ffc6dc', '#fff0f5'),
  [
    [[0, 0], [1, 0]],
    [[0, 0], [1, 0], [1, 1]],
    [[0, 0], [0, 1]],
    [[0, 0]],
  ],
  1.4,
);
