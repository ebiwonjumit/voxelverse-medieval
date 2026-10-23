import { BlockDef, BlockRegistry } from '../../engine/BlockRegistry';
import { Cell, packCell } from '../../engine/cell';
import { CHUNK_SIZE } from '../../engine/coords';
import { TextureLayout } from '../../engine/TextureLayout';
import { CellReader } from '../../meshing/CellReader';
import { MeshData, meshChunk } from '../../meshing/ChunkMesher';
import { BIOME_ZONES } from '../../meshing/biomeTint';

// The pure half of the ?sandbox=blocks page: which block goes where, which blocks to mesh together and where
// the camera starts. Three.js and React stay in BlockSandbox.tsx, so all of this runs in the tests.
//
// The sandbox draws through the real mesher, texture array and materials, so a block looks here exactly as it
// does in the world. Cubes sit on a grid two blocks apart, in registry order, so blocks other branches add
// show up without touching this file.

/** Blocks shown by ?sandbox=blocks&view=close: a few materials worth a close look. */
export const CLOSE_FOCUS = ['grass', 'wood_plank', 'stone_brick', 'wood_log', 'cobblestone', 'red_brick', 'marble', 'gold_block'];

/** Distance between neighbouring cubes, in blocks. Labels are wide, so the gaps are wider than the cubes. */
export const SLOT_SPACING_X = 3;
export const SLOT_SPACING_Z = 3;

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

export interface SandboxOptions {
  /** Short block names to show on their own, closer. Null shows every block plus the biome rows. */
  focus: string[] | null;
  /** Explicit camera from ?cam=px,py,pz,tx,ty,tz, or null for the framed default. */
  cam: CameraPose | null;
}

/** Reads the page's query string. Returns null unless it says sandbox=blocks, so nothing else selects the page. */
export const parseSandbox = (search: string): SandboxOptions | null => {
  const params = new URLSearchParams(search);
  if (params.get('sandbox') !== 'blocks') return null;

  const focusParam = params.get('focus');
  const focus = focusParam
    ? focusParam.split(',').map((s) => s.trim()).filter(Boolean)
    : params.get('view') === 'close' ? CLOSE_FOCUS : null;

  let cam: CameraPose | null = null;
  const camParam = params.get('cam');
  if (camParam) {
    const n = camParam.split(',').map(Number);
    if (n.length === 6 && n.every(Number.isFinite)) {
      cam = { position: [n[0], n[1], n[2]], target: [n[3], n[4], n[5]] };
    }
  }
  return { focus: focus && focus.length > 0 ? focus : null, cam };
};

/** "voxelverse:wood_plank" shown as "wood_plank". */
export const shortName = (def: BlockDef): string => def.name.slice(def.name.indexOf(':') + 1);

/** How far in front of a cube's back edge its label is anchored. */
const LABEL_Z = 1.4;

export interface BlockSlot {
  id: number;
  name: string;
  /** The block's cell. The cube fills x..x+1, 0..1, z..z+1. */
  x: number;
  z: number;
}

export interface SandboxLabel {
  text: string;
  /** Second, dimmer line (the block id, or what the cube shows). */
  sub?: string;
  /** A section title rather than a caption: drawn larger. */
  heading?: boolean;
  /** Where the label is anchored, in display coordinates. */
  x: number;
  z: number;
}

/** One placed block. `state` is the 4-bit cell state (a stair's facing, a slab's half), 0 when left out. */
export interface StageBlock {
  id: number;
  x: number;
  y: number;
  z: number;
  state?: number;
}

/**
 * A group of blocks meshed together. `blocks` are in the coordinates the mesher sees, which is what picks the
 * biome tint (it follows the world position). `shiftX` and `shiftZ` carry the result to where the cubes are
 * shown, so a grass block meshed at the centre of a zone can be shown next to the plain blocks.
 */
export interface Stage {
  blocks: StageBlock[];
  shiftX: number;
  shiftZ: number;
}

