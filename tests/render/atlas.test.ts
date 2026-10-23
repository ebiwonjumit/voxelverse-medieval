import {
  ClampToEdgeWrapping, LinearMipmapLinearFilter, NearestFilter, SRGBColorSpace, UnsignedByteType,
} from 'three';
import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { createDefaultTextureLayout } from '../../content/textures/layout';
import { createDefaultCatalog } from '../../content/textures/TextureCatalog';
import { TILE_BYTES, TILE_SIZE } from '../../content/textures/TextureRecipe';
import { createTextureLayout } from '../../engine/TextureLayout';
import { buildAtlas, buildAtlasPixels } from '../../render/AtlasBuilder';

const catalog = createDefaultCatalog();
const registry = createDefaultRegistry();
registry.register({ id: 100, name: 'test:flat', color: '#336699', solid: true, opaque: true, emits: 0 });
const layout = createDefaultTextureLayout(registry, catalog);
const atlas = buildAtlas(catalog, layout);
const pixels = buildAtlasPixels(catalog, layout);
const layerAt = (l: number) => pixels.slice(l * TILE_BYTES, (l + 1) * TILE_BYTES);
const layer = (name: string) => layerAt(atlas.layerOf(name));

describe('texture array', () => {
  it('is one 16 x 16 RGBA8 layer per tile, overlay and flat colour', () => {
    const t = atlas.texture;
    expect(t.image.width).toBe(TILE_SIZE);
    expect(t.image.height).toBe(TILE_SIZE);
    expect(t.image.depth).toBe(layout.layerCount);
    expect(t.type).toBe(UnsignedByteType);
    expect(t.image.data!.length).toBe(layout.layerCount * TILE_BYTES);
    // Stays well under the 256 layers every WebGL2 device guarantees.
    expect(layout.layerCount).toBeLessThan(200);
  });

  it('is crisp up close, mipmapped far away, and sampled as sRGB', () => {
    const t = atlas.texture;
    expect(t.magFilter).toBe(NearestFilter);
    expect(t.minFilter).toBe(LinearMipmapLinearFilter);
    expect(t.generateMipmaps).toBe(true);
    expect(t.colorSpace).toBe(SRGBColorSpace);
    expect(t.wrapS).toBe(ClampToEdgeWrapping);
    expect(t.wrapT).toBe(ClampToEdgeWrapping);
    expect(t.anisotropy).toBeGreaterThan(1);
  });

  it('returns the layer of every name, and rejects names it does not hold', () => {
    for (const name of catalog.names()) expect(atlas.layerOf(name)).toBe(layout.layerOf.get(name));
    expect(() => atlas.layerOf('nope')).toThrow(/nope/);
  });

  it('holds the catalog bytes of an ordinary tile unchanged', () => {
    expect(Array.from(layer('stone_brick'))).toEqual(Array.from(catalog.render('stone_brick')));
    expect(Array.from(layer('plank'))).toEqual(Array.from(catalog.render('plank')));
  });

  it('holds a flat tile as the sRGB bytes of the colour, fully opaque', () => {
    const flat = layer('flat:#336699');
    for (let p = 0; p < TILE_BYTES; p += 4) expect(Array.from(flat.slice(p, p + 4))).toEqual([0x33, 0x66, 0x99, 255]);
  });

  it('adds a flat tile for a block without faces and for unknown ids', () => {
    expect(layout.faceLayer(100, 0)).toBe(atlas.layerOf('flat:#336699'));
    expect(layout.faceLayer(3000, 0)).toBe(atlas.layerOf('flat:#ff00ff'));
  });

  it('keeps opaque tiles fully opaque in every layer that is not a mask', () => {
    for (let l = 0; l < layout.layerCount; l++) {
      const name = layout.layerNames[l];
      if (name.endsWith('#tint') || (!name.startsWith('flat:') && !catalog.get(name).recipe.opaque)) continue;
      const tile = layerAt(l);
      for (let p = 3; p < TILE_BYTES; p += 4) expect(tile[p], name).toBe(255);
    }
  });
});

