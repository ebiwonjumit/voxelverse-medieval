import { hashString, SeededRng } from './Rng';
import { TextureRecipe } from './TextureRecipe';
import { Basalt, Brick, Cobble, HangarWall, Marble, MossyCobble, Plaster, RoofTile, StoneBrick } from './recipes/masonry';
import { BirchLog, CedarLog, Log, PineLog, Plank, SakuraLog } from './recipes/wood';
import { Crystal, Glass, Gold, Iron, Lantern, MagicStone, Obsidian, Slime, Steel } from './recipes/materials';
import { Apple, Flower, LilyPad, Sugarcane, TallGrass } from './recipes/plants';
import { Dirt, Farmland, GrassSide, GrassTop, Leaves, Path, Sand, Snow, Speckle, Stone, Water, Wheat } from './recipes/natural';
import { Bamboo, BambooLeaves, Fern, Mushroom, Reeds, Wildflower, fallenLeaves, sakuraPetals } from './recipes/undergrowth';
import { Blossom, CedarLeaves, Gravel, Granite, Moss, Mud, Podzol, SnowyPine, SoilSide } from './recipes/wilds';
import { hex, palette } from './Pixels';

export interface CatalogEntry {
  readonly name: string;
  readonly recipe: TextureRecipe;
  /** Seed used when the caller does not pass one, so every tile has one fixed look. */
  readonly seed: number;
}

/** Names mapped to recipes. Order is registration order, which is the order of the contact sheet. */
export class TextureCatalog {
  private readonly entries = new Map<string, CatalogEntry>();

  register(name: string, recipe: TextureRecipe, seed = hashString(name)): this {
    if (this.entries.has(name)) throw new Error(`Texture "${name}" is already registered`);
    this.entries.set(name, { name, recipe, seed });
    return this;
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  names(): string[] {
    return [...this.entries.keys()];
  }

  get(name: string): CatalogEntry {
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`Unknown texture "${name}"`);
    return entry;
  }

  /** The tile's 16x16 RGBA pixels. */
  render(name: string, seed?: number): Uint8Array {
    const e = this.get(name);
    return e.recipe.generate(new SeededRng(seed ?? e.seed));
  }

  /** 255 where the biome tint applies, one byte per pixel; all zero for untinted tiles. */
  tintMask(name: string, seed?: number): Uint8Array {
    const e = this.get(name);
    return e.recipe.tintMask(new SeededRng(seed ?? e.seed));
  }
}

