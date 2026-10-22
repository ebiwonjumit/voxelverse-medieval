# World generation

Phase 6 of the rebuild replaces the wilderness and the land between the zones with a seeded generator. The legacy zones keep their interiors. This page describes what exists so far and grows with each step of the phase.

## Seed

`WORLD_SEED` in `worldConstants.ts` seeds every noise field in `worldgen/`. Same seed, same world, on the main thread or in a worker.

## Noise (`worldgen/noise/`)

Pure data code. Nothing here imports Three.js, React or the DOM.

| File | What it gives you |
| --- | --- |
| `Rng.ts` | `Rng`, a seeded mulberry32 generator: `next()` in [0, 1), `int(n)`, `range(a, b)`, `chance(p)`, `fork(salt)` for an independent stream. Also the integer hashes `hash2(x, z, seed)` and `hash3(x, y, z, seed)` (unsigned 32-bit) and `hash2f` / `hash3f` (floats in [0, 1)). |
| `SimplexNoise.ts` | `new SimplexNoise(seed)` with `noise2(x, z)` and `noise3(x, y, z)`. Both return values in [-1, 1] with a mean near 0. |
| `fractal.ts` | `fbm`, `fbm3`, `ridged`, `billow` and `domainWarp`. |

### Hashes

`hash2` and `hash3` are Murmur3 on the integer coordinates, with no float maths, unlike the old sine hash. Coordinates are truncated to int32, so pass whole numbers. Negative coordinates are fine and do not mirror positive ones. Use these for per-cell decisions (where a tree goes, which flower grows) so the answer never depends on the order chunks are generated in.

### Simplex noise

The permutation table is shuffled with `Rng(seed)`, so each seed is a different, repeatable field. Two choices worth knowing:

- 2D uses its own table of 16 unit gradients. Reusing the 3D table would mix gradient lengths and favour the axes.
- The 3D kernel radius is sqrt(0.5), not the often-copied 0.6. At 0.6 a corner still contributes when the point crosses into the next tetrahedron, which leaves a small step in the field (about 0.0035). A test guards this.

The output is scaled so the real extremes sit just inside [-1, 1] (measured over 20 seeds and 8 million samples: about 0.99 in both 2D and 3D) and clamped as a guard.

### Fractal helpers

All of them divide by the total amplitude, so the range does not depend on the octave count. Options are `{ octaves = 4, lacunarity = 2, gain = 0.5 }`.

| Helper | Range | Use |
| --- | --- | --- |
| `fbm`, `fbm3` | [-1, 1] | Layered noise: continents, moisture, temperature. |
| `ridged` | [0, 1], 1 on the crest | Mountain spines. Each octave is `(1 - |n|)^2`. |
| `billow` | [0, 1], 0 in the creases | Rounded hills. Each octave is `|n|`. |
| `domainWarp` | input shifted by at most `amount` per axis | Makes straight coasts and borders wander. Pass an `out` object in hot loops to avoid allocating. |

## Zones and terrain

### `worldgen/zones/ZoneInfo.ts`

One entry per legacy zone: name, shape (a circle with a radius, or the square Greensom uses), a falloff `band` just inside the edge and a `core` size. The shapes repeat each zone's own `isInside`, and a test checks the two agree. `getZone` from `zones/` still decides which zone owns a column.

| Zone | Shape | Band | Core (height is exactly the legacy one) |
| --- | --- | --- | --- |
| Town of Beginnings | circle, r 200 | 60 | r < 140 |
| Greensom Village | square, half 70 | 25 | half < 45 |
| Federation of Tempest | circle, r 700 | none | r < 550 |
| Amestris District | circle, r 700 | none | r < 550 |
| Kingdom of Bosse | circle, r 700 | 100 | r < 600 |
| Kingdom of Fremmevilla | circle, r 250 | 50 | r < 200 |
| Magnolia Town | circle, r 250 | 50 | r < 200 |

### `worldgen/terrain/TerrainField.ts`

`TerrainField(seed).height(x, z)` is the wilderness height W as a float, built only from seeded simplex noise:

