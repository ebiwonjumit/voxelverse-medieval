import { describe, expect, it } from 'vitest';
import { hex } from '../../content/textures/Pixels';
import { createDefaultCatalog } from '../../content/textures/TextureCatalog';
import { applyTint } from '../../content/textures/tint';

const catalog = createDefaultCatalog();

describe('grass tint', () => {
  it('marks only the grass tiles and the oak leaves as tinted', () => {
    const tinted = catalog.names().filter((n) => catalog.get(n).recipe.tint === 'grass');
    expect(tinted.sort()).toEqual(['grass_side', 'grass_top', 'leaves_oak']);
  });

  it('tints exactly the visible pixels of the oak leaves, which are neutral grey', () => {
    const t = catalog.render('leaves_oak');
    const mask = catalog.tintMask('leaves_oak');
    let visible = 0;
    for (let p = 0; p < 256; p++) {
      expect(mask[p] === 255, `pixel ${p}`).toBe(t[p * 4 + 3] === 255);
      if (t[p * 4 + 3]) {
        visible++;
        expect(t[p * 4]).toBe(t[p * 4 + 1]);
        expect(t[p * 4 + 1]).toBe(t[p * 4 + 2]);
      }
    }
    expect(visible).toBeGreaterThan(0);
    expect(visible).toBeLessThan(256);
  });

  it('gives untinted tiles an empty mask', () => {
    expect(catalog.tintMask('stone').every((b) => b === 0)).toBe(true);
  });

  it('tints the whole grass top and leaves it neutral grey before tinting', () => {
    const t = catalog.render('grass_top');
    const mask = catalog.tintMask('grass_top');
    expect(mask.every((b) => b === 255)).toBe(true);
    for (let p = 0; p < 256; p++) expect(t[p * 4]).toBe(t[p * 4 + 1]), expect(t[p * 4 + 1]).toBe(t[p * 4 + 2]);
  });

  it('marks a fringe along the top of the grass side, grey, and nothing but dirt below it', () => {
    const t = catalog.render('grass_side');
    const mask = catalog.tintMask('grass_side');
    for (let x = 0; x < 16; x++) {
      // Every column starts with fringe and ends with dirt.
      expect(mask[x]).toBe(255);
      expect(mask[15 * 16 + x]).toBe(0);
      expect(mask[7 * 16 + x]).toBe(0);
    }
    let fringe = 0;
    for (let p = 0; p < 256; p++) {
      if (mask[p]) {
        fringe++;
        expect(t[p * 4]).toBe(t[p * 4 + 1]);
        expect(t[p * 4 + 1]).toBe(t[p * 4 + 2]);
      } else {
        // Dirt is warm brown: red above blue.
        expect(t[p * 4]).toBeGreaterThan(t[p * 4 + 2]);
      }
    }
    expect(fringe).toBeGreaterThanOrEqual(16 * 3);
    expect(fringe).toBeLessThanOrEqual(16 * 8);
  });

  it('follows the biome colour on the fringe and leaves the dirt alone', () => {
    const t = catalog.render('grass_side');
    const mask = catalog.tintMask('grass_side');
    for (const colour of ['#4ade80', '#2e7d32', '#f48fb1']) {
      const tint = hex(colour);
      const out = applyTint(t, mask, tint);
      for (let p = 0; p < 256; p++) {
        if (mask[p]) {
          // Fringe takes the tint's hue: its channels keep the tint's ordering.
          for (let k = 0; k < 3; k++) expect(out[p * 4 + k]).toBeLessThanOrEqual(tint[k]);
          expect(out[p * 4 + 3]).toBe(255);
        } else {
          for (let k = 0; k < 4; k++) expect(out[p * 4 + k]).toBe(t[p * 4 + k]);
        }
      }
    }
  });

  it('produces different fringes for different biomes', () => {
    const t = catalog.render('grass_side');
    const mask = catalog.tintMask('grass_side');
    expect(applyTint(t, mask, hex('#4ade80'))).not.toEqual(applyTint(t, mask, hex('#f48fb1')));
  });

  it('agrees with generate() for the same seed', () => {
    expect(catalog.tintMask('grass_side', 5)).toEqual(catalog.tintMask('grass_side', 5));
    expect(catalog.tintMask('grass_side', 5)).not.toEqual(catalog.tintMask('grass_side', 6));
  });
});
