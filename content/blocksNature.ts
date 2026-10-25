import { BlockFaces, BlockRegistry } from '../engine/BlockRegistry';
import { BlockModel } from '../engine/models/BlockModel';
import { CrossModel } from '../engine/models/CrossModel';
import { PlateModel } from '../engine/models/PlateModel';

// Blocks for the wilderness: new trees, ground cover and soils. Ids 48..79 belong to this file; the legacy blocks
// own 0..47 and nothing may be registered above 79 from here. The generator in worldgen/ uses these names, so a
// block added here becomes available to features without touching the registry code. Texture names come from the
// catalog in content/textures (see docs/textures.md); the flat colour is only the fallback and the colour a far
// chunk or a missing tile would show.
export const NATURE_ID_MIN = 48;
export const NATURE_ID_MAX = 79;

export enum NatureBlock {
  CEDAR_LOG = 48,
  CEDAR_LEAVES = 49,
  SAKURA_LOG = 50,
  SAKURA_LEAVES = 51,
  BAMBOO = 52,
  BAMBOO_LEAVES = 53,
  FERN = 54,
  REEDS = 55,
  GRAVEL = 56,
  MOSS = 57,
  WILDFLOWER_BLUE = 58,
  WILDFLOWER_WHITE = 59,
  WILDFLOWER_PINK = 60,
  WILDFLOWER_PURPLE = 61,
  MUSHROOM_RED = 62,
  MUSHROOM_BROWN = 63,
  FALLEN_LEAVES = 64,
  SAKURA_PETALS = 65,
  GRANITE = 66,
  MUD = 67,
  SNOWY_PINE_LEAVES = 68,
  PINE_LOG = 69,
  PODZOL = 70,
}

interface NatureDef {
  id: NatureBlock;
  name: string;
  color: string;
  // Plants and ground cover are neither solid nor opaque. Leaves block the player but let light and sight through.
  kind: 'cube' | 'leaves' | 'plant';
  faces: BlockFaces;
  // Plants are not cubes: crossing planes for the upright ones, a thin plate for litter on the ground.
  model?: BlockModel;
  // How far the wind moves it (BlockDef.sway). Trunks, stone, litter and mushrooms stand still.
  sway?: number;
}

const same = (name: string): BlockFaces => ({ top: name, bottom: name, side: name });
const ends = (end: string, side: string): BlockFaces => ({ top: end, bottom: end, side });
// Ground with a living top: the top tile, dirt underneath and a dirt side with a cap of the same stuff.
const capped = (top: string, side: string): BlockFaces => ({ top, bottom: 'dirt', side });

// Sizes follow the legacy plants. Flowers share the legacy flower shape; a mushroom huddle is small and its tile
// fills its plane; bamboo and reeds stand a full block tall so a stack of them reads as one cane; ferns and
// bamboo leaves spread wider than a flower and are as tall as tall grass.
const FLOWER = new CrossModel(0.8, 0.8);
const STALK = new CrossModel(0.9, 1);
const TUFT = new CrossModel(0.9, 0.9);
const FUNGUS = new CrossModel(0.7, 0.9);
// A carpet of leaves or petals: a plate one sixteenth thick lying on the ground, covering the whole cell. Its
// underside is hidden by the soil, so it does not fight the ground for the same depth.
const LITTER = new PlateModel(0, 0);