- Hills around the zones: a broad macro field, hills at about 300 block wavelength, rolling ground and fine detail, on a base of 11.
- Forest: roughness fades in between z = 3200 and z = 4000 and stays on south of that.
- Mountains: a ridged field fades in from x = 10000 to 11500 on top of a 35 block uplift.
- Coast: the shore sits near x = -3000 (warped by up to 260 blocks so it is not a straight line) and the land drops 75 blocks into the sea over 700 blocks. Amestris ends at x = -2200, so the sea never touches it.

Heights are kept in `TERRAIN_MIN_Y..TERRAIN_MAX_Y` by `softLimit`, not a clamp. It leaves heights between -16 and 64 alone and eases the rest towards the bounds along a tanh, so it is smooth and strictly increasing and there are no flat plateaus at the limits. Over 30,000 samples out to 100,000 blocks east and west, no column sat on a bound; the range was -47 to 105.

### `worldgen/terrain/ZoneBlender.ts`

The one place where zone terrain meets the wilderness.

- Wilderness: W.
- Core of a zone: the zone's own `getHeight(x, z, W)`, so a zone that blends towards the base height it is given blends towards W. This is returned as is, so cores are bit for bit the legacy heights.
- Band (Town of Beginnings, Greensom, Bosse, Fremmevilla, Magnolia): the zone's height near the core's rim, faded into W with a smoothstep on the distance from the edge, so the edge itself is exactly W. "Near the rim" means each point is moved to the nearest core point and the height is averaged over a 3 x 3 grid 5 blocks apart. The legacy zones are not smooth along their rim (the Town's roads head for a fixed height of 7, Greensom's stream is cut off by a circle of radius 50), and the averaging stops those from becoming cliffs in the band. For the flat zones it changes nothing.
- Tempest and Amestris have no band. They already blend to the base height over their last 100 blocks and meet W exactly.

The ground height is `floor` of the blend, clamped to the terrain bounds.

The old edges, measured by walking rays across each border with the largest height difference between neighbouring columns (the test prints both numbers):

| Zone | Old largest step | New largest step |
| --- | --- | --- |
| Town of Beginnings | 7 | 1 |
| Greensom Village | 5 | 2 |
| Federation of Tempest | 6 | 1 |
| Amestris District | 22 | 1 |
| Kingdom of Bosse | 22 | 1 |
| Kingdom of Fremmevilla | 9 | 1 |
| Magnolia Town | 5 | 1 |

A brute-force scan of every column pair from 30 blocks outside each zone to the end of its blend found a largest step of 2 in Greensom (one pair) and 1 everywhere else.

## Nature blocks (`content/blocksNature.ts`)

Ids 48 to 79 belong to the wilderness; 23 are used (48 to 70), registered by one `registerNatureBlocks(registry)` call from `createDefaultRegistry`. `NatureBlock` is the enum the generator uses. Every block has a flat `#rrggbb` colour until textures arrive.

| Kind | Blocks | solid | opaque |
| --- | --- | --- | --- |
| Logs and soils | cedar, sakura and pine logs, gravel, moss, granite, mud, podzol | yes | yes |
| Leaves | cedar, sakura (pink) and snowy pine leaves | yes | no |
| Plants and ground cover | bamboo, bamboo leaves, fern, reeds, four wildflowers (blue, white, pink, purple), red and brown mushrooms, fallen leaves, sakura petals | no | no |

The legacy blocks (0 to 47) keep their ids. The default registry now holds 48 + 23 blocks.

## Biomes (`worldgen/biomes/`)

`BiomeMap(seed)` turns a position into one of eleven biomes: meadow, birch wood, oak wood, cedar forest, pine forest, bamboo grove, sakura grove, wetland, rocky hills, alpine and beach. It builds a `Climate` per column (temperature, moisture, woodiness, wetness, belt, home, tree density) from seeded noise at 800 to 2,600 block scales, then `classify` picks the biome from the climate and the wilderness height.

Regional bias on top of the noise:

