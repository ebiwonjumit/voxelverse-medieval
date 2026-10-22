import { SeededRng } from './Rng';

export const TILE_SIZE = 16;
export const TILE_BYTES = TILE_SIZE * TILE_SIZE * 4;

/**
 * Which edges of the tile are meant to meet their opposite edge without a visible seam.
 * 'both' tiles repeat across big walls and floors; 'x' tiles repeat sideways only (a grass side has grass
 * at the top and dirt at the bottom); 'none' tiles are drawn once per block face (bevelled metal, a lantern).
 */
export type Tiling = 'both' | 'x' | 'none';

/** Which biome colour multiplies the tile at render time, if any. */
export type TintKind = 'none' | 'grass';

/**
 * One generated 16x16 pixel-art material. A recipe is a pure function of the generator it is handed:
 * the same seed always gives the same 1024 bytes (RGBA, row 0 at the top).
 */
export abstract class TextureRecipe {
  abstract readonly id: string;
  /** Opaque recipes must produce alpha 255 everywhere; the rest are cutouts with real holes. */
  readonly opaque: boolean = true;
  readonly tiling: Tiling = 'both';
  readonly tint: TintKind = 'none';

  abstract generate(rng: SeededRng): Uint8Array;

  /**
   * For tinted recipes: 255 where the tint applies and 0 elsewhere (one byte per pixel).
   * Must be called with a generator in the same state as for generate() so the two agree.
   */
  tintMask(_rng: SeededRng): Uint8Array {
    return new Uint8Array(TILE_SIZE * TILE_SIZE);
  }
}
