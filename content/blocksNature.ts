import { BlockRegistry } from '../engine/BlockRegistry';

// Blocks for the wilderness: new trees, ground cover and soils. Ids 48..79 belong to this file; the legacy blocks
// own 0..47 and nothing may be registered above 79 from here. The generator in worldgen/ uses these names, so a
// block added here becomes available to features without touching the registry code.
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
}

const DEFS: readonly NatureDef[] = [
  { id: NatureBlock.CEDAR_LOG, name: 'cedar_log', color: '#6d4330', kind: 'cube' },
  { id: NatureBlock.CEDAR_LEAVES, name: 'cedar_leaves', color: '#2c6e49', kind: 'leaves' },
  { id: NatureBlock.SAKURA_LOG, name: 'sakura_log', color: '#4e3b3b', kind: 'cube' },
  { id: NatureBlock.SAKURA_LEAVES, name: 'sakura_leaves', color: '#f4a7c1', kind: 'leaves' },
  { id: NatureBlock.BAMBOO, name: 'bamboo', color: '#7fb83d', kind: 'plant' },
  { id: NatureBlock.BAMBOO_LEAVES, name: 'bamboo_leaves', color: '#5da130', kind: 'plant' },
  { id: NatureBlock.FERN, name: 'fern', color: '#3f7d2c', kind: 'plant' },
  { id: NatureBlock.REEDS, name: 'reeds', color: '#9aa04a', kind: 'plant' },
  { id: NatureBlock.GRAVEL, name: 'gravel', color: '#8a8d8f', kind: 'cube' },
  { id: NatureBlock.MOSS, name: 'moss', color: '#5f8f3a', kind: 'cube' },
  { id: NatureBlock.WILDFLOWER_BLUE, name: 'wildflower_blue', color: '#4f7cff', kind: 'plant' },
  { id: NatureBlock.WILDFLOWER_WHITE, name: 'wildflower_white', color: '#f5f5f0', kind: 'plant' },
  { id: NatureBlock.WILDFLOWER_PINK, name: 'wildflower_pink', color: '#ff8fb8', kind: 'plant' },
  { id: NatureBlock.WILDFLOWER_PURPLE, name: 'wildflower_purple', color: '#9b59d0', kind: 'plant' },
  { id: NatureBlock.MUSHROOM_RED, name: 'mushroom_red', color: '#d6362f', kind: 'plant' },
  { id: NatureBlock.MUSHROOM_BROWN, name: 'mushroom_brown', color: '#8b6b4a', kind: 'plant' },
  { id: NatureBlock.FALLEN_LEAVES, name: 'fallen_leaves', color: '#b5651d', kind: 'plant' },
  { id: NatureBlock.SAKURA_PETALS, name: 'sakura_petals', color: '#ffc6dc', kind: 'plant' },
  { id: NatureBlock.GRANITE, name: 'granite', color: '#9a8f89', kind: 'cube' },
  { id: NatureBlock.MUD, name: 'mud', color: '#5a4636', kind: 'cube' },
  { id: NatureBlock.SNOWY_PINE_LEAVES, name: 'snowy_pine_leaves', color: '#d7e6e3', kind: 'leaves' },
  { id: NatureBlock.PINE_LOG, name: 'pine_log', color: '#4b3621', kind: 'cube' },
  { id: NatureBlock.PODZOL, name: 'podzol', color: '#6b4a2f', kind: 'cube' },
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
    });
  }
};

// For tests and tools that want to walk the set without a registry.
export const natureBlockIds = (): number[] => DEFS.map((d) => d.id);
