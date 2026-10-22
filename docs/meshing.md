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

`MeshData` is `{ cx, cz, opaque, cutout, water }`. Each bucket holds `positions`, `normals`, `colors` (Float32Array, three per vertex) and `indices` (Uint32Array). Every face is four vertices and six indices, counter-clockwise from outside. `meshTransferables(mesh)` lists the twelve buffers for `postMessage`.

- Positions are chunk-local: x and z run 0 to 32, y is the world height. A block at (x, y, z) fills the unit cube from (x, y, z) to (x+1, y+1, z+1). The old renderer centred cubes on whole numbers, so the render code must place each chunk mesh half a block back on all three axes to look the same and to match the player's `Math.round` collision.
- Colours are linear rgb with ambient occlusion multiplied in, so the material needs `vertexColors: true`. Face shading is not baked in: the Three.js lights do that through the normals.
- Buckets: `opaque` is every block the registry marks opaque. `water` is water. `cutout` is everything else that draws: leaves, glass, and the shaped legacy blocks. A bucket exists so each can get its own material later (alpha test for cutout, blending for water).

## Reading cells

`CellReader.getCell(x, y, z)` answers for the chunk and a one block ring around it, which is all the mesher asks about. `PaddedChunkReader` reads the chunk from its own cells and the ring from `generator.sampleBlock`, so a worker generates exactly one chunk per job. For the legacy adapter `sampleBlock` equals what `generateChunk` would put in a neighbour (the parity tests prove it), so seams match.

Two optional reader methods exist for speed. `yRange()` tells the mesher which heights can hold blocks, so it skips empty sky. `copyChunkIds()` copies the chunk's ids in bulk instead of one `getCell` call per cell. Without them the mesher still works, only slower; a test checks both paths give identical meshes. `Chunk` gained `allocatedYRange()` and `copyIds()` for this.

## Culling

A face is drawn unless the block beside it is opaque. Details:

- Water faces are not drawn against water, or against opaque blocks. A solid face next to water is drawn, because water is not opaque.
- Full-cube blocks that are not opaque (leaves, glass) hide faces against a neighbour of the same id, and are drawn against anything else.
- Below the bottom of the world counts as solid, so the underside of the world is never drawn.
- A lily pad cell also holds a water cube, as the old renderer drew one under every pad.
- Ids the registry does not know are drawn as magenta cubes, so a missing registration is visible rather than silent.

## Legacy shapes

`LEGACY_BOXES` holds the boxes the old `World.tsx` made by scaling and moving a cube: flowers, small rock, magic crystal, fence, wheat and its two growth stages, farmland, lily pad, sugarcane, tall grass, lantern and red apple. Each is a size plus a vertical offset from the block centre. They draw all six faces, get no ambient occlusion and never hide a neighbour. Their random rotations were dropped. A test holds the old numbers separately and checks every box against them.

## Ambient occlusion

Full cubes (not water, not boxes) get per-vertex occlusion with the usual three-neighbour method over the layer in front of each face: two side blocks and the diagonal one, using the registry's `opaque` flag. Both sides solid gives the darkest level, otherwise the level is 3 minus the number of solid neighbours. Levels map to multipliers `[0.55, 0.7, 0.85, 1.0]`. The quad is split along the diagonal that joins the two brighter corners, which avoids the crease you get when the wrong diagonal is interpolated.

## Colours

Block colour is the registry colour. Grass and leaves use `biomeTint`: each zone centre contributes its grass colour weighted by 1 / (distance + 1), and leaves are that blend times 0.7. Tests compare it with a copy of the old formula, run through Three.js `Color`, at sample points across the map.

## Speed

Measured by `tests/meshing/mesher-timing.test.ts` in node on an Apple M4, with chunks from `LegacyZoneAdapter` and ring sampling included (median of 9 runs after warm-up; generating the chunk is not counted):

| Chunk | Median | Triangles |
| --- | ---: | ---: |
| (0, 9), spawn at Greensom | 8.6 ms | 8,500 |
| (0, 0), Town of Beginnings | 10.3 ms | 16,666 |
| (-1, -1), Great Tower corner | 10.3 ms | 15,702 |
| (53, 0), Tempest Coliseum | 6.8 ms | 2,552 |

The target was under 25 ms. The test asserts it, so a regression fails `npm test`; a heavily loaded machine can add noise, so rerun once before concluding anything. The run prints its numbers with a `[mesher]` prefix.
