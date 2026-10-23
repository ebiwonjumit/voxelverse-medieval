# Chunk mesher

`meshing/` turns one chunk of cells into triangle lists. It is plain data code (no Three.js, no React, no DOM), so it runs in a worker. A test fails if a file in `meshing/` imports anything it should not (`mesh.worker.ts` alone may import `content/` and `worldgen/`).

| File | What it does |
| --- | --- |
| `ChunkMesher.ts` | `meshChunk(reader, cx, cz, registry)` returns `MeshData`. Also `LEGACY_BOXES`, `meshTransferables` and `meshTriangleCount`. |
| `CellReader.ts` | The interface the mesher reads cells through, in world coordinates. |
| `PaddedChunkReader.ts` | A `Chunk` plus a generator's `sampleBlock` for the one-block ring around it. |
| `biomeTint.ts` | The zone colour blend for grass and leaves, ported from the old `World.tsx`. |
| `color.ts` | `#rrggbb` to linear rgb. |
| `runMeshJob.ts` | One job: generate a chunk with a given detail level, mesh it. |
| `MeshWorkerPool.ts` | The worker pool: priority queue, cancel, stale results. See [renderer.md](renderer.md). |
| `mesh.worker.ts` | Worker entry point. The one file here that imports `content/` and `worldgen/`, to build its own registry and generator. |

## Output

`MeshData` is `{ cx, cz, opaque, cutout, water }`. Each bucket holds these buffers (all Float32Array except the indices):

| Buffer | Per vertex | What it is |
| --- | --- | --- |
| `positions` | 3 | Chunk-local position. |
| `normals` | 3 | Outward face normal. |
| `colors` | 3 | Linear rgb multiplier for ambient occlusion; white while AO is off. |
| `tints` | 3 | Linear rgb biome tint; white on faces that take none. |
| `uvs` | 2 | Position inside the tile, 0 to 1. `v = 0` is the top row of the tile. |
| `layers` | 2 | Texture array layer of the face, and the layer of its tint overlay or -1. |
| `indices` (Uint32Array) | 6 per face | Two triangles. |

Every face is four vertices and six indices, counter-clockwise from outside. `meshTransferables(mesh)` lists the 21 buffers for `postMessage`.

- Positions are chunk-local: x and z run 0 to 32, y is the world height. A block at (x, y, z) fills the unit cube from (x, y, z) to (x+1, y+1, z+1). The old renderer centred cubes on whole numbers, so the render code must place each chunk mesh half a block back on all three axes to look the same and to match the player's `Math.round` collision.
- Vertex colours are linear rgb (ambient occlusion, when it is switched on, see below), so the material needs `vertexColors: true`. The block's own colour no longer lives in the vertices: it comes from the texture layer. Face shading is not baked in: the Three.js lights do that through the normals.
- Buckets: `opaque` is every block the registry marks opaque. `water` is water. `cutout` is everything else that draws: leaves, glass, and the shaped legacy blocks. Each bucket has its own material (see [renderer.md](renderer.md)): no alpha test for opaque, alpha test for cutout, blending and the wave for water.

## Reading cells

`CellReader.getCell(x, y, z)` answers for the chunk and a one block ring around it, which is all the mesher asks about. `PaddedChunkReader` reads the chunk from its own cells and the ring from `generator.sampleBlock`, so a worker generates exactly one chunk per job. For the legacy adapter `sampleBlock` equals what `generateChunk` would put in a neighbour (the parity tests prove it), so seams match.

Two optional reader methods exist for speed. `yRange()` tells the mesher which heights can hold blocks, so it skips empty sky. `copyChunkIds()` copies the chunk's ids in bulk instead of one `getCell` call per cell. Without them the mesher still works, only slower; a test checks both paths give identical meshes. `Chunk` gained `allocatedYRange()` and `copyIds()` for this.

## Culling

A face is drawn unless the block beside it is opaque. Details:

