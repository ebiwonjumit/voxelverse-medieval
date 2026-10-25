import { describe, expect, it } from 'vitest';
import { STREET_DEPTH, STREET_WIDTH, buildTempestStreet } from '../components/sandbox/tempestScene';
import {
  TEMPEST_COLS, TEMPEST_FOCUS, layoutBlocks, meshStage, parseSandbox, shortName,
} from '../components/sandbox/sandboxLayout';
import { createDefaultRegistry } from '../content/blocks';
import { tempestBlockIds } from '../content/blocksTempest';
import { createDefaultTextureLayout } from '../content/textures/layout';
import { stairState } from '../engine/models';

const registry = createDefaultRegistry();
const textureLayout = createDefaultTextureLayout(registry);
const street = buildTempestStreet(registry);
const idOf = (name: string) => registry.byName(`voxelverse:${name}`).id;
const at = new Map(street.blocks.map((b) => [`${b.x - street.worldX},${b.y},${b.z - street.worldZ}`, b]));
const nameAt = (x: number, y: number, z: number): string | null => {
  const b = at.get(`${x},${y},${z}`);
  return b ? registry.get(b.id).name.replace('voxelverse:', '') : null;
};

describe('the Tempest street', () => {
  it('is built the same way every time, from blocks that all exist, in states a cell can hold', () => {
    const again = buildTempestStreet(registry);
    expect(again.blocks).toEqual(street.blocks);
    for (const b of street.blocks) {
      expect(registry.has(b.id), `${b.id}`).toBe(true);
      expect(b.state ?? 0).toBeGreaterThanOrEqual(0);
      expect(b.state ?? 0).toBeLessThanOrEqual(15);
    }
    const keys = new Set(street.blocks.map((b) => `${b.x},${b.y},${b.z}`));
    expect(keys.size).toBe(street.blocks.length);
  });

  it('stays inside its own footprint and height, with the ground at y 0', () => {
    for (const b of street.blocks) {
      expect(b.x - street.worldX).toBeGreaterThanOrEqual(0);
      expect(b.x - street.worldX).toBeLessThan(STREET_WIDTH);
      expect(b.z - street.worldZ).toBeGreaterThanOrEqual(0);
      expect(b.z - street.worldZ).toBeLessThan(STREET_DEPTH);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeLessThan(street.height);
    }
  });

  it('uses all five roofs, both ridge caps with their horns, and the lights, screens, cloth and props of the set', () => {
    const used = new Set(street.blocks.map((b) => registry.get(b.id).name.replace('voxelverse:', '')));
    for (const name of [
      'terracotta_roof', 'terracotta_roof_stairs', 'dark_tile_roof_stairs', 'green_tile_roof_slab', 'teal_roof_stairs',
      'thatch_roof_stairs', 'terracotta_ridge', 'terracotta_ridge_horn', 'dark_ridge_horn', 'shoji_pane', 'shoji_pane_lit',
      'lattice_window', 'bamboo_blind', 'paper_lantern_red', 'paper_lantern_striped', 'stone_lantern_base', 'stone_lantern_light',
      'stone_lantern_cap', 'noren_indigo', 'noren_red', 'noren_white', 'awning_red', 'awning_indigo', 'laundry_pole',
      'stone_paving', 'fan_paving', 'stone_curb', 'stone_basin', 'water_jet', 'stone_bollard', 'koi_pond', 'stepping_stones',
      'mossy_stone_stairs', 'barrel', 'crate', 'rice_bale', 'vase', 'bucket', 'low_table', 'signboard', 'white_column',
      'vermilion_rail', 'vermilion_log', 'engawa_floor', 'bamboo_pole', 'bamboo_fence', 'sakura_leaves',
    ]) {
      expect(used.has(name), name).toBe(true);
    }
    expect(tempestBlockIds().filter((id) => street.blocks.some((b) => b.id === id)).length).toBeGreaterThan(55);
  });

  it('climbs every stair of the shop roof towards the ridge: the south slope faces north, the north slope south', () => {
    // Walls z 4..10, roof from y 7: the south eave is at z 11 and the north at z 3, the ridge over z 7.
    for (let k = 0; k < 4; k++) {
      expect(at.get(`6,${7 + k},${11 - k}`)?.state, `south k=${k}`).toBe(stairState(0));
      expect(at.get(`6,${7 + k},${3 + k}`)?.state, `north k=${k}`).toBe(stairState(2));
      expect(nameAt(6, 7 + k, 11 - k)).toBe('terracotta_roof_stairs');
    }
    expect(nameAt(6, 10, 7)).toBe('terracotta_roof');
    expect(nameAt(6, 11, 7)).toBe('terracotta_ridge');
    // Horns at both ends, turned to point out: east at state 0, west at state 2.
    expect(nameAt(12, 11, 7)).toBe('terracotta_ridge_horn');
    expect(at.get('12,11,7')?.state).toBe(0);
    expect(nameAt(1, 11, 7)).toBe('terracotta_ridge_horn');
    expect(at.get('1,11,7')?.state).toBe(2);
  });

  it('closes the gable ends under the roof, so no sky shows through the triangle', () => {
    for (const x of [2, 11]) {
      for (const [z, wallTop] of [[5, 7], [6, 8], [7, 9]] as const) {
        for (let y = 7; y < wallTop; y++) expect(nameAt(x, y, z), `${x},${y},${z}`).toBe('plaster_timber');
      }
    }
  });

  it('turns the teal hip roof on all four sides, with corners of full blocks', () => {
    const facings = new Set<number>();
    for (const b of street.blocks) {
      if (registry.get(b.id).name === 'voxelverse:teal_roof_stairs') facings.add((b.state ?? 0) & 3);
    }
    expect([...facings].sort()).toEqual([0, 1, 2, 3]);
    expect(nameAt(12, 7, 1)).toBe('teal_roof');
    expect(nameAt(23, 7, 9)).toBe('teal_roof');
  });

  it('puts the fountain in the middle of the plaza, on an island in a ring of water', () => {
    expect(nameAt(17, 1, 15)).toBe('stone_basin');
    expect(nameAt(17, 2, 15)).toBe('water_jet');
    expect(nameAt(17, 0, 15)).toBe('stone_paving');
    for (const [x, z] of [[16, 15], [18, 15], [17, 14], [17, 16]]) expect(nameAt(x, 0, z)).toBe('water');
  });

  it('hangs the curtains and awnings of the shop in the door and over it, turned to the street', () => {
    expect(nameAt(6, 2, 10)).toBe('noren_indigo');
    expect(nameAt(3, 3, 11)).toBe('awning_red');
    // The wall is to the north of the shop awnings and to the south of the inn's.
    expect(at.get('3,3,11')?.state).toBe(0);
    expect(at.get('7,3,21')?.state).toBe(2);
  });
});