export interface SandboxLayout {
  slots: BlockSlot[];
  labels: SandboxLabel[];
  stages: Stage[];
  /** Display bounds of everything on the stage, in blocks: x and z from 0. */
  width: number;
  depth: number;
  cols: number;
  rows: number;
}

/** Columns for n cubes, wide rather than tall: about twice as many columns as rows. */
export const columnsFor = (n: number): number => Math.max(1, Math.ceil(Math.sqrt(n * 2.1)));

/**
 * Lays the blocks out on the grid in id order, and, unless it is a focused view, adds two rows under it: the
 * grass block and the oak leaves under each zone's biome tint. Air is skipped.
 */
export const layoutBlocks = (registry: BlockRegistry, focus: string[] | null = null): SandboxLayout => {
  let defs = registry.all().filter((def) => def.id !== 0);
  if (focus) {
    const wanted = new Set(focus);
    defs = defs.filter((def) => wanted.has(shortName(def)));
    // Keep the order the caller gave, so a focused view reads the way it was asked for.
    defs.sort((a, b) => focus.indexOf(shortName(a)) - focus.indexOf(shortName(b)));
  }

  const cols = focus ? Math.max(1, Math.min(4, defs.length)) : columnsFor(defs.length);
  const rows = Math.max(1, Math.ceil(defs.length / cols));
  const slots: BlockSlot[] = [];
  const labels: SandboxLabel[] = [];
  const grid: Stage = { blocks: [], shiftX: 0, shiftZ: 0 };

  defs.forEach((def, i) => {
    const x = (i % cols) * SLOT_SPACING_X;
    const z = Math.floor(i / cols) * SLOT_SPACING_Z;
    slots.push({ id: def.id, name: shortName(def), x, z });
    grid.blocks.push({ id: def.id, x, y: 0, z });
    labels.push({ text: shortName(def), sub: `#${def.id}`, x: x + 0.5, z: z + LABEL_Z });
  });

  const stages: Stage[] = [grid];
  let depth = (rows - 1) * SLOT_SPACING_Z + 1;
  const width = Math.max((cols - 1) * SLOT_SPACING_X + 1, focus ? 0 : (BIOME_ZONES.length - 1) * SLOT_SPACING_X + 1);

  const grass = registry.all().find((def) => shortName(def) === 'grass')?.id ?? -1;
  const leaves = registry.all().find((def) => def.tint === 'foliage')?.id ?? -1;
  if (!focus && grass >= 0) {
    // The mesher tints by world position, so each zone's pair is meshed on the zone's own centre, where its
    // colour is all but pure, then moved into the row.
    const rowX = Math.max(0, Math.floor(((cols - BIOME_ZONES.length) * SLOT_SPACING_X) / 2));
    const grassZ = rows * SLOT_SPACING_Z + 1;
    const leavesZ = grassZ + SLOT_SPACING_Z;
    BIOME_ZONES.forEach((zone, i) => {
      const x = rowX + i * SLOT_SPACING_X;
      const bx = Math.round(zone.x);
      const bz = Math.round(zone.z);
      const blocks = [{ id: grass, x: bx, y: 0, z: bz }];
      if (leaves >= 0) blocks.push({ id: leaves, x: bx, y: 0, z: bz + SLOT_SPACING_Z });
      stages.push({ blocks, shiftX: x - bx, shiftZ: grassZ - bz });
      labels.push({ text: zone.name, sub: 'grass', x: x + 0.5, z: grassZ + LABEL_Z });
      if (leaves >= 0) labels.push({ text: 'oak leaves', x: x + 0.5, z: leavesZ + LABEL_Z });
    });
    depth = leaves >= 0 ? leavesZ + 1 : grassZ + 1;
  }

  return { slots, labels, stages, width, depth, cols, rows };
};

// --- Meshing -----------------------------------------------------------------------------------------------

class StageReader implements CellReader {
  private readonly cells = new Map<string, Cell>();
  private minY = 0;
  private maxY = 0;
  constructor(blocks: Stage['blocks']) {
    for (const b of blocks) {
      this.cells.set(`${b.x},${b.y},${b.z}`, packCell(b.id, b.state ?? 0));
      this.minY = Math.min(this.minY, b.y);
      this.maxY = Math.max(this.maxY, b.y);
    }
  }

