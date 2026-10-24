import { BlockRegistry } from '../../engine/BlockRegistry';
import { AIR_CELL, cellId, cellState } from '../../engine/cell';
import { Blueprint } from '../../worldgen/structures/Blueprint';
import { StylePack } from '../../worldgen/structures/StylePack';
import { LandmarkRegistry } from '../../worldgen/tempest/landmarks';
import { LANDMARK_SEED, LandmarkSpec, buildLandmark, frameSize } from '../../worldgen/tempest/landmarks/LandmarkSpec';
import { KIT_WORLD_X, KIT_WORLD_Z, KitSky, kitLook } from './kitsLayout';
import { CameraPose, FrameBox, SandboxLabel, Stage, StageBlock } from './sandboxLayout';

// The pure half of ?sandbox=landmarks, the viewer the landmarks are judged in. It builds one landmark with its own
// builder, on flat ground, and hands the blocks to the same mesher, materials and baked light as the game, with the game's
// noon, dusk and night. Three.js and React stay in LandmarkSandbox.tsx, so all of this runs in the tests.
//
//   ?sandbox=landmarks&landmark=civic-compound     which one (default central-square); the ids are the layout's
//   ?sandbox=landmarks&sky=noon|dusk|night         the sky preset (default noon); lanterns and lit screens are on after dark
//   ?sandbox=landmarks&view=iso|front|back|side|top|eye    camera presets (default iso); &az= &el= &zoom= &fov= adjust them
//   ?sandbox=landmarks&cam=px,py,pz,tx,ty,tz       an explicit camera in the blueprint's own coordinates (y 1 is the top of the ground)
//   ?sandbox=landmarks&maxY=14&minZ=20 ...         a cutaway: only the cells inside the given limits (maxY, minX, maxX, minZ, maxZ)
//   ?sandbox=landmarks&seed=7                      the generator seed (default the town's)
//
// The blueprint is shown in its own frame (front towards the south for most, the world frame for the long ones), the corner
// of the footprint at 0, 0, which is also where the camera coordinates start.

export type LandmarkView = 'iso' | 'front' | 'back' | 'top' | 'eye' | 'side';

export interface Cutaway {
  maxY: number | null;
  minX: number | null;
  maxX: number | null;
  minZ: number | null;
  maxZ: number | null;
}

export interface LandmarkSandboxOptions {
  landmark: string;
  sky: KitSky;
  seed: number;
  view: LandmarkView;
  az: number | null;
  el: number | null;
  zoom: number | null;
  fov: number | null;
  cam: CameraPose | null;
  cut: Cutaway;
}

const num = (v: string | null): number | null => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

export const parseLandmarkSandbox = (search: string): LandmarkSandboxOptions | null => {
  const params = new URLSearchParams(search);
  if (params.get('sandbox') !== 'landmarks') return null;
  const sky = params.get('sky');
  const view = params.get('view');
  const fov = num(params.get('fov'));
  const zoom = num(params.get('zoom'));
  let cam: CameraPose | null = null;
  const camParam = params.get('cam');
  if (camParam) {
    const n = camParam.split(',').map(Number);
    if (n.length === 6 && n.every(Number.isFinite)) cam = { position: [n[0], n[1], n[2]], target: [n[3], n[4], n[5]] };
  }
  const seed = num(params.get('seed'));
  return {
    landmark: params.get('landmark') || 'central-square',
    sky: sky === 'dusk' || sky === 'night' ? sky : 'noon',
    seed: seed !== null && Number.isInteger(seed) && seed >= 0 && seed <= 0x7fffffff ? seed : LANDMARK_SEED,
    view: view === 'front' || view === 'back' || view === 'top' || view === 'eye' || view === 'side' ? view : 'iso',
    az: num(params.get('az')),
    el: num(params.get('el')),
    zoom: zoom !== null && zoom >= 0.3 && zoom <= 5 ? zoom : null,
    fov: fov !== null && fov >= 20 && fov <= 110 ? fov : null,
    cam,
    cut: {
      maxY: num(params.get('maxY')), minX: num(params.get('minX')), maxX: num(params.get('maxX')),
      minZ: num(params.get('minZ')), maxZ: num(params.get('maxZ')),
    },
  };
};

/** Air round the landmark on every side, as grass. */
const MARGIN = 22;
/** How deep the ground goes under the blueprint, so rock and foundations that reach below the ground row sit in dirt. */
const DEPTH = 12;

export interface LandmarkStage {
  stages: Stage[];
  labels: SandboxLabel[];
  count: number;
  width: number;
  depth: number;
  height: number;
  spec: LandmarkSpec;
  blueprint: Blueprint;
}

