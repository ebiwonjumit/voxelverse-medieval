# Light engine

Phase 5 bakes light into the world instead of leaving it to Three.js lights. Step 5.1 is the pure engine, `meshing/LightEngine.ts`, which computes the light of one chunk. Step 5.2 puts that light into the mesh and the shader: see [Smooth light in the mesher](#smooth-light-in-the-mesher), [The worker](#the-worker) and [The shader](#the-shader) below. The day/night cycle that drives the daylight uniform comes in a later step. Like the mesher the engine is plain data code (no three, no React, no DOM), so it runs in the mesh worker.

## What it computes

Two channels per cell, each 0 to 15, packed in one byte (sky in the high nibble, block light in the low one):

- **Sky light** is 15 in every cell above the highest cell of its column that is opaque or dims light (see below). From there it floods down and sideways, losing 1 per block, so a room under a roof is lit near its windows and dark at the back. A column that is open all the way down (a well, a hole in a roof) stays at 15 to its floor, as in Minecraft.
- **Block light** floods from `BlockDef.emits` (lantern 15, magic crystal 10), losing 1 per block, and is 0 at distance 15 from a 15 source (Manhattan distance, through open cells).

What light does at a block comes from the registry:

| Block | Effect |
| --- | --- |
| `opaque: true` (stone, planks, stairs, slabs, farmland, ...) | stops both channels. Partial opaque blocks stop light as a whole cube; there is no light through the gap above a slab. |
| `opaque: false` (glass, panes, water, plants, fences, lanterns, small boxes) | passes light at the usual cost of 1 per block, and a column of open sky passes straight through without loss. |
| `lightDim: n` (new optional field, 0 to 15, default 0) | the block soaks up light. A block with `lightDim` above 0 ends a column of open sky, so light under it is no longer free, and a step into it costs `max(1, lightDim)`. Oak, birch and pine leaves use 1: sky light is 14, 13 and 12 inside a three layer canopy and 11 in the air just under it. |
| `emits: n` | the cell holds light level n, whether or not the block is opaque. |

A block added by another branch with no `lightDim` and `opaque: false` is fully clear. Blocks the registry does not know are clear and emit nothing.

## API

```ts
import { ChunkGrid, computeChunkLight, skyOf, blockOf } from './meshing/LightEngine';

const light = computeChunkLight(reader, cx, cz, registry);  // LightData
light.get(lx, y, lz);    // packed byte: skyOf(b) and blockOf(b)
light.sky(lx, y, lz);    // 0..15
light.block(lx, y, lz);  // 0..15
```

- `light.copyLayers(out, minY, maxY)` copies the packed light of whole layers into a byte array laid out like the mesher's padded cell grid (the chunk plus its ring, x fastest, then z, then y). The mesher uses it to read a cell's light at the same index as the cell.
- `reader` is a `LightReader`, `getChunk(cx, cz)`. `ChunkGrid` is one over chunks you already hold. It has to supply the chunk and its eight neighbours; a missing one reads as air.
- `LightData` answers for local `lx` and `lz` from -1 to `CHUNK_SIZE` (a one block ring around the chunk, so the mesher can read the cell in front of every face and the four cells around a vertex without asking a neighbour). Anything further out throws. Above `WORLD_MAX_Y` it reads as open sky (15, 0) and below `WORLD_MIN_Y` as dark.
- It is stored per section of 16 layers like the cells. A section whose 34 x 34 x 16 cells all have the same light (open sky above the ground, solid rock below it) is a single byte; `storedSections()` counts the ones that needed an array. A real chunk keeps 2 to 5.
- The result is deterministic: the same cells always give the same light. Scratch buffers are shared between calls and re-initialised on each one, and a test lights other chunks in between to check that.

## Why a 3x3 neighbourhood is enough

Light dies after 15 blocks, so a cell in the chunk or its ring can only be reached from cells within 15 blocks of the ring, which all lie inside the 3x3 chunks around it. With those nine chunks the result is exact, not an approximation, so two neighbouring chunks lit separately agree on every cell of the border (a test compares real terrain around the Great Tower, and synthetic lanterns, roofs and diagonal corners). The engine only reads the middle 64 x 64 blocks of the 3x3 (the chunk plus 16 blocks each way).

## How it works

1. Copy the nine chunks into one dense grid (`Chunk.copyCells`), from the world floor to one section above the highest allocated section (so sky is open at the top and block light has room to climb).
2. Sky: walk down from the top, row by row, over the 64 x 64 columns that matter. A column is open until its first opaque or dimming cell, which is its height; open cells are set to 15 as the walk passes them. The walk stops when every column has been blocked.
3. Seed a queue with the open cells that touch a column whose blocker reaches their height, plus the cell just above every blocker (so light can step down into leaves), and flood. Everything else that is open is already 15 with nothing darker beside it.
4. Block: scan for emitters, set their levels and flood from them. The scan is skipped if the registry has no emitter at all.
5. Pack the chunk and its ring into sections.

Floods relax a cell when a neighbour offers more than it has (a label-correcting breadth-first search), because a step can cost more than 1.

## Speed

Measured with the light computed from nine already generated chunks of `LegacyZoneAdapter`, on an Apple M4, median of 15 runs after warm-up. "Bundled" is the code bundled with esbuild and run in node (V8, no module-binding overhead, like the production worker); "vitest" is `tests/light.test.ts`, which asserts under 15 ms and prints `[light]` lines.

| Chunk | Light (bundled) | Light (vitest) | Stored sections | Mesh, for scale (bundled) |
| --- | ---: | ---: | ---: | ---: |
| (0, 9), spawn at Greensom | 2.7 ms | 2.3 ms | 2 | 4.0 ms |
| (0, 0), Town of Beginnings | 6.8 ms | 4.1 ms | 5 | 5.9 ms |
| (-1, -1), Great Tower corner | 6.3 ms | 4.1 ms | 5 | 5.0 ms |
| (53, 0), Tempest Coliseum | 2.6 ms | 2.2 ms | 2 | 3.0 ms |

Both are far under the 15 ms the 3x3 approach was allowed, so the height-map fallback was not needed. The light time is the same whichever chunk is lit; what changes between chunks is only how much of it is flooding through rooms.

The real cost of the neighbourhood is **generating the neighbours**: a worker that has only generated the chunk it meshes now needs eight more. Generating one chunk took 1.4 to 5.8 ms bundled (6 to 13 ms under vite-node), and all nine of a neighbourhood 17 to 86 ms (the 86 ms is the first one, with a cold JIT), so lighting a chunk from scratch is tens of milliseconds of generation plus the 3 to 7 ms of light. The worker integration (the next steps of the phase) should keep generated chunks in a small cache so a ring of neighbours is generated once and shared by the chunks around it, not nine times per job.

### A note on vitest timings

Under vite-node an imported binding (`CHUNK_SIZE`, say) is a property lookup on a module object, and in a loop that runs millions of times it is about 10 times slower than a local. `LightEngine` and `Chunk.copyCells` copy the constants they use in hot loops into locals for that reason, which took a chunk's copy from 14 ms to 2 ms in the tests. The production build is not affected (the bundler inlines them), so the same trick changes only the numbers you see in `npm test`.

## Smooth light in the mesher

`meshChunk(reader, cx, cz, registry, { layout, light })` takes the `LightData` of the chunk and writes it into every vertex, in one attribute (`light` in `MeshData`, `bakedLight` in the Three.js geometry) of four floats, all 0 to 1:

| Component | What it is |
| --- | --- |
| x | sky light, level / 15 |
| y | block light, level / 15 |
| z | ambient occlusion multiplier, 0.55 to 1 (1 is open) |
| w | glow: what the block itself emits, `emits / 15` (0 for everything that does not shine) |

This replaces the old `colors` attribute (a white or occlusion-only rgb multiplier); the biome tint stays in its own `tints` attribute, so tint, light and occlusion are three separate inputs to the shader. A vertex is 4 bytes bigger than before (a vec4 where there was a vec3).

**A corner of a cube face.** The face looks at one cell, the cell in front of it. Each of its four corners takes the average of the light of four cells in that layer: the front cell, the two beside the corner and the one diagonal to it, for sky and block light separately. Two rules keep it honest, and a test breaks if either is removed:

- A cell that blocks light (an opaque block, so its stored light is 0) is left out of the average instead of counting as dark. Otherwise every corner next to a wall would be a step darker than the air it touches, on top of the occlusion.
- The diagonal cell is also left out when both cells beside the corner block light, because light cannot reach the vertex through two walls that touch. Without this a lantern in a closed-off cell would light the corner of the floor next to it.

Ambient occlusion comes from the same cells, the usual three-neighbour level over blocks that cover all six sides (a slab or a stair does not darken the cube beside it). It is switched on now (`AO_STRENGTH = 1`, see [meshing.md](meshing.md#ambient-occlusion)). The quad is split along the diagonal that joins its two brighter corners, judged on sky plus block light times occlusion, so a lit corner next to a dark one does not show a crease.

**Quads that are not a whole cube face** (a stair's riser, a fence, a plant, a lantern, the two halves of a stair's base) take one light value for all four corners: the cell they look at if it lets light through, else the block's own cell, else the brightest open cell around (an opaque stair's own cell is dark, so a stair face inside it reads the air in front of it). A slab's base, which is a whole cell face, is smoothed like a cube.

**Water** is lit the same way and smoothed, with no occlusion: a shore does not darken it.

**Without light data** (the sandbox pages and most mesher tests) every vertex is open sky: sky 1, block 0.

**Glow** is the block's own `emits` level, written on every quad of an emitting block (the lantern is 15 and the magic crystal 10, which are the only legacy blocks that emit). A block another branch registers with `emits` above 0 glows by itself.

## The worker

A job for one chunk needs the 3x3 chunks around it for the light, so a worker would generate nine chunks per job. `meshing/ChunkCache.ts` is a small LRU of generated chunks (64 per worker, about 8 MB, kept per detail level: a job at HIGH reads its nine chunks at HIGH, so the light matches the cells it meshes). `runMeshJob` gets the neighbourhood from the cache, lights the chunk, and meshes it reading the cells and the one block ring from those same nine chunks (`NeighbourReader`, instead of asking the generator block by block; a test checks the mesh is identical to the one built the old way). It is still one job per chunk and the pool is unchanged.

```
cache.neighbourhood(cx, cz, lod)   9 chunks, generating the ones the worker has not seen
computeChunkLight(...)             sky and block light of the chunk and a one block ring
meshChunk(new NeighbourReader(...), ..., { layout, light })
```

Every `MeshData` carries `timing`: milliseconds spent generating (what the cache did not have), lighting and meshing, and how many chunks the job generated. The renderer sums them into `getStats()` (`jobs`, `generateMs`, `lightMs`, `meshMs`, `maxLightMs`, `maxMeshMs`, `chunksGenerated`), which the soak run records.

Measured in the browser (production build, render distance 8, four workers, the 90 s soak, [`bench-soak-p5-prod.json`](bench-soak-p5-prod.json)), averaged over 881 jobs: **light 2.4 ms, mesh 2.2 ms, generating 26.9 ms** per job, worst single light 22.6 ms and mesh 22.3 ms (the first jobs, with a cold JIT; both are under 3 ms on average). In node with the neighbours already cached, light plus mesh is 6 to 11 ms for the four test chunks (`tests/meshing/mesh-job-timing.test.ts`, target 25 ms).

Generation is the real cost, and the cache only helps partly: four workers each see about a quarter of the chunks, so a chunk is generated by several of them. In the soak 4,620 chunks were generated for 881 jobs, 5.2 per job where one job on its own needs 9 (and the old path needed 1). A cache of 160 chunks per worker brought it to 4.5 per job, so size is not what limits it. Sending jobs for neighbouring chunks to the same worker should cut it a lot (I did not try it): the pool ranks jobs by distance to the player and has tests that pin that order, so it was left alone, and it is the first thing to try if load time matters. Frame time does not see any of this, because it all happens in workers (table below).

| Run (production, render distance 8) | fps | p99 | worst frame | frames over 50 ms |
| --- | ---: | ---: | ---: | ---: |
| flythrough, overall ([`bench-p5-prod.json`](bench-p5-prod.json)) | 60.0 | 17.7 ms | 32.7 ms | 0 |
| 90 s soak | 60.0 | 17.7 ms | 24.6 ms | 0 |

Against the Phase 2 targets (jump p99 under 20 ms, walking p99 under 25 ms, nothing over 50 ms while walking, 58 fps or better): the jump leg p99 was 17.2 ms, the walking legs 17.7 ms and 17.7 ms, with no frame over 50 ms, and the geometry count in the soak stays flat (355 at 30 s, 352 at the end). The worst single frame, 32.7 ms on the long leg, is in the range the earlier phases saw on this busy machine (22 to 29 ms, [perf-after-p3.md](perf-after-p3.md)); the load leg had one frame of 31.5 ms, while the first chunks upload.

## The shader

`render/BlockMaterials.ts`. The three chunk materials are now `MeshBasicMaterial`, patched like before: a chunk takes nothing from the scene's lights. A fragment is

```
texture(layer, uv) x biome tint x ao x max(sky * uDaylight, block light) x face factor
```

computed as follows (constants at the top of the fragment declarations):

- Light levels go through a curve, `pow(level, 1.8)`, so the dark end is darker than a straight line: a room a few blocks from a window reads as dim and not nearly as bright as day. Sky light is multiplied by `uDaylight`; block light is not, and is warm (`vec3(1.0, 0.84, 0.6)`). The two are combined per colour channel with `max`, so a lantern in a dark room gives orange light and a lantern at noon changes nothing.
- A floor of 0.04 under the light keeps a sealed room from going black, and a final scale of 0.5 keeps full daylight from clipping once the renderer's ACES tone mapping has brightened it (ACES multiplies by 1/0.6 first, so an unscaled noon came out washed out).
- The face factor is mild: `0.86 + 0.14 * normal.y - 0.05 * abs(normal.x)`, which is 1 on tops, 0.86 on north and south walls, 0.81 on east and west walls and 0.72 on undersides. Occlusion and baked light do the real shading.
- **Glow.** The block light an emitter's own faces show is at least its emission, and the result is multiplied by `1 + glow * 0.45`, so a lantern is a little brighter than the light around it and stays lit when the area is dark. Block light by itself would make a magic crystal (10) only two thirds lit.
- Fog is the scene's, as before. Water uses the same lighting, then its wave and blending.

`uDaylight` is one uniform shared by the three materials, 0 to 1. `ChunkRenderer.setDaylight(value)` sets it (clamped), and `World` calls it every frame. Nothing is re-meshed when it changes: sky light is baked as a level and scaled here. Until the day/night cycle of the next step drives it, `World` reads `?daylight=0..1` from the page address (default 1, noon), which is how the night screenshots below were taken.

## Screenshots

In [screens/p5/](screens/p5/): the six standard world shots at noon (`world-*.png`, compare [p4](screens/p4/)), the spawn road at `?daylight=0.12` with the lanterns' pools of light (`night-spawn.png`), and the Great Tower at noon, where the entrance hall (`tower-entrance-day.png`) and the inside (`tower-interior-day.png`) are dark except where lanterns light the floor and the corners show occlusion. `blocks.png` and `models-house.png` are the two sandbox pages, which now show ambient occlusion on their blocks.

The old `DayNightCycle` component, the Three.js lights and the fixed twilight sky and fog are still in `components/Game.tsx`: chunks no longer use the lights, and replacing the rest, with zone `skyTint` and `fogDensity`, is a later step.

## Tests

`tests/meshing/baked-light.test.ts` (a sealed room dark by day, the same room with a lantern, averages round a vertex, walls and corners left out, stairs and slabs, windows, water, tint, glow, attribute shapes on real terrain), `tests/meshing/light-seams.test.ts` (the light of every vertex on the border of two real chunks agrees from both sides, for four borders), `tests/meshing/chunk-cache.test.ts` (the cache, the count of chunks generated for a block of jobs, same mesh warm or cold, lanterns across a border, `NeighbourReader` against the old reader), `tests/meshing/mesh-job-timing.test.ts`, and `tests/light.test.ts`: open sky is 15; a roof falls off by one per block from the opening (checked cell by cell); a sealed room is dark by day; a lantern gives 15 to 0 at radius 15 and does not enter the ground; opaque emitters; two sources; glass and slabs and water and fences; leaves; `lightDim`; borders between two, three and four chunks and real terrain at the Town of Beginnings; determinism; edges (missing neighbours, top of the world, a lantern in the top layer of the highest section); a random-world check against a plain relaxation written from the rules and sharing no code with the engine (three seeds, with caves, canopies, glass, fog, slabs, lanterns and glowstone); and the timings above.