- **Tempest belt**: within about 900 to 1,600 blocks of Tempest (radius wandering by 300 blocks) the land is cedar forest with bamboo groves and sakura groves, in patches of two scales. Between the Town and Tempest it starts at x of about 470 to 630.
- **Home country**: around the Town and Greensom, woods are suppressed, so it stays meadow with oak and birch copses (about two thirds meadow).
- **South of z = 4000**: woods are more likely and the tree density multiplier is higher (about 1.8 against 0.45 in the home country).
- **Far east**: rocky hills from a height of about 31 and alpine snow from about 82 to 86 (rock noise moves both lines), so the snow sits on the ridges. Around Fremmevilla a bias adds rocky outcrops.
- **West**: low ground west of x = -2100 is beach, shallows included.
- **Magnolia** gets extra sakura. Wetland pockets (under 10 percent of the land) and a few groves of sakura and bamboo turn up anywhere outside the home country.

Borders are never straight: positions are warped by up to 70 blocks and every threshold gets jitter from a fine noise, so borders are ragged at two scales. The belt border moves by about 45 blocks between rows 20 blocks apart.

`biomeAt(x, z)` is the one-call form. `temperature`, `moisture` and `elevation` expose the fields.

## Rivers and ponds (`worldgen/water/`, `worldgen/terrain/WildernessTerrain.ts`)

`WildernessTerrain` is the height the generator uses wherever no zone owns the column: W from `TerrainField`, then marsh flattening and ponds in wetland, then river valleys, then everything faded out near legacy zones.

- **Rivers** (`RiverField`) follow the zero contour of a warped noise field. A contour never ends or forks, so they are continuous and meander with no path finding. A presence field tapers a river down to a spring, a width field varies it, and the half width grows to 2.8 times towards the coast in the west (the 99th percentile of channel depth was 5.1 blocks at x = -2900 to -2500 against 1.7 in the middle). The distance to the contour is the field divided by its gradient, so widths are in blocks. Smaller streams use a faster field and a patchy mask.
- **Channel**: floor at `WATER_LEVEL - 1` exactly, so the water is one block deep. Banks are a smoothstep out to 4.2 times the depth of the ground (3.2 for streams), which keeps the slope under about one block per block. The weight is the mean of five samples 2 blocks apart, which turns the occasional sharp jump the distance estimate has near a river junction into a slope.
- **Rivers only run through low ground** (they fade out between heights of 12 and 28), so there are springs and dry gullies in the hills and none in the mountains.
- **Banks and beds**: sand and gravel. Reed beds line the banks.
- **Ponds**: in wetland, at most 4 blocks deep, with mud on the bed.
- **Marsh**: the ground is pulled towards a level just above the water (with 1.7 blocks of relief) in proportion to a wetness weight.
- **Fade near zones**: rivers, ponds and marsh are scaled by a smoothstep of the distance to the nearest zone footprint over 140 blocks, so at a footprint the wilderness is exactly W again and the zone blender sees the same height as before.

Every weight that multiplies a height difference is a wide ramp that does not depend on the height itself. Narrow ramps made cliffs wherever the ground was rough. The test for this is the walkability one in `blender.test.ts`: no step above 2 blocks anywhere.

## Features (`worldgen/features/`)

