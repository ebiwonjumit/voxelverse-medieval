import { BlockRegistry } from '../engine/BlockRegistry';
import { PaneModel } from '../engine/models/PaneModel';
import { SlabModel } from '../engine/models/SlabModel';
import { StairModel } from '../engine/models/StairModel';
import { COLORS } from '../worldConstants';

// Shaped blocks: stairs, slabs and panes, ids 80 to 127 (Phase 4). They reuse the textures and colours of the cube
// they are cut from, so the sides of a stone brick stair are the stone brick tile and its flat fallback colour is
// the stone brick colour. What their state means is defined by their model: see docs/models.md.

export const SHAPED_FIRST_ID = 80;
export const SHAPED_LAST_ID = 127;

/** Ids of the shaped blocks. Never renumber one: worlds store these numbers. */
export const ShapedBlock = {
  STONE_BRICK_SLAB: 80,
  STONE_BRICK_STAIRS: 81,
  COBBLESTONE_SLAB: 82,
  COBBLESTONE_STAIRS: 83,
  WOOD_PLANK_SLAB: 84,
  WOOD_PLANK_STAIRS: 85,
  DARK_PLANK_SLAB: 86,
  DARK_PLANK_STAIRS: 87,
  RED_ROOF_SLAB: 88,
  RED_ROOF_STAIRS: 89,
  BLUE_ROOF_SLAB: 90,
  BLUE_ROOF_STAIRS: 91,
  GLASS_PANE: 92,
} as const;

interface Material {
  name: string;
  color: string;
  tile: string;
  slab: number;
  stairs: number;
}

// Texture tiles come from the catalog in content/textures; every material below already has one.
const MATERIALS: readonly Material[] = [
  { name: 'stone_brick', color: COLORS.STONE_BRICK, tile: 'stone_brick', slab: ShapedBlock.STONE_BRICK_SLAB, stairs: ShapedBlock.STONE_BRICK_STAIRS },
  { name: 'cobblestone', color: COLORS.COBBLESTONE, tile: 'cobble', slab: ShapedBlock.COBBLESTONE_SLAB, stairs: ShapedBlock.COBBLESTONE_STAIRS },
  { name: 'wood_plank', color: COLORS.WOOD_PLANK, tile: 'plank', slab: ShapedBlock.WOOD_PLANK_SLAB, stairs: ShapedBlock.WOOD_PLANK_STAIRS },
  { name: 'dark_plank', color: COLORS.DARK_PLANK, tile: 'dark_plank', slab: ShapedBlock.DARK_PLANK_SLAB, stairs: ShapedBlock.DARK_PLANK_STAIRS },
  { name: 'red_roof', color: COLORS.ROOF_RED, tile: 'roof_red', slab: ShapedBlock.RED_ROOF_SLAB, stairs: ShapedBlock.RED_ROOF_STAIRS },
  { name: 'blue_roof', color: COLORS.ROOF_BLUE, tile: 'roof_blue', slab: ShapedBlock.BLUE_ROOF_SLAB, stairs: ShapedBlock.BLUE_ROOF_STAIRS },
];

export const registerShapedBlocks = (registry: BlockRegistry): void => {
  const slab = new SlabModel();
  const stairs = new StairModel();
  for (const m of MATERIALS) {
    const faces = { top: m.tile, bottom: m.tile, side: m.tile };
    registry.register({
      id: m.slab, name: `voxelverse:${m.name}_slab`, color: m.color, solid: true, opaque: true, emits: 0, faces, model: slab,
    });
    registry.register({
      id: m.stairs, name: `voxelverse:${m.name}_stairs`, color: m.color, solid: true, opaque: true, emits: 0, faces, model: stairs,
    });
  }
  registry.register({
    id: ShapedBlock.GLASS_PANE, name: 'voxelverse:glass_pane', color: COLORS.GLASS, solid: true, opaque: false, emits: 0,
    faces: { top: 'glass', bottom: 'glass', side: 'glass' }, model: new PaneModel(),
  });
};
