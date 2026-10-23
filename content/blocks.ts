import { BlockFaces, BlockRegistry, BlockTint } from '../engine/BlockRegistry';
import { BlockModel } from '../engine/models/BlockModel';
import { BoxModel } from '../engine/models/BoxModel';
import { CropModel } from '../engine/models/CropModel';
import { CrossModel } from '../engine/models/CrossModel';
import { FenceModel } from '../engine/models/FenceModel';
import { PlateModel } from '../engine/models/PlateModel';
import { BlockType, COLORS } from '../worldConstants';
import { registerNatureBlocks } from './blocksNature';
import { registerShapedBlocks } from './blocksShaped';

// The legacy blocks, registered under their old BlockType numbers so the existing zones keep working.
// Flat colours come from COLORS. They are the fallback tile for blocks without faces, so blocks added later
// by other branches still draw, and they back the texture-less look of anything the catalog lacks.

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

// See-through blocks and the ones that are mostly air. Farmland used to be here because it was drawn as a box;
// its model now covers its own base, so it is an opaque material like any other.
const NOT_OPAQUE = new Set<BlockType>([
  ...NOT_SOLID,
  BlockType.GLASS, BlockType.LEAVES, BlockType.BIRCH_LEAVES, BlockType.PINE_LEAVES,
  BlockType.SMALL_ROCK, BlockType.WOOD_FENCE, BlockType.LANTERN, BlockType.RED_APPLE,
  BlockType.MAGIC_CRYSTAL,
]);

// The legacy blocks the old renderer scaled out of a cube, as models. Sizes follow the old scales where the shape
// is still a box (rock, crystal, lantern, apple); plants became crossing planes with the tile as the picture, and
// the fence and farmland took the shapes the phase gave them. Everything else is a cube.
const FLOWER = new CrossModel(0.8, 0.8);
const WHEAT_CROP = new CropModel();
const MODELS = new Map<BlockType, BlockModel>([
  [BlockType.FLOWER_YELLOW, FLOWER],
  [BlockType.FLOWER_RED, FLOWER],
  [BlockType.SMALL_ROCK, new BoxModel([[0.3, 0, 0.3, 0.7, 0.2, 0.7]])],
  [BlockType.MAGIC_CRYSTAL, new BoxModel([[0.2, 0.1, 0.2, 0.8, 0.9, 0.8]])],
  [BlockType.WOOD_FENCE, new FenceModel()],
  [BlockType.WHEAT, WHEAT_CROP],
  [BlockType.WHEAT_STAGE_1, WHEAT_CROP],
  [BlockType.WHEAT_STAGE_2, WHEAT_CROP],
  [BlockType.FARMLAND, new BoxModel([[0, 0, 0, 1, 15 / 16, 1]], 'cell')],
  [BlockType.LILY_PAD, new PlateModel(0.2, 0.985)],
  [BlockType.SUGARCANE, new CrossModel(0.9, 1)],
  [BlockType.TALL_GRASS, new CrossModel(0.9, 0.9)],
  [BlockType.LANTERN, new BoxModel([[0.35, 0.1, 0.35, 0.65, 0.5, 0.65]])],
  [BlockType.RED_APPLE, new BoxModel([[0.4, 0.4, 0.4, 0.6, 0.6, 0.6]])],
]);

const same = (name: string): BlockFaces => ({ top: name, bottom: name, side: name });
const ends = (end: string, side: string): BlockFaces => ({ top: end, bottom: end, side });

