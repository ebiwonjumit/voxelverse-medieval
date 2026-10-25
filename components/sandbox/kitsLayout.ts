import { BlockRegistry } from '../../engine/BlockRegistry';
import { cellId, cellState } from '../../engine/cell';
import { computeSky, hoursToTime, parseAtmosphere, PRESET_HOURS } from '../../render/SkySystem';
import { getZone } from '../../zones';
import { MILE } from '../../worldConstants';
import type { SandboxLook } from './SandboxView';
import { BuildingKit, buildWithKit } from '../../worldgen/structures/BuildingKit';
import { Blueprint } from '../../worldgen/structures/Blueprint';
import { KitRegistry } from '../../worldgen/structures/KitRegistry';
import { Lot } from '../../worldgen/structures/Lot';
import { StylePack } from '../../worldgen/structures/StylePack';
import { CameraPose, FrameBox, SandboxLabel, Stage, StageBlock } from './sandboxLayout';

// The pure half of ?sandbox=kits, the viewer everyone judges buildings in. It builds kits for lots of their own preferred
// size on flat ground, puts them in a row, and hands the blocks to the same mesher, materials and baked light the game
// uses. Three.js and React stay in KitSandbox.tsx, so all of this runs in the tests.
//
//   ?sandbox=kits                         the demonstration set: every kit marked as a demo, one row
//   ?sandbox=kits&kit=timber-house        one kit (its first variant)
//   ?sandbox=kits&kit=timber-house&variant=2
//   ?sandbox=kits&row=timber-house        every variant of a kit side by side
//   ?sandbox=kits&sky=noon|dusk|night     the sky preset (default noon)
//   ?sandbox=kits&family=plaster-dark     force a palette family (default: the lot's own pick)
//   ?sandbox=kits&seed=7&w=13&d=11&floors=2&facing=2   the lot: seed, footprint, storeys, which way the front faces
//   ?sandbox=kits&view=iso|front|back|top|eye|side     camera preset (default iso); &az= &el= swing it by hand
//   ?sandbox=kits&zoom=1.6                              nearer or further than the fitted preset
//   ?sandbox=kits&cam=px,py,pz,tx,ty,tz&fov=60         explicit camera

export type KitSky = 'noon' | 'dusk' | 'night';
export type KitView = 'iso' | 'front' | 'back' | 'top' | 'eye' | 'side';

export interface KitSandboxOptions {
  kit: string | null;
  variant: number;
  row: string | null;
  sky: KitSky;
  family: string | null;
  seed: number;
  /** Footprint overrides; null uses the kit's preferred size. */
  w: number | null;
  d: number | null;
  floors: number | null;
  facing: 0 | 1 | 2 | 3;
  view: KitView;
  az: number | null;
  el: number | null;
  cam: CameraPose | null;
  fov: number | null;
  /** How much nearer than the fit the preset cameras stand (default 1.25). */
  zoom: number | null;
}

const num = (v: string | null): number | null => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

export const parseKitSandbox = (search: string): KitSandboxOptions | null => {
  const params = new URLSearchParams(search);
  if (params.get('sandbox') !== 'kits') return null;
  const sky = params.get('sky');
  const view = params.get('view');
  const facing = num(params.get('facing'));
  const fov = num(params.get('fov'));
  let cam: CameraPose | null = null;
  const camParam = params.get('cam');
  if (camParam) {
    const n = camParam.split(',').map(Number);
    if (n.length === 6 && n.every(Number.isFinite)) cam = { position: [n[0], n[1], n[2]], target: [n[3], n[4], n[5]] };
  }
  const int = (v: string | null, lo: number, hi: number): number | null => {
    const n = num(v);
    return n !== null && Number.isInteger(n) && n >= lo && n <= hi ? n : null;
  };
  return {
    kit: params.get('kit') || null,
    variant: int(params.get('variant'), 0, 99) ?? 0,
    row: params.get('row') || null,
    sky: sky === 'dusk' || sky === 'night' ? sky : 'noon',
    family: params.get('family') || null,
    seed: int(params.get('seed'), 0, 0x7fffffff) ?? 1,
    w: int(params.get('w'), 3, 80),
    d: int(params.get('d'), 3, 80),
    floors: int(params.get('floors'), 1, 3),
    facing: (facing !== null && facing >= 0 && facing <= 3 && Number.isInteger(facing) ? facing : 2) as 0 | 1 | 2 | 3,
    view: view === 'front' || view === 'back' || view === 'top' || view === 'eye' || view === 'side' ? view : 'iso',
    az: num(params.get('az')),
    el: num(params.get('el')),
    cam,
    fov: fov !== null && fov >= 20 && fov <= 110 ? fov : null,
    zoom: (() => { const z = num(params.get('zoom')); return z !== null && z >= 0.3 && z <= 5 ? z : null; })(),
  };
};

