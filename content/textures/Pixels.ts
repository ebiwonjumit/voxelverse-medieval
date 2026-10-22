import { TILE_BYTES, TILE_SIZE } from './TextureRecipe';

// Colour and pixel helpers shared by the recipes.

export type RGB = readonly [number, number, number];

export const hex = (s: string): RGB => {
  const v = parseInt(s.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

export const palette = (...colors: string[]): RGB[] => colors.map(hex);

export const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

const clamp8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

export const scale = (c: RGB, f: number): RGB => [clamp8(c[0] * f), clamp8(c[1] * f), clamp8(c[2] * f)];

/** A shade from a dark-to-light palette for a value in [0, 1]. */
export const ramp = (p: readonly RGB[], v: number): RGB => p[Math.min(p.length - 1, Math.max(0, Math.floor(v * p.length)))];

const wrap = (v: number) => ((v % TILE_SIZE) + TILE_SIZE) % TILE_SIZE;

/** A 16x16 RGBA canvas. Coordinates wrap, so a shape that leaves one edge comes back on the other. */
export class Canvas {
  readonly data = new Uint8Array(TILE_BYTES);

  set(x: number, y: number, c: RGB, a = 255): void {
    const i = (wrap(y) * TILE_SIZE + wrap(x)) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = a;
  }

  get(x: number, y: number): [number, number, number, number] {
    const i = (wrap(y) * TILE_SIZE + wrap(x)) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  fill(c: RGB, a = 255): this {
    for (let y = 0; y < TILE_SIZE; y++) for (let x = 0; x < TILE_SIZE; x++) this.set(x, y, c, a);
    return this;
  }

  /** Visit every pixel and let the callback choose its colour. */
  paint(fn: (x: number, y: number) => RGB | null): this {
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const c = fn(x, y);
        if (c) this.set(x, y, c);
      }
    }
    return this;
  }

  clear(x: number, y: number): void {
    const i = (wrap(y) * TILE_SIZE + wrap(x)) * 4;
    this.data[i] = this.data[i + 1] = this.data[i + 2] = this.data[i + 3] = 0;
  }
}
