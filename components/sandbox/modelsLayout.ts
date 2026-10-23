import { BlockDef, BlockRegistry } from '../../engine/BlockRegistry';
import {
  BlockModel, BoxModel, CropModel, CrossModel, FenceModel, PaneModel, PlateModel, SLAB_BOTTOM, SLAB_TOP, SlabModel,
  StairModel, stairState,
} from '../../engine/models';
import { CameraPose, FrameBox, SandboxLabel, Stage, StageBlock, shortName } from './sandboxLayout';

// The pure half of the ?sandbox=models page: every block model in every state, labelled, and a small house built
// from stairs, slabs, fences and panes. Like the block sandbox it is built from the registry, so a block another
// branch gives a model shows up here without a change; the page draws it through the real mesher.

export type ModelView = 'all' | 'close' | 'joins' | 'house';

export interface ModelSandboxOptions {
  view: ModelView;
  cam: CameraPose | null;
}

/** Reads the query string. Returns null unless it says sandbox=models, so nothing else selects the page. */
export const parseModelSandbox = (search: string): ModelSandboxOptions | null => {
  const params = new URLSearchParams(search);
  if (params.get('sandbox') !== 'models') return null;
  const v = params.get('view');
  const view: ModelView = v === 'close' || v === 'joins' || v === 'house' ? v : 'all';

  let cam: CameraPose | null = null;
  const camParam = params.get('cam');
  if (camParam) {
    const n = camParam.split(',').map(Number);
    if (n.length === 6 && n.every(Number.isFinite)) {
      cam = { position: [n[0], n[1], n[2]], target: [n[3], n[4], n[5]] };
    }
  }
  return { view, cam };
};

// --- Kinds -------------------------------------------------------------------------------------------------

export type ModelKind = 'cube' | 'slab' | 'stairs' | 'fence' | 'pane' | 'cross' | 'crop' | 'box' | 'plate' | 'other';

/** What a model is, for grouping. By class, not by name: the production build mangles class names. */
export const modelKind = (model: BlockModel): ModelKind => {
  if (model.isFullCube) return 'cube';
  if (model instanceof SlabModel) return 'slab';
  if (model instanceof StairModel) return 'stairs';
  if (model instanceof FenceModel) return 'fence';
  if (model instanceof PaneModel) return 'pane';
  if (model instanceof CrossModel) return 'cross';
  if (model instanceof CropModel) return 'crop';
  if (model instanceof BoxModel) return 'box';
  if (model instanceof PlateModel) return 'plate';
  return 'other';
};

export const FACING_NAMES = ['north', 'east', 'south', 'west'] as const;

/** The states a model has distinct looks for. Fences and panes have none: they look at their neighbours instead. */
export const statesOf = (kind: ModelKind): number[] => {
  if (kind === 'stairs') return [0, 1, 2, 3, 4, 5, 6, 7];
  if (kind === 'slab') return [SLAB_BOTTOM, SLAB_TOP];
  return [0];
};

// --- Cells and sections ------------------------------------------------------------------------------------

/** What stands in one slot of a section: some blocks, relative to the slot, and the caption under them. */
export interface ModelCell {
  blocks: StageBlock[];
  /** Footprint in blocks. */
  w: number;
  d: number;
  text: string;
  sub?: string;
}

export interface ModelSection {
  title: string;
  note: string;
  cols: number;
  stepX: number;
  stepZ: number;
  cells: ModelCell[];
}

const blocksOfKind = (registry: BlockRegistry, kinds: ModelKind[]): BlockDef[] =>
  registry.all().filter((def) => def.id !== 0 && def.model !== undefined && kinds.includes(modelKind(def.model)));

const single = (def: BlockDef, state: number, text: string, sub: string): ModelCell => ({
  blocks: [{ id: def.id, x: 0, y: 0, z: 0, state }], w: 1, d: 1, text, sub,
});

/** One cell per block and state: eight for every stair block, two for every slab. */
const shapedSection = (
  registry: BlockRegistry, kind: 'stairs' | 'slab', limit: number, cols: number, stepX = 3, stepZ = 3,
): ModelSection => {
  const defs = blocksOfKind(registry, [kind]).slice(0, limit);
  const cells: ModelCell[] = [];
  for (const def of defs) {
    for (const state of statesOf(kind)) {
      // The block's id goes on its first cell only, to keep a row of captions short.
      const sub = `${state === 0 ? `#${def.id} ` : ''}s${state}`;
      if (kind === 'stairs') {
        cells.push(single(def, state, `${FACING_NAMES[state & 3]}${state & 4 ? ' \u25BC' : ''}`, sub));
      } else {
        cells.push(single(def, state, state === SLAB_TOP ? 'top' : 'bottom', sub));
      }
    }
  }
  return kind === 'stairs'
    ? {
      title: 'stairs: 8 states each',
      note: 'bits 0-1 facing (tall back on that side), bit 2 upside down \u25BC',
      cols, stepX, stepZ, cells,
    }
    : {
      title: 'slabs: 2 states each',
      note: 'bit 0: 0 fills the lower half, 1 the upper half',
      cols, stepX, stepZ, cells,
    };
};

