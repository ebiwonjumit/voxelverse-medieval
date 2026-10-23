import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import {
  TEMPEST_ID_MAX, TEMPEST_ID_MIN, TempestBlock, tempestBlockIds, tempestBlockNames,
} from '../../content/blocksTempest';
import { createDefaultCatalog } from '../../content/textures/TextureCatalog';
import { createDefaultTextureLayout } from '../../content/textures/layout';
import { tempestRecipes } from '../../content/textures/recipes/tempest';
import { TILE_SIZE } from '../../content/textures/TextureRecipe';
import { Box } from '../../engine/models/BlockModel';
import { FenceModel } from '../../engine/models/FenceModel';
import { OrientedBoxModel } from '../../engine/models/OrientedBoxModel';
import { PaneModel } from '../../engine/models/PaneModel';
import { PlateModel } from '../../engine/models/PlateModel';
import { SlabModel } from '../../engine/models/SlabModel';
import { StairModel } from '../../engine/models/StairModel';
import { quadBounds } from '../models/helpers';

const N = TILE_SIZE;
const registry = createDefaultRegistry();
const catalog = createDefaultCatalog();
const layout = createDefaultTextureLayout(registry, catalog);
const ids = tempestBlockIds();
const defOf = (id: number) => registry.get(id);
const shortName = (id: number) => defOf(id).name.replace('voxelverse:', '');
const idOf = (name: string) => registry.byName(`voxelverse:${name}`).id;
const faceNames = (id: number) => {
  const f = defOf(id).faces!;
  return [f.top, f.bottom, f.side];
};
const tileNames = tempestRecipes().map((r) => r.id);

const mean = (name: string): [number, number, number] => {
  const t = catalog.render(name);
  let r = 0, g = 0, b = 0, n = 0;
  for (let p = 0; p < t.length; p += 4) {
    if (!t[p + 3]) continue;
    r += t[p]; g += t[p + 1]; b += t[p + 2]; n++;
  }
  return [r / n, g / n, b / n];
};
const luma = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const brightest = (name: string): number => {
  const t = catalog.render(name);
  let best = 0;
  for (let p = 0; p < t.length; p += 4) if (t[p + 3]) best = Math.max(best, luma([t[p], t[p + 1], t[p + 2]]));
  return best;
};

describe('Tempest block ids', () => {
  it('fill 128 to 199 exactly, once each, and every one is registered under that number', () => {
    expect(TEMPEST_ID_MIN).toBe(128);
    expect(TEMPEST_ID_MAX).toBe(199);
    expect(ids).toHaveLength(72);
    expect(new Set(ids).size).toBe(72);
    expect(ids[0]).toBe(TEMPEST_ID_MIN);
    expect(ids[ids.length - 1]).toBe(TEMPEST_ID_MAX);
    for (const id of ids) {
      expect(registry.has(id), `${id}`).toBe(true);
      expect(id).toBeGreaterThanOrEqual(128);
      expect(id).toBeLessThanOrEqual(199);
    }
    // Nothing else lives in the Tempest range yet, and the Tempest set owns nothing outside it.
    for (const def of registry.all()) {
      if (def.id >= 128) expect(ids.includes(def.id), def.name).toBe(true);
    }
  });

  it('are stable: these numbers are in worlds already, and never move', () => {
    const pinned: Record<string, number> = {
      vermilion_log: 128, timber_post: 130, plaster_white: 136, plaster_stairs: 139, white_column: 140,
      terracotta_roof: 141, terracotta_roof_stairs: 142, terracotta_roof_slab: 143, dark_tile_roof: 144, green_tile_roof: 147,
      teal_roof: 150, thatch_roof: 153, terracotta_ridge: 156, terracotta_ridge_horn: 157, dark_ridge_horn: 159,
      shoji_pane: 160, shoji_pane_lit: 161, paper_lantern_red: 163, stone_lantern_base: 165, stone_lantern_light: 166,
      blue_ore_lamp: 168, green_ore_lamp: 169, tatami: 170, stone_paving: 172, fan_paving: 173, stone_basin: 179,
      koi_pond: 180, low_table: 183, hearth: 187, barrel: 188, signboard: 193, noren_indigo: 194, awning_red: 197,
      laundry_pole: 199,
    };
    for (const [name, id] of Object.entries(pinned)) expect(idOf(name), name).toBe(id);
  });

  it('give every block a unique voxelverse: name, listed in id order by the sandbox', () => {
    const names = ids.map((id) => defOf(id).name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^voxelverse:[a-z_]+$/);
    expect(tempestBlockNames()).toEqual(ids.map(shortName));
  });

  it('keep the legacy, nature and shaped ranges where they were', () => {
    expect(idOf('stone_brick_stairs')).toBe(81);
    expect(idOf('glass_pane')).toBe(92);
    expect(idOf('sakura_log')).toBe(50);
    expect(idOf('wood_fence')).toBe(34);
  });
});

