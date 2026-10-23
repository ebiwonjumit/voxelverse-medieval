# Chunk mesher

`meshing/` turns one chunk of cells into triangle lists. It is plain data code (no Three.js, no React, no DOM), so it runs in a worker. A test fails if a file in `meshing/` imports anything it should not (`mesh.worker.ts` alone may import `content/` and `worldgen/`).

| File | What it does |
| --- | --- |
| `ChunkMesher.ts` | `meshChunk(reader, cx, cz, registry)` returns `MeshData`. Also `meshTransferables` and `meshTriangleCount`. Plain cubes are meshed here; every other block from the quads of its model (`engine/models`, see [models.md](models.md)). |
| `CellReader.ts` | The interface the mesher reads cells through, in world coordinates. |
| `PaddedChunkReader.ts` | A `Chunk` plus a generator's `sampleBlock` for the one-block ring around it. |
| `biomeTint.ts` | The zone colour blend for grass and leaves, ported from the old `World.tsx`. |
| `color.ts` | `#rrggbb` to linear rgb. |
| `LightEngine.ts` | `computeChunkLight(reader, cx, cz, registry)`: baked sky and block light for a chunk and a one block ring, from the 3x3 chunks around it. The mesher takes its result as `options.light`. See [light.md](light.md). |
| `ChunkCache.ts` | A worker's small LRU of generated chunks, so the 3x3 a job needs is generated once, not nine times. |
| `NeighbourReader.ts` | A `CellReader` over the nine chunks of a neighbourhood: the chunk and its ring come from the chunks themselves. |
| `runMeshJob.ts` | One job: get the chunk and its eight neighbours (from the cache), light the chunk, mesh it, and record how long each took. |
| `MeshWorkerPool.ts` | The worker pool: priority queue, cancel, stale results. See [renderer.md](renderer.md). |
| `mesh.worker.ts` | Worker entry point. The one file here that imports `content/` and `worldgen/`, to build its own registry and generator. |

## Output

