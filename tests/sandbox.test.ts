import { describe, expect, it } from 'vitest';
import {
  CLOSE_FOCUS, SLOT_SPACING_X, SLOT_SPACING_Z, columnsFor, defaultCamera, layoutBlocks, meshStage, parseSandbox, shortName,
} from '../components/sandbox/sandboxLayout';
import { createDefaultRegistry } from '../content/blocks';
import { createDefaultTextureLayout } from '../content/textures/layout';
import { BIOME_ZONES, grassTint } from '../meshing/biomeTint';
import { hexToLinear } from '../meshing/color';

const registry = createDefaultRegistry();
const textureLayout = createDefaultTextureLayout(registry);

describe('parseSandbox', () => {
  it('is selected by sandbox=blocks and nothing else', () => {
    expect(parseSandbox('')).toBeNull();
    expect(parseSandbox('?bench')).toBeNull();
    expect(parseSandbox('?sandbox=items')).toBeNull();
    expect(parseSandbox('?shot=0,10,300,0,0')).toBeNull();
    expect(parseSandbox('?sandbox=blocks')).toEqual({ focus: null, cam: null });
  });

  it('reads the close view, a focus list and an explicit camera', () => {
    expect(parseSandbox('?sandbox=blocks&view=close')?.focus).toEqual(CLOSE_FOCUS);
    expect(parseSandbox('?sandbox=blocks&focus=marble, gold_block')?.focus).toEqual(['marble', 'gold_block']);
    expect(parseSandbox('?sandbox=blocks&cam=1,2,3,4,5,6')?.cam).toEqual({ position: [1, 2, 3], target: [4, 5, 6] });
    expect(parseSandbox('?sandbox=blocks&cam=1,2,3')?.cam).toBeNull();
    expect(parseSandbox('?sandbox=blocks&cam=1,2,x,4,5,6')?.cam).toBeNull();
  });
});

describe('layoutBlocks', () => {
  const layout = layoutBlocks(registry);
  const real = registry.all().filter((d) => d.id !== 0);

  it('gives every registered block except air its own cell, in id order', () => {
    expect(layout.slots.map((s) => s.id)).toEqual(real.map((d) => d.id));
    const cells = new Set(layout.slots.map((s) => `${s.x},${s.z}`));
    expect(cells.size).toBe(real.length);
    for (const s of layout.slots) {
      expect(s.x % SLOT_SPACING_X).toBe(0);
      expect(s.z % SLOT_SPACING_Z).toBe(0);
    }
  });

  it('is wider than tall and labels every block', () => {
    expect(layout.cols).toBe(columnsFor(real.length));
    expect(layout.cols).toBeGreaterThan(layout.rows);
    for (const def of real) {
      expect(layout.labels.some((l) => l.text === shortName(def) && l.sub === `#${def.id}`)).toBe(true);
    }
  });

  it('keeps the biome rows under the grid, one grass and one leaves cube per zone', () => {
    const zoneStages = layout.stages.slice(1);
    expect(zoneStages).toHaveLength(BIOME_ZONES.length);
    const gridEnd = layout.rows * SLOT_SPACING_Z;
    for (const stage of zoneStages) {
      expect(stage.blocks.map((b) => registry.get(b.id).name)).toEqual(['voxelverse:grass', 'voxelverse:leaves']);
      for (const b of stage.blocks) expect(b.z + stage.shiftZ).toBeGreaterThanOrEqual(gridEnd);
    }
    expect(layout.depth).toBeGreaterThan(gridEnd);
  });

  it('shows blocks that no catalog tile covers, since the layout falls back to flat tiles', () => {
    const extended = createDefaultRegistry();
    extended.register({ id: 90, name: 'test:untextured', color: '#336699', solid: true, opaque: true, emits: 0 });
    const l = layoutBlocks(extended);
    expect(l.slots.some((s) => s.id === 90 && s.name === 'untextured')).toBe(true);
    const flat = createDefaultTextureLayout(extended);
    const stage = { blocks: [{ id: 90, x: 0, y: 0, z: 0 }], shiftX: 0, shiftZ: 0 };
    const [{ mesh }] = meshStage(stage, extended, flat);
    expect(flat.layerNames[mesh.opaque.layers[0]]).toBe('flat:#336699');
    expect(mesh.opaque.indices.length).toBe(36);
  });

  it('shows only the focused blocks, in the order asked, with no biome rows', () => {
    const focused = layoutBlocks(registry, ['marble', 'grass', 'nothing_like_this']);
    expect(focused.slots.map((s) => s.name)).toEqual(['marble', 'grass']);
    expect(focused.stages).toHaveLength(1);
    expect(focused.rows).toBe(1);
    // A longer list wraps into rows of four, so the close view stays close.
    const eight = layoutBlocks(registry, CLOSE_FOCUS);
    expect(eight.cols).toBe(4);
    expect(eight.rows).toBe(2);
  });
});