A `Feature` describes itself as a `BlockList`: offsets from its origin, each with a placement rule (`ORIGIN`: relative to the ground at the origin, for trunks and canopies; `SOIL`, `LAND`, `SHORE`: relative to the block's own column ground and only on soil, any land or the shore). Features are stateless; the same origin and seed give the same blocks.

| Feature | What it is |
| --- | --- |
| `OakTree`, `BirchTree` | the legacy blocks; oak with a round crown and now and then a large one, birch slim and tall |
| `PineTree` | 8 to 13 high, a cone of tiers; snowy leaves in the alpine biome; new pine log |
| `CedarTree` | 12 to 20 high, slim, crown in layers |
| `SakuraTree` | 3 to 5 high, two limbs, wide flat pink crown about 12 across, petals on the ground |
| `BambooClump` | 5 to 10 stalks of 6 to 13 blocks, each on its own ground, leaf tufts |
| `Boulder` | a dome that follows the ground, stone, granite or mossy cobblestone |
| `UndergrowthPatch` | ferns, tall grass, flowers, mushrooms, fallen leaves, petals, small rocks by biome |
| `ReedBed` | reeds where the ground is at the water line |
| `FallenLog` | a trunk on the ground, sometimes with mushrooms |

`FeaturePlacer` places them on one jittered grid per layer (undergrowth, reeds, logs, boulders, bamboo, trees, in that order, which is also the order they win overlaps). There is one candidate origin per grid cell, its position and the decision depending only on the cell, the layer and the seed. A chunk asks for the cells within the layer's largest radius of its edges, so a tree that crosses a chunk border is found by both chunks and clipped by each. `sampleBlock` asks for the cells around one block and gets the same trees. What may overwrite what depends only on the block already in the cell (`blockClass.ts`: a trunk grows through leaves and plants, leaves over plants, nothing replaces terrain, water or logs), so the order chunks are generated in does not matter. Built features are cached (16,384 entries, cleared when full; the answers never depend on the cache).

A feature is placed only if its origin is on soil above the water (trees at least 2 blocks above it), farther than its radius plus 2 from every legacy zone footprint, and not within its radius plus 1 of a road. Roads come through the `RoadField` interface (`isRoad(x, z, margin)`); `createVoxelverseGenerator(registry, seed, roads)` takes one and defaults to `NO_ROADS` until step 6.4. A last check in `paint` and `blockAt` refuses any block in a column a zone owns.

Tree density by biome is a chance per 5 x 5 cell: 0.30 in birch, cedar and pine woods, 0.27 in oak woods, 0.17 in sakura groves, 0.02 in meadow, times the climate's density multiplier. Species by biome are weighted tables in `Vegetation.ts`.

## Surface blocks

By biome, with patches of noise: grass in meadows and woods; moss and podzol patches in cedar forest, podzol and gravel in pine forest; mud, moss and grass in wetland; sand on beaches; sand and gravel on river banks and beds, mud on pond beds; stone, granite, gravel and some grass in rocky hills; snow, stone and gravel in the alpine biome. Under the surface is dirt for 3 blocks (sand for 3 under sand, gravel for 2 under gravel), then stone.

## `worldgen/VoxelverseGenerator.ts`

`createVoxelverseGenerator(registry, seed = WORLD_SEED, roads = NO_ROADS)` returns a `WorldGenerator`. It is not wired into the game yet.

- `ColumnSampler` decides for each column which zone owns it, the ground height, and for the wilderness the biome and the surface. `generateChunk` and `sampleBlock` both go through it.
- Zone columns: stone below the ground, water above it up to `WATER_LEVEL`, and whatever the legacy zone's `getBlock` says for the blended ground height, up to 64 blocks above it.
- Wilderness columns: stone, soil, the surface block, water, then the features.
- `generateChunk(chunk, { lod })`: `lod: 0` is far away. Zones are asked for their low detail blocks and the wilderness leaves out undergrowth and reeds (about 90 percent of its plant blocks) but keeps trees, boulders, bamboo and logs. Any other value is full detail. `sampleBlock` always answers at full detail, so it matches `generateChunk` exactly except for those plants in a chunk made at LOD 0.
- `sampleBlock`, `terrainHeight` and `zoneNameAt` share their code with `generateChunk`, so they cannot drift apart.
- `columnAt(x, z)` and `biomeAt(x, z)` describe a column for tools and tests.

Not done yet: the roads and bridges (step 6.4) and the wiring into the game.

## Tools

Node-side only (they use `node:fs` and `node:zlib`). Run them with `vite-node`.

| Command | What it does |
| --- | --- |
| `npm run map` | Writes every preset to `docs/maps/`: `overview` (x, z -3000 to 3000, 4 blocks per pixel), `corridor` (x 0 to 2200, z -400 to 400, 1 block per pixel), `tempest` (around Tempest, 1 block per pixel), `corridor-blocks` and `tempest-blocks` (topmost blocks, so trees, boulders and reeds show), `east-mountains`, `south-forest`, `west-coast`. About 25 seconds. |
| `npm run map -- --preset corridor` | One preset. |
| `npm run map -- --cx 0 --cz 0 --size 1024 --step 4 --out map.png [--blocks] [--height 512] [--seed 1]` | A custom view. |
| `npm run bench:chunks` | Time per generated chunk in node. On a laptop, about 9 ms for hills, woods and belt, 10 ms in the mountains, 6 ms for open sea, 7 to 9 ms in the Town and Tempest. |

The biome maps paint each biome in its own colour, shaded by slope, water by depth, zone footprints as outlined grey discs. Roads will be drawn once the generator has them. `tools/png.ts` is the small PNG writer.

What the maps show, judged by looking at them:

- Meadow with oak and birch copses around the Town and Greensom, a clear change to cedar forest with bamboo and sakura groves from about x = 500 on the road to Tempest, and a belt of the same around Tempest that is lobed, not round.
- Dense mixed forest with wetland pockets in the south, pine woods in the north, beaches along a ragged west coast, and rocky hills with snow on the ridges in the east.
- Rivers meander and widen to the west and stop at springs in the hills. There are no rivers in the mountains and none touching a zone.

Known weak spots: the rivers are many and thin on the overview and read a little like spaghetti, and the mountain front east of x = 10000 is roughly a north-south line (it comes from `TerrainField`'s uplift, which step 6.2 owns).

## Tests

`tests/worldgen/blender.test.ts` checks: no height step above 2 along rays that cross every zone border (120 crossing rays per zone at many angles and positions plus sweeps along the border across the road strips), the open wilderness being walkable (rivers and ponds included), the cores of the Town, Greensom, Tempest and Amestris matching `LegacyZoneAdapter` at 3,000 random points and cell for cell in seven landmark chunks, `sampleBlock` equal to `generateChunk` at 3,000 random points and down whole columns, heights inside the terrain bounds with nothing piled on them, the same seed giving the same chunk hash, LOD 0 only dropping plants, wilderness chunks averaging under 40 ms, and `ZoneInfo` agreeing with the legacy zones. `terrain.test.ts` covers `softLimit` and the geography of `TerrainField`.

`tests/worldgen/biomes.test.ts`: every biome appears over a wide area; cedar, bamboo and sakura dominate x 1000 to 1500, z 100 to 600; the home country stays meadow and oak; the south is woodier and denser; rocky hills and alpine in the east; beaches in the west; wetland pockets; the biomes change on the way from the Town to Tempest; borders are ragged (mean step 45 blocks between rows); determinism; the climate fields are smooth.

`tests/worldgen/features.test.ts`: features crossing a chunk seam agree with `sampleBlock` on both sides of seams in seven forests (60,000 cells, about 2,000 of them tree blocks) and in a 2 x 2 block of chunks; no tree block in water over about 120 chunks with open water (29,000 tree blocks, 0 in water); nothing grows inside or is cut by a zone footprint; a `RoadField` keeps everything out of a circle (22,000 blocks stand there without it, none with it); the same chunk hash twice whatever order chunks were generated in; every species appears somewhere; every feature stays inside its declared radius; the overlap rules; LOD 0; speed.

`tests/worldgen/rivers.test.ts`: channels have their floor at `WATER_LEVEL - 1` with water exactly at the water level; banks and beds are sand or gravel; reed beds; rivers are never stronger than the zone fade allows; widening towards the coast; no rivers in the mountains; determinism; ponds are in wetland with mud under them.

`tests/worldgen/blocksNature.test.ts`: the nature block ids are unique and in 48..79, plants are not solid, only whole cubes are opaque.

`tests/worldgen/noise.test.ts` checks: determinism per seed, different seeds being uncorrelated, output bounds, mean and spread over large samples, no step at simplex cell edges, no lattice artefacts (neighbour differences from integer and half-integer points agree within 5%), a chi-square test of `hash2` and `hash3` for uniformity, no link between neighbouring hashes, and negative coordinates.

Measured on the development machine: a wilderness chunk with biomes, rivers and features averages 8.7 ms over 20 chunks (dense forest, belt, open country; limit 40 ms).
