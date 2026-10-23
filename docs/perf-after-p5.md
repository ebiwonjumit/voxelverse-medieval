# Performance after Phase 5

Measured on 23 Oct 2026 after the sky system ([sky.md](sky.md)) on top of the baked light: production build, render distance 8, Apple M4, headless Chrome, ANGLE Metal, 1280x713 canvas, device pixel ratio 1. The machine was busy with other jobs (load average about 5), so single frames above 20 ms show up now and then, as in the earlier phases. Raw results: [`bench-p5-sky-prod.json`](bench-p5-sky-prod.json) and [`bench-soak-p5-sky-prod.json`](bench-soak-p5-sky-prod.json); the step before it is [`bench-p5-prod.json`](bench-p5-prod.json).

```bash
npx vite build && npx vite preview --port 3101 --strictPort      # terminal 1
node bench/run.mjs --url "http://localhost:3101/?bench" --out docs/bench-p5-sky-prod.json
node bench/run.mjs --url "http://localhost:3101/?bench=soak" --out docs/bench-soak-p5-sky-prod.json
node bench/run.mjs --smoke --url http://localhost:3101/
```

The benchmark runs the live day cycle (it starts at 09:00), so the sky update, the dome and the fog colour changes are in the frames measured.

## Frame time (ms)

| Leg | fps | p50 | p95 | p99 | max | frames over 50 ms | draw calls (max) | triangles (max) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| load | 60.1 | 16.7 | 17.0 | 17.4 | 22.6 | 0 | 142 | 287,392 |
| idle | 60.0 | 16.7 | 16.8 | 17.0 | 17.7 | 0 | 142 | 287,392 |
| **jump** | 60.0 | 16.7 | 17.4 | **17.7** | 17.9 | **0** | 142 | 287,392 |
| greensom-to-sao | 60.0 | 16.7 | 17.5 | 17.7 | 20.4 | 0 | | |
| sao-to-tempest | 60.0 | 16.7 | 17.5 | 17.7 | 25.7 | 0 | | |
| overall | 60.0 | 16.7 | 17.5 | 17.7 | 25.7 | 0 | | |

The 90 s soak: 60.0 fps, p99 17.7 ms, worst frame 20.4 ms, nothing over 50 ms, geometry count flat (355 at 30 s, 352 at the end), 100 to 160 draw calls.

## Against the Phase 2 targets

| Target | Result | Met |
| --- | --- | --- |
| jump leg p99 under 20 ms | 17.7 ms | yes |
| walking legs p99 under 25 ms | 17.7 ms and 17.7 ms | yes |
| no frame over 50 ms while walking | 0 and 0 (worst walking frame 25.7 ms) | yes |
| overall at least 58 fps | 60.0 | yes |
| geometry count flat in the soak | 352 against 355 at 30 s | yes |
| no page errors | 0 in the smoke run (which now also presses F4 and `]`) | yes |

Against the step before (baked light only, [light.md](light.md#the-worker)): jump p99 17.2 ms then, 17.7 now; walking 17.7 and 17.7 then, 17.7 and 17.7 now. The draw call count is unchanged: the dome replaces the drei `Sky` mesh, one draw each. The shadow map is gone too; chunk meshes never cast shadows, so it was an empty 2048 x 2048 target.

## Relight and mesh time per chunk

The time of day never re-lights or re-meshes anything: sky light is baked as a level and `uDaylight` scales it in the shader. So the relight cost only arises when a chunk is built, once per chunk load. What a worker spends per job (one job per chunk), as the workers measured it in the browser, production build, four workers, the 90 s soak (881 jobs):

| Part | Average | Worst (cold JIT, first jobs) |
| --- | ---: | ---: |
| light (the 3x3 chunk relight) | 1.99 ms | 25.9 ms |
| mesh | 1.71 ms | 17.9 ms |
| **light plus mesh** | **3.7 ms** | |
| generating the chunks the worker did not have cached | 22.5 ms | |

Chunks generated: 4,498 for 881 jobs, 5.1 per job, as before (see [light.md](light.md#the-worker) for why and what to try).

In node, with the neighbours already cached (`tests/meshing/mesh-job-timing.test.ts`, target 25 ms for light plus mesh), median of 9 runs:

| Chunk | Light | Mesh | Together | Triangles |
| --- | ---: | ---: | ---: | ---: |
| spawn, Greensom (0, 9) | 2.9 ms | 4.1 ms | 7.0 ms | 7,660 |
| Town of Beginnings (0, 0) | 4.1 ms | 6.3 ms | 11.2 ms | 16,666 |
| Great Tower corner (-1, -1) | 4.0 ms | 6.3 ms | 10.4 ms | 15,702 |
| Tempest Coliseum (53, 0) | 2.2 ms | 3.9 ms | 6.1 ms | 2,552 |

(The vitest numbers are higher than the browser's because vite-node reads module bindings through objects; see the note in [light.md](light.md#a-note-on-vitest-timings).)

## Per-frame cost of the sky

`SkySystem.update` is one zone lookup (the atmosphere is parsed only when the zone changes), one `computeSky` (a few dozen multiplications and two small arrays) and about 25 uniform writes. It allocates no more than the arrays of one `computeSky`, a few hundred bytes a frame, and does nothing the benchmark could see.
