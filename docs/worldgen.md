# World generation

Phase 6 of the rebuild replaces the wilderness and the land between the zones with a seeded generator. The legacy zones keep their interiors. This page describes what is built: seeded noise, the zone blender, biomes, vegetation and rivers, and the road network. The game runs on it: both the mesh workers and the main thread build it (see [Wired into the game](#wired-into-the-game)).

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

Ids 48 to 79 belong to the wilderness; 23 are used (48 to 70), registered by one `registerNatureBlocks(registry)` call from `createDefaultRegistry`. `NatureBlock` is the enum the generator uses. Every block has generated textures and, for plants, a model (crossing planes, or a thin plate for fallen leaves and petals): see [textures.md](textures.md#nature-block-tiles). The flat `#rrggbb` colour is only the fallback. None of them takes the biome tint.

| Kind | Blocks | solid | opaque |
| --- | --- | --- | --- |
| Logs and soils | cedar, sakura and pine logs, gravel, moss, granite, mud, podzol | yes | yes |
| Leaves | cedar, sakura (pink) and snowy pine leaves (light dim 1, like the legacy leaves) | yes | no |
| Plants and ground cover | bamboo, bamboo leaves, fern, reeds, four wildflowers (blue, white, pink, purple), red and brown mushrooms, fallen leaves, sakura petals | no | no |

The legacy blocks (0 to 47) keep their ids. The default registry holds 48 legacy blocks, these 23 and the 13 shaped blocks (80 to 92, [models.md](models.md)), 84 in all; tests count by id range so another range growing never breaks them.

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

A feature is placed only if its origin is on soil above the water (trees at least 2 blocks above it), farther than its radius plus 2 from every legacy zone footprint, and not within its radius plus 1 of a road. Roads come through the `RoadMask` interface (`isRoad(x, z, margin)`); the generator hands the placer the road network, and `createVoxelverseGenerator(registry, seed, keepClear)` takes an optional extra mask (a test clears a circle with it). A last check in `paint` and `blockAt` refuses any block in a column a zone owns.

Tree density by biome is a chance per 5 x 5 cell: 0.30 in birch, cedar and pine woods, 0.27 in oak woods, 0.17 in sakura groves, 0.02 in meadow, times the climate's density multiplier. Species by biome are weighted tables in `Vegetation.ts`.

## Surface blocks

By biome, with patches of noise: grass in meadows and woods; moss and podzol patches in cedar forest, podzol and gravel in pine forest; mud, moss and grass in wetland; sand on beaches; sand and gravel on river banks and beds, mud on pond beds; stone, granite, gravel and some grass in rocky hills; snow, stone and gravel in the alpine biome. Under the surface is dirt for 3 blocks (sand for 3 under sand, gravel for 2 under gravel), then stone.

## Roads (`worldgen/roads/`)

Six roads link the zones: Town of Beginnings to Greensom, Tempest, Amestris and Bosse, Tempest to Fremmevilla (out by Tempest's north avenue, then bending towards it) and Greensom to Magnolia. About 5,000 blocks of road in all. The network is built once from the seed (about 20 ms) and shared by every generator with that seed.

| File | What it is |
| --- | --- |
| `layout.ts` | The gates (where a road meets a zone) and the six edges, with their importance, how far they wander and at what wavelength. |
| `RoadNetwork.ts` | Builds each road as a Hermite curve between its gates plus a wandering sideways offset, sampled every 2 blocks, with its half width, level and bridge flags; a grid-bucket spatial index; and the waypoints. `query(x, z, out)` is the RoadField. |
| `RoadProfile.ts` | `buildProfile`: the road height along a road, and where it is a bridge. Pure arithmetic. |
| `RoadSurface.ts` | What a road is paved with. |
| `RoadField.ts` | `RoadField` (`query` and `isRoad`), `RoadHit` (what a query returns), `levelHeight` (how a road changes the ground). |

### Gates

A gate is the point on a zone's own road where the network takes over. The legacy roads, which the network meets exactly:

| Zone | Legacy road | Gate |
| --- | --- | --- |
| Town of Beginnings | axis roads with `|x| < 12` or `|z| < 12`, to distance 150; the south road to the edge | east (150, 0), west (-150, 0), north (0, -150) inside the footprint; south (0, 200) at the edge |
| Greensom | `|x| < 3`, through the village | (0, 230) north and (0, 370) south, both at the footprint's edge |
| Tempest | avenues `|x| < 5` or `|z| < 5` to 600 blocks from the centre | west (900, 0), north (1500, -600) |
| Amestris | streets 5 wide; the one along z = 0 stops 500 blocks from the centre, inside the core (550) | (-950, 0), on the core's rim |
| Bosse, Fremmevilla, Magnolia | none | on the core's rim, towards the zone the road comes from |

The road at a gate is as wide as the legacy road (23, 9, 5 blocks) and narrows to its own width over 70 blocks. Its wandering and its edge jitter fade to nothing at the gate, so it arrives square and head on, and it ends square (a cell behind the gate belongs to the zone).

Inside a zone's core nothing changes: the zone is exactly the legacy zone. Between the core and the footprint's edge the road is painted onto the zone's own ground: the surface block is replaced with the paving and everything above it cleared (so the Amestris factories either side of the road are cut, never on it). Heights there are the zone's, as ever. Where the legacy road stops short of the gate, the road is painted from the gate on and the legacy ground between is left alone: Amestris' street ends 50 blocks inside the core rim, and the three zones without roads have only a gate on the rim.

### Path, width and surface

- The path: a Hermite curve leaving the first gate heading away from its zone and arriving at the second heading into its zone, plus a sideways offset of two noise octaves (14 blocks at most, wavelength about 300) that fades to nothing over 90 blocks at each end. The tightest bend measured has a radius of 53 blocks. Town to Greensom (30 blocks, the old straight road) has no wandering.
- Width: 3 to 4 blocks plus the importance (so 3 to 5), from a noise along the road. The edge of the road is jittered by up to 0.55 blocks with a noise on the position, so it is never a straight line.
- Paving: cobblestone (some mossy) within about 130 blocks of a zone, packed path to about 520, dirt (some gravel) beyond, with a 70 block noise added to the distance so the changes are ragged. The outermost columns wear away to path or dirt. This is the old wilderness road's three steps, measured from the nearest zone instead of from the origin. Road columns have no soil, so nothing grows on them.

### Levelling

The height of each road is worked out when the network is built, from the wilderness height without roads (`RoadProfile.ts`): the natural height is lifted to the deck height where it is lower, smoothed with two box filters of about 16 blocks, and then limited to a grade of one block in four (the phase asks for one in three at most), with both ends pinned to the natural height, which is where a zone's own ground starts. Terrain is then blended to the road's level: fully across the road's width, easing out over a 6 block shoulder (`levelHeight`). Within 24 blocks of a zone the hold is eased off so the ground reaches the footprint edge as the natural height and meets the zone with no step, even where a wide legacy road meets a sloping edge. Measured: along all six roads no centreline step above 1; across 400 cross sections of the roads no step above 1 within 16 blocks of the centreline; and in a 24 block corridor round every vertex of all six roads, bridges and their approaches included (`tools/scan-road-steps.ts`, and one test per road), no 4-neighbour step above 2.

### Bridges

Where the natural ground along a road is below the water line the road is a bridge: the stretch of water plus 4 blocks of dry ground at each end, and stretches closer than 14 blocks are joined. The deck is planks one block above the water (never lower than that), five blocks wide, with fence rails on both edges, a log beam under each edge and a log pier every 8 blocks down to the bed. The approaches are the road's own grade (at most one in four), so the ramps are earth. Beside a bridge the ground is pulled to one block under the deck: ground above that is cut, and ground below it is filled only in proportion to how far it is above the river's floor (nothing at the floor, everything from a block and a half above, `dryness` in `RoadField.ts`), so a river is never dammed and the approach embankment meets the filled road without a cliff. The ground under the deck is never higher than one block below it. (An earlier version only cut, which left a drop of up to 4 blocks beside the first bridge columns; a hard dry or wet switch instead left 3.) The Greensom to Magnolia road has 58 bridge vertices (about 116 blocks) over its rivers.

### Waypoints

A fence post (three fence blocks) with a lantern on top stands about every 64 blocks along each road, on alternating sides and 2.2 blocks beyond the road's edge, and one just inside the wilderness at each end of every road. 71 in all. They replace air, plants and leaves only.

### The query

`RoadField.query(x, z, out)` returns `{ onRoad, distance, width, importance, bridge }` plus `level`, `weight` (how much terrain is pulled to the level), `gap`, `arc` and `edge`. The index is a grid of 8 block buckets; each holds every road segment that could be within a half width plus 11 blocks of any point of it, so a query is one hash lookup and, near a road, at most 26 distance tests (the fullest bucket). Measured 0.1 to 0.2 microseconds per query averaged over a mixed set of positions. `isRoad(x, z, margin)` is the same query, true when the column is within `margin` blocks of a road's edge, and is what keeps trees off the roads.

## `worldgen/VoxelverseGenerator.ts`

`createVoxelverseGenerator(registry, seed = WORLD_SEED, keepClear?)` returns a `WorldGenerator`. It is the generator the game uses, on the main thread and in the workers (see [Wired into the game](#wired-into-the-game)).

- `ColumnSampler` decides for each column which zone owns it, the ground height (roads included), and for the wilderness the biome and the surface. `generateChunk` and `sampleBlock` both go through it.
- Zone columns: stone below the ground, water above it up to `WATER_LEVEL`, and whatever the legacy zone's `getBlock` says for the blended ground height, up to 64 blocks above it. Where a road is painted onto the zone: the paving, and air above it.
- Wilderness columns: stone, soil, the surface block (the paving on a road), water, then the bridge, then the features, then the waypoints.
- `generateChunk(chunk, { lod })`: `lod: 0` is far away. Zones are asked for their low detail blocks and the wilderness leaves out undergrowth and reeds (about 90 percent of its plant blocks) but keeps trees, boulders, bamboo and logs. Any other value is full detail. Roads, bridges and waypoints are the same at every level. `sampleBlock` always answers at full detail, so it matches `generateChunk` exactly except for those plants in a chunk made at LOD 0.
- `sampleBlock`, `terrainHeight` and `zoneNameAt` share their code with `generateChunk`, so they cannot drift apart.
- `columnAt(x, z)` and `biomeAt(x, z)` describe a column for tools and tests; `generator.roads` is the `RoadNetwork`.

## Adding a biome

1. Add it to the `Biome` enum in `biomes/Biome.ts` (and bump `BIOME_COUNT`). Every table keyed by biome is a `Record<Biome, ...>`, so the compiler lists what is missing.
2. Decide where it is in `BiomeMap.classify`: an `if` on the climate and the height, placed before the checks it should win against. Use the jitter noise (`j`) on every threshold so the border is ragged.
3. Give it a surface in `ColumnSampler.surface` (a `case` in the biome switch).
4. Give it plants in `features/Vegetation.ts`: a weighted species table in `TREES`, and its entries in the undergrowth, log, boulder and bamboo chance tables.
5. Give `tools/render-map.ts` a colour in `BIOME_COLOR`, regenerate the maps and look at them, and extend `tests/worldgen/biomes.test.ts` so the biome has to appear somewhere.

## Adding a feature

1. Subclass `Feature` in `features/` with a name and its radius (the furthest any block reaches along x or z; a test checks it). `build(ctx, rng, out)` adds blocks to the `BlockList` as offsets from the origin, using only the `Rng` it is given. Use `Place.ORIGIN` for things that keep their shape on a slope and `SOIL`, `LAND` or `SHORE` for things that follow the ground of their own column.
2. Add it to a layer in `features/Vegetation.ts` (`LAYERS`), or add a layer: a grid cell size, the largest radius of its features, a salt, a maximum chance, and `pick(column, roll, rng)`. A layer's position in the list is its priority when features overlap.
3. If it needs a block, add it to `content/blocksNature.ts` (ids 48 to 79; 71 to 79 are free) and, if it is a plant or a leaf, to the tables in `features/blockClass.ts` so overlaps resolve.
4. Add it to the seam and radius tests in `tests/worldgen/features.test.ts`.

A feature must never depend on anything but its origin, the column at its origin and the seed. That is what makes a tree that crosses a chunk border come out the same in both chunks.

## Wired into the game

Done in the integration step after the ten-phase rebuild. Two lines choose the generator, and nothing else knows which one it is:

| Where | What it builds |
| --- | --- |
| `worldgen/createWorkerGenerator.ts` | `createVoxelverseGenerator(registry)`, once per mesh worker at start-up (`meshing/mesh.worker.ts`). The worker's `ChunkCache` calls `generateChunk(chunk, { lod })` with `LodLevel.LOW` (0) for chunks more than 2 chunks from the player and `HIGH` within that. |
| `gameWorld.ts` | `createVoxelverseGenerator(blockRegistry)` for the main thread, exported as `worldGenerator` and wrapped in `voxelWorld`. Player collision, the HUD zone name and biome, the benchmark camera and the spawn height read it. |

Both use `WORLD_SEED` and a registry from `createDefaultRegistry()`, so the same coordinates give the same block on both threads. `tests/worldgen/integration.test.ts` keeps it that way: at random points of chunks built the way a worker builds them (including whole columns at chunk borders, roads, bridges, the forest belt, the coast and the mountains), `voxelWorld.getBlock` on the main thread answers the same block, and a chunk meshed from the worker's nine chunks gives the same geometry as one meshed by asking the main thread block by block. The same file checks that neither `gameWorld.ts` nor the worker build a `LegacyZoneAdapter`.

Details that came up in wiring it:

- **Spawn.** The player spawns at Greensom (0, 300) and a fall into the void (eyes below y = -20) puts it back there. `engine/spawn.ts` (`standingEyeY`) finds the eye height for that column from the generator: the first solid cell from the ground up with three free cells above it, so the player stands on the village road and the first frame does not drop it from a fixed height. The ground at Greensom is y = 7, so the eyes are at 9.3. Tests check the floor is solid, the head room is free and the zone is Greensom.
- **HUD.** The zone name is `voxelWorld.zoneNameAt`, which asks the blender. In the wilderness the HUD and the F3 panel also show the biome (`worldGenerator.biomeAt`, for example "cedar forest"). The `--smoke` run checks that the HUD says Greensom Village at the spawn.
- **Level of detail.** `LodLevel.LOW` is 0 and `VoxelverseGenerator` treats `lod: 0` as far, so the engine's option already means what the generator expects. At LOW the wilderness drops about 90 percent of its plant blocks and the zones their small props; trees, rocks, logs, roads, bridges and waypoints stay. A test compares one forest chunk at both levels and finds only plants differ (where a bamboo clump hidden under undergrowth shows through at LOW, the low cell is a plant of another kind).
- **Cost in the workers.** Per chunk the new generator is no slower than the legacy adapter: in node about 7 ms in the Town, Tempest and the belt (the same as legacy), 7 to 10 ms in the home meadows, the south forest and the mountains where legacy took 13 to 20 ms (`npx vite-node tools/bench-generators.ts`). In the browser a job generated 5 chunks and 8 to 13 ms on average, against 5 chunks and 22 ms before. The chunk cache and the job order were left alone: [perf-after-integration.md](perf-after-integration.md).
- **Collision.** Walking each of the six roads end to end with the game's own physics (`tests/worldgen/road-walk.test.ts`): no road sticks or falls. A player has to jump at each one-block rise (1 jump on the 30 block Greensom road, 23 to 62 on the others) as before; bridges are walked on their planks.
- **Legacy.** `LegacyZoneAdapter` stays in `worldgen/` as the reference the zone cores, the parity tests and the mesher timing tests are checked against. Nothing in the game imports it.

## Structures and the Tempest layout (`worldgen/structures/`, `worldgen/tempest/`)

Phase 7 puts buildings into the zones. Step 7.1b added the machinery, described in [tempest.md](tempest.md); this is what it adds to `worldgen/`.

| Folder | What it is |
| --- | --- |
| `structures/` | Pure and generic: `Blueprint` (a sparse volume of cells with bounds, turning, mirroring, merging, a stable hash and a `Placement` that answers `cellAt` in world coordinates in one array read), the `StylePack` (roles mapped to blocks, with palette families), roof profiles as data and the roofs built from them, the `BlueprintBuilder` with its Japanese-fusion helpers, `Lot`, `BuildingKit`, `KitRegistry` and a placeholder `BoxHouseKit`. Nothing in it names a Tempest block. |
| `tempest/` | `style.ts` (the Tempest pack and its families), `layout.ts` (the contract of where the town's streets, blocks, districts and landmarks are, and the gates it shares with the roads), and `kits/` (the demonstration kits and `createTempestKits()`). |

Two connections to what is above:

- **Roads.** `layout.ts` reads `GATES.tempestWest` and `GATES.tempestNorth` from `roads/layout.ts` and lays its roads to them, so the network's road meets the town's head on. A test builds the `RoadNetwork` from the seed and checks that its Tempest roads start at those gates.
- **Zones.** The layout is a new description of the Federation of Tempest's interior and is not wired into `zones/TempestZone.ts` yet; the zone keeps building the old planned grid until the zone step replaces it. It uses the same footprint (circle of 700 about (1500, 0), core 550, ground y = 8), so the terrain blender needs no change.

`structures/` and `tempest/` are pure like the rest of `worldgen/`, and the engine and `content/` never import them (`tests/worldgen/structures-purity.test.ts`). The viewer for kits is `components/sandbox/` (`?sandbox=kits`); `npx vite-node tools/render-tempest-layout.ts` draws the layout as a map.

## Tools

Node-side only (they use `node:fs` and `node:zlib`). Run them with `vite-node`.

| Command | What it does |
| --- | --- |
| `npm run map` | Writes every preset to `docs/maps/`: `overview` (x, z -3000 to 3000, 4 blocks per pixel), `roads` (the whole network, 3 blocks per pixel), `greensom-magnolia` (the longest road, 2 blocks per pixel), `corridor` (x 0 to 2200, z -400 to 400, 1 block per pixel), `tempest` (around Tempest, 1 block per pixel), `corridor-blocks` and `tempest-blocks` (topmost blocks, so trees, boulders and reeds show), `bridge-blocks` (the first bridge), `gate-town-blocks` and `gate-tempest-blocks` (a road meeting a zone road, blown up 5 times), `east-mountains`, `south-forest`, `west-coast`. About 35 seconds. |
| `npm run map -- --preset corridor` | One preset. |
| `npx vite-node tools/scan-road-steps.ts` | Scans a 24 block corridor round every vertex of every road for any 4-neighbour height step above 2 and prints the worst and the first few offenders. |
| `npm run map -- --cx 0 --cz 0 --size 1024 --step 4 --out map.png [--blocks] [--height 512] [--seed 1]` | A custom view. |
| `npm run bench:chunks` | Time per generated chunk in node. On a laptop, about 8 to 9 ms for hills, woods and belt, 10 ms in the mountains, 6 ms for open sea, 7 ms in the Town and Tempest (roads included). |

The biome maps paint each biome in its own colour, shaded by slope, water by depth, zone footprints as outlined grey discs. Roads are drawn along their centrelines in the colour of their paving, darkened (at least 2 or 3 pixels wide on the coarse maps), bridges brown and waypoints yellow; the block maps show the real blocks. `tools/png.ts` is the small PNG writer.

What the maps show, judged by looking at them:

- Meadow with oak and birch copses around the Town and Greensom, a clear change to cedar forest with bamboo and sakura groves from about x = 500 on the road to Tempest, and a belt of the same around Tempest that is lobed, not round.
- Dense mixed forest with wetland pockets in the south, pine woods in the north, beaches along a ragged west coast, and rocky hills with snow on the ridges in the east.
- Rivers meander and widen to the west and stop at springs in the hills. There are no rivers in the mountains and none touching a zone.

- The roads are continuous from gate to gate, bend gently, run straight at the gates and cut through the cedar and sakura belt on the way to Tempest. At the gates they are as wide as the legacy road (the Town's 23 blocks, Tempest's 9) and narrow over 70 blocks (`gate-town-blocks`, `gate-tempest-blocks`). The Greensom to Magnolia road crosses a river on a bridge with its approaches either side (`bridge-blocks`).

Known weak spots: the rivers are many and thin on the overview and read a little like spaghetti, and the mountain front east of x = 10000 is roughly a north-south line (it comes from `TerrainField`'s uplift, which step 6.2 owns).

## Tests

`tests/worldgen/integration.test.ts` and `tests/worldgen/road-walk.test.ts` cover the wiring, see [Wired into the game](#wired-into-the-game). The structures and the Tempest layout have their own tests, listed in [tempest.md](tempest.md#tests).

`tests/worldgen/blender.test.ts` checks: no height step above 2 along rays that cross every zone border (120 crossing rays per zone at many angles and positions plus sweeps along the border across the road strips), the open wilderness being walkable (rivers and ponds included), the cores of the Town, Greensom, Tempest and Amestris matching `LegacyZoneAdapter` at 3,000 random points and cell for cell in seven landmark chunks, `sampleBlock` equal to `generateChunk` at 3,000 random points and down whole columns, heights inside the terrain bounds with nothing piled on them, the same seed giving the same chunk hash, LOD 0 only dropping plants, wilderness chunks averaging under 40 ms, and `ZoneInfo` agreeing with the legacy zones. `terrain.test.ts` covers `softLimit` and the geography of `TerrainField`.

`tests/worldgen/roads.test.ts`: the six roads run gate to gate and the Greensom road is straight; the tightest bend; the bucket size and query time; the network is the same when built twice and differs by seed; `buildProfile` keeps its grade, its ends and lifts the road to the deck over water; terrain stays walkable (no step above 2, measured 1) across 400 cross sections of the roads; walking each road's centreline in whole-block steps, every step is road (paving or deck), the height step is at most 1, there is no water on the road or under it except under a deck, and nothing stands in the way; at every gate with a legacy road, the legacy cells and ours across the whole width are side by side at the same height and the cells beside are not road; the roads that end on the rim of a core zone; the road painted onto zone footprints with air above; zone cores identical to `LegacyZoneAdapter` around every gate (more than 1,000 points); paving by distance; bridges (planks, water below, rails, log beams, ramps within the grade, none at a road's end); waypoints (post, lantern, never on the road); the same chunk hash twice from one seed in any order and another for another seed; `sampleBlock` equal to `generateChunk` at 3,000 random points on and beside roads, bridges and posts; chunks with a road averaging under 40 ms. `chunkHash.ts` is the hash helper.

`tests/worldgen/biomes.test.ts`: every biome appears over a wide area; cedar, bamboo and sakura dominate x 1000 to 1500, z 100 to 600; the home country stays meadow and oak; the south is woodier and denser; rocky hills and alpine in the east; beaches in the west; wetland pockets; the biomes change on the way from the Town to Tempest; borders are ragged (mean step 45 blocks between rows); determinism; the climate fields are smooth.

`tests/worldgen/features.test.ts`: features crossing a chunk seam agree with `sampleBlock` on both sides of seams in seven forests (60,000 cells, about 2,000 of them tree blocks) and in a 2 x 2 block of chunks; no tree block in water over about 120 chunks with open water (29,000 tree blocks, 0 in water); nothing grows inside or is cut by a zone footprint; a `RoadField` keeps everything out of a circle (22,000 blocks stand there without it, none with it); the same chunk hash twice whatever order chunks were generated in; every species appears somewhere; every feature stays inside its declared radius; the overlap rules; LOD 0; speed.

`tests/worldgen/rivers.test.ts`: channels have their floor at `WATER_LEVEL - 1` with water exactly at the water level; banks and beds are sand or gravel; reed beds; rivers are never stronger than the zone fade allows; widening towards the coast; no rivers in the mountains; determinism; ponds are in wetland with mud under them.

`tests/worldgen/blocksNature.test.ts`: the nature block ids are unique and in 48..79, plants are not solid, only whole cubes are opaque.

`tests/worldgen/noise.test.ts` checks: determinism per seed, different seeds being uncorrelated, output bounds, mean and spread over large samples, no step at simplex cell edges, no lattice artefacts (neighbour differences from integer and half-integer points agree within 5%), a chi-square test of `hash2` and `hash3` for uniformity, no link between neighbouring hashes, and negative coordinates.

Measured on the development machine: a wilderness chunk with biomes, rivers and features averages 9 to 12 ms over 20 chunks (dense forest, belt, open country; limit 40 ms), and chunks that carry a road about the same.
