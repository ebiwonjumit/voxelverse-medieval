# Living world: foliage sway and animated water

Phase 8 starts to move the world. Step 8.1 is two effects that cost almost nothing because they live in the vertex and fragment shaders: **foliage sways in the wind** and **water flows and ripples**. Neither changes what is meshed, lit, culled or collided with. Later steps of the phase (petals, fireflies, smoke, lantern flicker) are not described here yet.

Both effects can be switched off while the game runs (F3, then `1` and `2`, see [Switches](#switches)), and both are pure functions of position and time, so a screenshot is the same whichever chunk the camera is standing in.

## Foliage sway

### What sways

`BlockDef.sway` is an optional strength from 0 to 1 (the registry rejects anything else, `registry.sway(id)` reads it). A block without it does not move.

| Block | Strength | Why |
| --- | ---: | --- |
| oak leaves, birch leaves, pine needles | 0.35, 0.4, 0.25 | a canopy stirs a little; needles are stiffer |
| cedar leaves, sakura leaves, snowy pine needles | 0.3, 0.45, 0.2 | the same rule for the wilderness trees; blossom is the lightest |
| tall grass | 0.9 | the most it moves |
| red and yellow flowers, the four wildflowers | 0.75 | |
| bamboo, bamboo leaves, reeds | 0.8, 1, 0.9 | stalks lean as one piece; a bamboo tuft is the loosest thing in the game |
| fern | 0.6 | |
| sugarcane, wheat in its three stages | 0.6, 0.65 | |

Trunks, stone, ground, litter (fallen leaves, petals), mushrooms, the lily pad and everything built (the Tempest set has no sway: a bamboo fence or pole is timber, not a living cane) stand still.

### The weight the mesher writes

The mesher turns the strength into one number per vertex, the `sway` buffer (one float per vertex, 0 to 1), from the shape of the block alone. It knows nothing about wind, time or direction.

- **A full cube** (leaves) gets the block's strength on all four corners of every face: the whole block stirs a little, and two leaf cubes that share a corner agree on where it goes.
- **Any other shape** (crossed planes, crops, boxes) is rooted at its base and moves more toward its top. A vertex at height `h` in its cell has weight `strength * t^1.5` where `t = min((below + h) / stalk, 1)`. `below` is how many cells of the same block stand directly under this one (up to 8) and `stalk` is the height of the whole stack of that block, up to 4 cells. So a one-block plant reaches its full strength at its tip, and a stack of bamboo is one stalk: the weight at the top of a cell is exactly the weight at the bottom of the next (no gap opens between blocks), it rises over the first four blocks and is the block's strength above that. A lone bamboo in a chunk full of bamboo is still rooted on its own cell.
- A vertex below the base of its cell counts as at the base (crops stand a sixteenth below the cell and are rooted there).

The buffer is written only for a bucket that has a swaying quad in it. The opaque bucket of a normal chunk (stone, ground) has none, so nothing is uploaded for it; the cutout bucket has the weights, with a zero for glass, fences and other quads that do not sway.

**Disabled costs nothing.** `meshChunk(..., { sway: false })`, or a registry in which no block sways, skips every sway computation (no table lookups, no stalk scan, no writes) and returns empty buffers. The game always asks for sway (the switch in the F3 panel is a shader uniform, so flipping it re-meshes nothing); the option is for tools and tests. Measured in node with `npx vite-node tools/bench-sway.ts` (production numbers are in [perf-after-p8.md](perf-after-p8.md)) (same chunk meshed with the option off and on, baked light and cached neighbours, median of 15, Apple M4):

| Chunk | Sway off | Sway on | Change | Swaying vertices |
| --- | ---: | ---: | ---: | ---: |
| spawn, Greensom | 4.2 ms | 4.2 ms | +1 % | 9,632 |
| Town of Beginnings | 6.4 ms | 6.5 ms | 0 % | 0 |
| Tempest, farms and ponds | 4.8 ms | 4.8 ms | -1 % | 12,660 |
| Tempest, river | 3.7 ms | 3.7 ms | +1 % | 5,728 |
| bamboo grove | 5.4 ms | 5.5 ms | +2 % | 18,840 |
| sakura grove | 4.9 ms | 4.9 ms | +1 % | 15,732 |
| wetland ponds | 4.1 ms | 4.2 ms | +1 % | 3,228 |

The same run on the code before this step (git stash, same script, the option ignored) gives 4.2, 6.4, 4.5, 3.8, 5.4, 4.8 and 4.2 ms, so the weights and the water's depth channel (below) together add noise-level time to a job: the differences are within what the machine does between runs.

### The shader

`render/BlockMaterials.ts` patches the opaque and cutout materials. After `begin_vertex`, a vertex with `sway > 0` is moved horizontally:

```glsl
transformed.xz += windPush( worldPosition ) * sway;
```

`windPush` is a function of the vertex's world position, the clock (`uTime`) and the wind direction (`uWind`, a unit vector):

- **Gusts.** A sine travelling downwind (`along * 0.09 - t * 0.85`, a swell about 70 blocks long moving at about 9 blocks a second), bent by a slower one across the wind so the gusts are patches and not straight fronts, and passed through a `smoothstep` into 0 in a lull and 1 at a crest. The lean is a quarter of its strength in a lull and all of it at a crest, up to 0.2 blocks downwind.
- **Flutter.** A faster, smaller movement (0.05 blocks along the wind, 0.06 across) that is livelier in a gust. Its phase comes from the cell the point is in (`floor(xz + 0.5)`), not from the point, so a plant moves as one piece instead of rippling along its own width, and neighbouring cells are out of step.
- **Direction.** `ChunkRenderer.update` turns the wind slowly round a heading of 0.64 rad (toward +x and +z) by up to 0.4 rad with a period of about two minutes, plus a little faster drift, so gusts do not always run the same way.

The largest displacement is about 0.26 blocks (a full-strength vertex at a gust's crest with the flutter in phase: 0.25 along the wind and 0.06 across), about 0.12 at the strongest leaf (sakura), 0.2 at the top of tall grass and 0.26 at a bamboo tuft. Cutout and opaque buckets that have weights get their bounding sphere padded by 0.4 so culling never clips a plant at the edge of the screen.

Light baking, culling and collision never see any of this: the baked `light` attribute is passed through untouched, faces are culled by the mesher from the undisplaced blocks, and the player collides with the block's boxes, not with where a leaf is drawn. A bucket with no `sway` attribute reads weight 0 from `material.defaultAttributeValues` (three's way of giving a missing attribute a value), so one program draws every bucket.

## Water

### What the mesher adds

Water faces take no biome tint, so the water bucket's `tints` channel is free, and the mesher uses it:

- `r` is the **depth** of the water under the vertex, 0 to 1, where 1 is `WATER_DEPTH_MAX` (8) cells or more. A top face averages the depth of the (up to) four water columns around each corner, so it changes smoothly across the surface; any other face takes its own column's depth.
- `g` is the **shoreline**: for a top-face corner, the share of the other three cells around it that are not water (0 in open water, 1/3, 2/3 and 1 at a bank, an edge and a pool's corner). Other faces have 0.

A lily pad or koi pond counts as water for both. The cost is a few column walks per water surface face (about 1 percent of a mesh job, see the table above, where the river, ponds and farms chunks include it).

### The shader

The water material (`transparent`, opacity 0.75, one mesh per chunk, so it is sorted per chunk exactly as before) draws the water tile in a new way:

- **Flow.** The tile is sampled twice from the world position and not the face's uv, so a river does not repeat the same patch every block: once at the size of a block, sliding slowly one way, and once about two and a half times larger, sliding another way (`fract` wraps the tile; the water tile is made of wrapping noise so it has no seam, and the mip level comes from the unwrapped coordinates, so there is no seam in the mip either). Where the bright ripples of the two line up the surface glints, where they cross it dims, which is what makes the surface look as if it moves instead of scrolls. The tile is sampled with the texture's nearest-neighbour magnification, so the motion has the stepped, pixel-art feel of the rest of the game.
- **Wave.** The vertex shader still lifts the surface by a wave of the vertex's world position, now much smaller (0.06 and 0.045 of a block, down from 0.2 and 0.15, which pushed the surface through the banks).
- **Depth.** Shallow water keeps the tile's colour and is the most see-through (alpha 0.72 times the material's 0.75, so 0.54); deep water is darker and bluer and less see-through (alpha 1.12 times 0.75, 0.84). The change runs from 0 to about 5 cells deep.
- **Shoreline.** A pale band where the surface meets a bank: the colour moves toward a light blue by a quarter at full shoreline, and the water is a quarter more see-through there.
- **Light and fog.** The colour goes through the same `bakedLighting()` as every other block, so water darkens at dusk and night and takes block light, and the fog is three's own `fog_fragment` as before. Nothing about the water bucket's sort order or draw order changed.

### Switches

| | Does |
| --- | --- |
| F3, then `1` | Foliage sway on or off |
| F3, then `2` | Water animation on or off. Off freezes the flow at its start and flattens the wave; the depth and shore colours stay |
| `?sway=0`, `?waterfx=0` | The same, from the address (also `off`, `false`, `no`), for a page that starts with an effect off, such as `?shot=...&sway=0&waterfx=0` for a still comparison |

The switches are `render/effectSettings.ts` (plain data, no three) and the uniforms `uSwayOn`, `uWaterOn` and `uWaterTime`; `ChunkRenderer.setSwayEnabled` and `setWaterAnimated` set them, and `World` copies the settings in every frame. While the debug panel is open the keys `1` and `2` are taken by it; otherwise they do nothing. The block, model, kit and landmark sandboxes (`?sandbox=...`) move too, and obey the same address switches.

## Looking at it

Two screenshots a second apart, and the difference between them:

```bash
node bench/run.mjs --url "http://localhost:3105/?shot=1812,14,-40,-120,-4" --shot a.png --then b.png --gap 1000
npx vite-node tools/shot-diff.ts -- a.png b.png sheet.png --crop 200,400,640,320 --scale 2
node bench/shots.mjs --file bench/fxshots.json --prefix fx --dir docs/screens/p8 --url http://localhost:3105   # the whole set below
```

`tools/shot-diff.ts` writes the first shot, the second and the difference (times 4) side by side, and prints how many pixels changed by more than 6 levels out of 255. `pair-*.png` in `docs/screens/p8` are those sheets for the river, the pond, the sakura grove, the bamboo grove, the farms and the avenue, cropped and zoomed. In the pairs below, the pixels that change are the wheat, ferns and flowers (leaning with the gust), the canopy (stirring), and the whole of the water surface (the flow).

| View | First | A second later | Changed pixels |
| --- | --- | --- | ---: |
| River beside the farms and the east bridge (1812, 14, -40) | [fx-river-crops.png](screens/p8/fx-river-crops.png) | [fx-river-crops-b.png](screens/p8/fx-river-crops-b.png) | 11.8 % |
| Wetland pond under the sakura (-868, 11, 1123) | [fx-pond.png](screens/p8/fx-pond.png) | [fx-pond-b.png](screens/p8/fx-pond-b.png) | 18.5 % |
| Sakura grove, under the canopy (1500, 14, 1000) | [fx-sakura-grove.png](screens/p8/fx-sakura-grove.png) | [fx-sakura-grove-b.png](screens/p8/fx-sakura-grove-b.png) | 22.8 % |
| Bamboo grove (994, 16, -860) | [fx-bamboo-grove.png](screens/p8/fx-bamboo-grove.png) | [fx-bamboo-grove-b.png](screens/p8/fx-bamboo-grove-b.png) | 28.0 % |
| Farms, wheat and flowers (1690, 18, 60) | [fx-farms.png](screens/p8/fx-farms.png) | [fx-farms-b.png](screens/p8/fx-farms-b.png) | 8.4 % |
| Commercial avenue at eye level, street trees (1385, 10.8, -1) | [fx-avenue-eye.png](screens/p8/fx-avenue-eye.png) | [fx-avenue-eye-b.png](screens/p8/fx-avenue-eye-b.png) | 1.9 % |

In the avenue only the street trees move (1.9 percent of the pixels): the city's buildings, lanterns and cobbles are not swaying blocks, and the other views of the city are [fx-diagonal-street-eye.png](screens/p8/fx-diagonal-street-eye.png), [fx-gardens.png](screens/p8/fx-gardens.png) and [fx-square-eye.png](screens/p8/fx-square-eye.png). The river at dusk is [fx-river-dusk.png](screens/p8/fx-river-dusk.png); the same river with both effects off is [fx-river-crops-still.png](screens/p8/fx-river-crops-still.png).

The water by time of day, and the same pond with the water animation off:

| Day | Dusk | Night | Still (`?waterfx=0`) |
| --- | --- | --- | --- |
| [fx-pond.png](screens/p8/fx-pond.png) | [fx-pond-dusk.png](screens/p8/fx-pond-dusk.png) | [fx-pond-night.png](screens/p8/fx-pond-night.png) | [fx-pond-still.png](screens/p8/fx-pond-still.png) |

## Tests

`tests/meshing/sway.test.ts`: `sway` on the registry (read back, rejected outside 0 to 1, set on the right blocks and only them); weights per block and vertex (a leaf cube has the block's strength at all 24 vertices, trunks and stone get no buffer, a plant's base is 0 and its top above 70 percent of its strength and the weight never falls as the vertex rises, a stack of bamboo has the same weight at the top of a cell and the bottom of the next and reaches the strength after four blocks, a lone plant is rooted on its own cell, the same weights wherever the block is); the attribute's length (one per vertex in a bucket that sways, empty in one that does not); **disabled means zero** (`sway: false`, or a registry where nothing sways, gives empty buffers and a mesh identical to the enabled one in every other buffer, and nothing leaks from one call to the next); culling and light unchanged; and the water's depth and shore channels (depth by column, the cap, shore at an edge and a corner, walls, lily pads, the number of faces unchanged). `tests/render/chunk-renderer.test.ts` checks the shader patches (sway on opaque and cutout and not on water, one shared switch, wind and clock, the water clock stopping and the wave flattening when the animation is off, the wind a unit vector that turns slowly, the `sway` attribute only on buckets that have weights, the padded bounds) and `tests/effectSettings.test.ts` the switches and the PNG decoder `tools/shot-diff.ts` uses. The smoke run (`node bench/run.mjs --smoke`) opens the debug panel and checks that `1` and `2` flip both effects and back.

## What this does not do

- Hanging cloth (the noren curtains) does not move yet: a weight that grows toward the *bottom* of a block needs its own rule, and it is the obvious next use of `BlockDef.sway`.
- The water has no sun glint or reflection of the sky, and no foam where it meets a bank: the shoreline is a lighter band, nothing more.
- Leaves move as whole cubes, so a sakura tree sways as a stepped mass and a branch tip never moves differently from its trunk side. The amplitude (0.12 blocks at most) is small enough that the cubes do not visibly pull apart from the trunks.