- Water faces are not drawn against water, or against opaque blocks. A solid face next to water is drawn, because water is not opaque.
- Full-cube blocks that are not opaque (leaves, glass) hide faces against a neighbour of the same id, and are drawn against anything else.
- Below the bottom of the world counts as solid, so the underside of the world is never drawn.
- A lily pad cell also holds a water cube, as the old renderer drew one under every pad.
- Ids the registry does not know are drawn as magenta cubes (the layout's unknown tile, a flat `#ff00ff`), so a missing registration is visible rather than silent.

## Legacy shapes

`LEGACY_BOXES` holds the boxes the old `World.tsx` made by scaling and moving a cube: flowers, small rock, magic crystal, fence, wheat and its two growth stages, farmland, lily pad, sugarcane, tall grass, lantern and red apple. Each is a size plus a vertical offset from the block centre. They draw all six faces, get no ambient occlusion and never hide a neighbour. Their random rotations were dropped. A test holds the old numbers separately and checks every box against them.

## Ambient occlusion

Full cubes (not water, not boxes) can get per-vertex occlusion with the usual three-neighbour method over the layer in front of each face: two side blocks and the diagonal one, using the registry's `opaque` flag. Both sides solid gives the darkest level, otherwise the level is 3 minus the number of solid neighbours. At full strength levels map to multipliers `[0.55, 0.7, 0.85, 1.0]`. The quad is split along the diagonal that joins the two brighter corners, which avoids the crease you get when the wrong diagonal is interpolated.

**It is off by default.** Phase 2 promises the same look as the old renderer (flat colours, same lights), and the old renderer had no AO. The single switch is `AO_STRENGTH` in `ChunkMesher.ts`: 0 means every multiplier is 1.0 and the neighbour lookups are skipped entirely (the quad keeps its default split); 1 is the full range above, and values between scale the darkening linearly. `meshChunk` also takes `{ aoStrength, layout }` as a fifth argument, which is how the tests run the AO code at strength 1 while a separate test pins the shipped default to 0. Phase 6 (baked light) is the place to turn it on, and it will have to be rebalanced against the baked light then.

## Textures

The mesher is given a `TextureLayout` (`meshChunk(reader, cx, cz, registry, { layout })`; `runMeshJob` and the worker pass it). The layout answers two questions per block face, from tables, with no string lookups in the hot loop:

- **Which layer.** `layout.faceLayers[id * 3 + kind]`, where kind is top, bottom or side. A block with `faces` gets the layer of that tile. A block without them, or naming a tile the catalog lacks, gets a flat tile of its registry colour (`flat:#rrggbb`, one per distinct colour). Unregistered ids get the magenta tile. Without a layout, `meshChunk` builds a flat-only one, which is what most mesher tests use.
- **Which tint.** `layout.faceTint` is non-zero only if the block asks for a tint and the face's tile takes one. A tinted face carries the biome colour (`biomeTint.ts`: each zone centre contributes its grass colour weighted by 1 / (distance + 1); `foliage` is that times 0.7) in its `tints` vertices. A face of a partly tinted tile, the grass side, also carries the layer of the tile's tint mask in `layers.y`; the shader paints the tint only where that mask is set. Tests compare the blend with a copy of the old formula, run through Three.js `Color`, at sample points across the map.

Every face stretches its tile over the whole face. Walls are upright and read left to right as seen from outside, so a tile is never mirrored or turned. On the top face `v = 0` points north (-z), on the bottom face south.

Shaped legacy blocks (the boxes below) use the same tables, so a fence is a plank-textured box and a flower is a flower tile on a small box until Phase 4.

## Speed

Measured by `tests/meshing/mesher-timing.test.ts` in node on an Apple M4, with AO off (the default) and chunks from `LegacyZoneAdapter` and ring sampling included (median of 9 runs after warm-up; generating the chunk is not counted):

| Chunk | Median | Triangles |
| --- | ---: | ---: |
| (0, 9), spawn at Greensom | 7.9 ms | 8,500 |
| (0, 0), Town of Beginnings | 10.0 ms | 16,666 |
| (-1, -1), Great Tower corner | 9.9 ms | 15,702 |
| (53, 0), Tempest Coliseum | 6.3 ms | 2,552 |

The target was under 25 ms. The test asserts it, so a regression fails `npm test`; a heavily loaded machine can add noise, so rerun once before concluding anything. The run prints its numbers with a `[mesher]` prefix.