// How a fence or pane is surrounded in each cell of its section: offsets from the middle block, in x and z.
// Walls and glass are cubes standing where the neighbour would be.
interface Surround {
  text: string;
  same: Array<[number, number]>;
  stone?: Array<[number, number]>;
  glass?: Array<[number, number]>;
}
const W: [number, number] = [-1, 0];
const E: [number, number] = [1, 0];
const N: [number, number] = [0, -1];
const S: [number, number] = [0, 1];
const SURROUNDS: readonly Surround[] = [
  { text: 'alone', same: [] },
  { text: 'pair', same: [E] },
  { text: 'line', same: [W, E] },
  { text: 'corner', same: [E, S] },
  { text: 'T', same: [W, E, S] },
  { text: 'cross', same: [W, E, N, S] },
  { text: 'stone', same: [], stone: [E] },
  { text: 'glass', same: [], glass: [E] },
];

/** Fences and panes keep nothing in their state; this shows how they join what stands beside them. */
const connectSection = (registry: BlockRegistry, kind: 'fence' | 'pane'): ModelSection => {
  const def = blocksOfKind(registry, [kind])[0];
  const stone = registry.byName('voxelverse:stone_brick');
  const glass = registry.byName('voxelverse:glass');
  const cells: ModelCell[] = [];
  if (def) {
    for (const s of SURROUNDS) {
      const blocks: StageBlock[] = [{ id: def.id, x: 1, y: 0, z: 1 }];
      for (const [dx, dz] of s.same) blocks.push({ id: def.id, x: 1 + dx, y: 0, z: 1 + dz });
      for (const [dx, dz] of s.stone ?? []) blocks.push({ id: stone.id, x: 1 + dx, y: 0, z: 1 + dz });
      for (const [dx, dz] of s.glass ?? []) blocks.push({ id: glass.id, x: 1 + dx, y: 0, z: 1 + dz });
      cells.push({ blocks, w: 3, d: 3, text: s.text, sub: `#${def.id}` });
    }
  }
  return kind === 'fence'
    ? {
      title: 'fence: joined by its neighbours, state unused',
      note: 'joins fences and opaque solid cubes, not glass',
      cols: 8, stepX: 4, stepZ: 5, cells,
    }
    : {
      title: 'pane: joined by its neighbours, state unused',
      note: 'joins panes and every solid cube, glass too; alone it draws the cross',
      cols: 8, stepX: 4, stepZ: 5, cells,
    };
};

/** Every other model: one look each, with its kind under it. */
const otherSection = (registry: BlockRegistry): ModelSection => {
  const defs = blocksOfKind(registry, ['cross', 'crop', 'box', 'plate', 'other']);
  return {
    title: 'planes, boxes and plates: one state',
    note: 'plants, crops, lantern, rock and the rest; any new model kind lands here too',
    cols: 8, stepX: 4, stepZ: 3,
    cells: defs.map((def) => single(def, 0, shortName(def), `#${def.id} ${modelKind(def.model!)}`)),
  };
};

// --- The house ---------------------------------------------------------------------------------------------

export interface HouseBlocks {
  blocks: StageBlock[];
  /** Footprint and height in blocks. */
  width: number;
  depth: number;
  height: number;
}

/**
 * A house corner with a roof, built from the shaped blocks: a timber-framed stone house under a stair roof with an
 * overhanging gable, a plank floor of slabs, a doorway with a half-block lintel, a porch on fence posts, window
 * panes, and a fenced yard with a gate. Placed with its west edge at (x0, z0) on the ground.
 *
 * Seen from the south (the camera's side), roof stairs on the south slope face north and those on the north slope
 * face south: a stair's facing is the way you climb, so every roof stair climbs towards the ridge.
 */
