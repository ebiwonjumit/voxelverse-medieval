import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { hex } from '../../content/textures/Pixels';
import { createDefaultCatalog } from '../../content/textures/TextureCatalog';

const registry = createDefaultRegistry();
const catalog = createDefaultCatalog();

/** Rec. 709 weights on the sRGB bytes, the measure the art review used. */
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const meanLuma = (name: string, seed?: number): number => {
  const t = catalog.render(name, seed);
  let sum = 0;
  let n = 0;
  for (let p = 0; p < t.length; p += 4) {
    if (!t[p + 3]) continue;
    sum += luma(t[p], t[p + 1], t[p + 2]);
    n++;
  }
  return sum / n;
};

const flatLuma = (colour: string) => luma(...hex(colour));

// The flat-colour blocks that, once textured, came out far too dark or too bright. Their tiles must stay near the
// brightness of the flat colour they replaced, so roads, plinths, roofs and gems keep their old value in the world.
const KEEP_NEAR_FLAT = [
  'cobblestone', 'path', 'small_rock', 'marble', 'magic_crystal', 'stone_brick', 'red_brick', 'roof_blue', 'farmland',
];

describe('luminance of the textured blocks against their flat registry colour', () => {
  for (const short of KEEP_NEAR_FLAT) {
    it(`${short}: every face tile is within 0.8 to 1.4 of the flat colour`, () => {
      const def = registry.byName(`voxelverse:${short}`);
      const flat = flatLuma(def.color);
      for (const name of new Set([def.faces!.top, def.faces!.side])) {
        for (const seed of [undefined, 1, 2, 3]) {
          const ratio = meanLuma(name, seed) / flat;
          expect(ratio, `${name} (seed ${seed ?? 'default'})`).toBeGreaterThanOrEqual(0.8);
          expect(ratio, `${name} (seed ${seed ?? 'default'})`).toBeLessThanOrEqual(1.4);
        }
      }
    });
  }

  it('gives farmland its own side tile instead of the dirt tile', () => {
    const faces = registry.byName('voxelverse:farmland').faces!;
    expect(faces.side).toBe('farmland_side');
    expect(faces.bottom).toBe('dirt');
    expect(catalog.has('farmland_side')).toBe(true);
  });

  it('tones the magic crystal down to about 1.3 times its flat colour and keeps a glow in the edges', () => {
    const ratio = meanLuma('crystal') / flatLuma(registry.byName('voxelverse:magic_crystal').color);
    expect(ratio).toBeGreaterThan(1.1);
    expect(ratio).toBeLessThan(1.4);
    // The glow is a handful of pixels well above the face brightness.
    const t = catalog.render('crystal');
    const mean = meanLuma('crystal');
    let bright = 0;
    for (let p = 0; p < t.length; p += 4) if (luma(t[p], t[p + 1], t[p + 2]) > mean * 1.6) bright++;
    expect(bright).toBeGreaterThan(20);
  });
});

describe('very dark tiles keep their pattern in dim light', () => {
  // A few lighter pixels, so the pattern survives when the renderer multiplies the tile by a low light level.
  for (const name of ['log_side', 'obsidian', 'basalt', 'dark_plank', 'brick_factory', 'roof_blue']) {
    it(`${name}: has lighter highlight pixels well above its mean, without being bright overall`, () => {
      for (const seed of [undefined, 1, 2, 3]) {
        const t = catalog.render(name, seed);
        const mean = meanLuma(name, seed);
        let lit = 0;
        for (let p = 0; p < t.length; p += 4) if (luma(t[p], t[p + 1], t[p + 2]) > mean * 1.7) lit++;
        expect(lit, `${name} seed ${seed ?? 'default'}`).toBeGreaterThanOrEqual(3);
        expect(mean, name).toBeLessThan(110);
      }
    });
  }
});
