import { Canvas, RGB, hex, palette, ramp } from '../Pixels';
import { SeededRng } from '../Rng';
import { TILE_SIZE, TextureRecipe, Tiling } from '../TextureRecipe';
import { layers, ranks } from '../noise';

const N = TILE_SIZE;
const at = (x: number, y: number) => y * N + x;

/**
 * Boards four pixels wide with grain along their length. Horizontal boards run across the tile;
 * `vertical` swaps the axes. End joints and nails are placed per board.
 */
export class Plank extends TextureRecipe {
  constructor(
    readonly id: string,
    private readonly shades: readonly RGB[],
    private readonly seam: RGB,
    private readonly vertical = false,
    private readonly knots = 0,
    readonly tiling: Tiling = 'both',
  ) {
    super();
  }

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    // Grain varies quickly across the board and slowly along it.
    const grain = ranks(layers(rng, [[2, 16, 1], [4, 16, 0.5]]));
    const board = Array.from({ length: 4 }, () => rng.next());
    const joint = Array.from({ length: 4 }, () => rng.int(N));
    const set = (u: number, v: number, col: RGB) => (this.vertical ? c.set(v, u, col) : c.set(u, v, col));
    const grainAt = (u: number, v: number) => (this.vertical ? grain[at(v, u)] : grain[at(u, v)]);
    for (let v = 0; v < N; v++) {
      const b = v >> 2;
      const across = v & 3;
      for (let u = 0; u < N; u++) {
        if (across === 3) {
          set(u, v, this.seam);
          continue;
        }
        let t = board[b] * 0.45 + grainAt(u, v) * 0.55;
        if (across === 0) t += 0.2; // the top edge of each board catches light
        set(u, v, ramp(this.shades, Math.min(0.99, Math.max(0, t))));
      }
      // End joint of this board and its two nails.
      set(joint[b], v, this.seam);
      if (across === 1) {
        set(joint[b] + 2, v, this.shades[0]);
        set(joint[b] + N - 2, v, this.shades[0]);
      }
    }
    for (let i = 0; i < this.knots; i++) {
      const u = 3 + rng.int(N - 6);
      const v = (rng.int(4) << 2) + 1;
      set(u, v, this.shades[0]);
      set(u + 1, v, this.shades[0]);
      set(u, v + 1, this.shades[1]);
    }
    return c.data;
  }
}

export type LogFace = 'side' | 'top';

/** Oak log: dark furrowed bark on the sides, growth rings on the end. */
export class Log extends TextureRecipe {
  readonly id: string;
  readonly tiling: Tiling;

  protected readonly bark: readonly RGB[] = palette('#241910', '#33241a', '#473322', '#624930');
  protected readonly wood: readonly RGB[] = palette('#8a6a3e', '#9d7b49', '#b08d58', '#c19c66');

  constructor(protected readonly face: LogFace, id = face === 'side' ? 'log_side' : 'log_top') {
    super();
    this.id = id;
    this.tiling = face === 'side' ? 'both' : 'none';
  }

  protected barkSide(rng: SeededRng, c: Canvas): void {
    // Furrows run up the trunk: noise stretched vertically.
    const v = ranks(layers(rng, [[8, 2, 1], [16, 4, 0.6]]));
    c.paint((x, y) => ramp(this.bark, v[at(x, y)]));
    for (let i = 0; i < 4; i++) {
      const x = rng.int(N);
      const y = rng.int(N);
      c.set(x, y, this.bark[0]);
      c.set(x + 1, y, this.bark[0]);
    }
  }

  protected rings(rng: SeededRng, c: Canvas): void {
    const wobble = layers(rng, [[3, 3, 1], [6, 6, 0.5]]);
    const centre = (N - 1) / 2;
    c.paint((x, y) => {
      const dx = x - centre;
      const dy = y - centre;
      const edge = Math.max(Math.abs(dx), Math.abs(dy));
      if (edge > 5.9) return null; // bark rim, drawn by the caller
      const d = Math.hypot(dx, dy) + (wobble[at(x, y)] - 0.5) * 1.6;
      const ring = Math.floor(d / 1.15);
      if (d < 1.1) return this.wood[0];
      return this.wood[ring % 2 ? 1 : 2 + (ring % 4 === 0 ? 1 : 0)];
    });
  }

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    if (this.face === 'side') {
      this.barkSide(rng, c);
    } else {
      // Bark rim first, rings on top of the middle.
      const rim = ranks(layers(rng, [[8, 8, 1]]));
      c.paint((x, y) => ramp(this.bark, rim[at(x, y)]));
      this.rings(rng, c);
    }
    return c.data;
  }
}

/** Birch: pale papery bark with dark horizontal marks, pale wood with tight grey rings on the end. */
export class BirchLog extends Log {
  protected readonly bark: readonly RGB[] = palette('#bdb49e', '#cfc7b3', '#ddd5c2', '#e9e2d1');
  protected readonly wood: readonly RGB[] = palette('#b9a67a', '#cdbb90', '#dccda6', '#e8dcb8');

  constructor(face: LogFace) {
    super(face, face === 'side' ? 'birch_log_side' : 'birch_log_top');
  }

  protected barkSide(rng: SeededRng, c: Canvas): void {
    const v = ranks(layers(rng, [[4, 4, 1], [8, 8, 0.6]]));
    c.paint((x, y) => ramp(this.bark, v[at(x, y)]));
    const mark = hex('#35312b');
    const faint = hex('#7a7466');
    // Short dark lenticels, the horizontal dashes birch is known by.
    for (let i = 0; i < 7; i++) {
      const x = rng.int(N);
      const y = rng.int(N);
      const len = 2 + rng.int(3);
      for (let k = 0; k < len; k++) c.set(x + k, y, mark);
      for (let k = 0; k < len + 1; k++) c.set(x + k, y + 1, faint);
    }
  }
}