describe('Tempest faces and tiles', () => {
  it('give every block faces, all of them tiles that exist, and need no flat fallback layer', () => {
    expect(layout.missing).toEqual([]);
    for (const id of ids) {
      const def = defOf(id);
      expect(def.faces, def.name).toBeDefined();
      for (const name of faceNames(id)) expect(catalog.has(name), `${def.name}: ${name}`).toBe(true);
      for (const face of [0, 1, 2] as const) {
        expect(layout.layerNames[layout.faceLayer(id, face)].startsWith('flat:'), def.name).toBe(false);
      }
    }
  });

  it('leave no Tempest tile unused, and use no tile that is not in the set except the legacy cobble-like ones', () => {
    const used = new Set(ids.flatMap(faceNames));
    for (const name of tileNames) expect(used.has(name), name).toBe(true);
    for (const name of used) expect(catalog.has(name), name).toBe(true);
  });

  it('register the 63 tiles after the legacy and nature ones, in a stable order', () => {
    expect(tileNames).toHaveLength(63);
    const all = catalog.names();
    expect(all.slice(all.length - 63)).toEqual(tileNames);
  });

  it('share a top tile only inside a kit: a roof with its stairs and slab, a ridge with its horn, the parts of a lantern', () => {
    // The guard in tests/engine/blocks.test.ts covers the older ranges. Here every deliberate share is listed, so a tile
    // reused by accident for something else shows up as a new line.
    const byTop = new Map<string, string[]>();
    for (const id of ids) {
      const list = byTop.get(defOf(id).faces!.top) ?? [];
      list.push(shortName(id));
      byTop.set(defOf(id).faces!.top, list);
    }
    const shared = [...byTop.entries()].filter(([, names]) => names.length > 1).map(([tile, names]) => `${tile}: ${names.join(',')}`);
    expect(shared.sort()).toEqual([
      'black_lacquer: paper_lantern_red,paper_lantern_striped,low_table',
      'dark_ridge: dark_ridge,dark_ridge_horn',
      'dark_tile_roof: dark_tile_roof,dark_tile_roof_stairs,dark_tile_roof_slab',
      'green_tile_roof: green_tile_roof,green_tile_roof_stairs,green_tile_roof_slab',
      'lantern_stone: stone_lantern_base,stone_lantern_light,stone_lantern_cap,stone_bollard',
      'mossy_stone: mossy_stone,mossy_stone_slab,mossy_stone_stairs',
      'plaster_white: plaster_white,plaster_stairs,white_column',
      'teal_roof: teal_roof,teal_roof_stairs,teal_roof_slab',
      'terracotta_ridge: terracotta_ridge,terracotta_ridge_horn',
      'terracotta_roof: terracotta_roof,terracotta_roof_stairs,terracotta_roof_slab',
      'thatch_roof: thatch_roof,thatch_roof_stairs,thatch_roof_slab',
      'vermilion_planks: vermilion_planks,vermilion_rail',
    ].sort());
  });

  it('keep opaque blocks to opaque tiles and cutout tiles to see-through blocks', () => {
    for (const id of ids) {
      const def = defOf(id);
      for (const name of faceNames(id)) {
        if (def.opaque) expect(catalog.get(name).recipe.opaque, `${def.name}: ${name}`).toBe(true);
      }
    }
    for (const name of tileNames) {
      if (catalog.get(name).recipe.opaque) continue;
      const users = ids.filter((id) => faceNames(id).includes(name));
      for (const id of users) expect(defOf(id).opaque, `${shortName(id)} wears the cutout ${name}`).toBe(false);
    }
  });

  it('tint nothing: the biome colour must never be multiplied into a roof or a lantern', () => {
    for (const id of ids) expect(defOf(id).tint, shortName(id)).toBeUndefined();
    for (const name of tileNames) expect(catalog.get(name).recipe.tint, name).toBe('none');
  });
});

