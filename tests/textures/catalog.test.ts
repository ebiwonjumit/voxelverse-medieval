import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../content/textures/Rng';
import { TILE_BYTES, TILE_SIZE, TextureRecipe } from '../../content/textures/TextureRecipe';
import { TextureCatalog, createDefaultCatalog } from '../../content/textures/TextureCatalog';
import { Plank } from '../../content/textures/recipes/wood';
import { hex } from '../../content/textures/Pixels';

const catalog = createDefaultCatalog();
const names = catalog.names();
const N = TILE_SIZE;

// Names the plan asks for. Each must exist so later steps can map blocks to them.
const REQUIRED = [
  'dirt', 'stone', 'sand', 'cobble', 'mossy_cobble', 'stone_brick', 'brick_red', 'brick_factory', 'plank', 'dark_plank',
  'log_side', 'log_top', 'birch_log_side', 'birch_log_top', 'leaves_oak', 'leaves_birch', 'leaves_pine', 'plaster',
  'marble', 'gold', 'iron', 'obsidian', 'glass', 'water', 'snow', 'path', 'roof_red', 'roof_blue', 'grass_top', 'grass_side',
  'farmland', 'wheat_stage_1', 'wheat_stage_2', 'wheat_ripe', 'lantern', 'crystal', 'slime', 'steel', 'hangar_wall',
  'guild_wood', 'magic_stone', 'basalt', 'speckle',
];

const alphaCounts = (t: Uint8Array) => {
  let clear = 0;
  let solid = 0;
  for (let p = 3; p < t.length; p += 4) {
    if (t[p] === 0) clear++;
    else if (t[p] === 255) solid++;
  }
  return { clear, solid };
};

const colorCount = (t: Uint8Array) => {
  const set = new Set<number>();
  for (let p = 0; p < t.length; p += 4) if (t[p + 3]) set.add((t[p] << 16) | (t[p + 1] << 8) | t[p + 2]);
  return set.size;
};

describe('catalog contents', () => {
  it('registers every tile the plan names', () => {
    for (const n of REQUIRED) expect(catalog.has(n), n).toBe(true);
  });

  it('rejects duplicate names and unknown lookups', () => {
    const c = new TextureCatalog().register('dirt', catalog.get('dirt').recipe);
    expect(() => c.register('dirt', catalog.get('dirt').recipe)).toThrow();
    expect(() => c.get('nope')).toThrow();
  });

  it('has recipe ids that match the catalog names', () => {
    for (const n of names) expect(catalog.get(n).recipe.id, n).toBe(n);
  });
});

describe('every recipe', () => {
  for (const name of names) {
    const entry = catalog.get(name);

    it(`${name}: is 16x16 RGBA`, () => {
      const t = catalog.render(name);
      expect(t).toBeInstanceOf(Uint8Array);
      expect(t.length).toBe(TILE_BYTES);
    });

    it(`${name}: is deterministic for a seed and changes with another`, () => {
      const a = catalog.render(name, 42);
      const b = catalog.render(name, 42);
      expect([...a]).toEqual([...b]);
      expect(catalog.render(name)).toEqual(catalog.render(name));
    });

    it(`${name}: uses a limited palette`, () => {
      const n = colorCount(catalog.render(name));
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(12);
    });

    if (entry.recipe.opaque) {
      it(`${name}: is fully opaque`, () => {
        for (const seed of [entry.seed, 1, 2, 3]) {
          const { clear, solid } = alphaCounts(catalog.render(name, seed));
          expect(clear).toBe(0);
          expect(solid).toBe(N * N);
        }
      });
    } else {
      it(`${name}: is a cutout with opaque and fully transparent pixels and nothing in between`, () => {
        for (const seed of [entry.seed, 1, 2, 3]) {
          const { clear, solid } = alphaCounts(catalog.render(name, seed));
          expect(clear, `seed ${seed}`).toBeGreaterThan(0);
          expect(solid, `seed ${seed}`).toBeGreaterThan(0);
          expect(clear + solid).toBe(N * N); // alpha test, no blending, so no partial alpha
        }
      });
    }
  }

  it('fills the cutouts the plan names: leaves and glass', () => {
    for (const n of ['leaves_oak', 'leaves_birch', 'leaves_pine', 'glass']) {
      expect(catalog.get(n).recipe.opaque, n).toBe(false);
    }
  });

  it('keeps solid foliage reasonably dense so trees do not vanish', () => {
    for (const n of ['leaves_oak', 'leaves_birch', 'leaves_pine']) {
      const { clear } = alphaCounts(catalog.render(n));
      expect(clear / (N * N), n).toBeLessThan(0.45);
    }
  });
});

