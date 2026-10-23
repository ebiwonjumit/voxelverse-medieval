import { BlockFaces, BlockRegistry } from '../engine/BlockRegistry';
import { Box, BlockModel } from '../engine/models/BlockModel';
import { BoxModel } from '../engine/models/BoxModel';
import { FenceModel } from '../engine/models/FenceModel';
import { OrientedBoxModel } from '../engine/models/OrientedBoxModel';
import { PaneModel } from '../engine/models/PaneModel';
import { PlateModel } from '../engine/models/PlateModel';
import { SlabModel } from '../engine/models/SlabModel';
import { StairModel } from '../engine/models/StairModel';

// The blocks of Tempest, the forest city: timber, plaster, five roofs, paper and stone lanterns, bamboo, tatami,
// paving, garden stone, furniture and street props. Ids 128..199 belong to this file (the rest of 128..255 is for the
// buildings and landmarks built from them); never renumber one, worlds store these numbers. The tiles are drawn in
// content/textures/recipes/tempest*.ts and the table of what is what, with the light each block gives, is in
// docs/tempest-blocks.md.
export const TEMPEST_ID_MIN = 128;
export const TEMPEST_ID_MAX = 199;

export const TempestBlock = {
  // Timber and bamboo
  VERMILION_LOG: 128,
  VERMILION_PLANKS: 129,
  TIMBER_POST: 130,
  TIMBER_BEAM: 131,
  VERMILION_RAIL: 132,
  BAMBOO_FENCE: 133,
  BAMBOO_POLE: 134,
  BAMBOO_BLIND: 135,
  // Walls
  PLASTER_WHITE: 136,
  PLASTER_TIMBER: 137,
  PLASTER_BASE: 138,
  PLASTER_STAIRS: 139,
  WHITE_COLUMN: 140,
  // Roofs: a full block, stairs and a slab each
  TERRACOTTA_ROOF: 141,
  TERRACOTTA_ROOF_STAIRS: 142,
  TERRACOTTA_ROOF_SLAB: 143,
  DARK_TILE_ROOF: 144,
  DARK_TILE_ROOF_STAIRS: 145,
  DARK_TILE_ROOF_SLAB: 146,
  GREEN_TILE_ROOF: 147,
  GREEN_TILE_ROOF_STAIRS: 148,
  GREEN_TILE_ROOF_SLAB: 149,
  TEAL_ROOF: 150,
  TEAL_ROOF_STAIRS: 151,
  TEAL_ROOF_SLAB: 152,
  THATCH_ROOF: 153,
  THATCH_ROOF_STAIRS: 154,
  THATCH_ROOF_SLAB: 155,
  // Ridge caps and their horned ends
  TERRACOTTA_RIDGE: 156,
  TERRACOTTA_RIDGE_HORN: 157,
  DARK_RIDGE: 158,
  DARK_RIDGE_HORN: 159,
  // Windows and light
  SHOJI_PANE: 160,
  SHOJI_PANE_LIT: 161,
  LATTICE_WINDOW: 162,
  PAPER_LANTERN_RED: 163,
  PAPER_LANTERN_STRIPED: 164,
  STONE_LANTERN_BASE: 165,
  STONE_LANTERN_LIGHT: 166,
  STONE_LANTERN_CAP: 167,
  BLUE_ORE_LAMP: 168,
  GREEN_ORE_LAMP: 169,
  // Floors, paving and garden stone
  TATAMI: 170,
  ENGAWA_FLOOR: 171,
  STONE_PAVING: 172,
  FAN_PAVING: 173,
  STONE_CURB: 174,
  STEPPING_STONES: 175,
  MOSSY_STONE: 176,
  MOSSY_STONE_SLAB: 177,
  MOSSY_STONE_STAIRS: 178,
  STONE_BASIN: 179,
  KOI_POND: 180,
  WATER_JET: 181,
  STONE_BOLLARD: 182,
  // Furniture and props
  LOW_TABLE: 183,
  FUTON: 184,
  CUSHION: 185,
  BOOKSHELF: 186,
  HEARTH: 187,
  BARREL: 188,
  CRATE: 189,
  RICE_BALE: 190,
  VASE: 191,
  BUCKET: 192,
  SIGNBOARD: 193,
  NOREN_INDIGO: 194,
  NOREN_RED: 195,
  NOREN_WHITE: 196,
  AWNING_RED: 197,
  AWNING_INDIGO: 198,
  LAUNDRY_POLE: 199,
} as const;