describe('meshStage', () => {
  it('meshes the whole grid with one textured cube per block', () => {
    const layout = layoutBlocks(registry);
    const meshes = layout.stages.flatMap((stage) => meshStage(stage, registry, textureLayout));
    const names = new Set<string>();
    for (const { mesh } of meshes) {
      for (const bucket of [mesh.opaque, mesh.cutout, mesh.water]) {
        for (let i = 0; i < bucket.layers.length; i += 2) names.add(textureLayout.layerNames[bucket.layers[i]]);
      }
    }
    // Real tiles, not just the flat fallbacks (the magenta tile would mean an unknown block).
    expect(names.has('grass_top')).toBe(true);
    expect(names.has('stone_brick')).toBe(true);
    expect(names.has('flat:#ff00ff')).toBe(false);
  });

  it('puts each zone block under that zone\'s own grass colour', () => {
    const layout = layoutBlocks(registry);
    BIOME_ZONES.forEach((zone, i) => {
      const [{ mesh, offsetX, offsetZ }] = meshStage(layout.stages[i + 1], registry, textureLayout);
      const expected = [0, 0, 0];
      hexToLinear(zone.hex, expected);
      const top = mesh.opaque.tints.subarray(0, 3);
      // Close to the pure zone colour; the other zones are 1500 or more blocks away.
      for (let c = 0; c < 3; c++) expect(top[c]).toBeCloseTo(expected[c], 1);
      expect(Number.isFinite(offsetX + offsetZ)).toBe(true);
    });
    // And those colours differ from one another, which is the point of the row.
    const tints = BIOME_ZONES.map((z) => {
      const out = [0, 0, 0];
      grassTint(z.x, z.z, out);
      return out.map((v) => v.toFixed(2)).join();
    });
    expect(new Set(tints).size).toBe(BIOME_ZONES.length);
  });

  it('draws the grass side with its tint overlay layer', () => {
    const layout = layoutBlocks(registry);
    const [{ mesh }] = meshStage(layout.stages[1], registry, textureLayout);
    const overlays = [];
    for (let i = 1; i < mesh.opaque.layers.length; i += 2) overlays.push(mesh.opaque.layers[i]);
    expect(overlays.some((o) => o >= 0)).toBe(true);
  });
});

describe('defaultCamera', () => {
  it('backs off for a wider layout and for a narrower window', () => {
    const small = layoutBlocks(registry, CLOSE_FOCUS);
    const big = layoutBlocks(registry);
    const dist = (p: { position: number[]; target: number[] }) =>
      Math.hypot(...p.position.map((v, i) => v - p.target[i]));
    expect(dist(defaultCamera(big, 1.6, false))).toBeGreaterThan(dist(defaultCamera(small, 1.6, true)));
    expect(dist(defaultCamera(big, 0.8, false))).toBeGreaterThan(dist(defaultCamera(big, 1.6, false)));
  });

  it('looks at the middle of the layout from the front and above', () => {
    const layout = layoutBlocks(registry);
    const pose = defaultCamera(layout, 1.6, false);
    expect(pose.target[0]).toBeCloseTo(layout.width / 2);
    expect(pose.position[0]).toBeCloseTo(pose.target[0]);
    expect(pose.position[1]).toBeGreaterThan(pose.target[1]);
    expect(pose.position[2]).toBeGreaterThan(pose.target[2]);
  });
});