// Texture names come from the catalog in content/textures. Models with one picture (plants, fences, lanterns) wear
// the same tile on every face.
const FACES: Record<Colored, BlockFaces> = {
  [BlockType.GRASS]: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' },
  [BlockType.DIRT]: same('dirt'),
  [BlockType.STONE]: same('stone'),
  [BlockType.SAND]: same('sand'),
  [BlockType.WATER]: same('water'),
  [BlockType.SNOW]: same('snow'),
  [BlockType.STONE_BRICK]: same('stone_brick'),
  [BlockType.WOOD_LOG]: ends('log_top', 'log_side'),
  [BlockType.WOOD_PLANK]: same('plank'),
  [BlockType.PLASTER]: same('plaster'),
  [BlockType.ROOF_RED]: same('roof_red'),
  [BlockType.ROOF_BLUE]: same('roof_blue'),
  [BlockType.GLASS]: same('glass'),
  [BlockType.COBBLESTONE]: same('cobble'),
  [BlockType.PATH]: same('path'),
  [BlockType.LEAVES]: same('leaves_oak'),
  [BlockType.RED_BRICK]: same('brick_red'),
  [BlockType.DARK_PLANK]: same('dark_plank'),
  [BlockType.MOSSY_COBBLESTONE]: same('mossy_cobble'),
  [BlockType.FLOWER_YELLOW]: same('flower_yellow'),
  [BlockType.FLOWER_RED]: same('flower_red'),
  [BlockType.SMALL_ROCK]: same('cobble'),
  [BlockType.BIRCH_LOG]: ends('birch_log_top', 'birch_log_side'),
  [BlockType.BIRCH_LEAVES]: same('leaves_birch'),
  [BlockType.PINE_LEAVES]: same('leaves_pine'),
  [BlockType.FACTORY_BRICK]: same('brick_factory'),
  [BlockType.IRON_BLOCK]: same('iron'),
  [BlockType.OBSIDIAN]: same('obsidian'),
  [BlockType.BASALT]: same('basalt'),
  [BlockType.SLIME_BLOCK]: same('slime'),
  [BlockType.MAGIC_CRYSTAL]: same('crystal'),
  [BlockType.MARBLE]: same('marble'),
  [BlockType.GOLD_BLOCK]: same('gold'),
  [BlockType.WOOD_FENCE]: same('plank'),
  [BlockType.FARMLAND]: { top: 'farmland', bottom: 'dirt', side: 'farmland_side' },
  [BlockType.WHEAT]: same('wheat_ripe'),
  [BlockType.STEEL_BEAM]: same('steel'),
  [BlockType.HANGAR_WALL]: same('hangar_wall'),
  [BlockType.GUILD_WOOD]: same('guild_wood'),
  [BlockType.MAGIC_STONE]: same('magic_stone'),
  [BlockType.LILY_PAD]: same('lily_pad'),
  [BlockType.SUGARCANE]: same('sugarcane'),
  [BlockType.TALL_GRASS]: same('tall_grass'),
  [BlockType.LANTERN]: same('lantern'),
  [BlockType.RED_APPLE]: same('red_apple'),
  [BlockType.WHEAT_STAGE_1]: same('wheat_stage_1'),
  [BlockType.WHEAT_STAGE_2]: same('wheat_stage_2'),
};

// Grass takes the zone colour on its top and its fringe; oak leaves take it darkened. Birch and pine leaves
// keep their own colours, as they did when they were flat.
const TINT = new Map<BlockType, BlockTint>([
  [BlockType.GRASS, 'grass'],
  [BlockType.LEAVES, 'foliage'],
]);

// Leaves are see-through but shade what is under them: sky light does not fall through a canopy for free.
const LEAF_BLOCKS = new Set<BlockType>([BlockType.LEAVES, BlockType.BIRCH_LEAVES, BlockType.PINE_LEAVES]);

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
      lightDim: LEAF_BLOCKS.has(type) ? 1 : undefined,
      faces: type === BlockType.AIR ? undefined : FACES[type as Colored],
      tint: TINT.get(type),
      model: MODELS.get(type),
      // The old renderer drew a water cube under every lily pad.
      holdsWater: type === BlockType.LILY_PAD ? true : undefined,
    });
  }
  registerNatureBlocks(registry);
  registerShapedBlocks(registry);
  return registry;
};
