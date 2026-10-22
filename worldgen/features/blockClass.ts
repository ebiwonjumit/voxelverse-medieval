import { NatureBlock } from '../../content/blocksNature';
import { BlockType } from '../../worldConstants';

// What may overwrite what when features overlap. Everything is decided from the block already in the cell, so a
// single point (sampleBlock) and a whole chunk reach the same answer however the features are visited.
//   AIR    anything may be placed.
//   PLANT  ground cover and small decorations: solid blocks and leaves grow over them.
//   LEAVES leaves: solid blocks (a trunk) grow through them.
//   OTHER  terrain, water, logs, stone: never replaced.
export enum Class { AIR = 0, PLANT = 1, LEAVES = 2, OTHER = 3 }

const TABLE = new Uint8Array(4096).fill(Class.OTHER);
TABLE[BlockType.AIR] = Class.AIR;

for (const id of [
  BlockType.FLOWER_YELLOW, BlockType.FLOWER_RED, BlockType.SMALL_ROCK, BlockType.LILY_PAD, BlockType.SUGARCANE,
  BlockType.TALL_GRASS, NatureBlock.BAMBOO, NatureBlock.BAMBOO_LEAVES, NatureBlock.FERN, NatureBlock.REEDS,
  NatureBlock.WILDFLOWER_BLUE, NatureBlock.WILDFLOWER_WHITE, NatureBlock.WILDFLOWER_PINK, NatureBlock.WILDFLOWER_PURPLE,
  NatureBlock.MUSHROOM_RED, NatureBlock.MUSHROOM_BROWN, NatureBlock.FALLEN_LEAVES, NatureBlock.SAKURA_PETALS,
]) TABLE[id] = Class.PLANT;

for (const id of [
  BlockType.LEAVES, BlockType.BIRCH_LEAVES, BlockType.PINE_LEAVES, NatureBlock.CEDAR_LEAVES, NatureBlock.SAKURA_LEAVES,
  NatureBlock.SNOWY_PINE_LEAVES,
]) TABLE[id] = Class.LEAVES;

export const classOf = (id: number): Class => TABLE[id] as Class;

// A feature block `next` may be written into a cell that holds `old`.
export const canReplace = (old: number, next: number): boolean => {
  const o = TABLE[old];
  if (o === Class.AIR) return true;
  const n = TABLE[next];
  if (n === Class.PLANT) return false;
  if (n === Class.LEAVES) return o === Class.PLANT;
  return o === Class.PLANT || o === Class.LEAVES; // a solid feature block (log, stone)
};
