import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { NatureBlock, natureBlockIds } from '../../content/blocksNature';
import { createDefaultCatalog } from '../../content/textures/TextureCatalog';
import { createDefaultTextureLayout } from '../../content/textures/layout';
import { TILE_SIZE } from '../../content/textures/TextureRecipe';
import { CrossModel } from '../../engine/models/CrossModel';
import { PlateModel } from '../../engine/models/PlateModel';

const N = TILE_SIZE;
const registry = createDefaultRegistry();
const catalog = createDefaultCatalog();
const layout = createDefaultTextureLayout(registry, catalog);
const ids = natureBlockIds();

const PLANTS = new Set<number>([
  NatureBlock.BAMBOO, NatureBlock.BAMBOO_LEAVES, NatureBlock.FERN, NatureBlock.REEDS, NatureBlock.WILDFLOWER_BLUE,
  NatureBlock.WILDFLOWER_WHITE, NatureBlock.WILDFLOWER_PINK, NatureBlock.WILDFLOWER_PURPLE, NatureBlock.MUSHROOM_RED,
  NatureBlock.MUSHROOM_BROWN, NatureBlock.FALLEN_LEAVES, NatureBlock.SAKURA_PETALS,
]);
const LEAVES = new Set<number>([NatureBlock.CEDAR_LEAVES, NatureBlock.SAKURA_LEAVES, NatureBlock.SNOWY_PINE_LEAVES]);

const faceNames = (id: number) => {
  const faces = registry.get(id).faces!;
  return [faces.top, faces.bottom, faces.side];
};

describe('nature block faces', () => {
  it('give every block faces, all of them tiles that exist in the catalog', () => {
    for (const id of ids) {
      const def = registry.get(id);
      expect(def.faces, def.name).toBeDefined();
      for (const name of faceNames(id)) expect(catalog.has(name), `${def.name}: ${name}`).toBe(true);
    }
  });

  it('draw from real tiles: no flat fallback layer and no missing texture name in the layout', () => {
    expect(layout.missing).toEqual([]);
    for (const id of ids) {
      for (const face of [0, 1, 2] as const) {
        expect(layout.layerNames[layout.faceLayer(id, face)].startsWith('flat:'), registry.get(id).name).toBe(false);
      }
    }
  });

  it('leave no nature tile unused', () => {
    const used = new Set(ids.flatMap(faceNames));
    const first = catalog.names().indexOf('cedar_log_side');
    const last = catalog.names().indexOf('mud');
    for (const name of catalog.names().slice(first, last + 1)) expect(used.has(name), name).toBe(true);
  });

  it('wear grass-style soil sides on moss and podzol, with dirt underneath', () => {
    for (const [id, top, side] of [[NatureBlock.MOSS, 'moss', 'moss_side'], [NatureBlock.PODZOL, 'podzol', 'podzol_side']] as const) {
      expect(registry.get(id).faces).toEqual({ top, bottom: 'dirt', side });
    }
  });

  it('give logs an end tile and a bark tile, the same on both ends', () => {
    for (const id of [NatureBlock.CEDAR_LOG, NatureBlock.SAKURA_LOG, NatureBlock.PINE_LOG]) {
      const f = registry.get(id).faces!;
      expect(f.top).toBe(f.bottom);
      expect(f.top).toMatch(/_log_top$/);
      expect(f.side).toMatch(/_log_side$/);
    }
  });
});

describe('nature block rendering flags', () => {
  it('draw cutout blocks (leaves and plants) from tiles with real holes and opaque blocks from solid tiles', () => {
    for (const id of ids) {
      const cutout = PLANTS.has(id) || LEAVES.has(id);
      for (const name of faceNames(id)) {
        expect(catalog.get(name).recipe.opaque, `${registry.get(id).name}: ${name}`).toBe(!cutout);
      }
      // A cutout block must not claim to hide its neighbours, an opaque one must.
      expect(registry.isOpaque(id)).toBe(!cutout);
    }
  });

  it('shape plants as crossing planes and litter as a plate; leave everything else a cube', () => {
    for (const id of ids) {
      const def = registry.get(id);
      if (!PLANTS.has(id)) {
        expect(def.model, def.name).toBeUndefined();
        continue;
      }
      const litter = id === NatureBlock.FALLEN_LEAVES || id === NatureBlock.SAKURA_PETALS;
      expect(def.model, def.name).toBeInstanceOf(litter ? PlateModel : CrossModel);
      expect(registry.isSolid(id), def.name).toBe(false);
    }
  });

  it('tint nothing: cedar, cherry and ferns keep their own colours', () => {
    for (const id of ids) expect(registry.get(id).tint, registry.get(id).name).toBeUndefined();
    for (const id of ids) for (const name of faceNames(id)) expect(catalog.get(name).recipe.tint, name).toBe('none');
  });
});