/** Where the stage stands in the world, so the grass wears Tempest's colour: a whole number of chunks. */
export const KIT_WORLD_X = 1488;
export const KIT_WORLD_Z = -16;
/** Air round the buildings on every side, as grass, and the street's width in front. */
const MARGIN = 26;
const GAP = 8;
const STREET = 4;

export interface KitStage {
  stages: Stage[];
  labels: SandboxLabel[];
  count: number;
  width: number;
  depth: number;
  height: number;
  /** The lots shown, left to right, with where each stands in display coordinates. */
  shown: Array<{ kit: string; variant: number; x: number; z: number; w: number; d: number; hash: number; blocks: number }>;
}

interface KitPick { kit: BuildingKit; variant: number }

/** Which kits and variants the options ask for. The default is the demonstration set (see `demo`). */
export const pickKits = (registry: KitRegistry, options: Pick<KitSandboxOptions, 'kit' | 'row' | 'variant'>, demo: readonly string[]): KitPick[] => {
  if (options.row) {
    const kit = registry.get(options.row);
    if (!kit) throw new Error(`No kit called ${options.row}`);
    return Array.from({ length: kit.variants }, (_, variant) => ({ kit, variant }));
  }
  if (options.kit) {
    const kit = registry.get(options.kit);
    if (!kit) throw new Error(`No kit called ${options.kit}`);
    return [{ kit, variant: Math.min(options.variant, kit.variants - 1) }];
  }
  return demo.map((name) => {
    const kit = registry.get(name);
    if (!kit) throw new Error(`No kit called ${name}`);
    return { kit, variant: 0 };
  });
};

/**
 * Builds the picked kits on flat ground. Each gets a lot of its own preferred size (or the size in the options) facing
 * the options' way, is built the standard way (Lot, kit, style) and placed along the row; the ground is grass with a
 * paved street along the fronts. Everything is placed through the registry by name.
 */
