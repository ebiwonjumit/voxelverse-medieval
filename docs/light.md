# Light engine

Phase 5 bakes light into the world instead of leaving it to Three.js lights. This is step 5.1, the pure engine: `meshing/LightEngine.ts`. It computes the light of one chunk; the mesher, the shader and the day/night cycle that use it come in the later steps of the phase. Like the mesher it is plain data code (no three, no React, no DOM), so it runs in the mesh worker.

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

## Tests

`tests/light.test.ts`: open sky is 15; a roof falls off by one per block from the opening (checked cell by cell); a sealed room is dark by day; a lantern gives 15 to 0 at radius 15 and does not enter the ground; opaque emitters; two sources; glass and slabs and water and fences; leaves; `lightDim`; borders between two, three and four chunks and real terrain at the Town of Beginnings; determinism; edges (missing neighbours, top of the world, a lantern in the top layer of the highest section); a random-world check against a plain relaxation written from the rules and sharing no code with the engine (three seeds, with caves, canopies, glass, fog, slabs, lanterns and glowstone); and the timings above.