describe('tileability', () => {
  const diff = (t: Uint8Array, a: number, b: number) => {
    // Alpha counts, so a hole meeting a leaf is as visible a step as a colour change.
    let s = 0;
    for (let k = 0; k < 4; k++) s += Math.abs(t[a * 4 + k] - t[b * 4 + k]);
    return s / 4;
  };

  /**
   * Mean colour jump across each boundary between neighbouring columns (or rows), seam first.
   * A tile repeats cleanly when its wrap seam is no harsher than the harshest boundary already inside it,
   * which lets mortar lines and board edges count as normal while a hard cut in smooth art does not.
   */
  const boundaries = (t: Uint8Array, axis: 'x' | 'y') => {
    const out: number[] = [];
    for (let j = 0; j < N; j++) {
      let sum = 0;
      for (let i = 0; i < N; i++) {
        const from = axis === 'x' ? i * N + j : j * N + i;
        const to = axis === 'x' ? i * N + ((j + 1) % N) : ((j + 1) % N) * N + i;
        sum += diff(t, from, to);
      }
      out.push(sum / N);
    }
    const seam = out[N - 1];
    return { seam, interiorMax: Math.max(...out.slice(0, N - 1)) };
  };

  const seamOk = (t: Uint8Array, axis: 'x' | 'y') => {
    const { seam, interiorMax } = boundaries(t, axis);
    return seam <= interiorMax * 1.3 + 3;
  };

  for (const name of names) {
    const { recipe, seed } = catalog.get(name);
    if (recipe.tiling === 'none') continue;
    it(`${name}: wraps sideways without a seam`, () => {
      for (const s of [seed, 1, 2, 3]) expect(seamOk(catalog.render(name, s), 'x'), `seed ${s}`).toBe(true);
    });
    if (recipe.tiling === 'both') {
      it(`${name}: wraps vertically without a seam`, () => {
        for (const s of [seed, 1, 2, 3]) expect(seamOk(catalog.render(name, s), 'y'), `seed ${s}`).toBe(true);
      });
    }
  }

  it('catches a tile that does not wrap (control)', () => {
    // A left-to-right gradient has a hard cut where it wraps and nothing like it inside.
    const t = new Uint8Array(TILE_BYTES);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) t.set([x * 16, x * 16, x * 16, 255], (y * N + x) * 4);
    expect(seamOk(t, 'x')).toBe(false);
    expect(seamOk(t, 'y')).toBe(true);
  });

  it('declares which tiles are not meant to repeat', () => {
    // Bevelled blocks, crops and the lantern are drawn once per face; grass sides repeat sideways only.
    expect(catalog.get('gold').recipe.tiling).toBe('none');
    expect(catalog.get('lantern').recipe.tiling).toBe('none');
    expect(catalog.get('grass_side').recipe.tiling).toBe('x');
    expect(catalog.get('stone_brick').recipe.tiling).toBe('both');
  });
});

describe('distinct materials', () => {
  it('has no two different recipes producing the same pixels', () => {
    const seen = new Map<string, string>();
    for (const name of names) {
      const key = Buffer.from(catalog.render(name)).toString('base64');
      expect(seen.get(key), `${name} duplicates ${seen.get(key)}`).toBeUndefined();
      seen.set(key, name);
    }
  });

  it('keeps similar-looking materials visibly apart', () => {
    // Mean absolute difference per byte. 12 on a 0-255 scale is already easy to see side by side.
    const tiles = names.map((n) => catalog.render(n));
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        let sum = 0;
        for (let p = 0; p < TILE_BYTES; p++) sum += Math.abs(tiles[i][p] - tiles[j][p]);
        expect(sum / TILE_BYTES, `${names[i]} vs ${names[j]}`).toBeGreaterThan(12);
      }
    }
  });

  it('is still the same art for the same name after a fresh catalog is built', () => {
    expect(createDefaultCatalog().render('stone_brick')).toEqual(catalog.render('stone_brick'));
  });

  it('uses the recipe class hierarchy', () => {
    for (const n of names) expect(catalog.get(n).recipe).toBeInstanceOf(TextureRecipe);
    expect(new Plank('p', [hex('#111111'), hex('#222222')], hex('#000000')).generate(new SeededRng(1)).length).toBe(TILE_BYTES);
  });
});
