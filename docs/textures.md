# Block textures

Phase 3 replaces flat block colours with 16x16 pixel-art tiles that are generated in code, not drawn in an editor and not loaded from files. This page covers the pure side, `content/textures/`. Packing the tiles into a mipmapped texture array and drawing with them is covered in [Texture array](#texture-array) below.

The folder follows the layer rules for `content/`: no Three.js, no React, no DOM, no Node modules and no `Math.random`, so a worker can run it. A test checks all of that.

![The catalog](screens/p3/catalog.png)

`npm run textures:sheet` rewrites that image (`npx vite-node bench/textureSheet.ts [out.png]`). It has three parts: every tile at 6x with its name (cutouts sit on a checkerboard), the grass tiles under each zone's colour, and the tiles that are meant to repeat, shown 2x2 so a bad seam is easy to spot. The PNG is written by `bench/png.ts`, a small encoder on `node:zlib`.

## Pieces

| File | What it is |
| --- | --- |
| `TextureRecipe.ts` | The abstract `TextureRecipe`: an `id`, `generate(rng)` returning 1024 bytes (16x16 RGBA, row 0 on top), plus `opaque`, `tiling` and `tint` flags. |
| `Rng.ts` | `SeededRng` (mulberry32) and `hashString`. Every tile has a fixed default seed, the hash of its name. |
| `Pixels.ts` | Hex colours, palettes, `ramp` (pick a shade by value) and `Canvas`, a 16x16 RGBA buffer whose coordinates wrap. |
| `noise.ts` | Wrapping value noise (`tileNoise`, `layers`), `ranks`, wrapping Voronoi cells and diagonal vein waves. Everything wraps at the tile edge, so patterns built from it tile without extra work. |
| `recipes/` | The recipe classes, grouped as `natural`, `masonry`, `wood` and `materials`. |
| `TextureCatalog.ts` | Names mapped to recipes. `createDefaultCatalog()` registers the 49 tiles below. |
| `tint.ts` | `applyTint(pixels, mask, rgb)`, the multiply the renderer does for tinted tiles (the shader does the same). |
| `layout.ts` | `createDefaultTextureLayout(registry)`: describes the catalog to `engine/TextureLayout` and builds the layout the game uses. |
| `recipes/plants.ts` | `TallGrass`, `Sugarcane`, `Flower`, `LilyPad` and `Apple`, the cutout tiles of the small plants. |

```ts
import { createDefaultCatalog } from './content/textures/TextureCatalog';

const catalog = createDefaultCatalog();
catalog.names();                     // registration order
catalog.render('stone_brick');       // Uint8Array(1024), same bytes every time
catalog.render('stone_brick', 7);    // another variation of the same material
catalog.get('leaves_oak').recipe.opaque;   // false: alpha is 0 or 255, never in between
catalog.tintMask('grass_side');      // Uint8Array(256), 255 where the biome colour applies
```

## Tiles

| Group | Names |
| --- | --- |
| Terrain | `grass_top`, `grass_side`, `dirt`, `stone`, `sand`, `snow`, `water`, `path`, `farmland`, `basalt` |
| Crops and plants | `wheat_stage_1`, `wheat_stage_2`, `wheat_ripe`, `tall_grass`, `sugarcane`, `flower_yellow`, `flower_red`, `lily_pad`, `red_apple` (cutouts, for crossed quads or small boxes) |
| Trees | `log_side`, `log_top`, `birch_log_side`, `birch_log_top`, `leaves_oak`, `leaves_birch`, `leaves_pine` (cutouts) |
| Masonry | `cobble`, `mossy_cobble`, `stone_brick`, `brick_red`, `brick_factory`, `plaster`, `marble`, `roof_red`, `roof_blue`, `hangar_wall` |
| Wood | `plank`, `dark_plank`, `guild_wood` |
| Metal, glass, magic | `glass` (cutout), `gold`, `iron`, `steel`, `obsidian`, `magic_stone`, `crystal`, `slime`, `lantern` (cutout) |
| Utility | `speckle`: neutral grey grain, the generic `Speckle` recipe |

Tile names are not block names. Which tile goes on which face of which block is decided by the `faces` of each block in `content/blocks.ts`.

## Art rules

- **Few shades.** Each tile uses 3 to 12 distinct colours: a 3 to 5 shade ramp for the material and a few accent colours (mortar, rivets, glints). A test enforces the range.
- **Clustered, not static.** Shades come from smooth noise and are assigned by rank, so each shade covers a predictable share of the tile and forms blobs. Single-pixel accents are used sparingly for detail.
- **Light from the upper left.** Bevels, brick edges and cobblestone rims are lit on the top and left and shaded on the bottom and right.
- **Silhouettes differ.** Brick has small offset bricks with light mortar, stone brick has big blocks with dark mortar and cracks, cobble is round stones with dark gaps, path is small gravel, hangar wall is riveted panels. A test requires every pair of tiles to differ by more than 12 per byte on average.
- **Original art.** Palettes are hand-picked in code and the patterns are procedural.

## Flags

- `opaque`: opaque recipes have alpha 255 on every pixel. Cutouts (`leaves_*`, `glass`, `lantern`, `wheat_*`) contain both fully transparent and fully opaque pixels and nothing in between, so they work with an alpha test and need no sorting. Water is opaque on purpose: the water material supplies the see-through.
- `tiling`: `both` tiles repeat on a big wall or floor without a visible seam; `x` repeats sideways only (`grass_side` has grass at the top and dirt at the bottom); `none` tiles are drawn once per face (bevelled gold, iron, steel and slime, the lantern, crops, log ends, glass). The test compares the wrap seam with the harshest boundary already inside the tile, so mortar lines and board edges count as normal but a hard cut does not, and it runs on four seeds per tile.
- `tint`: `grass_top`, `grass_side` and `leaves_oak` are tinted. The tile is drawn in neutral grey wherever the tint applies, and `tintMask` says where. For `grass_top` that is every pixel. For `grass_side` it is the grass fringe along the top (3 to 7 pixels deep per column, with a few hanging blades); the dirt below is brown and must not be tinted. The renderer multiplies the masked pixels by the zone's grass colour, which is how the fringe follows the biome. The contact sheet shows both under all six zone colours. `leaves_oak` is neutral grey with holes, tinted on every visible pixel; the renderer multiplies it by the grass colour times 0.7, which is the old flat leaf colour with a pattern.

## Texture array

![Textured spawn](screens/p3/textured-spawn.png)

`render/AtlasBuilder.ts` packs the catalog into one `DataArrayTexture`: RGBA8, 16 x 16 pixels per layer, in the order of an `engine/TextureLayout`. The layout is pure data (no Three.js), so the mesh workers build the same one and write layer numbers straight into their vertices. Its layers are, in order:

1. Every catalog tile, in registration order.
2. For each partly tinted tile (the grass side) a second layer holding its tint mask, named `<tile>#tint`.
3. One flat tile per distinct registry colour that a block without textures needs, named `flat:#rrggbb`, and the magenta `flat:#ff00ff` that unregistered ids use.

52 layers now, well under the 256 every WebGL2 device guarantees. Blocks added later by other branches add at most one flat layer per new colour until they get tiles of their own.

How the texture is set up, and why:

- **sRGB, nearest up close, mipmapped far away.** `colorSpace = SRGBColorSpace`, so the GPU decodes on sampling and mip levels are averaged in linear light (no darkening at distance). `magFilter` is nearest for crisp pixels, `minFilter` is `LinearMipmapLinearFilter` with `generateMipmaps` on and anisotropy 4. Together this removes shimmer at distance. Layers are separate slices, so they cannot bleed into each other, and `ClampToEdge` stops a tile's edge blending into its opposite edge.
- **Cutouts are padded.** Mip levels average straight-alpha colour, so the colour of a transparent pixel leaks into the visible ones as a dark or grey halo around leaves. Hidden pixels of a cutout are given the mean colour of its visible pixels first. Alpha stays exactly 0 or 255 at level 0.
- **The grass fringe is a second layer.** Tinting a whole grass side would turn the dirt green. The catalog's tint mask says which pixels are fringe, and the builder stores the tile as two layers: a base where the fringe is replaced by the dirt in the same column (so lower mips blend green into brown rather than grey into brown), and an overlay that is opaque only on the fringe. The shader paints the overlay times the biome tint over the base. The tint is a vertex attribute, so the fringe follows the zone colour exactly like the top face, and each of the six zones shows its own grass colour.
- **Flat tiles are uniform sRGB.** A block without faces is a flat tile of its colour, so it looks the way the old flat blocks did.

`buildAtlasPixels(catalog, layout)` returns the raw bytes without touching Three.js state, which is what the tests check. The materials that sample the array are in [renderer.md](renderer.md).

## Cost

Measured on 23 Oct 2026 with the same harness, machine and flythrough as [perf-after-p2.md](perf-after-p2.md), production build, render distance 8 (raw results: [`bench-p3-prod.json`](bench-p3-prod.json), [`bench-soak-p3-prod.json`](bench-soak-p3-prod.json)):

| Run | fps | p99 | max | frames over 50 ms |
| --- | ---: | ---: | ---: | ---: |
| flythrough, overall | 60.0 | 17.7 ms | 22.2 ms | 0 |
| 90 s soak | 60.0 | 17.7 ms | 24.4 ms (first seconds) | 0 |

That is the Phase 2 result (60.0 fps, p99 17.7 ms, worst frame 22.1 ms), and the soak's geometry count stays flat (159 to 376, 352 at the end). Headless Chrome is locked to 60 fps, so this proves the frame budget, not the headroom. The chunk mesher still meshes the heaviest test chunk in about 10 ms (target 25 ms).

Textured vertices are bigger: each now carries a tint (3 floats), a uv (2) and two layer numbers (2) on top of position, normal and colour, 76 bytes against the old 36. Vertex memory and upload size roughly double for the same geometry. Nothing in the measurements shows it as a cost yet; if it ever does, the first things to shrink are the normal (a byte per axis would do) and the layer pair (it never changes within a face).

## Adding a tile

Write a `TextureRecipe` subclass (or configure an existing one), draw only from the `SeededRng` you are given, and register it in `createDefaultCatalog()`. `tests/textures/catalog.test.ts` then checks size, determinism, palette size, alpha rules, seams and distinctness for it. Run `npm run textures:sheet` and look at the result: the tests cannot tell you whether it looks like the thing it is named after.