export const buildKitStage = (
  blocks: BlockRegistry, kits: KitRegistry, style: StylePack, options: KitSandboxOptions, demo: readonly string[],
): KitStage => {
  const picks = pickKits(kits, options, demo);
  const id = (name: string): number => blocks.byName(`voxelverse:${name}`).id;
  const grass = id('grass');
  const dirt = id('dirt');
  const paving = id('stone_paving');
  const curb = id('stone_curb');
  const water = id('water');
  const treeBlocks = {
    sakura: { log: id('sakura_log'), leaves: id('sakura_leaves') },
    cedar: { log: id('cedar_log'), leaves: id('cedar_leaves') },
    bamboo: { log: id('bamboo'), leaves: id('bamboo_leaves') },
  };
  const cells = new Map<string, StageBlock>();
  const put = (x: number, y: number, z: number, blockId: number, state = 0): void => {
    cells.set(`${x},${y},${z}`, { id: blockId, x: KIT_WORLD_X + x, y, z: KIT_WORLD_Z + z, state });
  };

  // Lay the lots out along x with the fronts on one street. Facing 2 (south) is the default: the lots stand in a row.
  const entries: Array<{ pick: KitPick; lot: Lot; blueprint: Blueprint; x: number }> = [];
  let cursor = MARGIN;
  let maxDepth = 0;
  let maxHeight = 6;
  const horizontal = options.facing === 0 || options.facing === 2;
  for (const pick of picks) {
    const size = pick.kit.preferredSize(pick.variant);
    // The overrides are in the kit's frame (frontage and depth); the lot's world size follows the facing.
    const frontage = options.w ?? size.frontage;
    const depth = options.d ?? size.depth;
    const lot = new Lot({
      id: `${pick.kit.name}.${pick.variant}`,
      x: 0, z: 0,
      w: horizontal ? frontage : depth,
      d: horizontal ? depth : frontage,
      facing: options.facing,
      district: 'residential',
      seed: options.seed,
      floors: options.floors ?? size.floors,
      family: options.family ?? undefined,
    });
    const blueprint = buildWithKit(pick.kit, lot, style, pick.variant);
    entries.push({ pick, lot, blueprint, x: cursor });
    // The row runs along world x and the street along it: a lot's world width and depth, whichever way it faces.
    cursor += lot.w + GAP;
    maxDepth = Math.max(maxDepth, lot.d);
    maxHeight = Math.max(maxHeight, (blueprint.bounds()?.maxY ?? 0) + 2);
  }
  const lotsEnd = cursor - GAP;
  const width = lotsEnd + MARGIN;
  const z0 = MARGIN;
  const frontZ = z0 + maxDepth;
  const depthTotal = frontZ + STREET + MARGIN;

  // Ground: grass over dirt, the street in front of the lots with a curb on its far side.
  for (let x = 0; x < width; x++) {
    for (let z = 0; z < depthTotal; z++) {
      put(x, -1, z, dirt);
      put(x, 0, z, grass);
    }
  }
  for (let x = 0; x < width; x++) {
    for (let z = frontZ; z < frontZ + STREET; z++) put(x, 0, z, paving);
    put(x, 1, frontZ + STREET, curb);
  }

  const shown: KitStage['shown'] = [];
  const labels: SandboxLabel[] = [];
  for (const e of entries) {
    // Facing south, the lots stand on the street line whatever their depth; turned ones stand in a plain row.
    const placed = new Lot({
      id: e.lot.id, x: e.x, z: options.facing === 2 ? frontZ - e.lot.d : z0, w: e.lot.w, d: e.lot.d, facing: options.facing,
      district: 'residential', seed: options.seed, floors: e.lot.floors, family: options.family ?? undefined, groundY: 0,
    });
    if (e.pick.kit.name === 'river-bridge') carveRiver(put, water, width, depthTotal, frontZ, placed);
    const placement = placed.place(e.blueprint);
    placement.stamp((x, y, z, cell) => {
      // The stage has no ground below its dirt: a bridge's foundations are not drawn.
      if (y < -1) return;
      const bid = cellId(cell);
      if (bid === 0) {
        // A carved cell is air: it clears the ground if the building dug into it.
        cells.delete(`${x},${y},${z}`);
        return;
      }
      put(x, y, z, bid, cellState(cell));
    });
    // The zone grows trees at the tree markers with its own features; the viewer stands a small tree of the species there.
    for (const m of placement.markers()) if (m.kind === 'tree') plantStandIn(put, treeBlocks, m.x, m.y, m.z, m.tag ?? 'any');
    shown.push({
      kit: e.pick.kit.name, variant: e.pick.variant, x: e.x - MARGIN, z: placed.z - z0, w: placed.w, d: placed.d,
      hash: e.blueprint.hash(), blocks: e.blueprint.size,
    });
    labels.push({
      text: e.pick.kit.name, sub: e.pick.kit.variants > 1 ? `variant ${e.pick.variant}` : undefined, heading: true,
      x: e.x - MARGIN + placed.w / 2, z: frontZ - z0 + STREET + 0.5,
    });
  }
  return {
    // The stage is carried so the first lot's north west corner lands on 0, 0, which is where the camera frames from.
    stages: [{ blocks: [...cells.values()], shiftX: -KIT_WORLD_X - MARGIN, shiftZ: -KIT_WORLD_Z - z0 }],
    labels,
    count: cells.size,
    width: lotsEnd - MARGIN,
    depth: maxDepth + 1,
    height: maxHeight,
    shown,
  };
};

type PutBlock = (x: number, y: number, z: number, blockId: number, state?: number) => void;
type TreeBlocks = Record<'sakura' | 'cedar' | 'bamboo', { log: number; leaves: number }>;

/** A small stand-in tree at a marker: a trunk with a round crown (sakura), a stack of discs (cedar) or a stand of canes (bamboo). */
const plantStandIn = (put: PutBlock, blocks: TreeBlocks, x: number, y: number, z: number, tag: string): void => {
  const species = tag === 'cedar' || tag === 'sakura' || tag === 'bamboo' ? tag : ((x * 7 + z * 13) & 1) === 0 ? 'sakura' : 'cedar';
  const { log, leaves } = blocks[species];
  const n = (x * 73856093 ^ z * 19349663) >>> 0;
  if (species === 'bamboo') {
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1]]) for (let k = 0; k < 4 + ((n >> (dx + dz)) & 1); k++) put(x + dx, y + k, z + dz, log);
    return;
  }
  const h = (species === 'sakura' ? 4 : 6) + (n % 2);
  for (let k = 0; k < h; k++) put(x, y + k, z, log);
  const disc = (cy: number, r: number): void => {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dz * dz > r * r + 1) continue;
      if (dx === 0 && dz === 0 && cy < y + h) continue;
      put(x + dx, cy, z + dz, leaves);
    }
  };
  if (species === 'sakura') {
    disc(y + h - 1, 2); disc(y + h, 2); disc(y + h + 1, 2); disc(y + h + 2, 1);
  } else {
    const radii = [2, 2, 2, 1, 1, 0];
    radii.forEach((r, k) => disc(y + h - 4 + k, r));
  }
};

