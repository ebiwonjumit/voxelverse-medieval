import { describe, expect, it } from 'vitest';
import { defaultCamera, meshStage, parseSandbox } from '../components/sandbox/sandboxLayout';
import { parseModelSandbox } from '../components/sandbox/modelsLayout';
import {
  KIT_WORLD_X, KIT_WORLD_Z, buildKitStage, kitFrame, kitLook, parseKitSandbox, pickKits,
} from '../components/sandbox/kitsLayout';
import { DEMO_KITS } from '../components/sandbox/KitSandbox';
import { createDefaultRegistry } from '../content/blocks';
import { createDefaultTextureLayout } from '../content/textures/layout';
import { meshTriangleCount } from '../meshing/ChunkMesher';
import { createTempestKits } from '../worldgen/tempest/kits';
import { TEMPEST_STYLE } from '../worldgen/tempest/style';

const registry = createDefaultRegistry();
const textureLayout = createDefaultTextureLayout(registry);
const kits = createTempestKits();
const options = (search: string) => parseKitSandbox(search)!;

describe('parseKitSandbox', () => {
  it('is selected by sandbox=kits and nothing else', () => {
    expect(parseKitSandbox('')).toBeNull();
    expect(parseKitSandbox('?sandbox=blocks')).toBeNull();
    expect(parseKitSandbox('?sandbox=models')).toBeNull();
    expect(parseSandbox('?sandbox=kits')).toBeNull();
    expect(parseModelSandbox('?sandbox=kits')).toBeNull();
    expect(parseKitSandbox('?sandbox=kits')).toMatchObject({ kit: null, row: null, sky: 'noon', variant: 0, facing: 2, view: 'iso', cam: null });
  });

  it('reads the kit, variant, row, sky, family, lot, view and camera, and ignores nonsense', () => {
    const o = options('?sandbox=kits&kit=timber-house&variant=2&sky=dusk&family=plaster-dark&seed=7&w=15&d=13&floors=2&facing=1&view=front&az=30&el=12&zoom=1.5&fov=55');
    expect(o).toMatchObject({ kit: 'timber-house', variant: 2, sky: 'dusk', family: 'plaster-dark', seed: 7, w: 15, d: 13, floors: 2, facing: 1, view: 'front', az: 30, el: 12, zoom: 1.5, fov: 55 });
    expect(options('?sandbox=kits&row=gate').row).toBe('gate');
    expect(options('?sandbox=kits&sky=night').sky).toBe('night');
    expect(options('?sandbox=kits&sky=moon').sky).toBe('noon');
    expect(options('?sandbox=kits&view=up').view).toBe('iso');
    expect(options('?sandbox=kits&facing=7').facing).toBe(2);
    expect(options('?sandbox=kits&floors=9').floors).toBeNull();
    expect(options('?sandbox=kits&fov=500').fov).toBeNull();
    expect(options('?sandbox=kits&cam=1,2,3,4,5,6').cam).toEqual({ position: [1, 2, 3], target: [4, 5, 6] });
    expect(options('?sandbox=kits&cam=1,2,3').cam).toBeNull();
  });
});

