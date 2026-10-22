import { BlockRegistry } from '../engine/BlockRegistry';
import { BlockType, COLORS } from '../worldConstants';
import { registerNatureBlocks } from './blocksNature';

// The legacy blocks, registered under their old BlockType numbers so the existing zones keep working.
// Flat colours come from COLORS until blocks get textures in Phase 3.

type Colored = Exclude<BlockType, BlockType.AIR>;

const COLOR: Record<Colored, string> = {
  [BlockType.GRASS]: COLORS.GRASS,
  [BlockType.DIRT]: COLORS.DIRT,
  [BlockType.STONE]: COLORS.STONE,
  [BlockType.SAND]: COLORS.SAND,
  [BlockType.WATER]: COLORS.WATER,
  [BlockType.SNOW]: COLORS.SNOW,
  [BlockType.STONE_BRICK]: COLORS.STONE_BRICK,
  [BlockType.WOOD_LOG]: COLORS.WOOD_LOG,
  [BlockType.WOOD_PLANK]: COLORS.WOOD_PLANK,
  [BlockType.PLASTER]: COLORS.PLASTER,
  [BlockType.ROOF_RED]: COLORS.ROOF_RED,
  [BlockType.ROOF_BLUE]: COLORS.ROOF_BLUE,
  [BlockType.GLASS]: COLORS.GLASS,
  [BlockType.COBBLESTONE]: COLORS.COBBLESTONE,
  [BlockType.PATH]: COLORS.PATH,
  [BlockType.LEAVES]: COLORS.LEAVES,
  [BlockType.RED_BRICK]: COLORS.RED_BRICK,
  [BlockType.DARK_PLANK]: COLORS.DARK_PLANK,
  [BlockType.MOSSY_COBBLESTONE]: COLORS.MOSSY_COBBLESTONE,
  [BlockType.FLOWER_YELLOW]: COLORS.FLOWER_YELLOW,
  [BlockType.FLOWER_RED]: COLORS.FLOWER_RED,
  [BlockType.SMALL_ROCK]: COLORS.SMALL_ROCK,
  [BlockType.BIRCH_LOG]: COLORS.BIRCH_LOG,
  [BlockType.BIRCH_LEAVES]: COLORS.BIRCH_LEAVES,
  [BlockType.PINE_LEAVES]: COLORS.PINE_LEAVES,
  [BlockType.FACTORY_BRICK]: COLORS.FACTORY_BRICK,
  [BlockType.IRON_BLOCK]: COLORS.IRON_BLOCK,
  [BlockType.OBSIDIAN]: COLORS.OBSIDIAN,
  [BlockType.BASALT]: COLORS.BASALT,
  [BlockType.SLIME_BLOCK]: COLORS.SLIME_BLOCK,
  [BlockType.MAGIC_CRYSTAL]: COLORS.MAGIC_CRYSTAL,
  [BlockType.MARBLE]: COLORS.MARBLE,
  [BlockType.GOLD_BLOCK]: COLORS.GOLD_BLOCK,
  [BlockType.WOOD_FENCE]: COLORS.WOOD_FENCE,
  [BlockType.FARMLAND]: COLORS.FARMLAND,
  [BlockType.WHEAT]: COLORS.WHEAT,
  [BlockType.STEEL_BEAM]: COLORS.STEEL_BEAM,
  [BlockType.HANGAR_WALL]: COLORS.HANGAR_WALL,
  [BlockType.GUILD_WOOD]: COLORS.GUILD_WOOD,
  [BlockType.MAGIC_STONE]: COLORS.MAGIC_STONE,
  [BlockType.LILY_PAD]: COLORS.LILY_PAD,
  [BlockType.SUGARCANE]: COLORS.SUGARCANE,
  [BlockType.TALL_GRASS]: COLORS.TALL_GRASS,
  [BlockType.LANTERN]: COLORS.LANTERN,
  [BlockType.RED_APPLE]: COLORS.RED_APPLE,
  [BlockType.WHEAT_STAGE_1]: COLORS.WHEAT_GREEN,
  [BlockType.WHEAT_STAGE_2]: COLORS.WHEAT_GROWING,
};

// Same set the old player collision let you walk through.
const NOT_SOLID = new Set<BlockType>([
  BlockType.AIR, BlockType.WATER, BlockType.SUGARCANE, BlockType.TALL_GRASS,
  BlockType.FLOWER_RED, BlockType.FLOWER_YELLOW, BlockType.WHEAT,
  BlockType.WHEAT_STAGE_1, BlockType.WHEAT_STAGE_2, BlockType.LILY_PAD,
]);

// Blocks the old renderer drew smaller than a full cube, or see-through ones.
const NOT_OPAQUE = new Set<BlockType>([
  ...NOT_SOLID,
  BlockType.GLASS, BlockType.LEAVES, BlockType.BIRCH_LEAVES, BlockType.PINE_LEAVES,
  BlockType.SMALL_ROCK, BlockType.WOOD_FENCE, BlockType.LANTERN, BlockType.RED_APPLE,
  BlockType.MAGIC_CRYSTAL, BlockType.FARMLAND,
]);

const EMITS = new Map<BlockType, number>([
  [BlockType.LANTERN, 15],
  [BlockType.MAGIC_CRYSTAL, 10],
]);

export const createDefaultRegistry = (): BlockRegistry => {
  const registry = new BlockRegistry();
  const types = Object.values(BlockType).filter((v): v is BlockType => typeof v === 'number');
  for (const type of types) {
    registry.register({
      id: type,
      name: `voxelverse:${BlockType[type].toLowerCase()}`,
      color: type === BlockType.AIR ? '#000000' : COLOR[type as Colored],
      solid: !NOT_SOLID.has(type),
      opaque: !NOT_OPAQUE.has(type),
      emits: EMITS.get(type) ?? 0,
    });
  }
  registerNatureBlocks(registry);
  return registry;
};