const mean = (name: string) => {
  const t = catalog.render(name);
  let r = 0, g = 0, b = 0, n = 0;
  for (let p = 0; p < t.length; p += 4) {
    if (!t[p + 3]) continue;
    r += t[p]; g += t[p + 1]; b += t[p + 2]; n++;
  }
  return [r / n, g / n, b / n];
};

describe('nature tiles look like what they are named after', () => {
  it('paints sakura leaves and petals pink, cedar and fern green, snowy pine mostly pale', () => {
    for (const name of ['sakura_leaves', 'sakura_petals']) {
      const [r, g, b] = mean(name);
      expect(r, name).toBeGreaterThan(g + 40);
      expect(b, name).toBeGreaterThan(g);
    }
    for (const name of ['cedar_leaves', 'fern', 'bamboo', 'bamboo_leaves']) {
      const [r, g, b] = mean(name);
      expect(g, name).toBeGreaterThan(r);
      expect(g, name).toBeGreaterThan(b);
    }
    const [r, g, b] = mean('snowy_pine_leaves');
    expect(Math.min(r, g, b)).toBeGreaterThan(110);
  });

  it('puts the cedar wood end warmer than its bark, and the pine end more orange than the oak end', () => {
    const [br] = mean('cedar_log_side');
    const [tr, , tb] = mean('cedar_log_top');
    expect(tr).toBeGreaterThan(br);
    expect(tr).toBeGreaterThan(tb);
    const [pr, pg, pb] = mean('pine_log_top');
    const [or, og, ob] = mean('log_top');
    expect(pr - pb).toBeGreaterThan(or - ob);
    expect(pg).toBeGreaterThan(0);
  });

  it('lets bamboo and reeds join when stacked: every filled column on the bottom row has one within a pixel on the top row, and back', () => {
    for (const name of ['bamboo', 'reeds']) {
      for (const seed of [undefined, 1, 2, 3]) {
        const t = catalog.render(name, seed);
        const row = (y: number) => Array.from({ length: N }, (_, x) => t[(y * N + x) * 4 + 3] !== 0);
        const near = (a: boolean[], x: number) => a[x] || a[x - 1] || a[x + 1];
        const [top, bottom] = [row(0), row(N - 1)];
        for (let x = 0; x < N; x++) {
          if (top[x]) expect(near(bottom, x), `${name} seed ${seed}: top column ${x}`).toBe(true);
          if (bottom[x]) expect(near(top, x), `${name} seed ${seed}: bottom column ${x}`).toBe(true);
        }
      }
    }
  });

  it('keeps the tall plants rooted: something is drawn on the bottom row, and the tuft of leaves has gaps', () => {
    for (const name of ['fern', 'wildflower_blue', 'wildflower_white', 'wildflower_pink', 'wildflower_purple', 'mushroom_red', 'mushroom_brown']) {
      const t = catalog.render(name);
      let bottom = 0;
      for (let x = 0; x < N; x++) if (t[((N - 1) * N + x) * 4 + 3]) bottom++;
      expect(bottom, name).toBeGreaterThan(0);
    }
  });

  it('keeps litter thin enough for the ground to show: a tenth to four fifths covered', () => {
    for (const name of ['fallen_leaves', 'sakura_petals']) {
      for (const seed of [undefined, 1, 2, 3]) {
        const t = catalog.render(name, seed);
        let solid = 0;
        for (let p = 3; p < t.length; p += 4) if (t[p]) solid++;
        expect(solid / (N * N), `${name} seed ${seed}`).toBeGreaterThan(name === 'sakura_petals' ? 0.1 : 0.35);
        expect(solid / (N * N), `${name} seed ${seed}`).toBeLessThan(0.8);
      }
    }
  });

  it('keeps leaves dense enough that a canopy does not vanish', () => {
    for (const name of ['cedar_leaves', 'sakura_leaves', 'snowy_pine_leaves']) {
      for (const seed of [undefined, 1, 2, 3]) {
        const t = catalog.render(name, seed);
        let clear = 0;
        for (let p = 3; p < t.length; p += 4) if (!t[p]) clear++;
        expect(clear / (N * N), `${name} seed ${seed}`).toBeLessThan(0.45);
      }
    }
  });

  it('caps the moss side in green over brown dirt', () => {
    const t = catalog.render('moss_side');
    const band = (y0: number, y1: number) => {
      let r = 0, g = 0;
      for (let y = y0; y < y1; y++) for (let x = 0; x < N; x++) { r += t[(y * N + x) * 4]; g += t[(y * N + x) * 4 + 1]; }
      return [r, g];
    };
    const [capR, capG] = band(0, 3);
    const [dirtR, dirtG] = band(N - 6, N);
    expect(capG).toBeGreaterThan(capR * 1.2);
    expect(dirtR).toBeGreaterThan(dirtG);
  });
});