// --- Shapes ----------------------------------------------------------------------------------------------------
// Boxes are written in pixels of the 16 by 16 tile (x east, y up, z south) and turned into cell units by `px`. Most of
// them are laid over the whole cell and show the part of their tile they cover (the models' `cell` mapping), so a tile
// is a picture of the object where it stands.

type PxBox = readonly [number, number, number, number, number, number];
const px = (...boxes: PxBox[]): Box[] => boxes.map((b) => [b[0] / 16, b[1] / 16, b[2] / 16, b[3] / 16, b[4] / 16, b[5] / 16]);

/** An eight sided shaft of the given width from three boxes: a wide middle band and a narrower cap on its north and south sides. */
const shaft = (width: number, cut: number): PxBox[] => {
  const lo = (16 - width) / 2;
  const hi = 16 - lo;
  return [[lo, 0, lo + cut, hi, 16, hi - cut], [lo + cut, 0, lo, hi - cut, 16, lo + cut], [lo + cut, 0, hi - cut, hi - cut, 16, hi]];
};

// Ridge caps, written for a ridge running east to west (state 0), a rolled cap over a wider foot. The horned end is
// the east one: the crest climbs three steps and narrows to a tip. Turning the block turns the horn with it.
const RIDGE_BODY: PxBox[] = [[0, 0, 2, 16, 3, 14], [0, 3, 5, 16, 7, 11]];
const RIDGE_HORN: PxBox[] = [
  [0, 0, 2, 16, 3, 14], [0, 3, 5, 9, 7, 11],
  [9, 3, 5, 16, 8, 11], [11, 8, 6, 16, 12, 10], [13, 12, 7, 16, 16, 9],
];

/**
 * An awning, written with the wall to the north and the cloth falling to the south in steps of two sixteenths every four
 * pixels, with a short valance hanging at the front edge. Stripes run down the slope.
 */
const AWNING: PxBox[] = [[0, 13, 0, 16, 15, 4], [0, 11, 4, 16, 13, 8], [0, 9, 8, 16, 11, 12], [0, 5, 12, 16, 10, 13]];

// The stone lantern is three blocks stacked: a post on a foot, a firebox with its plates, and a roof under a jewel.
const LANTERN_BASE: PxBox[] = [[3, 0, 3, 13, 2, 13], [6, 2, 6, 10, 13, 10], [4, 13, 4, 12, 16, 12]];
const LANTERN_LIGHT: PxBox[] = [[3, 0, 3, 13, 2, 13], [4, 2, 4, 12, 12, 12], [3, 12, 3, 13, 14, 13]];
const LANTERN_CAP: PxBox[] = [[1, 0, 1, 15, 3, 15], [3, 3, 3, 13, 6, 13], [5, 6, 5, 11, 9, 11], [6, 9, 6, 10, 12, 10], [7, 12, 7, 9, 14, 9]];

// A basin: a stone floor, a rim two pixels thick and a plate of still water set two pixels under the rim.
const BASIN: PxBox[] = [
  [0, 0, 0, 16, 4, 16],
  [0, 4, 0, 16, 14, 2], [0, 4, 14, 16, 14, 16], [0, 4, 2, 2, 14, 14], [14, 4, 2, 16, 14, 14],
  [2, 4, 2, 14, 12, 14],
];

// --- The table of blocks ----------------------------------------------------------------------------------------

interface TempestDef {
  id: number;
  name: string;
  /** The flat fallback colour, and what a far chunk's average would be. */
  color: string;
  faces: BlockFaces;
  solid?: boolean;
  opaque?: boolean;
  emits?: number;
  lightDim?: number;
  model?: BlockModel;
  holdsWater?: boolean;
}

const same = (name: string): BlockFaces => ({ top: name, bottom: name, side: name });
const ends = (end: string, side: string): BlockFaces => ({ top: end, bottom: end, side });
const faces = (top: string, side: string, bottom = side): BlockFaces => ({ top, bottom, side });

