import { ShapedBlock } from '../../content/blocksShaped';
import { NatureBlock } from '../../content/blocksNature';
import { TempestBlock as T } from '../../content/blocksTempest';
import { BlockType } from '../../worldConstants';
import { FamilyDef, RoleMap, StylePack } from '../structures/StylePack';

// The Tempest style pack: what the forest city's buildings are made of. The base roles are the commonest house of the
// town (white plaster in a dark timber frame under a warm terracotta roof), and the families are the other palettes of the
// owner's pictures, so a street mixes them. From above the town should read as one terracotta mass, which is why that roof
// is the base and the heaviest weight in every ordinary district; dark ridged tile, green glaze and thatch are accents.
//
// Districts are the names worldgen/tempest/layout.ts gives its blocks.

const BASE: RoleMap = {
  wall: T.PLASTER_WHITE,
  wallFrame: T.PLASTER_TIMBER,
  wallBase: T.PLASTER_BASE,
  trim: T.TIMBER_BEAM,
  beam: T.TIMBER_BEAM,
  post: T.TIMBER_POST,
  accent: T.VERMILION_LOG,
  column: T.WHITE_COLUMN,
  roofBlock: T.TERRACOTTA_ROOF,
  roofStairs: T.TERRACOTTA_ROOF_STAIRS,
  roofSlab: T.TERRACOTTA_ROOF_SLAB,
  ridge: T.TERRACOTTA_RIDGE,
  ridgeHorn: T.TERRACOTTA_RIDGE_HORN,
  glassPane: ShapedBlock.GLASS_PANE,
  shoji: T.SHOJI_PANE,
  shojiLit: T.SHOJI_PANE_LIT,
  lattice: T.LATTICE_WINDOW,
  blind: T.BAMBOO_BLIND,
  floor: T.ENGAWA_FLOOR,
  interiorFloor: BlockType.WOOD_PLANK,
  path: T.STONE_PAVING,
  pathAlt: T.FAN_PAVING,
  curb: T.STONE_CURB,
  stone: T.MOSSY_STONE,
  stoneSlab: T.MOSSY_STONE_SLAB,
  stoneStairs: T.MOSSY_STONE_STAIRS,
  light: T.PAPER_LANTERN_RED,
  lightAlt: T.PAPER_LANTERN_STRIPED,
  fence: T.BAMBOO_FENCE,
  rail: T.VERMILION_RAIL,
  awning: T.AWNING_RED,
  awningAlt: T.AWNING_INDIGO,
  noren: T.NOREN_INDIGO,
  norenAlt: T.NOREN_RED,
  sign: T.SIGNBOARD,
};

// Districts (see layout.ts): civic, guest, government, public, luxury, commercial, production, storage, residential,
// tourism. The weights are relative; a district that is not listed gets `fallback`.
export const TEMPEST_FAMILIES: readonly FamilyDef[] = [
  {
    // The ordinary house: plaster in a dark frame, terracotta tile with horned ridge ends.
    name: 'timber-terracotta',
    overrides: {},
    weights: { residential: 6, commercial: 5, production: 5, storage: 3, luxury: 3, guest: 3, government: 3, public: 3, tourism: 3 },
    fallback: 4,
  },
  {
    // The heavy Japanese roof: charcoal ridged tile, vermilion posts.
    name: 'plaster-dark',
    overrides: {
      roofBlock: T.DARK_TILE_ROOF, roofStairs: T.DARK_TILE_ROOF_STAIRS, roofSlab: T.DARK_TILE_ROOF_SLAB,
      ridge: T.DARK_RIDGE, ridgeHorn: T.DARK_RIDGE_HORN, accent: T.VERMILION_LOG,
    },
    weights: { residential: 2, commercial: 2, production: 1, storage: 1, luxury: 4, guest: 4, government: 3, public: 2, tourism: 3 },
    fallback: 2,
  },
  {
    // Half-timber under green glaze, the inns and the bath: no ridge cap, the tiles run over the crest.
    name: 'half-timber-green',
    overrides: {
      wall: T.PLASTER_TIMBER, roofBlock: T.GREEN_TILE_ROOF, roofStairs: T.GREEN_TILE_ROOF_STAIRS, roofSlab: T.GREEN_TILE_ROOF_SLAB,
      ridge: T.GREEN_TILE_ROOF, ridgeHorn: T.GREEN_TILE_ROOF,
    },
    weights: { residential: 1, commercial: 2, production: 0.5, storage: 0.5, luxury: 2, guest: 3, government: 1, public: 1, tourism: 6 },
    fallback: 1,
  },
  {
    // Dark timber with red lacquer, the shrines and the grander houses.
    name: 'vermilion-dark',
    overrides: {
      post: T.VERMILION_LOG, beam: T.VERMILION_PLANKS, trim: T.VERMILION_PLANKS,
      roofBlock: T.DARK_TILE_ROOF, roofStairs: T.DARK_TILE_ROOF_STAIRS, roofSlab: T.DARK_TILE_ROOF_SLAB,
      ridge: T.DARK_RIDGE, ridgeHorn: T.DARK_RIDGE_HORN, light: T.PAPER_LANTERN_STRIPED, lightAlt: T.PAPER_LANTERN_RED,
    },
    weights: { residential: 1, commercial: 1, production: 0.5, storage: 0.2, luxury: 3, guest: 2, government: 2, public: 1, tourism: 3 },
    fallback: 0.5,
  },
  {
    // Thatch over plaster and bamboo: huts, stalls and the farm houses.
    name: 'thatch',
    overrides: {
      roofBlock: T.THATCH_ROOF, roofStairs: T.THATCH_ROOF_STAIRS, roofSlab: T.THATCH_ROOF_SLAB,
      ridge: T.THATCH_ROOF, ridgeHorn: T.THATCH_ROOF, beam: T.BAMBOO_POLE, post: T.BAMBOO_POLE,
    },
    weights: { residential: 1, commercial: 0.5, production: 1, storage: 2, luxury: 0, guest: 0, government: 0, public: 0, tourism: 1 },
    fallback: 0.5,
  },
  {
    // The civic hall: white plaster and columns under the teal roof.
    name: 'civic-teal',
    overrides: {
      wallFrame: T.PLASTER_WHITE, trim: T.PLASTER_WHITE, beam: T.PLASTER_WHITE, post: T.PLASTER_WHITE,
      roofBlock: T.TEAL_ROOF, roofStairs: T.TEAL_ROOF_STAIRS, roofSlab: T.TEAL_ROOF_SLAB,
      ridge: T.TEAL_ROOF, ridgeHorn: T.TEAL_ROOF, stoneStairs: T.PLASTER_STAIRS, stone: T.PLASTER_BASE, light: T.STONE_LANTERN_LIGHT,
    },
    weights: { civic: 10, government: 1, public: 2 },
    fallback: 0,
  },
];

export const TEMPEST_STYLE = new StylePack('tempest', BASE, TEMPEST_FAMILIES);

/** Blocks of the wilderness the town's gardens plant, by name, for kits and the zone to share. */
export const TEMPEST_TREES = {
  sakura: { log: NatureBlock.SAKURA_LOG, leaves: NatureBlock.SAKURA_LEAVES },
  cedar: { log: NatureBlock.CEDAR_LOG, leaves: NatureBlock.CEDAR_LEAVES },
} as const;