/** A river across the stage under a bridge lot: water in the ground row between the abutments, running the stage's width. */
const carveRiver = (put: PutBlock, water: number, width: number, depthTotal: number, frontZ: number, lot: Lot): void => {
  const span = lot.facing === 0 || lot.facing === 2;
  const from = (span ? lot.z : lot.x) + 3;
  const to = (span ? lot.z + lot.d : lot.x + lot.w) - 4;
  if (span) {
    for (let z = from; z <= to && z < frontZ; z++) for (let x = 0; x < width; x++) put(x, 0, z, water);
  } else {
    for (let x = from; x <= to; x++) for (let z = 0; z < depthTotal; z++) put(x, 0, z, water);
  }
};

// --- Cameras --------------------------------------------------------------------------------------------------

/** Azimuth and elevation, in degrees, for each preset. 0 looks at the south side from the south. */
const VIEWS: Record<Exclude<KitView, 'eye'>, { azimuth: number; elevation: number }> = {
  iso: { azimuth: 28, elevation: 32 },
  front: { azimuth: 0, elevation: 14 },
  back: { azimuth: 180, elevation: 24 },
  side: { azimuth: 78, elevation: 18 },
  top: { azimuth: 0, elevation: 78 },
};

export interface KitFrame extends FrameBox {
  focused: boolean;
  cam: CameraPose | null;
  fov: number | undefined;
}

/** How the page should frame the stage for the options: a preset swing for the default camera, or an explicit pose. */
export const kitFrame = (stage: KitStage, options: KitSandboxOptions): KitFrame => {
  if (options.cam) return { width: stage.width, depth: stage.depth, height: stage.height, focused: true, cam: options.cam, fov: options.fov ?? undefined };
  if (options.view === 'eye') {
    // Standing in the street in front of the first building, looking along it at eye height.
    const first = stage.shown[0];
    const cx = first ? first.x + first.w / 2 : stage.width / 2;
    return {
      width: stage.width, depth: stage.depth, height: stage.height, focused: true, fov: options.fov ?? 62,
      cam: { position: [cx - 4, 2.7, stage.depth + 6], target: [cx + 1, 3.4, stage.depth - 8] },
    };
  }
  const preset = VIEWS[options.view];
  return {
    width: stage.width,
    depth: stage.depth,
    height: stage.height,
    focused: true,
    zoom: options.zoom ?? 1.25,
    azimuth: options.az ?? preset.azimuth,
    elevation: options.el ?? preset.elevation,
    cam: null,
    fov: options.fov ?? undefined,
  };
};

// --- Light ----------------------------------------------------------------------------------------------------

const hex = (c: [number, number, number]): string =>
  `#${c.map((v) => Math.round(Math.min(Math.max(v, 0), 1) * 255).toString(16).padStart(2, '0')).join('')}`;

/** The hour each viewer sky stops the game's clock at (render/SkySystem.ts PRESET_HOURS: noon, dusk and night). */
export const KIT_SKY_HOURS: Record<KitSky, number> = { noon: PRESET_HOURS.noon, dusk: PRESET_HOURS.dusk, night: PRESET_HOURS.night };

/**
 * The light of a sky preset, taken from the game's own sky model inside Tempest's atmosphere: the daylight and sky light
 * colour the chunk shader gets, and the colour behind the scene. Block light is always baked in, so lanterns and lit
 * screens are on in every sky and only seen at dusk and night.
 */
export const kitLook = (sky: KitSky): SandboxLook => {
  const zone = getZone(3 * MILE, 0);
  const state = computeSky(hoursToTime(KIT_SKY_HOURS[sky]), parseAtmosphere(zone.getAtmosphere()));
  const mixc = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] =>
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const lum = state.daylight;
  return {
    daylight: state.daylight,
    skyLight: state.skyLight,
    lit: true,
    background: hex(mixc(state.zenith, state.horizon, 0.45)),
    floor: hex([0.18 + 0.2 * lum, 0.3 + 0.28 * lum, 0.14 + 0.1 * lum]),
    ambient: 0.1 + 0.6 * lum,
    sun: 0.1 + 0.9 * lum,
    grid: false,
  };
};