const SLAB = new SlabModel();
const STAIRS = new StairModel();

interface RoofKit {
  name: string;
  tile: string;
  color: string;
  ids: readonly [number, number, number];
}

const ROOFS: readonly RoofKit[] = [
  { name: 'terracotta_roof', tile: 'terracotta_roof', color: '#c0602f', ids: [TempestBlock.TERRACOTTA_ROOF, TempestBlock.TERRACOTTA_ROOF_STAIRS, TempestBlock.TERRACOTTA_ROOF_SLAB] },
  { name: 'dark_tile_roof', tile: 'dark_tile_roof', color: '#2f3645', ids: [TempestBlock.DARK_TILE_ROOF, TempestBlock.DARK_TILE_ROOF_STAIRS, TempestBlock.DARK_TILE_ROOF_SLAB] },
  { name: 'green_tile_roof', tile: 'green_tile_roof', color: '#2c7a4c', ids: [TempestBlock.GREEN_TILE_ROOF, TempestBlock.GREEN_TILE_ROOF_STAIRS, TempestBlock.GREEN_TILE_ROOF_SLAB] },
  { name: 'teal_roof', tile: 'teal_roof', color: '#4a8e95', ids: [TempestBlock.TEAL_ROOF, TempestBlock.TEAL_ROOF_STAIRS, TempestBlock.TEAL_ROOF_SLAB] },
  { name: 'thatch_roof', tile: 'thatch_roof', color: '#a2823f', ids: [TempestBlock.THATCH_ROOF, TempestBlock.THATCH_ROOF_STAIRS, TempestBlock.THATCH_ROOF_SLAB] },
];

const roofDefs = (): TempestDef[] =>
  ROOFS.flatMap(({ name, tile, color, ids }) => [
    { id: ids[0], name, color, faces: same(tile) },
    { id: ids[1], name: `${name}_stairs`, color, faces: same(tile), model: STAIRS },
    { id: ids[2], name: `${name}_slab`, color, faces: same(tile), model: SLAB },
  ]);

// The one-picture thin things (a curtain, a sign, a washing line) are planes drawn as thin boxes and stand either way
// round; the awning and the ridge caps too.
const NOREN: PxBox[] = [[0, 15, 7, 16, 16, 9], [1, 5, 7.5, 15, 15, 8.5]];
const SIGN: PxBox[] = [[0, 3, 7, 16, 12, 9], [3, 12, 7.5, 4, 16, 8.5], [12, 12, 7.5, 13, 16, 8.5]];
const WASHING: PxBox[] = [[0, 2, 7.5, 16, 15, 8.5]];