describe('the sandbox views of the Tempest set', () => {
  it('reads view=tempest, the night shot, the camera angle and the street, and nothing else changes', () => {
    const tempest = parseSandbox('?sandbox=blocks&view=tempest');
    expect(tempest?.focus).toEqual(TEMPEST_FOCUS);
    expect(tempest?.cols).toBe(TEMPEST_COLS);
    expect(parseSandbox('?sandbox=blocks&view=tempest&cols=6')?.cols).toBe(6);
    expect(parseSandbox('?sandbox=blocks&view=tempest&night=1')?.night).toBe(true);
    expect(parseSandbox('?sandbox=blocks&sky=night')?.night).toBe(true);
    expect(parseSandbox('?sandbox=blocks&night=0')).toEqual({ focus: null, cam: null });
    expect(parseSandbox('?sandbox=blocks&view=street')?.scene).toBe('street');
    expect(parseSandbox('?sandbox=blocks&fov=60')?.fov).toBe(60);
    expect(parseSandbox('?sandbox=blocks&fov=5')?.fov).toBeUndefined();
    expect(parseSandbox('?sandbox=blocks&fov=x')?.fov).toBeUndefined();
  });

  it('lists the whole Tempest set, in id order, nine to a row', () => {
    expect(TEMPEST_FOCUS).toHaveLength(72);
    const layout = layoutBlocks(registry, TEMPEST_FOCUS, TEMPEST_COLS);
    expect(layout.slots.map((s) => s.id)).toEqual(tempestBlockIds());
    expect(layout.cols).toBe(9);
    expect(layout.rows).toBe(8);
    for (const s of layout.slots) expect(s.name).toBe(shortName(registry.get(s.id)));
  });
});

describe('meshing the street', () => {
  const stage = { blocks: street.blocks, shiftX: -street.worldX, shiftZ: -street.worldZ };

  it('draws every block from a real tile, and a lot of them', () => {
    const names = new Set<string>();
    let faces = 0;
    for (const { mesh } of meshStage(stage, registry, textureLayout)) {
      for (const bucket of [mesh.opaque, mesh.cutout, mesh.water]) {
        faces += bucket.indices.length / 6;
        for (let i = 0; i < bucket.layers.length; i += 2) names.add(textureLayout.layerNames[bucket.layers[i]]);
      }
    }
    expect(faces).toBeGreaterThan(8000);
    for (const tile of ['terracotta_roof', 'teal_roof', 'dark_tile_roof', 'green_tile_roof', 'thatch_roof', 'shoji_lit', 'fan_paving', 'noren_indigo', 'awning_red']) {
      expect(names.has(tile), tile).toBe(true);
    }
    expect([...names].filter((n) => n.startsWith('flat:'))).toEqual([]);
  });

  it('bakes the block light of the lanterns in when asked (the night view), and none when not', () => {
    const lightMax = (lit: boolean): number => {
      let best = 0;
      for (const { mesh } of meshStage(stage, registry, textureLayout, lit)) {
        for (const bucket of [mesh.opaque, mesh.cutout]) {
          for (let i = 1; i < bucket.light.length; i += 4) best = Math.max(best, bucket.light[i]);
        }
      }
      return best;
    };
    expect(lightMax(false)).toBe(0);
    expect(lightMax(true)).toBeGreaterThan(0.9);
  });

  it('lights the street under a lantern, and not the far end of it', () => {
    const near = { x: 4, z: 12 }; // under the red lanterns of the shop
    const far = { x: 36, z: 16 };
    const sample = (p: { x: number; z: number }): number => {
      let best = 0;
      for (const { mesh, offsetX, offsetZ } of meshStage(stage, registry, textureLayout, true)) {
        for (const bucket of [mesh.opaque]) {
          for (let v = 0; v < bucket.positions.length / 3; v++) {
            const x = bucket.positions[v * 3] + offsetX + street.worldX;
            const y = bucket.positions[v * 3 + 1];
            const z = bucket.positions[v * 3 + 2] + offsetZ + street.worldZ;
            if (Math.abs(x - street.worldX - p.x) < 0.6 && Math.abs(z - street.worldZ - p.z) < 0.6 && Math.abs(y - 1) < 0.01) {
              best = Math.max(best, bucket.light[v * 4 + 1]);
            }
          }
        }
      }
      return best;
    };
    expect(sample(near)).toBeGreaterThan(sample(far));
    expect(idOf('paper_lantern_red')).toBeGreaterThan(0);
  });
});
