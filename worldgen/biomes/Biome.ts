export enum Biome {
  MEADOW = 0,
  BIRCH_WOOD = 1,
  OAK_WOOD = 2,
  CEDAR_FOREST = 3,
  PINE_FOREST = 4,
  BAMBOO_GROVE = 5,
  SAKURA_GROVE = 6,
  WETLAND = 7,
  ROCKY_HILLS = 8,
  ALPINE = 9,
  BEACH = 10,
}

export const BIOME_COUNT = 11;

export const biomeName = (biome: Biome): string => Biome[biome].toLowerCase();

// Biomes made of trees. Used where the generator wants to know if a place is a wood at all.
export const isWoodland = (biome: Biome): boolean =>
  biome === Biome.BIRCH_WOOD || biome === Biome.OAK_WOOD || biome === Biome.CEDAR_FOREST ||
  biome === Biome.PINE_FOREST || biome === Biome.BAMBOO_GROVE || biome === Biome.SAKURA_GROVE;
