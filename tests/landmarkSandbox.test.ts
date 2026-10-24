import { describe, expect, it } from 'vitest';
import { parseKitSandbox } from '../components/sandbox/kitsLayout';
import {
  buildLandmarkStage, inCut, landmarkFrame, landmarkLook, parseLandmarkSandbox,
} from '../components/sandbox/landmarksLayout';
import { meshStage, parseSandbox } from '../components/sandbox/sandboxLayout';
import { createDefaultRegistry } from '../content/blocks';
import { createDefaultTextureLayout } from '../content/textures/layout';
import { meshTriangleCount } from '../meshing/ChunkMesher';
import { buildLandmark, createTempestLandmarks } from '../worldgen/tempest/landmarks';
import { LANDMARK_SEED } from '../worldgen/tempest/landmarks/LandmarkSpec';
import { TEMPEST_STYLE } from '../worldgen/tempest/style';

const registry = createDefaultRegistry();
const textureLayout = createDefaultTextureLayout(registry);
const landmarks = createTempestLandmarks();
const options = (search: string) => parseLandmarkSandbox(search)!;

describe('parseLandmarkSandbox', () => {
  it('is selected by sandbox=landmarks and nothing else', () => {
    expect(parseLandmarkSandbox('')).toBeNull();
    expect(parseLandmarkSandbox('?sandbox=kits')).toBeNull();
    expect(parseKitSandbox('?sandbox=landmarks')).toBeNull();
    expect(parseSandbox('?sandbox=landmarks')).toBeNull();
    expect(parseLandmarkSandbox('?sandbox=landmarks')).toMatchObject({ landmark: 'central-square', sky: 'noon', seed: LANDMARK_SEED, view: 'iso', cam: null });
  });

  it('reads the landmark, sky, view, camera, cutaway and seed, and ignores nonsense', () => {
    const o = options('?sandbox=landmarks&landmark=arena&sky=dusk&view=front&az=30&el=12&zoom=1.5&fov=55&seed=7&maxY=9&minZ=4');
    expect(o).toMatchObject({ landmark: 'arena', sky: 'dusk', view: 'front', az: 30, el: 12, zoom: 1.5, fov: 55, seed: 7 });
    expect(o.cut).toMatchObject({ maxY: 9, minZ: 4, minX: null, maxX: null, maxZ: null });
    expect(options('?sandbox=landmarks&sky=moon').sky).toBe('noon');
    expect(options('?sandbox=landmarks&view=up').view).toBe('iso');
    expect(options('?sandbox=landmarks&zoom=40').zoom).toBeNull();
    expect(options('?sandbox=landmarks&seed=-4').seed).toBe(LANDMARK_SEED);
    expect(options('?sandbox=landmarks&cam=1,2,3,4,5,6').cam).toEqual({ position: [1, 2, 3], target: [4, 5, 6] });
    expect(options('?sandbox=landmarks&cam=1,2,3').cam).toBeNull();
  });
});

describe('the landmark viewer stage', () => {
  it('shows landmarks through real blocks on grass: a hall, the arena, a gate, the rock face, a free piece and the room gallery', () => {
    for (const id of ['civic-compound', 'arena', 'west-gate', 'north-cave', 'bell-tower', 'interior-gallery']) {
      const spec = landmarks.get(id)!;
      const stage = buildLandmarkStage(registry, landmarks, TEMPEST_STYLE, options(`?sandbox=landmarks&landmark=${spec.id}`));
      expect(stage.count, spec.id).toBeGreaterThan(100);
      expect(stage.blueprint.hash(), spec.id).toBe(buildLandmark(spec).hash());
      for (const blk of stage.stages[0].blocks) expect(registry.has(blk.id), `${spec.id} ${blk.id}`).toBe(true);
    }
    expect(() => buildLandmarkStage(registry, landmarks, TEMPEST_STYLE, options('?sandbox=landmarks&landmark=nothing'))).toThrow();
  });

  it('is the same every time, and the seed changes the details', () => {
    const a = buildLandmarkStage(registry, landmarks, TEMPEST_STYLE, options('?sandbox=landmarks&landmark=south-cairn'));
    const b = buildLandmarkStage(registry, landmarks, TEMPEST_STYLE, options('?sandbox=landmarks&landmark=south-cairn'));
    const c = buildLandmarkStage(registry, landmarks, TEMPEST_STYLE, options('?sandbox=landmarks&landmark=south-cairn&seed=5'));
    expect(a.stages[0].blocks).toEqual(b.stages[0].blocks);
    expect(c.blueprint.hash()).not.toBe(a.blueprint.hash());
  });

  it('cuts a landmark away with maxY, minX and the like, so its rooms can be seen', () => {
    expect(inCut({ maxY: 5, minX: null, maxX: null, minZ: null, maxZ: null }, 0, 6, 0)).toBe(false);
    expect(inCut({ maxY: 5, minX: 2, maxX: null, minZ: null, maxZ: 9 }, 2, 5, 9)).toBe(true);
    const whole = buildLandmarkStage(registry, landmarks, TEMPEST_STYLE, options('?sandbox=landmarks&landmark=town-hall'));
    const cut = buildLandmarkStage(registry, landmarks, TEMPEST_STYLE, options('?sandbox=landmarks&landmark=town-hall&maxY=6'));
    expect(cut.stages[0].blocks.length).toBeLessThan(whole.stages[0].blocks.length);
    expect(cut.height).toBeLessThan(whole.height);
  });

  it('meshes through the real mesher with block light baked in', () => {
    const stage = buildLandmarkStage(registry, landmarks, TEMPEST_STYLE, options('?sandbox=landmarks&landmark=west-gate'));
    const lit = meshStage(stage.stages[0], registry, textureLayout, true);
    expect(lit.reduce((n, m) => n + meshTriangleCount(m.mesh), 0)).toBeGreaterThan(3000);
  });

  it('frames the stage: a preset swing, an eye-level pose in front of it, or the explicit one', () => {
    const stage = buildLandmarkStage(registry, landmarks, TEMPEST_STYLE, options('?sandbox=landmarks&landmark=west-gate'));
    const iso = landmarkFrame(stage, options('?sandbox=landmarks'));
    expect(iso.cam).toBeNull();
    expect(iso.azimuth).toBe(28);
    expect(landmarkFrame(stage, options('?sandbox=landmarks&view=top')).elevation).toBeGreaterThan(70);
    expect(landmarkFrame(stage, options('?sandbox=landmarks&view=back')).azimuth).toBe(180);
    const eye = landmarkFrame(stage, options('?sandbox=landmarks&view=eye'));
    expect(eye.cam!.position[1]).toBeLessThan(4);
    expect(eye.cam!.position[2]).toBeGreaterThan(stage.depth);
    const explicit = landmarkFrame(stage, options('?sandbox=landmarks&cam=1,2,3,4,5,6'));
    expect(explicit.cam).toEqual({ position: [1, 2, 3], target: [4, 5, 6] });
  });

  it('takes the game\'s own sky: bright at noon, darker at dusk and night', () => {
    expect(landmarkLook('noon').daylight).toBe(1);
    expect(landmarkLook('dusk').daylight).toBeLessThan(1);
    expect(landmarkLook('night').daylight).toBeLessThan(landmarkLook('dusk').daylight);
  });
});