export const buildHouse = (registry: BlockRegistry, x0 = 0, z0 = 0): HouseBlocks => {
  const id = (name: string): number => registry.byName(`voxelverse:${name}`).id;
  const placed = new Map<string, StageBlock>();
  const put = (x: number, y: number, z: number, name: string, state = 0): void => {
    const key = `${x},${y},${z}`;
    if (placed.has(key)) throw new Error(`The house puts two blocks at ${key}`);
    // Local x runs from -1 (the yard's west fence and the roof overhang) to 7.
    placed.set(key, { id: id(name), x: x0 + x + 1, y, z: z0 + z, state });
  };

  // Walls: a cobblestone course, two of stone brick, a plank beam, dark plank at the corners. 7 wide, 6 deep.
  const WINDOWS = new Set(['1,5', '5,5', '6,1', '6,4', '0,2', '0,3']);
  for (let y = 0; y <= 3; y++) {
    for (let x = 0; x <= 6; x++) {
      for (let z = 0; z <= 5; z++) {
        if (x !== 0 && x !== 6 && z !== 0 && z !== 5) continue;
        const corner = (x === 0 || x === 6) && (z === 0 || z === 5);
        if (x === 3 && z === 5 && y <= 2) continue; // the doorway
        if (WINDOWS.has(`${x},${z}`) && (y === 1 || y === 2)) put(x, y, z, 'glass_pane');
        else if (corner) put(x, y, z, 'dark_plank');
        else put(x, y, z, y === 0 ? 'cobblestone' : y === 3 ? 'wood_plank' : 'stone_brick');
      }
    }
  }
  put(3, 2, 5, 'wood_plank_slab', SLAB_TOP); // half a block of lintel over the door, so the doorway is 2.5 high

  // Gable ends fill the triangle under the roof.
  for (const x of [0, 6]) {
    for (let z = 1; z <= 4; z++) put(x, 4, z, 'wood_plank');
    for (let z = 2; z <= 3; z++) put(x, 5, z, 'wood_plank');
  }

  // The floor is bottom slabs, so it is half a block up, and so is the doorstep.
  for (let x = 1; x <= 5; x++) for (let z = 1; z <= 4; z++) put(x, 0, z, 'wood_plank_slab', SLAB_BOTTOM);
  put(3, 0, 5, 'wood_plank_slab', SLAB_BOTTOM);
  put(3, 0, 6, 'wood_plank_slab', SLAB_BOTTOM);

  // The roof climbs a half block per half block from both eaves to a one block ridge, and overhangs the gables.
  for (let x = -1; x <= 7; x++) {
    put(x, 4, 5, 'red_roof_stairs', stairState(0));
    put(x, 5, 4, 'red_roof_stairs', stairState(0));
    put(x, 6, 3, 'red_roof_stairs', stairState(0));
    put(x, 4, 0, 'red_roof_stairs', stairState(2));
    put(x, 5, 1, 'red_roof_stairs', stairState(2));
    put(x, 6, 2, 'red_roof_stairs', stairState(2));
  }

  // The porch: fence posts that join the wall behind them, with a slab roof on top.
  for (const x of [2, 4]) for (let y = 0; y <= 2; y++) put(x, y, 6, 'wood_fence');
  for (let x = 2; x <= 4; x++) put(x, 3, 6, 'wood_plank_slab', SLAB_BOTTOM);

  // The yard: a fence that joins the corner posts of the house, a gap for the gate, lanterns on the gate posts and
  // stepping stones from the gate to the porch.
  for (let x = -1; x <= 7; x++) if (x !== 3) put(x, 0, 8, 'wood_fence');
  for (const x of [-1, 7]) for (let z = 5; z <= 7; z++) put(x, 0, z, 'wood_fence');
  for (const x of [2, 4]) put(x, 1, 8, 'lantern');
  put(3, 0, 7, 'cobblestone_slab', SLAB_BOTTOM);
  put(3, 0, 8, 'cobblestone_slab', SLAB_BOTTOM);

  return { blocks: [...placed.values()], width: 9, depth: 9, height: 7 };
};

// --- Layout ------------------------------------------------------------------------------------------------

/** Space under a section's title before its first row, and between the end of one section and the next. Whole
 *  blocks, since sections are placed on the block grid. */
const TITLE_SPACE = 3;
const SECTION_GAP = 2;
const COLUMN_GAP = 5;

interface Placed {
  blocks: StageBlock[];
  labels: SandboxLabel[];
  width: number;
  depth: number;
  cells: number;
}

const placeSection = (section: ModelSection, ox: number, oz: number): Placed => {
  const blocks: StageBlock[] = [];
  const labels: SandboxLabel[] = [];
  const rows = Math.ceil(section.cells.length / section.cols);
  const usedCols = Math.min(section.cols, section.cells.length);
  const cellW = section.cells.reduce((m, c) => Math.max(m, c.w), 1);
  const cellD = section.cells.reduce((m, c) => Math.max(m, c.d), 1);
  const width = Math.max(1, (usedCols - 1) * section.stepX + cellW);
  section.cells.forEach((cell, i) => {
    const x = ox + (i % section.cols) * section.stepX;
    const z = oz + TITLE_SPACE + Math.floor(i / section.cols) * section.stepZ;
    for (const b of cell.blocks) blocks.push({ ...b, x: x + b.x, z: z + b.z });
    labels.push({ text: cell.text, sub: cell.sub, x: x + cell.w / 2, z: z + cell.d + 0.4 });
  });
  labels.push({ text: section.title, sub: section.note, heading: true, x: ox + width / 2, z: oz + 0.5 });
  const depth = Math.ceil(TITLE_SPACE + Math.max(0, rows - 1) * section.stepZ + cellD + 1.2) + SECTION_GAP;
  return { blocks, labels, width, depth, cells: section.cells.length };
};