  getCell(x: number, y: number, z: number): Cell {
    return this.cells.get(`${x},${y},${z}`) ?? 0;
  }

  // Only the rows that hold blocks, so the mesher need not scan the whole height of the world.
  yRange(): { minY: number; maxY: number } {
    return { minY: this.minY, maxY: this.maxY };
  }
}

export interface StageMesh {
  mesh: MeshData;
  /** Where the mesh's chunk-local origin goes in display coordinates. */
  offsetX: number;
  offsetZ: number;
}

/** Meshes a stage with the real mesher, one chunk at a time, and says where each result goes. */
export const meshStage = (stage: Stage, registry: BlockRegistry, layout: TextureLayout): StageMesh[] => {
  const reader = new StageReader(stage.blocks);
  const chunks = new Map<string, [number, number]>();
  for (const b of stage.blocks) {
    const cx = Math.floor(b.x / CHUNK_SIZE);
    const cz = Math.floor(b.z / CHUNK_SIZE);
    chunks.set(`${cx},${cz}`, [cx, cz]);
  }
  const out: StageMesh[] = [];
  for (const [cx, cz] of chunks.values()) {
    out.push({
      mesh: meshChunk(reader, cx, cz, registry, { layout }),
      offsetX: cx * CHUNK_SIZE + stage.shiftX,
      offsetZ: cz * CHUNK_SIZE + stage.shiftZ,
    });
  }
  return out;
};

// --- Camera ------------------------------------------------------------------------------------------------

export const CAMERA_FOV = 30;

type Vec3 = [number, number, number];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** What the camera has to fit: the content box from the origin, labels not included, and how to look at it. */
export interface FrameBox {
  width: number;
  depth: number;
  /** Tallest block top, default 1 (a row of cubes). */
  height?: number;
  /** Degrees to swing the camera round to the east of straight in front. Default 0. */
  azimuth?: number;
  /** Degrees above the horizon. Default 50, or 45 when focused. */
  elevation?: number;
}

/**
 * A camera that fits the whole layout, labels included, looking down at it from the front. Focused views sit
 * lower and closer. The distance is the smallest one at which every corner of the content box is on screen.
 */
export const defaultCamera = (layout: FrameBox, aspect: number, focused: boolean): CameraPose => {
  const elevation = ((layout.elevation ?? (focused ? 45 : 50)) * Math.PI) / 180;
  const azimuth = ((layout.azimuth ?? 0) * Math.PI) / 180;
  const margin = focused ? 0.9 : 0.94;
  const halfV = Math.tan((CAMERA_FOV * Math.PI) / 360);
  const halfH = halfV * aspect;

  // The content box: the cubes, the labels under the front row, and a little air around them.
  const x0 = -0.6, x1 = layout.width + 0.6;
  const z0 = -0.3, z1 = layout.depth + 1.4;
  const y1 = (layout.height ?? 1) + 0.2;
  const corners: Vec3[] = [];
  for (const x of [x0, x1]) for (const y of [0, y1]) for (const z of [z0, z1]) corners.push([x, y, z]);

  const target: Vec3 = [(x0 + x1) / 2, layout.height ? y1 / 2 : 0.5, (z0 + z1) / 2];
  const back: Vec3 = [Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)];
  const forward: Vec3 = [-back[0], -back[1], -back[2]];
  const right = unit(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);

  const fits = (distance: number): boolean => {
    const position: Vec3 = [target[0] + back[0] * distance, target[1] + back[1] * distance, target[2] + back[2] * distance];
    return corners.every((c) => {
      const d = sub(c, position);
      const depth = dot(d, forward);
      if (depth <= 0.1) return false;
      return Math.abs(dot(d, right) / (depth * halfH)) <= margin && Math.abs(dot(d, up) / (depth * halfV)) <= margin;
    });
  };

  let lo = 1;
  let hi = 400;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return {
    position: [target[0] + back[0] * hi, target[1] + back[1] * hi, target[2] + back[2] * hi],
    target,
  };
};