describe('texture array: grass side', () => {
  const baseLayer = layout.layer('grass_side');
  const base = layerAt(baseLayer);
  const overlay = layerAt(layout.overlayOf[baseLayer]);
  const mask = catalog.tintMask('grass_side');

  it('stores the fringe as an overlay that is opaque exactly where the biome tint applies', () => {
    for (let p = 0; p < 256; p++) expect(overlay[p * 4 + 3], `pixel ${p}`).toBe(mask[p] ? 255 : 0);
  });

  it('replaces the fringe in the base with the dirt below it, so mips fade green into brown, not grey', () => {
    const tile = catalog.render('grass_side');
    for (let p = 0; p < 256; p++) {
      if (!mask[p]) {
        expect(Array.from(base.slice(p * 4, p * 4 + 4))).toEqual(Array.from(tile.slice(p * 4, p * 4 + 4)));
        continue;
      }
      // Brown, not the neutral grey of the fringe: red above blue.
      expect(base[p * 4], `pixel ${p}`).toBeGreaterThan(base[p * 4 + 2]);
      expect(base[p * 4 + 3]).toBe(255);
    }
  });

  it('keeps the neutral grey of the fringe in the overlay, ready for the tint', () => {
    for (let p = 0; p < 256; p++) {
      if (!mask[p]) continue;
      expect(overlay[p * 4]).toBe(overlay[p * 4 + 1]);
      expect(overlay[p * 4 + 1]).toBe(overlay[p * 4 + 2]);
    }
  });

  it('has no overlay for a fully tinted tile such as grass_top or leaves', () => {
    expect(layout.overlayOf[layout.layer('grass_top')]).toBe(-1);
    expect(layout.overlayOf[layout.layer('leaves_oak')]).toBe(-1);
  });
});

describe('texture array: cutouts do not grow halos in the mips', () => {
  it('colours the hidden pixels of a cutout with the mean of its visible ones', () => {
    for (const name of ['leaves_birch', 'leaves_pine', 'glass', 'lantern', 'wheat_ripe', 'tall_grass']) {
      const tile = layer(name);
      let visible = 0;
      const sum = [0, 0, 0];
      for (let p = 0; p < TILE_BYTES; p += 4) {
        if (tile[p + 3] === 0) continue;
        visible++;
        for (let c = 0; c < 3; c++) sum[c] += tile[p + c];
      }
      expect(visible, name).toBeGreaterThan(0);
      let hidden = 0;
      for (let p = 0; p < TILE_BYTES; p += 4) {
        if (tile[p + 3] !== 0) continue;
        hidden++;
        for (let c = 0; c < 3; c++) expect(Math.abs(tile[p + c] - sum[c] / visible), `${name} channel ${c}`).toBeLessThanOrEqual(1);
      }
      expect(hidden, name).toBeGreaterThan(0);
    }
  });

  it('keeps the alpha of a cutout exactly zero or 255', () => {
    for (const name of ['leaves_oak', 'leaves_birch', 'glass', 'lantern']) {
      const tile = layer(name);
      for (let p = 3; p < TILE_BYTES; p += 4) expect([0, 255]).toContain(tile[p]);
    }
  });
});

describe('texture layout', () => {
  it('reports a texture name the catalog lacks instead of throwing', () => {
    const r = createDefaultRegistry();
    r.register({
      id: 100, name: 'test:odd', color: '#123456', solid: true, opaque: true, emits: 0,
      faces: { top: 'zzz', bottom: 'dirt', side: 'dirt' },
    });
    const l = createDefaultTextureLayout(r, catalog);
    expect(l.missing).toEqual(['zzz']);
    expect(l.layerNames[l.faceLayer(100, 0)]).toBe('flat:#123456');
    expect(l.layerNames[l.faceLayer(100, 1)]).toBe('dirt');
  });

  it('refuses the same tile twice', () => {
    const tile = { name: 'a', tint: false, overlay: false };
    expect(() => createTextureLayout([tile, tile], registry)).toThrow(/twice/);
  });

  it('is the same from the same inputs, which is how a worker and the main thread agree', () => {
    const again = createDefaultTextureLayout(registry, createDefaultCatalog());
    expect(again.layerNames).toEqual(layout.layerNames);
    expect(Array.from(again.faceLayers)).toEqual(Array.from(layout.faceLayers));
    expect(Array.from(again.faceTint)).toEqual(Array.from(layout.faceTint));
  });
});