const defs = (): TempestDef[] => [
  // Timber and bamboo
  { id: TempestBlock.VERMILION_LOG, name: 'vermilion_log', color: '#a5281c', faces: ends('vermilion_log_top', 'vermilion_log_side') },
  { id: TempestBlock.VERMILION_PLANKS, name: 'vermilion_planks', color: '#a02a1d', faces: same('vermilion_planks') },
  { id: TempestBlock.TIMBER_POST, name: 'timber_post', color: '#3d2b20', faces: ends('timber_end', 'timber_post_side') },
  { id: TempestBlock.TIMBER_BEAM, name: 'timber_beam', color: '#3a281c', faces: same('timber_beam') },
  { id: TempestBlock.VERMILION_RAIL, name: 'vermilion_rail', color: '#a02a1d', faces: same('vermilion_planks'), solid: true, opaque: false, model: new FenceModel() },
  { id: TempestBlock.BAMBOO_FENCE, name: 'bamboo_fence', color: '#78a336', faces: same('bamboo_fence'), solid: true, opaque: false, model: new FenceModel() },
  { id: TempestBlock.BAMBOO_POLE, name: 'bamboo_pole', color: '#78a336', faces: same('bamboo_pole'), solid: true, opaque: false, model: new BoxModel(px([6, 0, 6, 10, 16, 10]), 'cell') },
  { id: TempestBlock.BAMBOO_BLIND, name: 'bamboo_blind', color: '#a89a48', faces: same('bamboo_blind'), solid: true, opaque: false, lightDim: 2, model: new PaneModel() },
  // Walls
  { id: TempestBlock.PLASTER_WHITE, name: 'plaster_white', color: '#e6e9ea', faces: same('plaster_white') },
  { id: TempestBlock.PLASTER_TIMBER, name: 'plaster_timber', color: '#d0d3d3', faces: same('plaster_timber') },
  { id: TempestBlock.PLASTER_BASE, name: 'plaster_base', color: '#c4c9cb', faces: same('plaster_base') },
  { id: TempestBlock.PLASTER_STAIRS, name: 'plaster_stairs', color: '#e6e9ea', faces: same('plaster_white'), model: STAIRS },
  {
    id: TempestBlock.WHITE_COLUMN, name: 'white_column', color: '#dfe3e5', faces: faces('plaster_white', 'column_white'),
    solid: true, opaque: false, model: new BoxModel(px(...shaft(12, 3)), 'cell'),
  },
  ...roofDefs(),
  // Ridge caps and their horned ends: the same four states, the horn at the end the turn gives it
  { id: TempestBlock.TERRACOTTA_RIDGE, name: 'terracotta_ridge', color: '#c0602f', faces: same('terracotta_ridge'), solid: true, opaque: false, model: new OrientedBoxModel(px(...RIDGE_BODY)) },
  { id: TempestBlock.TERRACOTTA_RIDGE_HORN, name: 'terracotta_ridge_horn', color: '#c0602f', faces: same('terracotta_ridge'), solid: true, opaque: false, model: new OrientedBoxModel(px(...RIDGE_HORN)) },
  { id: TempestBlock.DARK_RIDGE, name: 'dark_ridge', color: '#2f3645', faces: same('dark_ridge'), solid: true, opaque: false, model: new OrientedBoxModel(px(...RIDGE_BODY)) },
  { id: TempestBlock.DARK_RIDGE_HORN, name: 'dark_ridge_horn', color: '#2f3645', faces: same('dark_ridge'), solid: true, opaque: false, model: new OrientedBoxModel(px(...RIDGE_HORN)) },
  // Windows and light. Paper takes a little of the light it lets through (lightDim), and a lit screen is a lamp behind it.
  { id: TempestBlock.SHOJI_PANE, name: 'shoji_pane', color: '#ebe4d0', faces: same('shoji'), solid: true, opaque: false, lightDim: 2, model: new PaneModel() },
  { id: TempestBlock.SHOJI_PANE_LIT, name: 'shoji_pane_lit', color: '#fbc063', faces: same('shoji_lit'), solid: true, opaque: false, lightDim: 2, emits: 8, model: new PaneModel() },
  { id: TempestBlock.LATTICE_WINDOW, name: 'lattice_window', color: '#5b4129', faces: same('lattice_window'), solid: true, opaque: false, model: new PaneModel() },
  {
    id: TempestBlock.PAPER_LANTERN_RED, name: 'paper_lantern_red', color: '#d03a2a', faces: faces('black_lacquer', 'paper_lantern_red'),
    solid: true, opaque: false, emits: 14, model: new BoxModel(px([5, 2, 5, 11, 14, 11], [7, 14, 7, 9, 16, 9]), 'cell'),
  },
  {
    id: TempestBlock.PAPER_LANTERN_STRIPED, name: 'paper_lantern_striped', color: '#e0a79a', faces: faces('black_lacquer', 'paper_lantern_striped'),
    solid: true, opaque: false, emits: 14, model: new BoxModel(px([5, 2, 5, 11, 14, 11], [7, 14, 7, 9, 16, 9]), 'cell'),
  },
  { id: TempestBlock.STONE_LANTERN_BASE, name: 'stone_lantern_base', color: '#8f959a', faces: same('lantern_stone'), solid: true, opaque: false, model: new BoxModel(px(...LANTERN_BASE), 'cell') },
  {
    id: TempestBlock.STONE_LANTERN_LIGHT, name: 'stone_lantern_light', color: '#d9a35a', faces: faces('lantern_stone', 'stone_lantern_light'),
    solid: true, opaque: false, emits: 12, model: new BoxModel(px(...LANTERN_LIGHT), 'cell'),
  },
  { id: TempestBlock.STONE_LANTERN_CAP, name: 'stone_lantern_cap', color: '#8f959a', faces: same('lantern_stone'), solid: true, opaque: false, model: new BoxModel(px(...LANTERN_CAP), 'cell') },
  { id: TempestBlock.BLUE_ORE_LAMP, name: 'blue_ore_lamp', color: '#2f9be0', faces: same('blue_ore_lamp'), emits: 15 },
  { id: TempestBlock.GREEN_ORE_LAMP, name: 'green_ore_lamp', color: '#38c06a', faces: same('green_ore_lamp'), emits: 13 },
  // Floors, paving and garden stone
  { id: TempestBlock.TATAMI, name: 'tatami', color: '#b9bf80', faces: faces('tatami_top', 'tatami_side'), model: new BoxModel(px([0, 0, 0, 16, 4, 16]), 'cell') },
  { id: TempestBlock.ENGAWA_FLOOR, name: 'engawa_floor', color: '#c4935f', faces: faces('engawa_floor', 'timber_beam') },
  { id: TempestBlock.STONE_PAVING, name: 'stone_paving', color: '#b8b0a0', faces: same('stone_paving') },
  { id: TempestBlock.FAN_PAVING, name: 'fan_paving', color: '#bcaea6', faces: same('fan_paving') },
  { id: TempestBlock.STONE_CURB, name: 'stone_curb', color: '#9da3a8', faces: faces('curb_top', 'curb_side'), model: SLAB },
  { id: TempestBlock.STEPPING_STONES, name: 'stepping_stones', color: '#a29a90', faces: same('stepping_stones'), solid: false, opaque: false, model: new PlateModel(0, 0, 2 / 16) },
  { id: TempestBlock.MOSSY_STONE, name: 'mossy_stone', color: '#7c8a78', faces: same('mossy_stone') },
  { id: TempestBlock.MOSSY_STONE_SLAB, name: 'mossy_stone_slab', color: '#7c8a78', faces: same('mossy_stone'), model: SLAB },
  { id: TempestBlock.MOSSY_STONE_STAIRS, name: 'mossy_stone_stairs', color: '#7c8a78', faces: same('mossy_stone'), model: STAIRS },
  { id: TempestBlock.STONE_BASIN, name: 'stone_basin', color: '#7cb4d0', faces: faces('basin_top', 'ashlar'), solid: true, opaque: false, model: new BoxModel(px(...BASIN), 'cell') },
  { id: TempestBlock.KOI_POND, name: 'koi_pond', color: '#3b94c4', faces: same('koi'), solid: false, opaque: false, holdsWater: true, model: new PlateModel(0, 0.985) },
  { id: TempestBlock.WATER_JET, name: 'water_jet', color: '#b4e0f2', faces: same('water_jet'), solid: false, opaque: false, model: new BoxModel(px([6, 0, 6, 10, 16, 10], [3, 12, 3, 13, 16, 13]), 'cell') },
  { id: TempestBlock.STONE_BOLLARD, name: 'stone_bollard', color: '#8f959a', faces: same('lantern_stone'), solid: true, opaque: false, model: new BoxModel(px([5, 0, 5, 11, 10, 11], [4, 10, 4, 12, 11, 12]), 'cell') },
  // Furniture and props
  {
    id: TempestBlock.LOW_TABLE, name: 'low_table', color: '#2a1d19', faces: same('black_lacquer'), solid: true, opaque: false,
    model: new BoxModel(px([1, 6, 2, 15, 8, 14], [2, 0, 3, 4, 6, 5], [12, 0, 3, 14, 6, 5], [2, 0, 11, 4, 6, 13], [12, 0, 11, 14, 6, 13]), 'cell'),
  },
  {
    id: TempestBlock.FUTON, name: 'futon', color: '#ddd5bd', faces: faces('futon_top', 'futon_side'), solid: true, opaque: false,
    model: new BoxModel(px([0, 0, 0, 16, 3, 16], [4, 3, 1, 12, 5, 6]), 'cell'),
  },
  { id: TempestBlock.CUSHION, name: 'cushion', color: '#27407d', faces: same('cushion'), solid: true, opaque: false, model: new BoxModel(px([3, 0, 3, 13, 3, 13]), 'stretch') },
  { id: TempestBlock.BOOKSHELF, name: 'bookshelf', color: '#4a3322', faces: faces('timber_post_side', 'bookshelf') },
  { id: TempestBlock.HEARTH, name: 'hearth', color: '#7a6455', faces: faces('hearth_top', 'hearth_side'), solid: true, opaque: false, emits: 8, model: new BoxModel(px([0, 0, 0, 16, 10, 16]), 'cell') },
  { id: TempestBlock.BARREL, name: 'barrel', color: '#8a6236', faces: faces('barrel_top', 'barrel_side'), solid: true, opaque: false, model: new BoxModel(px(...shaft(14, 3)), 'cell') },
  { id: TempestBlock.CRATE, name: 'crate', color: '#a07c48', faces: same('crate') },
  { id: TempestBlock.RICE_BALE, name: 'rice_bale', color: '#c7a85a', faces: same('rice_bale'), solid: true, opaque: false, model: new BoxModel(px([2, 0, 2, 14, 9, 14]), 'stretch') },
  {
    id: TempestBlock.VASE, name: 'vase', color: '#cfd8dc', faces: same('vase'), solid: true, opaque: false,
    model: new BoxModel(px([4, 0, 4, 12, 8, 12], [5, 8, 5, 11, 10, 11], [6, 10, 6, 10, 13, 10], [5, 13, 5, 11, 14, 11]), 'cell'),
  },
  { id: TempestBlock.BUCKET, name: 'bucket', color: '#a68450', faces: faces('bucket_top', 'bucket_side'), solid: true, opaque: false, model: new BoxModel(px([4, 0, 4, 12, 7, 12]), 'cell') },
  { id: TempestBlock.SIGNBOARD, name: 'signboard', color: '#e0d4b4', faces: same('signboard'), solid: false, opaque: false, model: new OrientedBoxModel(px(...SIGN)) },
  { id: TempestBlock.NOREN_INDIGO, name: 'noren_indigo', color: '#1f3170', faces: same('noren_indigo'), solid: false, opaque: false, model: new OrientedBoxModel(px(...NOREN)) },
  { id: TempestBlock.NOREN_RED, name: 'noren_red', color: '#a3241b', faces: same('noren_red'), solid: false, opaque: false, model: new OrientedBoxModel(px(...NOREN)) },
  { id: TempestBlock.NOREN_WHITE, name: 'noren_white', color: '#e4e6dd', faces: same('noren_white'), solid: false, opaque: false, model: new OrientedBoxModel(px(...NOREN)) },
  { id: TempestBlock.AWNING_RED, name: 'awning_red', color: '#c9a39a', faces: same('awning_red'), solid: true, opaque: false, lightDim: 3, model: new OrientedBoxModel(px(...AWNING)) },
  { id: TempestBlock.AWNING_INDIGO, name: 'awning_indigo', color: '#7d8bb5', faces: same('awning_indigo'), solid: true, opaque: false, lightDim: 3, model: new OrientedBoxModel(px(...AWNING)) },
  { id: TempestBlock.LAUNDRY_POLE, name: 'laundry_pole', color: '#d6d9db', faces: same('laundry'), solid: false, opaque: false, model: new OrientedBoxModel(px(...WASHING)) },
];

export const registerTempestBlocks = (registry: BlockRegistry): void => {
  for (const def of defs()) {
    registry.register({
      id: def.id,
      name: `voxelverse:${def.name}`,
      color: def.color,
      solid: def.solid ?? true,
      opaque: def.opaque ?? true,
      emits: def.emits ?? 0,
      lightDim: def.lightDim,
      faces: def.faces,
      model: def.model,
      holdsWater: def.holdsWater,
    });
  }
};

// For tests and tools that want to walk the set without a registry.
export const tempestBlockIds = (): number[] => Object.values(TempestBlock).sort((a, b) => a - b);

/** Short block names by id, in id order (what the sandbox's `view=tempest` lists). */
export const tempestBlockNames = (): string[] => defs().sort((a, b) => a.id - b.id).map((d) => d.name);