/** True when a cell survives the cutaway. */
export const inCut = (cut: Cutaway, x: number, y: number, z: number): boolean =>
  (cut.maxY === null || y <= cut.maxY) && (cut.minX === null || x >= cut.minX) && (cut.maxX === null || x <= cut.maxX)
  && (cut.minZ === null || z >= cut.minZ) && (cut.maxZ === null || z <= cut.maxZ);

/**
 * Builds the landmark the options name and stands it on grass. The stage is placed where Tempest is in the world, so the
 * grass wears its colour, and shifted so that the blueprint's 0, 0 is the display origin.
 */
export const buildLandmarkStage = (blocks: BlockRegistry, landmarks: LandmarkRegistry, style: StylePack, options: LandmarkSandboxOptions): LandmarkStage => {
  const spec = landmarks.get(options.landmark);
  if (!spec) throw new Error(`No landmark called ${options.landmark}`);
  const blueprint = buildLandmark(spec, style, options.seed);
  const { frontage, depth } = frameSize(spec);
  const id = (name: string): number => blocks.byName(`voxelverse:${name}`).id;
  const grass = id('grass');
  const dirt = id('dirt');
  const cells = new Map<string, StageBlock>();
  const put = (x: number, y: number, z: number, blockId: number, state = 0): void => {
    cells.set(`${x},${y},${z}`, { id: blockId, x: KIT_WORLD_X + MARGIN + x, y, z: KIT_WORLD_Z + MARGIN + z, state });
  };
  for (let x = -MARGIN; x < frontage + MARGIN; x++) {
    for (let z = -MARGIN; z < depth + MARGIN; z++) {
      for (let y = -DEPTH; y < 0; y++) put(x, y, z, dirt);
      put(x, 0, z, grass);
    }
  }
  // A landmark over water has its river dug under it: the bed and the water, so the arch stands over something.
  if (spec.river) {
    const water = id('water');
    for (let x = spec.river.x0; x <= spec.river.x1; x++) {
      for (let z = -MARGIN; z < depth + MARGIN; z++) {
        for (let y = spec.river.bed + 1; y <= 0; y++) {
          if (y <= spec.river.surface) put(x, y, z, water);
          else cells.delete(`${x},${y},${z}`);
        }
      }
    }
  }
  let maxY = 6;
  blueprint.forEach((x, y, z, cell) => {
    if (!inCut(options.cut, x, y, z)) return;
    const bid = cellId(cell);
    if (cell === AIR_CELL || bid === 0) {
      cells.delete(`${x},${y},${z}`);
      return;
    }
    put(x, y, z, bid, cellState(cell));
    if (y + 2 > maxY) maxY = y + 2;
  });
  return {
    stages: [{ blocks: [...cells.values()], shiftX: -KIT_WORLD_X - MARGIN, shiftZ: -KIT_WORLD_Z - MARGIN }],
    labels: [],
    count: blueprint.size,
    width: frontage,
    depth,
    height: maxY,
    spec,
    blueprint,
  };
};

// --- Cameras --------------------------------------------------------------------------------------------------------

const VIEWS: Record<Exclude<LandmarkView, 'eye'>, { azimuth: number; elevation: number }> = {
  iso: { azimuth: 28, elevation: 32 },
  front: { azimuth: 0, elevation: 14 },
  back: { azimuth: 180, elevation: 24 },
  side: { azimuth: 78, elevation: 18 },
  top: { azimuth: 0, elevation: 78 },
};

export interface LandmarkFrame extends FrameBox {
  focused: boolean;
  cam: CameraPose | null;
}

/** How the page should frame the stage: a preset swing for the default camera, or an explicit pose. */
export const landmarkFrame = (stage: LandmarkStage, options: LandmarkSandboxOptions): LandmarkFrame => {
  const base = { width: stage.width, depth: stage.depth, height: stage.height, focused: true };
  if (options.cam) return { ...base, cam: options.cam };
  if (options.view === 'eye') {
    // In the street in front of the middle of the front, at eye height, looking at the building.
    const cx = stage.width / 2;
    return { ...base, cam: { position: [cx, 2.6, stage.depth + 14], target: [cx, Math.min(stage.height * 0.4, 8), stage.depth * 0.5] } };
  }
  const preset = VIEWS[options.view];
  return {
    ...base,
    zoom: options.zoom ?? 1.25,
    azimuth: options.az ?? preset.azimuth,
    elevation: options.el ?? preset.elevation,
    cam: null,
  };
};

export const landmarkLook = (sky: KitSky) => kitLook(sky);