describe('the kit viewer stage', () => {
  it('picks the demonstration set by default, one kit by name, and a row of variants', () => {
    expect(pickKits(kits, options('?sandbox=kits'), DEMO_KITS).map((p) => p.kit.name)).toEqual([...DEMO_KITS]);
    expect(pickKits(kits, options('?sandbox=kits&kit=gate&variant=1'), DEMO_KITS).map((p) => [p.kit.name, p.variant])).toEqual([['gate', 1]]);
    expect(pickKits(kits, options('?sandbox=kits&kit=gate&variant=9'), DEMO_KITS)[0].variant).toBe(kits.get('gate')!.variants - 1);
    const row = pickKits(kits, options('?sandbox=kits&row=timber-house'), DEMO_KITS);
    expect(row.map((p) => p.variant)).toEqual([0, 1, 2]);
    expect(() => pickKits(kits, options('?sandbox=kits&kit=nothing'), DEMO_KITS)).toThrow();
  });

  it('shows every demonstration kit through real blocks, on flat ground, the same every time', () => {
    const a = buildKitStage(registry, kits, TEMPEST_STYLE, options('?sandbox=kits'), DEMO_KITS);
    const b = buildKitStage(registry, kits, TEMPEST_STYLE, options('?sandbox=kits'), DEMO_KITS);
    expect(a.stages[0].blocks).toEqual(b.stages[0].blocks);
    expect(a.shown.map((s) => s.kit)).toEqual([...DEMO_KITS]);
    expect(new Set(a.shown.map((s) => s.hash)).size).toBe(DEMO_KITS.length);
    for (const blk of a.stages[0].blocks) expect(registry.has(blk.id), `${blk.id}`).toBe(true);
    // The stage stands on Tempest's own ground so the grass wears its tint.
    expect(a.stages[0].blocks.every((blk) => blk.x >= KIT_WORLD_X && blk.z >= KIT_WORLD_Z)).toBe(true);
    // Ground: grass at y = 0 everywhere a kit does not cover it, dirt under it.
    const grass = registry.byName('voxelverse:grass').id;
    const at = new Map(a.stages[0].blocks.map((blk) => [`${blk.x},${blk.y},${blk.z}`, blk.id]));
    expect(at.get(`${KIT_WORLD_X + 1},0,${KIT_WORLD_Z + 1}`)).toBe(grass);
    expect(a.labels.length).toBe(DEMO_KITS.length);
    // Lots sit side by side along the street with a gap, left to right.
    for (let i = 1; i < a.shown.length; i++) expect(a.shown[i].x).toBeGreaterThanOrEqual(a.shown[i - 1].x + a.shown[i - 1].w);
  });

  it('honours the lot options: footprint, storeys, facing, family and seed change the building', () => {
    const base = buildKitStage(registry, kits, TEMPEST_STYLE, options('?sandbox=kits&kit=box-house&family=timber-terracotta'), DEMO_KITS);
    const bigger = buildKitStage(registry, kits, TEMPEST_STYLE, options('?sandbox=kits&kit=box-house&family=timber-terracotta&w=21&d=17'), DEMO_KITS);
    const taller = buildKitStage(registry, kits, TEMPEST_STYLE, options('?sandbox=kits&kit=box-house&family=timber-terracotta&floors=3'), DEMO_KITS);
    const green = buildKitStage(registry, kits, TEMPEST_STYLE, options('?sandbox=kits&kit=box-house&family=half-timber-green'), DEMO_KITS);
    expect(bigger.width).toBeGreaterThan(base.width);
    expect(taller.height).toBeGreaterThan(base.height);
    expect(green.shown[0].hash).not.toBe(base.shown[0].hash);
    for (const facing of ['0', '1', '3']) {
      const turned = buildKitStage(registry, kits, TEMPEST_STYLE, options(`?sandbox=kits&kit=timber-house&family=timber-terracotta&facing=${facing}`), DEMO_KITS);
      expect(turned.count).toBeGreaterThan(1000);
    }
  });

  it('meshes through the real mesher with block light baked in, and lanterns give light at night', () => {
    const stage = buildKitStage(registry, kits, TEMPEST_STYLE, options('?sandbox=kits&kit=timber-house'), DEMO_KITS);
    const lit = meshStage(stage.stages[0], registry, textureLayout, true);
    const flat = meshStage(stage.stages[0], registry, textureLayout, false);
    expect(lit.length).toBeGreaterThan(0);
    expect(lit.reduce((n, m) => n + meshTriangleCount(m.mesh), 0)).toBeGreaterThan(5000);
    expect(lit.reduce((n, m) => n + meshTriangleCount(m.mesh), 0)).toBe(flat.reduce((n, m) => n + meshTriangleCount(m.mesh), 0));
  });

  it('frames the stage: a preset swing for the default camera, an eye-level pose, or the explicit one', () => {
    const stage = buildKitStage(registry, kits, TEMPEST_STYLE, options('?sandbox=kits&kit=timber-house'), DEMO_KITS);
    const iso = kitFrame(stage, options('?sandbox=kits&kit=timber-house'));
    expect(iso.cam).toBeNull();
    expect(iso.azimuth).toBe(28);
    expect(iso.elevation).toBe(32);
    expect(kitFrame(stage, options('?sandbox=kits&view=top')).elevation).toBeGreaterThan(70);
    expect(kitFrame(stage, options('?sandbox=kits&view=back')).azimuth).toBe(180);
    expect(kitFrame(stage, options('?sandbox=kits&az=5&el=40')).azimuth).toBe(5);
    const eye = kitFrame(stage, options('?sandbox=kits&view=eye'));
    expect(eye.cam!.position[1]).toBeLessThan(4);
    expect(eye.fov).toBe(62);
    const explicit = kitFrame(stage, options('?sandbox=kits&cam=1,2,3,4,5,6&fov=40'));
    expect(explicit.cam).toEqual({ position: [1, 2, 3], target: [4, 5, 6] });
    expect(explicit.fov).toBe(40);
    // The fitted camera looks at the buildings from a sensible distance.
    const pose = defaultCamera(iso, 1.6, true);
    const d = Math.hypot(pose.position[0] - pose.target[0], pose.position[1] - pose.target[1], pose.position[2] - pose.target[2]);
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(120);
  });

  it('takes the light of the game\'s own sky: bright at noon, low and warm at dusk, dark with moonlight at night', () => {
    const noon = kitLook('noon');
    const dusk = kitLook('dusk');
    const night = kitLook('night');
    expect(noon.daylight).toBe(1);
    expect(dusk.daylight).toBeLessThan(noon.daylight);
    expect(dusk.daylight).toBeGreaterThan(night.daylight);
    expect(night.daylight).toBeGreaterThan(0);
    expect(dusk.skyLight[0]).toBeGreaterThanOrEqual(dusk.skyLight[2]);
    expect(night.skyLight[2]).toBeGreaterThan(night.skyLight[0]);
    for (const look of [noon, dusk, night]) {
      expect(look.lit).toBe(true);
      expect(look.background).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
