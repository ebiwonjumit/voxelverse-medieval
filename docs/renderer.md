# Chunk renderer

Phase 2 replaced the old renderer, which mounted a React component per chunk and drew every block as an instanced cube, with chunk meshes built in web workers. `components/World.tsx` is now a few lines: it creates a `ChunkRenderer`, calls `update` once a frame with the camera position and disposes it on unmount.

## How a chunk gets on screen

```
ChunkRenderer.update(x, z)         main thread, every frame
  -> MeshWorkerPool.request(cx, cz, lod)
       -> mesh.worker.ts           generate the chunk, mesh it (runMeshJob)
       <- MeshData, buffers transferred, not copied
  -> upload queue                  at most 2 geometries added per frame, nearest chunk first
  -> Mesh in ChunkRenderer.group
```

| File | Role |
| --- | --- |
| `render/ChunkRenderer.ts` | Three.js side: which chunks to hold, uploads, materials, disposal, stats. |
| `render/createMeshWorker.ts` | The one `new Worker(new URL(...))` call, in the form Vite bundles. |
| `meshing/MeshWorkerPool.ts` | Pool, priority queue, cancel, stale results. No Three.js. |
| `meshing/mesh.worker.ts` | Worker entry point. Builds its own registry and generator, answers jobs. |
| `meshing/runMeshJob.ts` | The work of one job, separate from the messaging so tests can run it. |
| `worldgen/createWorkerGenerator.ts` | Says which generator the workers use. |
| `playerState.ts` | Mutable `{ x, y, z }` the player writes every frame. |

## Which chunks are held

- The player's chunk is `floor(camera / 32)`. Everything is recomputed only when that changes.
- A chunk is requested when its distance from the player's chunk (straight line, in chunks) is at most `RENDER_DISTANCE`, which is 8. That is a circle of about 200 chunks.
- A chunk is dropped when it is more than `RENDER_DISTANCE + 1` away. The extra chunk is hysteresis, so walking back and forth over a border does not rebuild anything. Dropping a chunk cancels its job if it has not started, drops its result if it has, and disposes its geometries.
- Chunks within 2 chunks of the player are generated at `LodLevel.HIGH`, the rest at `LOW` (the zones leave out small decorations like lanterns, crops and apples). When the player walks up to a chunk that was built at LOW it is requested again at HIGH and its geometry is replaced in place.
- Nothing depends on the player's height. Jumping changes no chunk and sends no job.

## Jobs

`MeshWorkerPool` starts `min(max(hardwareConcurrency - 1, 1), 4)` workers. Queued jobs are ranked by distance to the player when a worker frees up, not when the job was queued, so a long queue follows the player. A chunk has at most one live request: asking again replaces it. `cancel(cx, cz)` removes a job that has not started and returns true; for a running job it returns false and the result is dropped when it arrives. A worker error is reported once and the chunk is asked for again the next time the player changes chunk.

Each worker holds its own registry and `LegacyZoneAdapter`, so a job is just `{ id, cx, cz, lod }`. The main thread keeps its own `VoxelWorld` for collision, exactly as before, and never generates chunks for it.

## Upload budget

Three.js sends a geometry to the GPU the first time it is drawn, so the number of geometries added to the scene per frame is the number of uploads per frame. `ChunkRenderer` adds at most `MAX_GEOMETRIES_PER_FRAME` (2), working through finished chunks nearest first and through the buckets of one chunk in the order opaque, cutout, water. Replacing the geometry of a mesh that already exists counts too. Removing one is free.

## Meshes and materials

- One mesh per non-empty bucket per chunk. Vertices are chunk-local; `mesh.position` is the chunk origin minus half a block on each axis (the mesher's cubes run from the block coordinate upward, the old renderer centred them). `matrixAutoUpdate` is off.
- The bounding sphere is set from the buffer's own bounds, and padded for water, so frustum culling works per bucket without Three.js scanning the buffer again.
- One shared `MeshStandardMaterial` (vertex colours, roughness 0.8, metalness 0.1) for opaque and cutout, and one shared water material (vertex colours, transparent, opacity 0.75, roughness 0.1, metalness 0.8, flat shading). There is no per-chunk material and no distance fade.
- The water wave is in the vertex shader and reads the vertex's world position, `sin(x * 0.5 + t) * 0.2 + cos(z * 0.4 + t * 1.2) * 0.15`, the same formula the instanced version applied per block. It needs no instancing, and neighbouring faces move together.
- Lights are unchanged. Fog now scales with the render distance: near `(RENDER_DISTANCE - 2) * 32`, far `RENDER_DISTANCE * 32`, with the same per-zone colour logic.

## Player position

`playerState` is a plain object. `Player` writes it each frame, as do the benchmark route and the screenshot camera. `Game` copies it into React state about 10 times a second (and only when the rounded position changed) to draw the HUD and pick the zone atmosphere. The world takes no position prop: `World` reads the camera.

## Stats and readiness

`getStats()` returns `chunks` (tracked), `meshes` (in the scene), `geometries` (created and not yet disposed, counted independently of `gl.info`) and `pending` (jobs not finished plus meshes waiting for upload). They go into the soak output through the world probe. `isReady()` is what `?shot` mode waits for: every requested chunk built and uploaded, and nothing changing for a second.

## Measured

Apple M4, headless Chrome, 1280x800, render distance 8, production build, raw results in [`bench-p2-prod.json`](bench-p2-prod.json) and [`bench-soak-p2-prod.json`](bench-soak-p2-prod.json). The browser caps at 60 fps, so these runs show the frame budget is met, not how much is left over.

| Leg | fps | p50 | p99 | max | frames over 50 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| load | 60.0 | 16.7 | 17.8 | 18.2 | 0 |
| idle | 60.0 | 16.7 | 17.8 | 19.2 | 0 |
| jump | 60.0 | 16.7 | 17.6 | 18.1 | 0 |
| greensom-to-sao | 60.0 | 16.7 | 17.8 | 18.8 | 0 |
| sao-to-tempest | 60.0 | 16.7 | 18.5 | 20.4 | 0 |
| overall | 60.0 | 16.7 | 18.2 | 20.4 | 0 |

Soak (closed loop, 90 s): 224 chunks tracked, 374 to 428 meshes in the scene and the same number of geometries from 20 s on (`geometries` in `getStats()`); `gl.info.memory.geometries` climbs from 159 to about 350 in the first 25 s and then stays between 343 and 376, because Three.js only uploads a geometry once the camera has had it in view. JS heap stays between 74 and 103 MB. About 100 to 160 draw calls and 190,000 to 315,000 triangles per frame.
