# Performance after Phase 7 (the Tempest city)

Measured on 24 Oct 2026 with the Tempest city in the game ([tempest.md](tempest.md#the-finished-city)): about 257 lots with real kits, the hand-built landmarks, interiors, 1,060 lamp posts and a lot of block light, on top of Phases 2 to 6. Production build, render distance 8, Apple M4, headless Chrome, ANGLE Metal, 1280x713 canvas, device pixel ratio 1, the machine shared with other jobs. The step before it is [perf-after-integration.md](perf-after-integration.md) (the old planned grid in Tempest). Raw results: [`bench-p7-prod.json`](bench-p7-prod.json) and [`bench-soak-p7-prod.json`](bench-soak-p7-prod.json).

```bash
npx vite build && npx vite preview --port 3105 --strictPort      # terminal 1
node bench/run.mjs --url "http://localhost:3105/?bench" --out docs/bench-p7-prod.json
node bench/run.mjs --url "http://localhost:3105/?bench=soak&route=tempest&soakSeconds=150" --out docs/bench-soak-p7-prod.json
node bench/run.mjs --smoke --url http://localhost:3105/
npx vite-node tools/bench-tempest-zone.ts
```

What changed in the harness: the flythrough has a sixth leg, `tempest-streets` (`bench/Benchmark.tsx`): in at the west gate, along the commercial avenue to the Central Square, up the north avenue towards the Town Hall, east and back down a side street, across the square again and down the south avenue into the tourism sector, about 670 blocks at walking speed; `bench/viewpoints.json` (the screenshot list) gained the Tempest gate, square, avenue, hall and arena, and `bench/cityshots.json` lists the 23 city views. `?bench=soak&route=tempest` soaks on a closed loop through the same streets at sprint speed instead of the old loop round the Town. Every run's Chrome profile is now deleted when it exits.

## Frame time (ms)

| Leg | fps | p50 | p95 | p99 | max | frames over 50 ms | draw calls (max) | triangles (max) | JS heap (MB) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| load | 60.2 | 16.7 | 18.3 | 18.6 | 19.1 | 0 | 130 | 340,592 | 157 |
| idle | 60.0 | 16.7 | 18.3 | 18.6 | 18.8 | 0 | 130 | 340,592 | 152 |
| **jump** | 60.0 | 16.7 | 18.2 | **18.6** | 19.0 | **0** | 130 | 340,592 | 158 |
| greensom-to-sao | 60.0 | 16.7 | 18.3 | 18.6 | 19.3 | 0 | 130 | 340,592 | 171 |
| sao-to-tempest | 60.0 | 16.7 | 18.1 | 18.7 | 20.1 | 0 | 162 | 975,900 | 449 |
| **tempest-streets** | 60.0 | 16.7 | 17.8 | **18.6** | 20.6 | **0** | 170 | 1,037,680 | 372 |
| overall | 60.0 | 16.7 | 18.1 | 18.6 | 20.6 | 0 | | | |

The soak through the streets (150 s, sprint speed, about two laps of the loop): 60.0 fps, p99 18.7 ms, worst frame 26.5 ms, nothing over 50 ms, 130 to 176 draw calls, 489,000 to 1,039,000 triangles.

## Against the Phase 2 targets

| Target | Result | Met |
| --- | --- | --- |
| jump leg p99 under 20 ms | 18.6 ms | yes |
| walking legs p99 under 25 ms | 18.6, 18.7 and 18.6 ms (the streets leg is the new one) | yes |
| no frame over 50 ms while walking | 0 in every leg and the soak (worst walking frame 20.6 ms, worst soak frame 26.5 ms) | yes |
| overall at least 58 fps | 60.0 | yes |
| geometry count flat in the soak | 215 at 5 s while the first chunks arrive, then 390 to 465 for the remaining 145 s with no trend (30 s: 444, 90 s: 448, 150 s: 439) | yes |
| no page errors | 0 in the smoke run and in every screenshot | yes |

Against the step before: walking p99 was 18.6 and 18.5 ms, now 18.7 and 18.6; the worst walking frame 21.6 ms, now 20.6. All of these are at the 16.7 ms floor of the 60 Hz cap plus a little, so what this shows is that the frame budget is still met, not how much is spare. What is heavier is the world: the streets draw up to 170 calls and 1.04 million triangles (161 and 746,000 on the way to the old Tempest), because buildings have roofs of stairs and slabs, timber frames and lanterns where the box houses had a few faces.

JS heap is the one number that got worse: 330 to 450 MB in Tempest (it was 120 to 200 MB walking to the old one). It saw-tooths with the garbage collector and does not grow over the 150 s soak (331 to 400 MB), and it is the main thread's heap only (the workers are not in it), but it is about twice as large as before; the likely cause is the larger meshes and the chunk data of the extra geometry, not measured further.

## Chunk generation and meshing in the workers

As the workers measured it in the browser (production, four workers, average per job; a job generates about 5 chunks, the rest come from the worker's chunk cache):

| Part | Whole run before Tempest's streets (1,342 jobs) | The streets leg alone (438 jobs) | Worst single job |
| --- | ---: | ---: | ---: |
| generation | 11.4 ms | 12.8 ms | |
| light | 2.7 ms | 3.0 ms | 24.7 ms |
| mesh | 2.5 ms | 2.6 ms | 16.4 ms |

(The streets leg's figure is the difference of the cumulative averages the renderer reports at the end of the previous leg and at the end of this one.) In the soak the averages were 13.1 ms of generation, 2.8 ms of light and 2.5 ms of meshing per job, with 224 chunks resident, no pending jobs at the end and 6,735 chunks generated over 1,327 jobs.

In node, with the zone's caches cold (`npx vite-node tools/bench-tempest-zone.ts`): a Tempest chunk takes **9.1 ms on average, 10.5 ms at the 95th percentile, 34.9 ms the worst** (the first chunk of a region that builds several blueprints), over 274 chunks across the dense town (9.2 mean), the tourism sector (8.8), the civic compound and the public strip (8.8), the farms (9.0), the river (9.1), the pastures (8.3), the forest (9.3) and the north road (9.2); warm, 8 to 9 ms. Almost all of that is filling the column below the ground with stone, which every zone's chunks do, so the buildings add little. The planner takes 37 ms and the zone 32 ms to construct (the planner included), once per worker. The city's cost in the workers is therefore within what the integration step measured for the wilderness (8 to 13 ms per job): **no blueprint caching, lot lookup, mesh budget or worker cache change was needed**, and the lot cache (256 lots) was left as it was.

## Smoke

`node bench/run.mjs --smoke` against the production build: the player lands at Greensom, walks forward, the sky keys work, 0 page errors.
