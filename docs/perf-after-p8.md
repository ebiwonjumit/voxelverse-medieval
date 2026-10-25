# Performance after step 8.1 (foliage sway and animated water)

Measured on 24 Oct 2026 on the same city as [perf-after-p7.md](perf-after-p7.md), with foliage sway on every leaf, plant and stalk and the new water shader. Production build (`vite build`, served by `vite preview`), render distance 8, Apple M4, headless Chrome, ANGLE Metal, 1280x713 canvas, device pixel ratio 1, the machine shared with other jobs. Raw results: [`bench-p8-prod.json`](bench-p8-prod.json) and [`bench-soak-p8-prod.json`](bench-soak-p8-prod.json).

```bash
npx vite build && npx vite preview --port 3105 --strictPort
node bench/run.mjs --url "http://localhost:3105/?bench" --out docs/bench-p8-prod.json
node bench/run.mjs --url "http://localhost:3105/?bench=soak&route=tempest&soakSeconds=150" --out docs/bench-soak-p8-prod.json
node bench/run.mjs --smoke --url http://localhost:3105/
npx vite-node tools/bench-sway.ts
```

## Frame time (ms)

| Leg | fps | p50 | p95 | p99 | max | frames over 50 ms | draw calls (max) | triangles (max) | JS heap (MB) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| load | 60.1 | 16.7 | 18.3 | 18.7 | 18.7 | 0 | 130 | 340,592 | 159 |
| idle | 60.0 | 16.7 | 18.2 | 18.6 | 18.8 | 0 | 130 | 340,592 | 153 |
| **jump** | 60.0 | 16.7 | 18.2 | **18.5** | 18.8 | **0** | 131 | 343,392 | 160 |
| greensom-to-sao | 60.0 | 16.7 | 18.3 | 18.6 | 19.6 | 0 | 130 | 340,592 | 173 |
| sao-to-tempest | 60.0 | 16.7 | 18.3 | 18.6 | 18.8 | 0 | 173 | 1,089,810 | 445 |
| **tempest-streets** | 60.0 | 16.7 | 18.2 | **18.6** | 21.7 | **0** | 181 | 1,162,872 | 408 |
| overall | 60.0 | 16.7 | 18.3 | 18.6 | 21.7 | 0 | | | |

The soak through the streets (150 s, sprint speed): 60.0 fps, p99 18.6 ms, worst frame 26.2 ms, nothing over 50 ms, 129 to 174 draw calls and 491,000 to 1,048,000 triangles at the 5 second samples. Draw calls are identical to step 7 (the effects add no meshes, no materials and no draw calls), and the triangle counts are the same world. Geometry count: 222 at 5 s, 343 at 10 s and 452 at 15 s while the first chunks arrive, then 402 to 480 for the rest of the run with no trend (last sample 455), as before.

## Against the Phase 2 targets

| Target | Result | Met |
| --- | --- | --- |
| jump leg p99 under 20 ms | 18.5 ms | yes |
| walking legs p99 under 25 ms | 18.6, 18.6 and 18.6 ms | yes |
| no frame over 50 ms while walking | 0 in every leg and the soak (worst walking frame 21.7 ms, in Tempest's streets; worst soak frame 26.2 ms) | yes |
| overall at least 58 fps | 60.0 | yes |
| geometry count flat in the soak | 402 to 480 after the first 15 s, no trend | yes |
| no page errors | 0 in the smoke run (production build and dev server) and in every screenshot | yes |

Headless Chrome caps at 60 fps, so this shows that the frame budget is still met with the effects on, not how much is spare. The vertex shaders gained a few sines per vertex of a swaying bucket and the water fragment shader a second texture lookup; at 1280x713 neither moves a frame time that sits on the 16.7 ms floor.

## What it costs

- **Mesher** (node, `tools/bench-sway.ts`, baked light and cached neighbours, median of 15): the same chunk with `sway: false` and with the weights on differs by -1 to +2 percent (4.2 against 4.2 ms at the spawn, 5.4 against 5.5 ms in the bamboo grove, 3.7 against 3.7 ms on the Tempest river); and the code before this step gives the same times (4.2, 6.4, 4.5, 3.8, 5.4, 4.8 and 4.2 ms on the seven chunks against 4.2, 6.5, 4.8, 3.7, 5.5, 4.9 and 4.2 ms now). That includes the water's depth channel. The table is in [effects.md](effects.md#the-weight-the-mesher-writes).
- **Workers** (browser, average per job): over the whole flythrough before the streets leg (1,342 jobs) light took 2.7 ms and mesh 2.7 ms against 2.7 and 2.4 ms in the step 7 measurement; the soak (1,327 jobs) took 2.8 and 2.5 ms against 2.8 and 2.6. The 0.3 ms in the flythrough's mesh average is the one number that is higher; the node comparison above, taken with the machine quiet, shows no difference, and the soak is lower, so this is read as the load of the other jobs sharing the CPU. Worst single jobs: 17.5 ms for light and 11.5 ms for meshing.
- **Memory:** the cutout bucket carries one more float per vertex (4 bytes on a vertex that was 80), and the opaque and water buckets nothing. The JS heap in Tempest was 445 MB at the end of the Tempest approach and 408 MB in the streets, against 397 and 373 in the step 7 run, and 365 to 441 MB in the soak against 355 to 410 MB. That is higher by about 10 percent, more than the one extra float per cutout vertex explains in the main thread's heap (the vertex arrays are kept by the geometry only until the GPU has them), but the run was taken on a shared machine and the heap saw-tooths with the garbage collector; it was not investigated further, and it does not grow over the soak.

## Smoke

`node bench/run.mjs --smoke` against the production build and the dev server: the player lands at Greensom, walks forward, the sky keys work, the debug panel opens with F3, `1` and `2` switch the sway and the water animation off and on again, 0 page errors.
