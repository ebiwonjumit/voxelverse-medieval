import { TextureLayout, TileDescriptor, createTextureLayout } from '../../engine/TextureLayout';
import { BlockRegistry } from '../../engine/BlockRegistry';
import { TextureCatalog, createDefaultCatalog } from './TextureCatalog';

/**
 * What the layout needs to know about each tile: whether it takes a biome tint and whether the tint covers
 * only part of it (a grass side), in which case the mask is stored as an overlay layer. The mask is read from
 * the recipe, so a new tinted tile needs no change here.
 */
export const describeCatalog = (catalog: TextureCatalog): TileDescriptor[] =>
  catalog.names().map((name) => {
    const { recipe } = catalog.get(name);
    const tint = recipe.tint !== 'none';
    let overlay = false;
    if (tint) {
      const pixels = catalog.render(name);
      const mask = catalog.tintMask(name);
      // Partial means a visible pixel the tint skips. Holes in a cutout need no tint.
      for (let p = 0; p < mask.length; p++) if (!mask[p] && pixels[p * 4 + 3]) overlay = true;
    }
    return { name, tint, overlay };
  });

/** The layout the game uses: every default catalog tile, then a flat tile for each colour that needs one. */
export const createDefaultTextureLayout = (registry: BlockRegistry, catalog = createDefaultCatalog()): TextureLayout =>
  createTextureLayout(describeCatalog(catalog), registry);