describe('Tempest tiles look like what they are named after', () => {
  it('makes terracotta the warm orange main roof, and no roof a deep blue slate', () => {
    const [r, g, b] = mean('terracotta_roof');
    expect(r).toBeGreaterThan(140);
    expect(r).toBeGreaterThan(g * 1.25);
    expect(g).toBeGreaterThan(b * 1.2);
    // Terracotta is the brightest and warmest of the roofs.
    for (const other of ['dark_tile_roof', 'green_tile_roof', 'teal_roof', 'thatch_roof']) {
      const [or, , ob] = mean(other);
      expect(r - b, other).toBeGreaterThan(or - ob);
    }
    // The dark Japanese tile is charcoal, not a saturated blue: dark, and with little more blue than red.
    const dark = mean('dark_tile_roof');
    expect(luma(dark)).toBeLessThan(80);
    expect(dark[2] - dark[0]).toBeLessThan(40);
    for (const name of ['terracotta_roof', 'dark_tile_roof', 'green_tile_roof', 'thatch_roof', 'terracotta_ridge', 'dark_ridge']) {
      const [rr, , bb] = mean(name);
      expect(bb > rr * 1.6 && bb > 100, `${name} must not be deep blue`).toBe(false);
    }
    // The civic roof is teal: as much green as blue, never the blue of slate.
    const teal = mean('teal_roof');
    expect(teal[1]).toBeGreaterThan(teal[2] * 0.85);
  });

  it('paints green glaze green, the civic roof teal, thatch straw and the lacquer vermilion', () => {
    const [gr, gg, gb] = mean('green_tile_roof');
    expect(gg).toBeGreaterThan(gr * 1.4);
    expect(gg).toBeGreaterThan(gb);
    const [tr, tg, tb] = mean('teal_roof');
    expect(tg).toBeGreaterThan(tr + 30);
    expect(tb).toBeGreaterThan(tr + 30);
    const [sr, sg, sb] = mean('thatch_roof');
    expect(sr).toBeGreaterThan(sg);
    expect(sg).toBeGreaterThan(sb * 1.5);
    for (const name of ['vermilion_log_side', 'vermilion_planks']) {
      const [r, g, b] = mean(name);
      expect(r, name).toBeGreaterThan(g * 2.2);
      expect(r, name).toBeGreaterThan(b * 2.2);
    }
  });

  it('keeps plaster white and timber dark, the contrast the town is built on', () => {
    expect(luma(mean('plaster_white'))).toBeGreaterThan(200);
    expect(luma(mean('column_white'))).toBeGreaterThan(190);
    for (const name of ['timber_post_side', 'timber_beam', 'timber_end']) expect(luma(mean(name)), name).toBeLessThan(80);
  });

  it('draws the lit things bright: lanterns, lit paper, ore, embers and the lantern window', () => {
    for (const name of ['shoji_lit', 'stone_lantern_light', 'blue_ore_lamp', 'green_ore_lamp', 'hearth_top']) {
      expect(brightest(name), name).toBeGreaterThan(190);
    }
    // A red paper lantern is red, so it never reaches white, but its middle glows well above the rest of its body.
    for (const name of ['paper_lantern_red', 'paper_lantern_striped']) expect(brightest(name), name).toBeGreaterThan(150);
    // Lit paper is warm, and brighter than the same screen unlit.
    expect(luma(mean('shoji_lit'))).toBeGreaterThan(luma(mean('shoji')) * 0.9);
    const [r, g, b] = mean('shoji_lit');
    expect(r).toBeGreaterThan(b + 60);
    expect(g).toBeGreaterThan(b);
    const [br, , bb] = mean('blue_ore_lamp');
    expect(bb).toBeGreaterThan(br);
    const [gr, gg, gb] = mean('green_ore_lamp');
    expect(gg).toBeGreaterThan(gr);
    expect(gg).toBeGreaterThan(gb);
  });

  it('gives the cloth its colours: indigo, red, white, and the stripes of the awnings in two of them', () => {
    const [ir, , ib] = mean('noren_indigo');
    expect(ib).toBeGreaterThan(ir * 1.5);
    const [rr, rg] = mean('noren_red');
    expect(rr).toBeGreaterThan(rg * 2);
    expect(luma(mean('noren_white'))).toBeGreaterThan(190);
    // An awning tile is cut in vertical stripes: every row of it reads the same, and a stripe is four pixels wide.
    for (const name of ['awning_red', 'awning_indigo']) {
      const t = catalog.render(name);
      const col = (x: number) => luma([t[x * 4], t[x * 4 + 1], t[x * 4 + 2]]);
      expect(Math.abs(col(1) - col(5)), name).toBeGreaterThan(40);
      expect(Math.abs(col(1) - col(9)), name).toBeLessThan(40);
    }
  });

  it('paints a pond with a pale rim round blue water, and a basin top the same', () => {
    const t = catalog.render('basin_top');
    const px = (x: number, y: number) => [t[(y * N + x) * 4], t[(y * N + x) * 4 + 1], t[(y * N + x) * 4 + 2]];
    expect(px(8, 8)[2]).toBeGreaterThan(px(8, 8)[0] + 40); // water: blue over red
    expect(px(0, 8)[2]).toBeLessThanOrEqual(px(0, 8)[0] + 30); // rim: stone, not blue
  });
});

