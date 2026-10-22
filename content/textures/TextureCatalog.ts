import { hashString, SeededRng } from './Rng';
import { TextureRecipe } from './TextureRecipe';
import { Basalt, Brick, Cobble, HangarWall, Marble, MossyCobble, Plaster, RoofTile, StoneBrick } from './recipes/masonry';
import { BirchLog, Log, Plank } from './recipes/wood';
import { Crystal, Glass, Gold, Iron, Lantern, MagicStone, Obsidian, Slime, Steel } from './recipes/materials';
import { Dirt, Farmland, GrassSide, GrassTop, Leaves, Path, Sand, Snow, Speckle, Stone, Water, Wheat } from './recipes/natural';
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
    // Trees
    .register('log_side', new Log('side'))
    .register('log_top', new Log('top'))
    .register('birch_log_side', new BirchLog('side'))
    .register('birch_log_top', new BirchLog('top'))
    .register('leaves_oak', new Leaves('leaves_oak', palette('#1f4f22', '#2d6a2c', '#3d8a37', '#55a64a')))
    .register('leaves_birch', new Leaves('leaves_birch', palette('#3b6e2a', '#55902f', '#74ad3e', '#97c95a')))
    .register('leaves_pine', new Leaves('leaves_pine', palette('#0c3318', '#154a24', '#1f6330', '#2c7c3f'), 'needle', 0.16))
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