// None of these take the biome tint. Birch and pine leaves did not either: a cedar, a cherry tree and a fern have
// the colour of their own species, and the pink of blossom must never be multiplied by a zone's green.
const DEFS: readonly NatureDef[] = [
  { id: NatureBlock.CEDAR_LOG, name: 'cedar_log', color: '#6d4330', kind: 'cube', faces: ends('cedar_log_top', 'cedar_log_side') },
  { id: NatureBlock.CEDAR_LEAVES, name: 'cedar_leaves', color: '#2c6e49', kind: 'leaves', faces: same('cedar_leaves'), sway: 0.3 },
  { id: NatureBlock.SAKURA_LOG, name: 'sakura_log', color: '#4e3b3b', kind: 'cube', faces: ends('sakura_log_top', 'sakura_log_side') },
  { id: NatureBlock.SAKURA_LEAVES, name: 'sakura_leaves', color: '#f4a7c1', kind: 'leaves', faces: same('sakura_leaves'), sway: 0.45 },
  { id: NatureBlock.BAMBOO, name: 'bamboo', color: '#7fb83d', kind: 'plant', faces: same('bamboo'), model: STALK, sway: 0.8 },
  { id: NatureBlock.BAMBOO_LEAVES, name: 'bamboo_leaves', color: '#5da130', kind: 'plant', faces: same('bamboo_leaves'), model: new CrossModel(1, 1), sway: 1 },
  { id: NatureBlock.FERN, name: 'fern', color: '#3f7d2c', kind: 'plant', faces: same('fern'), model: TUFT, sway: 0.6 },
  { id: NatureBlock.REEDS, name: 'reeds', color: '#9aa04a', kind: 'plant', faces: same('reeds'), model: STALK, sway: 0.9 },
  { id: NatureBlock.GRAVEL, name: 'gravel', color: '#8a8d8f', kind: 'cube', faces: same('gravel') },
  { id: NatureBlock.MOSS, name: 'moss', color: '#5f8f3a', kind: 'cube', faces: capped('moss', 'moss_side') },
  { id: NatureBlock.WILDFLOWER_BLUE, name: 'wildflower_blue', color: '#4f7cff', kind: 'plant', faces: same('wildflower_blue'), model: FLOWER, sway: 0.75 },
  { id: NatureBlock.WILDFLOWER_WHITE, name: 'wildflower_white', color: '#f5f5f0', kind: 'plant', faces: same('wildflower_white'), model: FLOWER, sway: 0.75 },
  { id: NatureBlock.WILDFLOWER_PINK, name: 'wildflower_pink', color: '#ff8fb8', kind: 'plant', faces: same('wildflower_pink'), model: FLOWER, sway: 0.75 },
  { id: NatureBlock.WILDFLOWER_PURPLE, name: 'wildflower_purple', color: '#9b59d0', kind: 'plant', faces: same('wildflower_purple'), model: FLOWER, sway: 0.75 },
  { id: NatureBlock.MUSHROOM_RED, name: 'mushroom_red', color: '#d6362f', kind: 'plant', faces: same('mushroom_red'), model: FUNGUS },
  { id: NatureBlock.MUSHROOM_BROWN, name: 'mushroom_brown', color: '#8b6b4a', kind: 'plant', faces: same('mushroom_brown'), model: FUNGUS },
  { id: NatureBlock.FALLEN_LEAVES, name: 'fallen_leaves', color: '#b5651d', kind: 'plant', faces: same('fallen_leaves'), model: LITTER },
  { id: NatureBlock.SAKURA_PETALS, name: 'sakura_petals', color: '#ffc6dc', kind: 'plant', faces: same('sakura_petals'), model: LITTER },
  { id: NatureBlock.GRANITE, name: 'granite', color: '#9a8f89', kind: 'cube', faces: same('granite') },
  { id: NatureBlock.MUD, name: 'mud', color: '#5a4636', kind: 'cube', faces: same('mud') },
  { id: NatureBlock.SNOWY_PINE_LEAVES, name: 'snowy_pine_leaves', color: '#d7e6e3', kind: 'leaves', faces: same('snowy_pine_leaves'), sway: 0.2 },
  { id: NatureBlock.PINE_LOG, name: 'pine_log', color: '#4b3621', kind: 'cube', faces: ends('pine_log_top', 'pine_log_side') },
  { id: NatureBlock.PODZOL, name: 'podzol', color: '#6b4a2f', kind: 'cube', faces: capped('podzol', 'podzol_side') },
];

export const registerNatureBlocks = (registry: BlockRegistry): void => {
  for (const def of DEFS) {
    registry.register({
      id: def.id,
      name: `voxelverse:${def.name}`,
      color: def.color,
      solid: def.kind !== 'plant',
      opaque: def.kind === 'cube',
      emits: 0,
      // Same rule as the legacy leaves: a canopy shades what is under it.
      lightDim: def.kind === 'leaves' ? 1 : undefined,
      faces: def.faces,
      model: def.model,
      sway: def.sway,
    });
  }
};

// For tests and tools that want to walk the set without a registry.
export const natureBlockIds = (): number[] => DEFS.map((d) => d.id);
