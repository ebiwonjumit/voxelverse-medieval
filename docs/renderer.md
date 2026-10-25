# Chunk renderer

Phase 2 replaced the old renderer, which mounted a React component per chunk and drew every block as an instanced cube, with chunk meshes built in web workers. `components/World.tsx` is now a few lines: it creates a `ChunkRenderer`, calls `update` once a frame with the camera position and disposes it on unmount.

## How a chunk gets on screen

```
ChunkRenderer.update(x, z)         main thread, every frame
  -> MeshWorkerPool.request(cx, cz, lod)
       -> mesh.worker.ts           get the chunk and its 8 neighbours (cache), light it, mesh it (runMeshJob)
       <- MeshData, buffers transferred, not copied
  -> upload queue                  at most 2 geometries added per frame, nearest chunk first
  -> Mesh in ChunkRenderer.group
```

| File | Role |
| --- | --- |
| `render/ChunkRenderer.ts` | Three.js side: which chunks to hold, uploads, materials, disposal, stats. |
| `render/AtlasBuilder.ts` | Packs the texture catalog into the block texture array (`DataArrayTexture`). |
| `render/BlockMaterials.ts` | The three shared materials (opaque, cutout, water) and the shader patches: sampling the array and shading from the baked light, foliage sway on opaque and cutout, flowing water. `EffectUniforms` is what drives the last two. |
| `render/effectSettings.ts` | The switches for sway and the water animation (F3 panel, `?sway=0`, `?waterfx=0`); plain data, no three. |
| `render/createMeshWorker.ts` | The one `new Worker(new URL(...))` call, in the form Vite bundles. |
| `meshing/MeshWorkerPool.ts` | Pool, priority queue, cancel, stale results. No Three.js. |
| `meshing/mesh.worker.ts` | Worker entry point. Builds its own registry, generator and chunk cache, answers jobs. |
| `meshing/runMeshJob.ts` | The work of one job (neighbourhood, light, mesh, timing), separate from the messaging so tests can run it. |
| `meshing/ChunkCache.ts` | The worker's LRU of generated chunks, see [light.md](light.md#the-worker). |
| `worldgen/createWorkerGenerator.ts` | Says which generator the workers use: `VoxelverseGenerator`, the same one `gameWorld.ts` builds on the main thread. |
| `playerState.ts` | Mutable `{ x, y, z }` the player writes every frame. |

## Which chunks are held

- The player's chunk is `floor(camera / 32)`. Everything is recomputed only when that changes.
- A chunk is requested when its distance from the player's chunk (straight line, in chunks) is at most `RENDER_DISTANCE`, which is 8. That is a circle of about 200 chunks.
- A chunk is dropped when it is more than `RENDER_DISTANCE + 1` away. The extra chunk is hysteresis, so walking back and forth over a border does not rebuild anything. Dropping a chunk cancels its job if it has not started, drops its result if it has, and disposes its geometries.
- Chunks within 2 chunks of the player are generated at `LodLevel.HIGH`, the rest at `LOW` (the zones leave out small decorations like lanterns, crops and apples). When the player walks up to a chunk that was built at LOW it is requested again at HIGH and its geometry is replaced in place.
- Nothing depends on the player's height. Jumping changes no chunk and sends no job.

## Jobs

`MeshWorkerPool` starts `min(max(hardwareConcurrency - 1, 1), 4)` workers. Queued jobs are ranked by distance to the player when a worker frees up, not when the job was queued, so a long queue follows the player. A chunk has at most one live request: asking again replaces it. `cancel(cx, cz)` removes a job that has not started and returns true; for a running job it returns false and the result is dropped when it arrives. A worker error is reported once and the chunk is asked for again the next time the player changes chunk.

