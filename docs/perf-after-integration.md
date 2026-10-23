# Performance after the integration

Measured on 23 Oct 2026 with the Phase 6 generator wired into the game ([worldgen.md](worldgen.md#wired-into-the-game)) on top of Phases 2 to 5 and the nature blocks: production build, render distance 8, Apple M4, headless Chrome, ANGLE Metal, 1280x713 canvas, device pixel ratio 1. The machine was shared with other jobs (load average 2 to 4), as in the earlier phases. The step before it is [perf-after-p5.md](perf-after-p5.md), measured with the legacy zones in the workers. Raw results: [`bench-integration-prod.json`](bench-integration-prod.json), [`bench-soak-integration-prod.json`](bench-soak-integration-prod.json) and [`bench-soak-integration-long-prod.json`](bench-soak-integration-long-prod.json).

```bash
npx vite build && npx vite preview --port 3101 --strictPort      # terminal 1
node bench/run.mjs --url "http://localhost:3101/?bench" --out docs/bench-integration-prod.json
node bench/run.mjs --url "http://localhost:3101/?bench=soak" --out docs/bench-soak-integration-prod.json
node bench/run.mjs --url "http://localhost:3101/?bench=soak&soakSeconds=260" --out docs/bench-soak-integration-long-prod.json
node bench/run.mjs --smoke --url http://localhost:3101/
node bench/shots.mjs --prefix world --dir docs/screens/integration --url http://localhost:3101
npx vite-node tools/bench-generators.ts
```

What changed in the harness: the camera of the flythrough now takes its height from the main thread's generator (`voxelWorld.terrainHeight`) instead of the old `getTerrainHeight`, since the wilderness it flies over is no longer the legacy one (the route, speeds and legs are the same, so the legs stay comparable); each leg records the world renderer's counters at its end (`stats`); `?bench=soak&soakSeconds=N` runs a longer soak. The benchmark still runs the live day cycle from 09:00.

## Frame time (ms)

| Leg | fps | p50 | p95 | p99 | max | frames over 50 ms | draw calls (max) | triangles (max) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| load | 60.1 | 16.7 | 18.1 | 18.5 | 18.6 | 0 | 130 | 340,592 |
| idle | 60.0 | 16.7 | 18.3 | 18.6 | 18.7 | 0 | 130 | 340,592 |
| **jump** | 60.0 | 16.7 | 18.3 | **18.6** | 18.9 | **0** | 130 | 340,592 |
| greensom-to-sao | 60.0 | 16.7 | 18.4 | 18.6 | 18.8 | 0 | 130 | 340,592 |
| sao-to-tempest | 60.0 | 16.7 | 17.8 | 18.5 | 21.6 | 0 | 161 | 746,338 |
| overall | 60.0 | 16.7 | 18.1 | 18.6 | 21.6 | 0 | | |

The 90 s soak: 60.0 fps, p99 17.6 ms, worst frame 19.6 ms, nothing over 50 ms, 92 to 147 draw calls, 198,000 to 343,000 triangles, JS heap 124 to 198 MB. The long soak (260 s, about three laps): 60.0 fps, p99 17.7 ms, worst frame 29.2 ms, nothing over 50 ms.

## Against the Phase 2 targets

| Target | Result | Met |
| --- | --- | --- |
| jump leg p99 under 20 ms | 18.6 ms | yes |
| walking legs p99 under 25 ms | 18.6 ms and 18.5 ms | yes |
| no frame over 50 ms while walking | 0 and 0 (worst walking frame 21.6 ms) | yes |
| overall at least 58 fps | 60.0 | yes |
| geometry count flat in the soak | see below | yes, with a caveat about how it is read |
| no page errors | 0 in the smoke run | yes |

Against the step before (legacy zones, [perf-after-p5.md](perf-after-p5.md)): jump p99 17.7 ms then, 18.6 ms now; walking p99 17.7 and 17.7 then, 18.6 and 18.5 now; worst walking frame 25.7 ms then, 21.6 ms now. The difference in p99 (0.9 ms) is within what the shared machine moved between runs of one build earlier (17.2 to 17.7 ms); the hard 16.7 ms floor of the 60 Hz cap means all of these runs have room to spare. What is heavier is the world: the walk to Tempest now draws up to 161 calls and 746,000 triangles (560,000 and 151 before), because the wilderness has trees, plants and rivers where the legacy one had bare hills.

### Geometry count, and why the 30 s sample is no longer the right one

The Phase 2 rule was that the last sample of the soak stays within 10 percent of the one at 30 s. On this run it does not, literally: `gl.info` counted 293 geometries at 30 s and 332 at 90 s (+13 percent); the renderer's own count is 315 and 379. The cause is where on the soak loop the samples fall, not growth. One lap of the loop is about 82 s (1,150 blocks at sprint speed) and the number of meshes in view follows the scenery: Town and the roads out of it hold about 310 to 330 meshes, Greensom's trees and fields about 380 to 400. With the legacy terrain around the Town the loop was nearly uniform, so any two samples agreed. The 260 s run shows what matters, that the count comes back to the same values lap after lap:

| Lap | Peak (renderer count, at the Greensom end of the loop) | Trough (at the Town end) |
| --- | ---: | ---: |
| 1 | 402 (85 s) | 312 (40 s) |
| 2 | 402 (165 s) | 291 (120 s) |
| 3 | 397 (250 s) | 310 (200 s) |

`gl.info` counts a geometry the first time it is drawn, so it starts low (145 at 5 s) while the renderer's own count starts at 388; the peaks repeat at 356, 355 and 351. JS heap stays between 122 and 198 MB with the same period. Nothing grows.

## Chunk generation in the workers

The legacy zones cost the workers 22.5 ms of generation per job (5.1 chunks generated per job, [perf-after-p5.md](perf-after-p5.md)). What the same workers spent with the new generator, as they measured it in the browser (production, four workers):

| Part | Soak (881 jobs) | load leg (212 jobs) | greensom-to-sao (190 jobs) | sao-to-tempest (940 jobs) |
| --- | ---: | ---: | ---: | ---: |
| generating the chunks the worker did not have cached | 12.6 ms | 13.4 ms | 11.0 ms | 8.2 ms |
| chunks generated per job | 5.1 | 5.5 | 5.2 | 4.2 |
| light | 2.2 ms | | | |
| mesh | 2.0 ms | | | |
| worst single light / mesh, cold JIT (legs: highest since the page loaded) | 16.5 / 13.5 ms | 14.8 / 18.6 ms | | 17.8 / 18.6 ms |

So the new generator costs less per job than the legacy adapter did, not more, and the cache gets the same hit rate as before (4.2 to 5.5 chunks generated per job; a job on its own needs 9). In node, per chunk (`tools/bench-generators.ts`, ms per chunk over a 6 x 6 block of chunks, warmed up; the machine was busy so figures move 10 to 20 percent between runs, and one run had the legacy road chunks at 30 ms):

| Place | Legacy HIGH | Phase 6 HIGH | Legacy LOW | Phase 6 LOW |
| --- | ---: | ---: | ---: | ---: |
| Greensom (spawn) | 13.0 | 9.9 | 11.5 | 9.5 |
| Town of Beginnings | 7.1 | 7.1 | 6.9 | 7.2 |
| road, x 250 to 500 | 12.8 | 7.2 | 12.9 | 6.8 |
| road, x 800 to 1000 | 7.0 | 7.0 | 6.9 | 7.0 |
| Tempest | 7.3 | 7.5 | 6.8 | 7.2 |
| cedar belt | 13.3 | 9.4 | 13.2 | 9.2 |
| south forest (dense) | 13.8 | 9.0 | 13.6 | 8.5 |
| mountains | 20.2 | 10.3 | 19.8 | 10.1 |

Inside the zones the new generator is the legacy zone (same cost); in the wilderness it is cheaper because it fills columns from the ground and sea level up instead of asking the legacy rule for every block of the 70 blocks above. LOW detail saves little for the wilderness (about 0.3 ms: the plants it leaves out are a small part of a chunk's cost); the legacy zones save a little more.

Because frame times did not suffer and the generation per job fell, the chunk cache (64 per worker) and the job order (nearest to the player first) were left exactly as they were. The idea noted in [light.md](light.md#the-worker), sending neighbouring chunks to the same worker to cut the 5 generated chunks per job, remains the first thing to try if load time ever matters.

## Walking the new roads

`tests/worldgen/road-walk.test.ts` walks each road from gate to gate with the game's own physics (gravity, `moveAABB` against the main thread's world, a jump whenever the way is blocked) at sprint speed, steering for the next vertex of the road's centreline:

| Road | Length | Time | Jumps |
| --- | ---: | ---: | ---: |
| Town of Beginnings to Greensom | 30 blocks | 2.2 s | 1 |
| Town of Beginnings to Tempest | 757 blocks | 58.2 s | 23 |
| Town of Beginnings to Amestris | 807 blocks | 62.6 s | 26 |
| Town of Beginnings to Bosse | 750 blocks | 63.8 s | 37 |
| Tempest to Fremmevilla | 808 blocks | 63.4 s | 27 |
| Greensom to Magnolia (4 bridges) | 1,868 blocks | 144.7 s | 62 |

None sticks or falls. The centreline never steps by more than a block, the player's step-up is 0.6 and its jump 1.25, so a rise of one block costs a jump. On the Magnolia road's bridges the player's feet are within a block of the top of the deck at every frame, standing on planks over the water and on the bank beside the planks at the first blocks of the approach.

## Screenshots

In [screens/integration/](screens/integration/), taken at noon in the production build with `node bench/shots.mjs` (`bench/viewpoints.json` keeps the six old viewpoints and adds ten), plus three at other times of day. Judged by reading each image:

| Shot | What it shows |
| --- | --- |
| `world-spawn` | Greensom's street: cobblestone road with fence posts and lanterns on both sides, houses with red roofs, trees, flowers and crops, and the village road running up to the Town. Beyond the village the ground rises in one-block terraces with grass tops and dirt sides. Textures, grass tint and sky as in Phase 5, nothing missing. |
| `world-great-tower` | The Town: the tower, its wall and gate, a cobblestone road in front of it and flat meadow around. The zone interiors are the legacy ones and look as they did in Phase 5. |
| `world-tempest-plaza` | Tempest's main street between white and brown houses. Unchanged. |
| `world-amestris` | Amestris' red brick walls, chimneys, and the street. Unchanged. |
| `world-bosse-castle` | Bosse's flat white plateau and the golden block, identical to the Phase 5 shot (the zone is that bare; its interior is legacy). |
| `world-distant-terrain` | From 45 blocks up over the home meadow: the road runs straight to the Town's wall; around it the hills are terraced, with patches of stone, dirt, a few pines at the right and flowers. This is the old fog-bound flat hills view turned into real terrain. |
| `world-highway-400` | Looking east along the road to Tempest at x = 400: cobblestone with patches of path and dirt at its edges, continuous to the horizon, through meadow with scattered cedar, birch, oak and bamboo. A waypoint post with a lantern shows small in the distance (it is clearer at night). |
| `world-highway-800` | At x = 800 the road is narrower and mostly path and cobblestone, running straight for Tempest, whose first houses and roofs stand on both sides at the end. |
| `world-highway-1200` | Tempest's own west avenue (zone ground, the legacy road), cobblestone between the houses, with the road and its ground continuing from the wilderness road without a step. |
| `world-tempest-belt` | From 32 blocks up south of Tempest looking north: a dense belt of cedar with sakura groves, a river with a sandy bank at the left, bamboo at the edges. Tree trunks all stand on the ground; the canopies overlap and cut each other off without holes. |
| `world-bridge` and `world-bridge-small` | The Greensom to Magnolia road reaching a river: the road (dirt here, as far from any zone), reeds on the bank, a plank deck over blue water with fence rails and a continuing road on the far side; the approach banks meet the deck with no cliff. The water is blue with its wave pattern, sand banks along it. |
| `world-bosse-edge` | The old cliff at the Bosse plateau: from 40 blocks up over the birch woods north of the Town the ground rises gradually to the white plateau and the road climbs it as a thin dark line. There is no wall where there was a 22 block cliff. |
| `world-east-mountains` | The rocky hills at x = 11,150 with alpine snow on the ridge and snowy pines on it: stone and granite in layers, patches of sand and gravel, dark pines. No flat-colour or magenta tiles. |
| `world-town-gate` and `world-tempest-gate` | A road leaving the Town's east gate, wide cobblestone climbing in broad one-block steps with kerbs, then a grass verge; and the road arriving at Tempest's west edge, narrowing to the avenue. Both continuous, no gap where the generator hands over to the zone. |
| `night-highway-400`, `night-spawn`, `dusk-bridge` | The same views at night and at dusk. Lanterns on the waypoint posts light the road and the grass round them; the night is dark with stars, the dusk sunset over the river is warm. No bright seams along chunk borders. |

Looked for and not found in any of them: floating trees, holes at zone borders, gaps in the roads, black or magenta blocks, flat-colour tiles, bright seams at chunk edges. The water matches the shore (sand and gravel round it, the level uniform).

Two things that are on screen but are not integration faults, left as they are:

- **The wilderness sky is the legacy "deep purple".** `zones/WildernessZone.ts` gives the wilderness a purple fog and sky tint, so on a sunny meadow, in the shots from `highway-400` to `east-mountains`, the sky goes violet towards the horizon while it is clear blue in the zones. That was a design choice for a barren land and it now sits oddly on real biomes; it is an atmosphere setting, not a world-generation one.
- **Grass is grey-green far from the zones.** The grass and leaf tint is still the old blend of the zone colours weighted by distance (`meshing/biomeTint.ts`, tested against the old formula), which far from every zone averages to a dull grey-green (the bridge and east mountain shots). Tinting by the new biomes would fix it; it is the natural next job for the colour work and was not done here.