`MeshData` is `{ cx, cz, opaque, cutout, water, timing? }` (`timing` is milliseconds spent generating, lighting and meshing, set by `runMeshJob`, see [light.md](light.md#the-worker)). Each bucket holds these buffers (all Float32Array except the indices):

| Buffer | Per vertex | What it is |
| --- | --- | --- |
| `positions` | 3 | Chunk-local position. |
| `normals` | 3 | Outward face normal. |
| `light` | 4 | Baked light: sky (0 to 1), block light (0 to 1), ambient occlusion multiplier (0.55 to 1) and glow (0 to 1). See [light.md](light.md#smooth-light-in-the-mesher). |
| `tints` | 3 | Linear rgb biome tint; white on faces that take none. |
| `uvs` | 2 | Position inside the tile, 0 to 1. `v = 0` is the top row of the tile. |
| `layers` | 2 | Texture array layer of the face, and the layer of its tint overlay or -1. |
| `indices` (Uint32Array) | 6 per face | Two triangles. |

Every face is four vertices and six indices, counter-clockwise from outside. `meshTransferables(mesh)` lists the 21 buffers for `postMessage`.

- Positions are chunk-local: x and z run 0 to 32, y is the world height. A block at (x, y, z) fills the unit cube from (x, y, z) to (x+1, y+1, z+1). The old renderer centred cubes on whole numbers, so the render code must place each chunk mesh half a block back on all three axes to look the same and to match the player's collision, which uses the same block-centred coordinates (see [collision.md](collision.md)).
- There is no vertex colour any more: the light attribute replaces it, and the materials are unlit (`MeshBasicMaterial`) and shade from it. The block's own colour does not live in the vertices either: it comes from the texture layer. The face-direction factor (tops brighter than sides) is applied in the shader from the normal, not baked.
- Buckets: `opaque` is every block the registry marks opaque, whatever its shape (cubes, stairs, slabs, farmland). `water` is water. `cutout` is everything else that draws: leaves, glass, panes, fences, plants and the small boxes. Each bucket has its own material (see [renderer.md](renderer.md)): no alpha test for opaque, alpha test for cutout, blending and the wave for water.

## Reading cells

`CellReader.getCell(x, y, z)` answers for the chunk and a one block ring around it, which is all the mesher asks about. It returns whole cells, state included: the mesher's padded grid holds cells, and its tables (kind, covered sides, opaque, wet) are indexed by the cell, so a stair facing north and one facing east cull differently. `PaddedChunkReader` reads the chunk from its own cells and the ring from `generator.sampleCell`, or `sampleBlock` with state 0 for a generator without one, so a worker generates exactly one chunk per job. For both generators `sampleBlock` equals what `generateChunk` would put in a neighbour (the parity and seam tests prove it), so seams match, and the main thread's `sampleBlock` equals the chunk a worker builds (`tests/worldgen/integration.test.ts`).

Two optional reader methods exist for speed. `yRange()` tells the mesher which heights can hold blocks, so it skips empty sky. `copyChunkCells()` copies the chunk's cells in bulk instead of one `getCell` call per cell. Without them the mesher still works, only slower; a test checks both paths give identical meshes. `Chunk` has `allocatedYRange()` and `copyCells()` for this.

## Culling

A face is drawn unless the block beside it covers the side the face looks at. Details (the full rules for partial blocks are in [models.md](models.md#faces-hidden-by-neighbours)):

- Water faces are not drawn against water, or against a block that covers the side they look at (a full opaque cube; a slab covers only its flat side, so water beside one is drawn). A solid face next to water is drawn, because water covers nothing.
- Full-cube blocks that are not opaque (leaves, glass) hide faces against a neighbour of the same id, and are drawn against anything else.
- A cube face is hidden only by a neighbour that covers its whole side. A face of a model that lies flat against a side of its cell is hidden when the neighbour covers every quarter the face touches; a slab's wall hides behind the slab beside it.
- Below the bottom of the world counts as solid, so the underside of the world is never drawn.
- A block with `holdsWater` (the lily pad) also draws a water cube in its cell, as the old renderer did under every pad.
- Ids the registry does not know are drawn as magenta cubes (the layout's unknown tile, a flat `#ff00ff`), so a missing registration is visible rather than silent.

## Shaped blocks

Everything that is not a plain cube or water is drawn from the quads of its `BlockModel`: stairs, slabs, fences, panes, plants, crops and the small boxes (the old `LEGACY_BOXES` table is gone, those blocks have models now). A model's quads are cell-local, shared between cells and moved to the block's place as they are copied into the bucket; fences and panes get a view of their four neighbours from the mesher's grid to choose the variant with the right arms. Models of opaque blocks go in the opaque bucket, the rest in cutout. See [models.md](models.md) for the shapes, the state bits and the culling.

## Ambient occlusion

Full cubes (not water, not shaped blocks) get per-vertex occlusion with the usual three-neighbour method over the layer in front of each face: two side blocks and the diagonal one, counting only blocks that cover all six sides (so a slab does not darken the cube beside it). A model quad that is a whole cell face, such as a slab's base, gets the same treatment; other model quads stay lit. Both sides solid gives the darkest level, otherwise the level is 3 minus the number of solid neighbours. At full strength levels map to multipliers `[0.55, 0.7, 0.85, 1.0]`, written as the third component of the `light` attribute and multiplied into the shading by the shader. The quad is split along the diagonal that joins the two brighter corners (judged on the light as well as the occlusion, see [light.md](light.md#smooth-light-in-the-mesher)), which avoids the crease you get when the wrong diagonal is interpolated.

**It is on by default since Phase 5.** Phase 2 kept it off to keep the old renderer's flat look; with light baked it is what makes corners and creases read. The single switch is `AO_STRENGTH` in `ChunkMesher.ts`: 0 means every multiplier is 1.0 and the neighbour lookups are skipped; 1 is the full range above, and values between scale the darkening linearly. `meshChunk` also takes `{ aoStrength }` as an option, which tests use for other strengths.

## Textures

The mesher is given a `TextureLayout` (`meshChunk(reader, cx, cz, registry, { layout })`; `runMeshJob` and the worker pass it). The layout answers two questions per block face, from tables, with no string lookups in the hot loop:

- **Which layer.** `layout.faceLayers[id * 3 + kind]`, where kind is top, bottom or side. A block with `faces` gets the layer of that tile. A block without them, or naming a tile the catalog lacks, gets a flat tile of its registry colour (`flat:#rrggbb`, one per distinct colour). Unregistered ids get the magenta tile. Without a layout, `meshChunk` builds a flat-only one, which is what most mesher tests use.
- **Which tint.** `layout.faceTint` is non-zero only if the block asks for a tint and the face's tile takes one. A tinted face carries the biome colour (`biomeTint.ts`: each zone centre contributes its grass colour weighted by 1 / (distance + 1); `foliage` is that times 0.7) in its `tints` vertices. A face of a partly tinted tile, the grass side, also carries the layer of the tile's tint mask in `layers.y`; the shader paints the tint only where that mask is set. Tests compare the blend with a copy of the old formula, run through Three.js `Color`, at sample points across the map.

Every face stretches its tile over the whole face. Walls are upright and read left to right as seen from outside, so a tile is never mirrored or turned. On the top face `v = 0` points north (-z), on the bottom face south.

Shaped blocks use the same tables through the face kind each quad carries (top, bottom or side), so a stair wears the top tile on its treads, and a fence, flower or crop wears one tile everywhere. A block with a model but no `faces` is that model in its flat colour.

## Speed

Meshing alone, measured by `tests/meshing/mesher-timing.test.ts` in node on an Apple M4, with AO on (the default), no light data and chunks from `LegacyZoneAdapter` (these timing tests still use it; the Phase 6 generator makes chunks of the same size and shape, see [perf-after-integration.md](perf-after-integration.md) for the game itself) with ring sampling included (median of 9 runs after warm-up; generating the chunk is not counted). Phase 2 measured 6.3 to 10.0 ms on the same chunks with AO off:

| Chunk | Median | Triangles |
| --- | ---: | ---: |
| (0, 9), spawn at Greensom | 6.0 ms | 7,660 |
| (0, 0), Town of Beginnings | 8.0 ms | 16,666 |
| (-1, -1), Great Tower corner | 8.1 ms | 15,702 |
| (53, 0), Tempest Coliseum | 4.6 ms | 2,552 |

The target was under 25 ms. The test asserts it, so a regression fails `npm test`; a heavily loaded machine can add noise, so rerun once before concluding anything. The run prints its numbers with a `[mesher]` prefix.

With baked light and the neighbours already cached, `tests/meshing/mesh-job-timing.test.ts` measures what a worker spends on one job (`[job]` lines, same four chunks, median of 9 after warm-up, node):

| Chunk | Light | Mesh (with light, ring from the neighbours) | Together |
| --- | ---: | ---: | ---: |
| (0, 9), spawn at Greensom | 3.0 ms | 4.2 ms | 7.2 ms |
| (0, 0), Town of Beginnings | 4.2 ms | 6.5 ms | 10.7 ms |
| (-1, -1), Great Tower corner | 4.0 ms | 6.3 ms | 10.3 ms |
| (53, 0), Tempest Coliseum | 2.2 ms | 3.9 ms | 6.1 ms |

The test asserts light plus mesh under the same 25 ms. Mesh time with light is a little below the AO-only run on the busier chunks because the ring is read from the cached neighbours instead of the generator. In the browser the average over a soak is 2.4 ms for light and 2.2 ms for meshing per job (most chunks in view are mostly empty sky or far, low detail ground).