describe('Tempest light', () => {
  const emitting = (): Array<[string, number]> => ids.filter((id) => registry.emission(id) > 0).map((id) => [shortName(id), registry.emission(id)]);

  it('gives off exactly the light the table says', () => {
    expect(emitting()).toEqual([
      ['shoji_pane_lit', 8], ['paper_lantern_red', 14], ['paper_lantern_striped', 14], ['stone_lantern_light', 12],
      ['blue_ore_lamp', 15], ['green_ore_lamp', 13], ['hearth', 8],
    ]);
  });

  it('keeps emission in 0..15, lightDim in 0..15, and only see-through blocks dim', () => {
    for (const id of ids) {
      const def = defOf(id);
      expect(def.emits).toBeGreaterThanOrEqual(0);
      expect(def.emits).toBeLessThanOrEqual(15);
      expect(registry.lightDim(id)).toBeGreaterThanOrEqual(0);
      expect(registry.lightDim(id)).toBeLessThanOrEqual(15);
      if (registry.lightDim(id) > 0) expect(def.opaque, def.name).toBe(false);
    }
  });

  it('lets light through paper and cloth at a cost, and through nothing else at more than a block', () => {
    for (const name of ['shoji_pane', 'shoji_pane_lit', 'bamboo_blind']) expect(registry.lightDim(idOf(name)), name).toBe(2);
    for (const name of ['awning_red', 'awning_indigo']) expect(registry.lightDim(idOf(name)), name).toBe(3);
    const dimmed = ids.filter((id) => registry.lightDim(id) > 0).map(shortName);
    expect(dimmed.sort()).toEqual(['awning_indigo', 'awning_red', 'bamboo_blind', 'shoji_pane', 'shoji_pane_lit'].sort());
  });

  it('stops light only where a block is a solid wall: cubes, stairs, slabs and the tatami', () => {
    const stoppers = ids.filter((id) => registry.isOpaque(id)).map(shortName);
    for (const name of ['plaster_white', 'terracotta_roof', 'terracotta_roof_stairs', 'terracotta_roof_slab', 'stone_paving', 'tatami', 'bookshelf', 'crate', 'blue_ore_lamp']) {
      expect(stoppers.includes(name), name).toBe(true);
    }
    for (const name of ['paper_lantern_red', 'shoji_pane', 'bamboo_fence', 'water_jet', 'barrel', 'noren_red', 'awning_red', 'terracotta_ridge', 'stone_basin']) {
      expect(stoppers.includes(name), name).toBe(false);
    }
  });
});