export const createDefaultCatalog = (): TextureCatalog =>
  new TextureCatalog()
    // Ground and terrain
    .register('grass_top', new GrassTop())
    .register('grass_side', new GrassSide())
    .register('dirt', new Dirt())
    .register('stone', new Stone())
    .register('sand', new Sand())
    .register('snow', new Snow())
    .register('water', new Water())
    .register('path', new Path())
    .register('farmland', new Farmland())
    .register('wheat_stage_1', new Wheat('wheat_stage_1', 'sprout'))
    .register('wheat_stage_2', new Wheat('wheat_stage_2', 'growing'))
    .register('wheat_ripe', new Wheat('wheat_ripe', 'ripe'))
    .register('tall_grass', new TallGrass())
    .register('sugarcane', new Sugarcane())
    .register('flower_yellow', new Flower('flower_yellow', palette('#c98f10', '#e8b21c', '#f8d23e', '#fff08a'), hex('#8a4a12')))
    .register('flower_red', new Flower('flower_red', palette('#8a1420', '#b8202e', '#dc3c46', '#f27a78'), hex('#f2d24a')))
    .register('lily_pad', new LilyPad())
    .register('red_apple', new Apple())
    // Trees
    .register('log_side', new Log('side'))
    .register('log_top', new Log('top'))
    .register('birch_log_side', new BirchLog('side'))
    .register('birch_log_top', new BirchLog('top'))
    .register('leaves_oak', new Leaves('leaves_oak', palette('#8e8e8e', '#b0b0b0', '#d0d0d0', '#eeeeee'), 'clump', 0.2, 'grass'))
    .register('leaves_birch', new Leaves('leaves_birch', palette('#3b6e2a', '#55902f', '#74ad3e', '#97c95a')))
    .register('leaves_pine', new Leaves('leaves_pine', palette('#0c3318', '#154a24', '#1f6330', '#2c7c3f'), 'needle', 0.16))
    // Wilderness: the nature blocks of content/blocksNature.ts
    .register('cedar_log_side', new CedarLog('side'))
    .register('cedar_log_top', new CedarLog('top'))
    .register('cedar_leaves', new CedarLeaves())
    .register('sakura_log_side', new SakuraLog('side'))
    .register('sakura_log_top', new SakuraLog('top'))
    .register('sakura_leaves', new Blossom())
    .register('pine_log_side', new PineLog('side'))
    .register('pine_log_top', new PineLog('top'))
    .register('snowy_pine_leaves', new SnowyPine())
    .register('bamboo', new Bamboo())
    .register('bamboo_leaves', new BambooLeaves())
    .register('fern', new Fern())
    .register('reeds', new Reeds())
    .register('wildflower_blue', new Wildflower('wildflower_blue', 'bell', palette('#2a3f9a', '#3f62d6', '#6a8cf5', '#a9c1ff')))
    .register('wildflower_white', new Wildflower('wildflower_white', 'daisy', palette('#b9c4c4', '#dde5e3', '#f4f7f4', '#ffffff'), hex('#f2bf2a')))
    .register('wildflower_pink', new Wildflower('wildflower_pink', 'cluster', palette('#b83c70', '#e0588c', '#ff86b3', '#ffc4dc'), hex('#ffe9a8')))
    .register('wildflower_purple', new Wildflower('wildflower_purple', 'spike', palette('#4d2480', '#6e38a8', '#9b59d0', '#c8a0ee')))
    .register('mushroom_red', new Mushroom('mushroom_red', 'spotted', palette('#7a1418', '#b8242a', '#dc443c', '#f0786a'), hex('#f6f0e0')))
    .register('mushroom_brown', new Mushroom('mushroom_brown', 'plain', palette('#4a3220', '#6b4a30', '#8a6644', '#a8845c'), hex('#000000')))
    .register('fallen_leaves', fallenLeaves())
    .register('sakura_petals', sakuraPetals())
    .register('gravel', new Gravel())
    .register('moss', new Moss())
    .register('moss_side', new SoilSide('moss_side', 'moss'))
    .register('podzol', new Podzol())
    .register('podzol_side', new SoilSide('podzol_side', 'podzol'))
    .register('granite', new Granite())
    .register('mud', new Mud())
    // Masonry
    .register('cobble', new Cobble())
    .register('mossy_cobble', new MossyCobble())
    .register('stone_brick', new StoneBrick())
    .register('brick_red', new Brick('brick_red', palette('#8a3b30', '#9a4638', '#a95243', '#b95f4e'), hex('#c0b8aa')))
    .register('brick_factory', new Brick('brick_factory', palette('#5e2323', '#6f2b2b', '#803434', '#8f3e3c'), hex('#2b2423'), true))
    .register('plaster', new Plaster())
    .register('marble', new Marble())
    .register('basalt', new Basalt())
    .register('roof_red', new RoofTile('roof_red', palette('#6e1d17', '#a02e24', '#c04434', '#d65a46')))
    .register('roof_blue', new RoofTile('roof_blue', palette('#18235c', '#283a8a', '#3b55b4', '#5370d0')))
    // Wood
    .register('plank', new Plank('plank', palette('#8a6a3d', '#9d7b49', '#b08d58', '#c19c66'), hex('#5b4222')))
    .register('dark_plank', new Plank('dark_plank', palette('#3f2a1b', '#4f3622', '#60442b', '#725337'), hex('#24160d')))
    .register('guild_wood', new Plank('guild_wood', palette('#d98f3d', '#e8a54e', '#f4bb66', '#fccf84'), hex('#8e5320'), true, 2))
    // Glass, metal and the odd ones
    .register('glass', new Glass())
    .register('gold', new Gold())
    .register('iron', new Iron())
    .register('obsidian', new Obsidian())
    .register('steel', new Steel())
    .register('hangar_wall', new HangarWall())
    .register('magic_stone', new MagicStone())
    .register('crystal', new Crystal())
    .register('slime', new Slime())
    .register('lantern', new Lantern())
    .register('speckle', new Speckle('speckle', palette('#6e6e72', '#808085', '#929297', '#a5a5aa'), palette('#4f4f53', '#c9c9cd'), 10));
