import { Canvas, RGB, ramp } from '../Pixels';
import { SeededRng } from '../Rng';
import { TILE_SIZE, TextureRecipe, Tiling } from '../TextureRecipe';

// Small tools for the Tempest tiles (docs/tempest-blocks.md). Most of them are drawn on purpose rather than grown from
// noise: a lantern, a vase or a noren curtain are pictures, and the shaped blocks that wear them map the tile onto
// their boxes by position, so a tile is laid out like the object it is a picture of.

export const N = TILE_SIZE;
export const at = (x: number, y: number): number => y * N + x;
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 0.999 ? 0.999 : v);

export type Draw = (c: Canvas, rng: SeededRng) => void;

export interface DrawnOptions {
  /** Opaque recipes fill every pixel; cutouts leave holes (default opaque). */
  opaque?: boolean;
  /** See Tiling (default 'both'). */
  tiling?: Tiling;
}

/** A recipe that is a drawing function, so a tile is a name, a few options and the code that paints it. */
export class DrawnTile extends TextureRecipe {
  readonly opaque: boolean;
  readonly tiling: Tiling;

  constructor(readonly id: string, private readonly draw: Draw, options: DrawnOptions = {}) {
    super();
    this.opaque = options.opaque ?? true;
    this.tiling = options.tiling ?? 'both';
  }

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    this.draw(c, rng);
    return c.data;
  }
}

/** Fills the whole tile from a noise field in 0..1, one shade of `shades` per value. */
export const fillRamp = (c: Canvas, shades: readonly RGB[], field: Float32Array, bias = 0, spread = 1): void => {
  c.paint((x, y) => ramp(shades, clamp01(0.5 + (field[at(x, y)] - 0.5) * spread + bias)));
};

/** Pixels inside a disc (centre and radius in pixels, centre of pixel (x, y) at x + 0.5). */
export const inDisc = (x: number, y: number, cx: number, cy: number, r: number): boolean =>
  Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r;