/** The sections of a view, top to bottom. */
const sectionsFor = (registry: BlockRegistry, view: ModelView) => {
  const close = view === 'close';
  // The close view is narrow so it can be near: the four facings in a row, then the same four upside down.
  const stairs = shapedSection(registry, 'stairs', close ? 1 : Infinity, close ? 4 : 8, close ? 2 : 3, close ? 4 : 3);
  const slabs = shapedSection(registry, 'slab', close ? 2 : Infinity, close ? 4 : 8, close ? 2 : 3);
  const fence = connectSection(registry, 'fence');
  const pane = connectSection(registry, 'pane');
  const other = otherSection(registry);
  return { stairs, slabs, fence, pane, other };
};

export interface ModelsLayout extends FrameBox {
  stages: Stage[];
  labels: SandboxLabel[];
  /** Number of cells shown (the house is one). */
  cells: number;
  /** The sections shown, without the house. */
  sections: ModelSection[];
  view: ModelView;
}

/**
 * Lays the page out for a view. 'all' puts the stairs and slabs in a column on the left and the house, the fence
 * and pane connections and the single-state models in a column on the right. 'close' keeps one stair block and two
 * slab blocks, close up, and 'joins' the fence and pane rows. 'house' is the house alone.
 */
export const layoutModels = (registry: BlockRegistry, view: ModelView = 'all'): ModelsLayout => {
  const s = sectionsFor(registry, view);
  const blocks: StageBlock[] = [];
  const labels: SandboxLabel[] = [];
  let cells = 0;
  const shown: ModelSection[] = [];
  const add = (p: Placed): void => {
    blocks.push(...p.blocks);
    labels.push(...p.labels);
    cells += p.cells;
  };

  const stack = (sections: ModelSection[], ox: number, oz: number): { width: number; depth: number } => {
    let z = oz;
    let width = 0;
    for (const section of sections) {
      const p = placeSection(section, ox, z);
      add(p);
      shown.push(section);
      z += p.depth;
      width = Math.max(width, p.width);
    }
    return { width, depth: z - oz - SECTION_GAP };
  };

  const placeHouse = (ox: number, oz: number): { width: number; depth: number; height: number } => {
    const house = buildHouse(registry, ox, oz);
    blocks.push(...house.blocks);
    cells += 1;
    // Under the yard fence, not above the roof, where it would hang in the air over the house.
    labels.push({
      text: 'house corner', sub: 'stairs, slabs, fences, panes',
      heading: true, x: ox + house.width / 2, z: oz + house.depth + 0.6,
    });
    return { width: house.width, depth: house.depth + 2, height: house.height };
  };

  if (view === 'house') {
    const h = placeHouse(0, 0);
    return {
      stages: [{ blocks, shiftX: 0, shiftZ: 0 }], labels, cells, sections: shown, view,
      width: h.width, depth: h.depth, height: h.height, azimuth: 28, elevation: 32,
    };
  }

  if (view === 'close') {
    // Side by side, so the page is wide rather than tall and the blocks come out larger.
    const a = stack([s.stairs], 0, 0);
    const b = stack([s.slabs], a.width + 2, 0);
    return {
      stages: [{ blocks, shiftX: 0, shiftZ: 0 }], labels, cells, sections: shown, view,
      width: a.width + 2 + b.width, depth: Math.max(a.depth, b.depth), height: 1, elevation: 38,
    };
  }

  if (view === 'joins') {
    const { width, depth } = stack([s.fence, s.pane], 0, 0);
    return { stages: [{ blocks, shiftX: 0, shiftZ: 0 }], labels, cells, sections: shown, view, width, depth, height: 1.6, elevation: 38 };
  }

  const left = stack([s.stairs, s.slabs], 0, 0);
  const rightX = left.width + COLUMN_GAP;
  const h = placeHouse(rightX, 0);
  const right = stack([s.fence, s.pane, s.other], rightX, h.depth + SECTION_GAP);
  return {
    stages: [{ blocks, shiftX: 0, shiftZ: 0 }], labels, cells, sections: shown, view,
    width: rightX + Math.max(right.width, h.width), depth: Math.max(left.depth, h.depth + SECTION_GAP + right.depth),
    height: h.height, elevation: 58,
  };
};