Each worker holds its own registry, `VoxelverseGenerator` (the Phase 6 world, see [worldgen.md](worldgen.md#wired-into-the-game)) and a cache of the chunks it has generated (64, so the 3x3 neighbourhood the light needs is not generated again for the next chunk over), so a job is just `{ id, cx, cz, lod }`. The main thread keeps its own `VoxelWorld` for collision, exactly as before, and never generates chunks for it.

## Upload budget

Three.js sends a geometry to the GPU the first time it is drawn, so the number of geometries added to the scene per frame is the number of uploads per frame. `ChunkRenderer` adds at most `MAX_GEOMETRIES_PER_FRAME` (2), working through finished chunks nearest first and through the buckets of one chunk in the order opaque, cutout, water. Replacing the geometry of a mesh that already exists counts too. Removing one is free.

## Meshes and materials

- One mesh per non-empty bucket per chunk. Vertices are chunk-local; `mesh.position` is the chunk origin minus half a block on each axis (the mesher's cubes run from the block coordinate upward, the old renderer centred them). `matrixAutoUpdate` is off.
- The bounding sphere is set from the buffer's own bounds, and padded for water (0.15, its wave) and for any bucket that has sway weights (0.4, how far the wind can move a vertex), so frustum culling works per bucket without Three.js scanning the buffer again.
- Three shared materials, all `MeshBasicMaterial` patched with `onBeforeCompile`: **opaque** (no alpha test, so early depth rejection still works), **cutout** (`alphaTest` 0.5, for leaves, glass, panes, fences and plants; the tiles' alpha is only ever 0 or 255, so nothing needs sorting) and **water** (transparent, opacity 0.75, with the flowing tile and the wave). There is no per-chunk material and no distance fade. They are unlit: since Phase 5 a chunk reads nothing from the scene's lights, the light is baked into the vertices and the shader shades from it (see [light.md](light.md#the-shader)). Fog is still the scene's.
- The patch decides where the colour comes from. In the fragment shader the texel is sampled from the array at the vertex's layer and uv, multiplied by the biome tint (`vTint`), then by the baked lighting (sky light times the shared `uDaylight` uniform against block light, occlusion, a mild face-direction factor and a glow boost for light sources), and `diffuseColor *= texel`. For a grass side there are two layers: the base tile (dirt where the fringe is) and the fringe mask, and the result is `mix(base, mask * tint, mask.a)`, so only the fringe takes the zone colour. Layer numbers are `flat` varyings, so they are never interpolated.
- `ChunkRenderer.setDaylight(0..1)` sets `uDaylight` and `setSkyLightColor(r, g, b)` sets `uSkyLight` for all three materials at once; `World` calls both every frame with what the sky clock says ([sky.md](sky.md)). No chunk is re-meshed when they change.
- Sampling uses `textureGrad` with derivatives taken outside the branch, so the mip level is the same on both sides of the overlay `if` and the cutout edge never picks a different level than its neighbour pixel.
- The water wave is in the vertex shader and reads the vertex's world position, `sin(x * 0.5 + t) * 0.06 + cos(z * 0.4 + t * 1.2) * 0.045` (the formula the instanced version used per block, at a third of its size since step 8.1, because the surface at 0.35 pushed through the banks). It needs no instancing, and neighbouring faces move together. The fragment shader flows the water tile by world position and shades it by depth and shoreline, which the mesher writes into the water bucket's tint channel; the clock it reads is `uWaterTime`, which `update` sets to the game's time while the animation is on and to 0 while it is off.
- Foliage sway is in the vertex shader of the opaque and cutout materials: a vertex with a weight in the `sway` attribute is pushed downwind by a gust pattern read from its world position, the clock (`uTime`) and the wind (`uWind`, which `update` turns slowly). A bucket with no weights has no attribute (nothing is uploaded) and reads 0 through `defaultAttributeValues`. `setSwayEnabled` and `setWaterAnimated` set `uSwayOn` and `uWaterOn`; no mesh or geometry is touched. See [effects.md](effects.md).
- Fog belongs to the sky system ([sky.md](sky.md)): its colour is the time of day blended with the player's zone fog colour, and a zone's `fogDensity` pulls the distances in from `(RENDER_DISTANCE - 2) * 32` and `RENDER_DISTANCE * 32` when it is above 0.02, never out past them.

## Player position

`playerState` is a plain object. `Player` writes it each frame, as do the benchmark route and the screenshot camera. `Game` copies it into React state about 10 times a second (and only when the rounded position changed) to draw the HUD and pick the zone atmosphere. The world takes no position prop: `World` reads the camera.

## Stats and readiness

`getStats()` returns `chunks` (tracked), `meshes` (in the scene), `geometries` (created and not yet disposed, counted independently of `gl.info`) and `pending` (jobs not finished plus meshes waiting for upload), plus the workers' own timings summed over the results received: `jobs`, `generateMs`, `lightMs`, `meshMs` (averages per job), `maxLightMs`, `maxMeshMs` and `chunksGenerated`. They go into the soak output through the world probe. `isReady()` is what `?shot` mode waits for: every requested chunk built and uploaded, and nothing changing for a second.

## Measured

Production build, render distance 8, headless Chrome on an Apple M4. Every leg of the flythrough holds 60 fps (the browser's cap) with p99 under 18.5 ms and no frame over 25 ms, the jump leg builds nothing, and the geometry count is flat over a 90 s soak. The tables, the soak samples and the before and after screenshots are in [perf-after-p2.md](perf-after-p2.md); raw results are in [`bench-p2-prod.json`](bench-p2-prod.json), [`bench-p2-dev.json`](bench-p2-dev.json) and [`bench-soak-p2-prod.json`](bench-soak-p2-prod.json). Typical load is 100 to 160 draw calls and 190,000 to 330,000 triangles per frame, up to 560,000 on the long road leg.

After Phase 3 (textures) the frame numbers are unchanged within noise (60 fps, p99 17.7 ms, no frame over 50 ms in the walking legs) and draw calls, triangles and geometry counts are identical; the JS heap is higher because vertices are 76 bytes. See [perf-after-p3.md](perf-after-p3.md). `bucketGeometry` (exported from `render/ChunkRenderer.ts`) builds the Three.js geometry of one bucket and is shared with the block sandbox ([textures.md](textures.md#block-sandbox)).

After Phase 5 step 2 (baked light) the frame numbers are again unchanged within noise (60 fps, p99 17.7 ms, no frame over 50 ms) and the vertex is 4 bytes bigger; the numbers, including the worker time per job, are in [light.md](light.md#the-worker).

After wiring in the Phase 6 generator the frame numbers are unchanged again (60 fps, p99 18.6 ms, nothing over 50 ms; the benchmark route now runs over the new terrain); per job a worker generates about 5 chunks in 8 to 13 ms, against 22 ms with the legacy zones. See [perf-after-integration.md](perf-after-integration.md).
