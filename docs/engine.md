# Voxel core

Phase 1 of the rebuild plan added a block and chunk layer under the game. The player and the HUD read from it on the main thread, and since Phase 2 the mesh workers build chunks from the same generator. How they get on screen is in [renderer.md](renderer.md).

## Layout

| Folder | What is in it |
| --- | --- |
| `engine/` | Voxel core: `coords`, `cell`, `BlockRegistry`, `Chunk`, `ChunkStore`, `VoxelWorld` and the `WorldGenerator` interface. No Three.js, no React. |
| `content/` | Block definitions. `blocks.ts` registers the legacy blocks. `content/textures/` holds the generated pixel-art tiles, see [textures.md](textures.md). |
| `meshing/` | Pure chunk mesher and the mesh worker pool, worker-safe. See [meshing.md](meshing.md). |
| `render/` | The Three.js chunk renderer. See [renderer.md](renderer.md). |
| `worldgen/` | Things that implement `WorldGenerator`. `LegacyZoneAdapter` wraps the old zones. |
| `worldConstants.ts` | Numbers and enums (`BlockType`, `LodLevel`) with no Three.js import, so generation can run in a worker. `constants.ts` re-exports them and adds the Three.js vectors. |
| `gameWorld.ts` | The `voxelWorld` and `blockRegistry` the game uses on the main thread. |

`engine/` never imports from `worldgen/`, `content/` or `zones/` (a test checks it). `meshing/` reads the engine but, like it, has no Three.js or DOM. The generator is passed in.

## World shape

- Chunks are 32 x 32 blocks, split into 16 sections of 16 blocks.
- Height runs from y = -64 to y = 191. A section is only allocated when something that is not air is written to it.
- Terrain height is clamped to y = -48 through 120. The old coast sank forever and the old mountains rose forever, so this keeps both inside the world and leaves 70 blocks of room for the Great Tower.

## Cells

One cell is a `Uint16`: the low 12 bits are the block id (0 to 4095), the high 4 bits are the block state (0 to 15). State is unused until shaped blocks arrive in Phase 4.

## Blocks

`BlockRegistry` holds a `BlockDef` per block: id, name, flat colour, `solid`, `opaque` and `emits`. The legacy blocks keep their old `BlockType` numbers as ids, so the old zones work without changes. Registration rejects duplicate ids and names, and any colour that is not `#rrggbb`.

## Querying blocks

```ts
import { voxelWorld } from './gameWorld';

voxelWorld.getBlock(x, y, z);   // block id
voxelWorld.getState(x, y, z);   // state 0..15
voxelWorld.isSolid(x, y, z);
voxelWorld.loadChunk(cx, cz);   // generate and keep a chunk
voxelWorld.unloadChunk(cx, cz);
```

Loaded chunks answer from their stored cells. Anything else, which means a chunk that is not loaded or a height outside the world, is answered by the generator one block at a time. So the player's collision checks never cause a chunk to be generated.

## Generator interface

`generateChunk(chunk, options?)` takes an optional `{ lod }`: `LodLevel.HIGH` (the default) or `LodLevel.LOW`, which a generator may use to leave out small detail that nobody can see from far away. `VoxelWorld.loadChunk` and the parity tests use the default. The mesh workers pass HIGH within 2 chunks of the player and LOW beyond. `sampleBlock` always answers at full detail.

## Legacy adapter

`LegacyZoneAdapter` fills a chunk exactly the way `getBlockAt` answers a single block (at HIGH detail; at LOW it passes `LodLevel.LOW` to the zones, which then skip lanterns, crops, lily pads and the like): stone below the ground, water above it up to the water level, and the zone's own blocks from the ground up to 64 blocks above. Tests compare it with the old function:

- 10,000 random points across 50 chunks, including the coast and mountains.
- Every block above the ground in 12 landmark chunks (the Great Tower, Tempest's Coliseum and Town Hall, Greensom, Bosse, Fremmevilla, Magnolia), more than 500,000 comparisons.
- 5,000 points in chunks that are not loaded.

## Meshing and rendering architecture

The whole path from block data to pixels, as of the end of Phase 2:

```
main thread                                   worker (1 to 4)
-----------                                   ---------------
Player / bench / shot camera
  writes playerState {x, y, z}
World (React) -> ChunkRenderer.update(x, z)
  chunk of the player changed?
  yes: wanted ring = 8 chunks, LOD by ring
       MeshWorkerPool.request(cx, cz, lod) -->  mesh.worker.ts
                                                 LegacyZoneAdapter.generateChunk (lod)
                                                 PaddedChunkReader (chunk + 1 block ring)
                                                 meshChunk -> opaque / cutout / water
  <-- MeshData, 12 buffers transferred      <--
  upload queue, 2 geometries per frame
  Mesh per bucket in ChunkRenderer.group
  collision and HUD: voxelWorld (main thread, never generates chunks for rendering)
```

- **Two copies of the world, on purpose.** Workers generate the chunk they mesh. The main thread keeps its own `VoxelWorld` for collision and the HUD, answered by the generator block by block, so physics never waits on rendering. Both use the same `LegacyZoneAdapter`, and the parity tests keep the generator's `sampleBlock` and `generateChunk` identical, which is why chunk borders meet without a seam.
- **Nothing on the main thread depends on height.** The renderer recomputes only when the player's chunk changes, so a jump sends no job and rebuilds nothing. The old renderer rebuilt every visible chunk because `playerY` was a React dependency.
- **Meshes are plain Three.js objects, not React.** `components/World.tsx` creates one `ChunkRenderer` and calls `update` from a frame hook. There is no per-chunk component, no instancing and no per-chunk material.
- **Faces are culled in the mesher** (a face is drawn unless the block beside it is opaque), colours are flat per block (vertex ambient occlusion exists in the mesher but is off by default, see [meshing.md](meshing.md)), and the lights, fog colours and water wave are unchanged apart from fog distances, which scale with the render distance.
- **Budgets keep frames even.** At most 2 geometries are uploaded per frame, nearest chunk first. The job queue is ranked by distance to the player when a worker frees up. Chunks are dropped one chunk beyond the render distance (hysteresis) and their geometries disposed.
- **Layers.** `meshing/` and `engine/` import neither Three.js nor React (a test checks both), so a worker can load them. `render/` and `components/` are the only places that touch Three.js; `mesh.worker.ts` is the only file in `meshing/` that imports `content/` and `worldgen/`.

Details: [meshing.md](meshing.md) for the mesher, [renderer.md](renderer.md) for the pool and the Three.js side. Measured results against the baseline, with the soak and before and after screenshots, are in [perf-after-p2.md](perf-after-p2.md).
