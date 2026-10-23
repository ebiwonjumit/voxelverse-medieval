import {
  ClampToEdgeWrapping, DataArrayTexture, LinearMipmapLinearFilter, NearestFilter, RGBAFormat, SRGBColorSpace,
  UnsignedByteType,
} from 'three';
import { FLAT_PREFIX, OVERLAY_SUFFIX, TextureLayout } from '../engine/TextureLayout';
import { TextureCatalog } from '../content/textures/TextureCatalog';
import { TILE_BYTES, TILE_SIZE } from '../content/textures/TextureRecipe';

// Packs the texture catalog into one three DataArrayTexture, a layer per tile, in the order the TextureLayout
// says. The mesher writes layer numbers into its vertices, so the two must be built from the same layout.
//
// Colour: the pixels are sRGB, the texture is marked sRGB, so the GPU decodes on sampling and the mip levels
// are averaged in linear light. Magnification is nearest (crisp pixels up close) and minification is
// mipmapped (no shimmer at distance). Layers never bleed into each other; wrapping is clamped so the edge of
// a tile does not blend into its opposite edge either.

export const ATLAS_ANISOTROPY = 4;

export interface Atlas {
  texture: DataArrayTexture;
  layout: TextureLayout;
  /** Layer of a catalog or flat tile by name. */
  layerOf(name: string): number;
  dispose(): void;
}

const hexToBytes = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// Straight-alpha mip levels average the colour of transparent pixels in too, which would grow dark or grey
// halos around leaves at distance. Giving hidden pixels the mean colour of the visible ones avoids that.
const bleedHiddenColor = (tile: Uint8Array): void => {
  let r = 0, g = 0, b = 0, n = 0;
  for (let p = 0; p < tile.length; p += 4) {
    if (tile[p + 3] === 0) continue;
    r += tile[p]; g += tile[p + 1]; b += tile[p + 2]; n++;
  }
  if (n === 0 || n === TILE_SIZE * TILE_SIZE) return;
  const mean = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  for (let p = 0; p < tile.length; p += 4) {
    if (tile[p + 3] !== 0) continue;
    tile[p] = mean[0]; tile[p + 1] = mean[1]; tile[p + 2] = mean[2];
  }
};

/**
 * A grass side is stored as two layers: the base, with the grass fringe replaced by the dirt beneath it, and
 * the fringe itself (alpha 255 where the biome tint applies). The shader draws the fringe over the base in the
 * tint colour. Keeping the dirt under the fringe is what lets lower mip levels blend green into brown instead
 * of grey into brown.
 */
const splitOverlay = (tile: Uint8Array, mask: Uint8Array): { base: Uint8Array; overlay: Uint8Array } => {
  const base = new Uint8Array(tile);
  const overlay = new Uint8Array(TILE_BYTES);
  let r = 0, g = 0, b = 0, n = 0;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    overlay.set(tile.subarray(p * 4, p * 4 + 4), p * 4);
    r += tile[p * 4]; g += tile[p * 4 + 1]; b += tile[p * 4 + 2]; n++;
  }
  for (let x = 0; x < TILE_SIZE; x++) {
    // Dirt for a masked pixel: the first unmasked one further down its column.
    let below = -1;
    for (let y = TILE_SIZE - 1; y >= 0; y--) {
      const p = y * TILE_SIZE + x;
      if (!mask[p]) below = p;
      else if (below >= 0) base.set(tile.subarray(below * 4, below * 4 + 4), p * 4);
    }
  }
  if (n > 0) {
    const mean = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    for (let p = 0; p < mask.length; p++) {
      if (mask[p]) continue;
      overlay[p * 4] = mean[0]; overlay[p * 4 + 1] = mean[1]; overlay[p * 4 + 2] = mean[2]; // alpha stays 0
    }
  }
  return { base, overlay };
};

/** The pixels of every layer, one tile after another (RGBA8, row 0 on top). */
export const buildAtlasPixels = (catalog: TextureCatalog, layout: TextureLayout): Uint8Array => {
  const data = new Uint8Array(layout.layerCount * TILE_BYTES);
  for (let layer = 0; layer < layout.layerCount; layer++) {
    const name = layout.layerNames[layer];
    let tile: Uint8Array;
    if (name.startsWith(FLAT_PREFIX)) {
      const [r, g, b] = hexToBytes(name.slice(FLAT_PREFIX.length));
      tile = new Uint8Array(TILE_BYTES);
      for (let p = 0; p < tile.length; p += 4) {
        tile[p] = r; tile[p + 1] = g; tile[p + 2] = b; tile[p + 3] = 255;
      }
    } else if (name.endsWith(OVERLAY_SUFFIX)) {
      continue; // written together with its base layer
    } else {
      tile = catalog.render(name);
      const overlayLayer = layout.overlayOf[layer];
      if (overlayLayer >= 0) {
        const { base, overlay } = splitOverlay(tile, catalog.tintMask(name));
        data.set(overlay, overlayLayer * TILE_BYTES);
        tile = base;
      } else if (!catalog.get(name).recipe.opaque) {
        tile = new Uint8Array(tile);
        bleedHiddenColor(tile);
      }
    }
    data.set(tile, layer * TILE_BYTES);
  }
  return data;
};

export const buildAtlas = (catalog: TextureCatalog, layout: TextureLayout): Atlas => {
  const texture = new DataArrayTexture(buildAtlasPixels(catalog, layout), TILE_SIZE, TILE_SIZE, layout.layerCount);
  texture.format = RGBAFormat;
  texture.type = UnsignedByteType;
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.anisotropy = ATLAS_ANISOTROPY;
  texture.needsUpdate = true;
  texture.name = 'block-textures';
  return {
    texture,
    layout,
    layerOf: (name) => layout.layer(name),
    dispose: () => texture.dispose(),
  };
};
