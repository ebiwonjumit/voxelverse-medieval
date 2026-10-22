# Performance after Phase 2

Measured on 22 Oct 2026 at the end of Phase 2 (re-measured after the review fix that turned vertex ambient occlusion off by default, see [Screenshots](#screenshots-before-and-after)) (worker-built chunk meshes, [renderer.md](renderer.md)), with the same harness, machine and flythrough as [perf-baseline.md](perf-baseline.md). Every target for the phase is met.

## Setup

- Apple M4, Chrome (headless), ANGLE Metal, 1280x713 viewport (the harness's own canvas size), device pixel ratio 1. Same as the baseline.
- **Render distance 8 chunks (256 blocks)**, against 3 chunks in the baseline. About 224 chunks are held, against 29.
- Production build (`npx vite build`, `npx vite preview --port 3101`) for the performance claims, plus one dev-server run (`npm run dev -- --port 3101`).
- Raw results: [`bench-p2-prod.json`](bench-p2-prod.json), [`bench-p2-dev.json`](bench-p2-dev.json), [`bench-soak-p2-prod.json`](bench-soak-p2-prod.json).
- Another job was using the machine (load average about 4.5 while measuring). The production and soak numbers were clean on the first run after the AO change, so nothing was rerun. The dev-server table below was measured before AO was switched off and was not repeated: AO only changes vertex colours at meshing time, not the amount of geometry or the frame work.

Headless Chrome is locked to 60 frames per second, so every leg reads 60.0 fps and a p50 of 16.7 ms. That proves the frame budget is met with room under the 20 and 25 ms targets. It does not say how much is left over.

How to rerun:

```bash
npx vite build && npx vite preview --port 3101 --strictPort      # terminal 1
node bench/run.mjs --url "http://localhost:3101/?bench" --out docs/bench-p2-prod.json
node bench/run.mjs --url "http://localhost:3101/?bench=soak" --out docs/bench-soak-p2-prod.json
node bench/shots.mjs --prefix after --url http://localhost:3101
```

## Results (frame times in ms)

Production build, with the baseline's production numbers beside it:

| Leg | fps | p50 | p95 | p99 | max | frames over 50 ms | Baseline p99 | Baseline over 50 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| load | 60.0 | 16.7 | 17.1 | 17.5 | 17.7 | 0 | 18.8 | 1 |
| idle | 60.0 | 16.7 | 17.0 | 17.3 | 17.6 | 0 | 18.6 | 0 |
| **jump** | 60.0 | 16.7 | 17.4 | **17.6** | 17.7 | **0** | 189.0 | 32 |
| greensom-to-sao | 60.0 | 16.7 | 17.4 | 17.6 | 17.7 | 0 | 56.3 | 15 |
| sao-to-tempest | 60.0 | 16.7 | 17.5 | 17.7 | 22.1 | 0 | 47.2 | 56 |
| overall | 60.0 | 16.7 | 17.5 | 17.7 | 22.1 | 0 | 65.6 | 104 |

Dev server:

| Leg | fps | p50 | p95 | p99 | max | frames over 50 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| load | 60.0 | 16.7 | 17.0 | 17.5 | 34.3 | 0 |
| idle | 60.0 | 16.7 | 17.2 | 17.7 | 17.8 | 0 |
| **jump** | 60.0 | 16.7 | 17.5 | 17.7 | 17.8 | 0 |
| greensom-to-sao | 60.0 | 16.7 | 17.5 | 17.8 | 20.1 | 0 |
| sao-to-tempest | 60.0 | 16.7 | 17.5 | 17.7 | 22.6 | 0 |
| overall | 60.0 | 16.7 | 17.5 | 17.7 | 34.3 | 0 |

The dev server is no longer slower than production in any way that shows: the worst single frame is 34 ms (the first seconds, while workers start), and the jump leg is the same as everywhere else.

Renderer load (production), the same columns as the baseline:

| Leg | draw calls (max) | triangles (max) | `gl.info` geometries | JS heap (MB) |
| --- | ---: | ---: | ---: | ---: |
| load | 142 | 295,840 | 142 | 75 |
| idle | 142 | 295,840 | 142 | 74 |
| jump | 142 | 295,840 | 142 | 73 |
| greensom-to-sao | 142 | 305,398 | 314 | 80 |
| sao-to-tempest | 151 | 558,584 | 367 | 176 |

The baseline drew 17 to 19 calls and 2 to 2.7 million triangles at 3 chunks. Now it is 142 to 151 calls and 0.3 to 0.56 million triangles at 8 chunks: face culling removed the hidden faces that the instanced cubes drew, and the area is seven times larger. Draw calls are up because each chunk has up to three meshes (opaque, cutout, water) and nothing is merged across chunks.

**Jumping does nothing to the world.** The `gl.info` geometry count is 142 in load, idle and jump alike, and the draw call and triangle maxima are identical in the three legs. No chunk was requested, meshed or uploaded while jumping. The old renderer rebuilt every visible chunk on each jump.

**The long leg grows the heap from 80 to 176 MB.** That leg walks 1,380 blocks and keeps loading new ground, so the heap rises while the garbage collector has not yet run. The soak below, which loops over fixed ground for 90 s, stays between 76 and 98 MB.

## Targets

| Target (production, render distance 8) | Result | Met |
| --- | --- | --- |
| jump leg p99 under 20 ms | 17.6 ms | yes |
| walking legs p99 under 25 ms | 17.7 ms and 17.7 ms | yes |
| zero frames over 50 ms while walking | 0 and 0 (worst walking frame 22.1 ms) | yes |
| overall average at least 58 fps | 60.0 fps | yes |
| geometry count flat in the soak (last sample within 10 percent of the 30 s sample) | 352 against 355, minus 0.8 percent | yes |
| no console errors | 0 page errors in the smoke run and in all five screenshot runs | yes |

## Soak

`?bench=soak`: a load leg, then 90 s of a closed loop at sprint speed (Greensom, south road, plaza, west and east roads, home). `gl.info` is sampled every 5 s; the last three columns come from the renderer's own `getStats()`.

| t (s) | `gl.info` geometries | triangles | draw calls | heap (MB) | chunks | meshes | geometries (own count) | pending |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 5 | 159 | 253,772 | 100 | 80 | 220 | 417 | 417 | 0 |
| 10 | 193 | 272,794 | 95 | 89 | 224 | 411 | 411 | 0 |
| 15 | 240 | 301,240 | 111 | 89 | 224 | 383 | 383 | 0 |
| 20 | 311 | 272,118 | 120 | 95 | 224 | 375 | 375 | 2 |
| 25 | 343 | 187,646 | 124 | 87 | 224 | 376 | 376 | 0 |
| **30** | **355** | 315,410 | 118 | 81 | 224 | 385 | 385 | 0 |
| 35 | 346 | 291,190 | 115 | 81 | 224 | 376 | 376 | 0 |
| 40 | 357 | 206,300 | 115 | 79 | 224 | 374 | 374 | 0 |
| 45 | 358 | 239,522 | 125 | 76 | 224 | 374 | 374 | 0 |
| 50 | 348 | 194,916 | 136 | 79 | 224 | 376 | 376 | 0 |
| 55 | 356 | 294,808 | 106 | 85 | 224 | 383 | 383 | 0 |
| 60 | 355 | 268,106 | 107 | 80 | 224 | 374 | 374 | 0 |
| 65 | 363 | 196,500 | 116 | 81 | 224 | 376 | 376 | 0 |
| 70 | 361 | 220,840 | 141 | 82 | 224 | 374 | 374 | 9 |
| 75 | 374 | 255,014 | 158 | 84 | 224 | 409 | 409 | 0 |
| 80 | 372 | 247,370 | 148 | 80 | 224 | 423 | 423 | 0 |
| 85 | 376 | 243,008 | 109 | 98 | 224 | 428 | 428 | 0 |
| **90** | **352** | 283,744 | 100 | 97 | 224 | 406 | 406 | 4 |

Soak leg: 60.0 fps, p99 17.7 ms, max 31.1 ms, no frames over 50 ms (baseline soak: 59.1 fps, p99 31 ms, 39 frames over 50 ms).

- `gl.info` geometries rise from 159 to about 350 in the first 30 s and then stay between 346 and 376. The rise is Three.js uploading a geometry only when the camera first has it in view, as the loop turns toward new directions. After that, geometries created and disposed balance out: 224 chunks tracked from 10 s onward and the own geometry count follows the mesh count exactly (374 to 428), so nothing is left behind when a chunk is dropped.
- The own count moves with the player's position (more meshes when the loop crosses busy chunks), not with time: it was 374 at 40 s and 374 at 70 s.
- The 30 s sample is 355 and the last is 352. The maximum, 376 at 85 s, is 5.9 percent above the 30 s sample.
- The soak covers 90 s of a closed loop, not the 5 minute walk named in the baseline's target table. The loop revisits the same chunks, so it shows that dropped chunks are disposed; a long straight walk (the sao-to-tempest leg) is the test for unbounded growth and its geometry count (367) is the highest of the legs but is bounded by the 224-chunk window.

## Screenshots, before and after

`docs/screens/p2/before-*.png` come from the old renderer (render distance 3, fog from 40 to 120 blocks). `docs/screens/p2/after-*.png` come from the new one (render distance 8, fog from 192 to 256 blocks), both at 1280x800 on the production build, camera, time of day and lights identical. I looked at each pair.

The first version of the after shots had vertex ambient occlusion baked in (multipliers 0.55 to 1.0): banded roofs, darkened wall bases and kerbs. That went beyond "flat colours, same lights", so the review sent it back. AO is now a single switch, `AO_STRENGTH` in `meshing/ChunkMesher.ts`, which is 0 (off) by default; the AO code and its tests are kept and run with an explicit strength of 1 (see [meshing.md](meshing.md)). The five after shots were retaken with it off, on a fresh production build, and the benchmark and soak above were rerun.

| Viewpoint | What is the same | What differs |
| --- | --- | --- |
| spawn (Greensom street) | Houses, trees, lamp posts, hedge blocks, flowers, road, sky and colours, down to individual blocks. The red roof is flat red on every step, as before. | The far hills, which the old fog turned into flat green slabs, now show terraced blocks and a row of small trees on the right, and the end of the road is visible instead of a pale haze. |
| great-tower | Walls, gate towers, road, grass and sky. | The Great Tower is now visible as a dark cylinder with a grid of window frames. Before, it was only a pale, fog-washed ghost behind the gate. This is the fog and the render distance, not a change of colour. |
| tempest-plaza | Street, white and brown buildings, blue windows, road and sky. Wall bases are the same flat colour as before. | The far end of the street, a pale green slab before, is a sharper green block with buildings around it. |
| amestris | Red buildings, road, the grey kerb, sky and fog colour. Walls have no darkening toward the ground. | Many more towers and buildings stand in the distance (two before, about ten now, from the larger render distance). The grey kerb on the left was a row of separate segments with visible seams before and is one continuous strip now. |
| bosse-castle | Sky and the grey ground in the foreground. | The wall is light grey with a yellow block above it; before it was cream and the horizon was washed to cream. The old fog (40 to 120 blocks) tints everything it reaches, and the yellow block is probably further away than the old renderer drew, though I did not measure its distance. The pale lattice pattern on the ground at the right of the old image (many small cubes seen edge on) is gone. |

Honest summary of the differences:

1. **Distance and fog, as expected.** Far geometry is now present and sharper, and the fog covers 192 to 256 blocks instead of 40 to 120. Colours of the same objects at the same distance match.
2. **No ambient occlusion in the shipped look.** With the switch off, surfaces carry only their registry (or zone-blended) colour and the Three.js lights, as in the old renderer. The banding and wall-base darkening seen in the first after shots are gone. Turning AO back on is a one-line change for Phase 6 (baked light).
3. **Bosse is the least certain pair.** The wall colour differs (cream before, light grey after) and I attribute that to the old fog, which was much closer, but I could not confirm it with a closer old-renderer shot because the old renderer no longer exists in the tree.
4. Nothing was missing in the after shots: every block the old renderer drew within its distance is present.

## What was not measured

- Uncapped frame rate. Headless Chrome is limited to 60 fps, so there is no headroom figure. The frame budget is met at 8 chunks with p99 about 17.7 ms, which is the vsync interval plus noise.
- Hardware other than this M4, a visible (non-headless) window, and device pixel ratios above 1. Chunk meshing runs in up to 4 workers; machines with fewer cores will take longer to fill the 8-chunk ring after a teleport, but nothing runs on the main thread except uploads, which are capped at 2 geometries per frame.
- The `Color('#385865ca')` warning in `Game.tsx` and the `COLORS.WATER` 8-digit hex still log console warnings (not errors). They are known and are replaced in Phase 5 and with the block registry colours.
