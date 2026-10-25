# Performance after Phase 7 (the Tempest city)

Measured on 24 Oct 2026 on the final city ([tempest.md](tempest.md#the-finished-city)), after the last fix pass (the variety pass with its workshop and public hall kits, shrines, watchtowers and wells, the roundabout of rings, curved eaves that sweep up at the corners, and the new roof palettes): **310 lots, 269 of them buildings** drawn by real kits (the planner's count: 6 parks, 12 construction sites, 21 gardens and 2 meadows are the rest), the hand-built landmarks, interiors, 1,060 lamp posts (recounted from the planner) and a lot of block light, on top of Phases 2 to 6. Production build (`vite build`, served by `vite preview`), render distance 8, Apple M4, headless Chrome, ANGLE Metal, 1280x713 canvas, device pixel ratio 1, the machine shared with other jobs. The step before it is [perf-after-integration.md](perf-after-integration.md) (the old planned grid in Tempest). Raw results: [`bench-p7-prod.json`](bench-p7-prod.json) and [`bench-soak-p7-prod.json`](bench-soak-p7-prod.json). An earlier measurement of this phase, taken before the variety pass (about 257 lots, 9.1 ms per chunk in node), is replaced by this one.

```bash
npx vite build && npx vite preview --port 3105 --strictPort      # terminal 1 (this run used port 3109: 3105 was held by a stale dev server)
node bench/run.mjs --url "http://localhost:3105/?bench" --out docs/bench-p7-prod.json
node bench/run.mjs --url "http://localhost:3105/?bench=soak&route=tempest&soakSeconds=150" --out docs/bench-soak-p7-prod.json
node bench/run.mjs --smoke --url http://localhost:3105/
npx vite-node tools/bench-tempest-zone.ts
```

What changed in the harness: the flythrough has a sixth leg, `tempest-streets` (`bench/Benchmark.tsx`): in at the west gate, along the commercial avenue to the Central Square, up the north avenue towards the Town Hall, east and back down a side street, across the square again and down the south avenue into the tourism sector, about 670 blocks at walking speed; `bench/viewpoints.json` (the screenshot list) gained the Tempest gate, square, avenue, hall and arena, and `bench/cityshots.json` lists the 40 city views. `?bench=soak&route=tempest` soaks on a closed loop through the same streets at sprint speed instead of the old loop round the Town. Every run's Chrome profile is now deleted when it exits.

## Frame time (ms)

| Leg | fps | p50 | p95 | p99 | max | frames over 50 ms | draw calls (max) | triangles (max) | JS heap (MB) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| load | 60.2 | 16.7 | 18.4 | 18.6 | 18.8 | 0 | 130 | 340,592 | 157 |
| idle | 60.0 | 16.7 | 18.4 | 18.6 | 18.8 | 0 | 130 | 340,592 | 152 |
| **jump** | 60.0 | 16.7 | 18.2 | **18.6** | 18.8 | **0** | 130 | 340,592 | 158 |
| greensom-to-sao | 60.0 | 16.7 | 18.0 | 18.5 | 27.1 | 0 | 130 | 340,592 | 171 |
| sao-to-tempest | 60.0 | 16.7 | 18.1 | 18.6 | 18.9 | 0 | 173 | 1,089,810 | 397 |
| **tempest-streets** | 60.0 | 16.7 | 18.2 | **18.6** | 18.9 | **0** | 181 | 1,147,934 | 373 |
| overall | 60.0 | 16.7 | 18.2 | 18.6 | 27.1 | 0 | | | |

The soak through the streets (150 s, sprint speed, about two laps of the loop): 60.0 fps, p99 18.6 ms, worst frame 30.1 ms, nothing over 50 ms, 129 to 175 draw calls and 491,000 to 1,048,000 triangles at the 5 second samples (the most in any single frame: 183 calls, 1,156,000 triangles).

## Against the Phase 2 targets

| Target | Result | Met |
| --- | --- | --- |
| jump leg p99 under 20 ms | 18.6 ms | yes |
| walking legs p99 under 25 ms | 18.5, 18.6 and 18.6 ms (the streets leg is the new one) | yes |
| no frame over 50 ms while walking | 0 in every leg and the soak (worst walking frame 27.1 ms, in the Greensom to SAO leg; 18.9 ms in the Tempest legs; worst soak frame 30.1 ms) | yes |
| overall at least 58 fps | 60.0 | yes |
| geometry count flat in the soak | 222 at 5 s while the first chunks arrive, 341 at 10 s and 452 at 15 s, then 402 to 480 for the remaining 135 s with no trend (30 s: 460, 90 s: 464, 150 s: 455) | yes |
| no page errors | 0 in the smoke run (production and dev server) and in every screenshot | yes |

Against the first Tempest measurement of this phase (before the variety pass): the p99 of the two Tempest legs was 18.7 and 18.6 ms, now 18.6 and 18.6. All of these are at the 16.7 ms floor of the 60 Hz cap plus a little, so what this shows is that the frame budget is still met, not how much is spare. What is heavier is the world: the streets draw up to 181 calls and 1.15 million triangles (170 and 1.04 million in the first measurement, 161 and 746,000 on the way to the old Tempest), because buildings have roofs of stairs and slabs, timber frames and lanterns where the box houses had a few faces.

JS heap is the one number that got worse than before the city: 355 to 410 MB in Tempest in the soak and 373 to 397 MB in the flythrough (it was 120 to 200 MB walking to the old one). It saw-tooths with the garbage collector and does not grow over the 150 s soak (394 MB at 5 s, 396 MB at 150 s), and it is the main thread's heap only (the workers are not in it), but it is about twice as large as before; the likely cause is the larger meshes and the chunk data of the extra geometry, not measured further.

## Chunk generation and meshing in the workers

As the workers measured it in the browser (production, four workers, average per job; a job generates about 5 chunks, the rest come from the worker's chunk cache):

| Part | Whole run before Tempest's streets (1,342 jobs) | The streets leg alone (438 jobs) | Soak (1,327 jobs) | Worst single job (whole run) |
| --- | ---: | ---: | ---: | ---: |
| generation | 11.4 ms | 13.4 ms | 13.3 ms | |
| light | 2.7 ms | 3.0 ms | 2.8 ms | 15.9 ms (9.6 in the soak) |
| mesh | 2.4 ms | 2.5 ms | 2.6 ms | 16.7 ms (9.8 in the soak) |

(The streets leg's figure is the difference of the cumulative averages the renderer reports at the end of the previous leg and at the end of this one; the worst jobs are cumulative maxima over the run, so they are not necessarily from the streets.) In the soak 224 chunks were resident, no jobs were pending at the end and 6,756 chunks were generated over 1,327 jobs.

In node, with the zone's caches cold (`npx vite-node tools/bench-tempest-zone.ts`): a Tempest chunk takes **9.3 ms on average, 10.7 ms at the 95th percentile, 26.9 ms the worst** (the first chunk of a region that builds several blueprints), over 274 chunks across the dense town (9.7 mean), the tourism sector (8.9), the civic compound and the public strip (9.5), the farms (9.2), the river (9.2), the pastures (8.5), the forest (9.4) and the north road (9.3); warm, 8.3 to 9.3. Almost all of that is filling the column below the ground with stone, which every zone's chunks do, so the buildings add little. The planner takes 44 ms and the zone 46 ms to construct (the planner included), once per worker. The city's cost in the workers is therefore within what the integration step measured for the wilderness (8 to 13 ms per job): **no blueprint caching, lot lookup, mesh budget or worker cache change was needed**, and the lot cache (256 lots) was left as it was.

## Smoke

`node bench/run.mjs --smoke` against the production build and against the dev server: the player lands at Greensom, walks forward, the sky keys work, 0 page errors.