describe('Tempest shapes', () => {
  it('cut the roofs, plaster and moss into stairs and slabs, and hang the windows and rails on the joining models', () => {
    for (const roof of ['terracotta', 'dark_tile', 'green_tile', 'teal', 'thatch']) {
      expect(registry.model(idOf(`${roof}_roof`)).isFullCube, roof).toBe(true);
      expect(registry.model(idOf(`${roof}_roof_stairs`)), roof).toBeInstanceOf(StairModel);
      expect(registry.model(idOf(`${roof}_roof_slab`)), roof).toBeInstanceOf(SlabModel);
      // The slab and the stairs wear the same tile as the block they are cut from.
      expect(defOf(idOf(`${roof}_roof_stairs`)).faces).toEqual(defOf(idOf(`${roof}_roof`)).faces);
      expect(defOf(idOf(`${roof}_roof_slab`)).faces).toEqual(defOf(idOf(`${roof}_roof`)).faces);
    }
    expect(registry.model(idOf('plaster_stairs'))).toBeInstanceOf(StairModel);
    expect(registry.model(idOf('mossy_stone_slab'))).toBeInstanceOf(SlabModel);
    expect(registry.model(idOf('mossy_stone_stairs'))).toBeInstanceOf(StairModel);
    expect(registry.model(idOf('stone_curb'))).toBeInstanceOf(SlabModel);
    for (const name of ['vermilion_rail', 'bamboo_fence']) expect(registry.model(idOf(name)), name).toBeInstanceOf(FenceModel);
    for (const name of ['shoji_pane', 'shoji_pane_lit', 'lattice_window', 'bamboo_blind']) expect(registry.model(idOf(name)), name).toBeInstanceOf(PaneModel);
  });

  it('draw the ridge caps, awnings, curtains, signs and washing as turning boxes, and the koi as a plate on water', () => {
    for (const name of ['terracotta_ridge', 'terracotta_ridge_horn', 'dark_ridge', 'dark_ridge_horn', 'signboard', 'noren_indigo', 'noren_red', 'noren_white', 'awning_red', 'awning_indigo', 'laundry_pole']) {
      expect(registry.model(idOf(name)), name).toBeInstanceOf(OrientedBoxModel);
    }
    expect(registry.model(TempestBlock.KOI_POND)).toBeInstanceOf(PlateModel);
    expect(defOf(TempestBlock.KOI_POND).holdsWater).toBe(true);
    expect(ids.filter((id) => defOf(id).holdsWater)).toEqual([TempestBlock.KOI_POND]);
  });

  it('keep every model inside its cell, give solid ones something to bump into and walk-through ones nothing', () => {
    const NON_SOLID = new Set(['stepping_stones', 'koi_pond', 'water_jet', 'signboard', 'noren_indigo', 'noren_red', 'noren_white', 'laundry_pole']);
    for (const id of ids) {
      const def = defOf(id);
      const model = registry.model(id);
      expect(registry.isSolid(id), def.name).toBe(!NON_SOLID.has(shortName(id)));
      if (model.isFullCube) continue;
      for (let state = 0; state < (model instanceof OrientedBoxModel ? 4 : model instanceof StairModel ? 8 : 2); state++) {
        const quads = model.quads(state);
        expect(quads.length, `${def.name} s${state}`).toBeGreaterThan(0);
        // Fences stand 1.5 high for collision but are drawn in the cell; the koi plate lies a hair above its water.
        const b = quadBounds(quads);
        for (let a = 0; a < 3; a++) {
          expect(b.min[a], `${def.name} s${state}`).toBeGreaterThanOrEqual(-1e-4);
          expect(b.max[a], `${def.name} s${state}`).toBeLessThanOrEqual(1.07);
        }
        for (const box of model.collisionBoxes(state)) {
          const [x0, y0, z0, x1, y1, z1] = box as Box;
          expect(x1 - x0, def.name).toBeGreaterThan(0);
          expect(y1 - y0, def.name).toBeGreaterThan(0);
          expect(z1 - z0, def.name).toBeGreaterThan(0);
        }
      }
    }
  });

  it('turns the horn of a ridge with the block: east at state 0, south at 1, west at 2, north at 3', () => {
    for (const name of ['terracotta_ridge_horn', 'dark_ridge_horn']) {
      const model = registry.model(idOf(name));
      const tip = (state: number): [number, number] => {
        const top = model.collisionBoxes(state).reduce((a, b) => (b[4] > a[4] ? b : a));
        return [(top[0] + top[3]) / 2, (top[2] + top[5]) / 2];
      };
      expect(tip(0)[0], name).toBeGreaterThan(0.8);
      expect(tip(1)[1], name).toBeGreaterThan(0.8);
      expect(tip(2)[0], name).toBeLessThan(0.2);
      expect(tip(3)[1], name).toBeLessThan(0.2);
      // The horn rises above the cap of a plain ridge.
      const plain = registry.model(idOf(name.replace('_horn', '')));
      const high = (m: typeof model) => Math.max(...m.collisionBoxes(0).map((b) => b[4]));
      expect(high(model), name).toBeGreaterThan(high(plain) + 0.3);
    }
  });

  it('puts the high end of an awning against the wall: north at state 0, east at 1, south at 2, west at 3', () => {
    for (const name of ['awning_red', 'awning_indigo']) {
      const model = registry.model(idOf(name));
      const high = (state: number): [number, number] => {
        const top = model.collisionBoxes(state).reduce((a, b) => (b[4] > a[4] ? b : a));
        return [(top[0] + top[3]) / 2, (top[2] + top[5]) / 2];
      };
      expect(high(0)[1], name).toBeLessThan(0.2);
      expect(high(1)[0], name).toBeGreaterThan(0.8);
      expect(high(2)[1], name).toBeGreaterThan(0.8);
      expect(high(3)[0], name).toBeLessThan(0.2);
    }
  });

  it('stacks a stone lantern from three blocks that agree about where they stand, only the middle one lit', () => {
    const parts = ['stone_lantern_base', 'stone_lantern_light', 'stone_lantern_cap'].map(idOf);
    expect(parts.map((id) => registry.emission(id))).toEqual([0, 12, 0]);
    for (const id of parts) {
      const b = quadBounds(registry.model(id).quads(0));
      // Centred on the cell, so the stack is one pillar.
      expect((b.min[0] + b.max[0]) / 2).toBeCloseTo(0.5, 3);
      expect((b.min[2] + b.max[2]) / 2).toBeCloseTo(0.5, 3);
    }
    // The foot of each part meets the top of the one below: both are about as wide there, and the base starts on the ground.
    const base = quadBounds(registry.model(parts[0]).quads(0));
    expect(base.min[1]).toBe(0);
    const light = registry.model(parts[1]).collisionBoxes(0);
    const footOfLight = light.find((b) => b[1] === 0)!;
    const seatOfBase = registry.model(parts[0]).collisionBoxes(0).find((b) => b[4] === 1)!;
    expect(footOfLight[3] - footOfLight[0]).toBeGreaterThanOrEqual(seatOfBase[3] - seatOfBase[0]);
  });

  it('sets the water of a basin below its rim, so it reads as held, and gives the pillar and jet no collision where it would trap', () => {
    const basin = registry.model(TempestBlock.STONE_BASIN);
    const boxes = basin.collisionBoxes(0);
    const rim = Math.max(...boxes.map((b) => b[4]));
    const water = boxes.find((b) => b[0] === 2 / 16 && b[3] === 14 / 16 && b[2] === 2 / 16)!;
    expect(water[4]).toBeLessThan(rim);
    expect(rim).toBeLessThan(1);
    expect(registry.isSolid(TempestBlock.WATER_JET)).toBe(false);
    expect(registry.isOpaque(TempestBlock.STONE_BASIN)).toBe(false);
  });

  it('makes the tatami a low mat that covers the cell (a floor), and the engawa a full block with a dark side', () => {
    const tatami = registry.model(TempestBlock.TATAMI);
    const [box] = tatami.collisionBoxes(0);
    expect(box).toEqual([0, 0, 0, 1, 4 / 16, 1]);
    expect(tatami.occludesFace(0, 3)).toBe(true); // its base
    expect(tatami.occludesFace(0, 2)).toBe(false); // not its top: it is a mat
    expect(defOf(TempestBlock.ENGAWA_FLOOR).faces).toEqual({ top: 'engawa_floor', bottom: 'timber_beam', side: 'timber_beam' });
  });
});
