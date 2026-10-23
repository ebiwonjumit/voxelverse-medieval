# Performance after Phase 3

Measured on 23 Oct 2026 with the textured renderer (texture array, three patched materials, 76-byte vertices, see [textures.md](textures.md)), on the same harness, machine, flythrough and targets as [perf-after-p2.md](perf-after-p2.md). Frame time is within the Phase 2 targets everywhere. Memory is not: the JS heap is higher than after Phase 2 (see [Memory](#memory)).

## Setup

- Apple M4, headless Chrome, ANGLE Metal, 1280x713 canvas, device pixel ratio 1. Render distance 8 (about 224 chunks). Production build (`npx vite build`, `npx vite preview --port 3101`).
- Raw results: [`bench-p3-prod.json`](bench-p3-prod.json) (the table below), [`bench-p3-prod-run1.json`](bench-p3-prod-run1.json) (the run before it, see the note under the table) and [`bench-soak-p3-prod.json`](bench-soak-p3-prod.json).
- Another job kept the machine busy (load average 3 to 5 while measuring), so single frames above 25 ms show up now and then, in the Phase 2 runs too. Headless Chrome is locked to 60 fps, so every leg reads 60.0 fps and a p50 of 16.7 ms: that proves the frame budget, not the headroom.

```bash
npx vite build && npx vite preview --port 3101 --strictPort      # terminal 1
node bench/run.mjs --url "http://localhost:3101/?bench" --out docs/bench-p3-prod.json
node bench/run.mjs --url "http://localhost:3101/?bench=soak" --out docs/bench-soak-p3-prod.json
node bench/run.mjs --smoke --url http://localhost:3101/
node bench/shots.mjs --prefix world --dir docs/screens/p3 --url http://localhost:3101
```

## Results (frame times in ms)

| Leg | fps | p50 | p95 | p99 | max | frames over 50 ms | Phase 2 p99 | Phase 2 max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| load | 60.0 | 16.7 | 17.4 | 17.6 | 24.6 | 0 | 17.5 | 17.7 |
| idle | 60.0 | 16.7 | 17.2 | 17.6 | 17.7 | 0 | 17.3 | 17.6 |
| **jump** | 60.0 | 16.7 | 17.4 | **17.8** | 17.9 | **0** | 17.6 | 17.7 |
| greensom-to-sao | 60.0 | 16.7 | 17.5 | 17.7 | 18.0 | 0 | 17.6 | 17.7 |
| sao-to-tempest | 60.0 | 16.7 | 17.3 | 17.7 | 29.4 | 0 | 17.7 | 22.1 |
| overall | 60.0 | 16.7 | 17.3 | 17.7 | 29.4 | 0 | 17.7 | 22.1 |

Renderer load (production), against Phase 2:

| Leg | draw calls (max) | triangles (max) | `gl.info` geometries | JS heap (MB) | Phase 2 heap (MB) |
| --- | ---: | ---: | ---: | ---: | ---: |
| load | 142 | 295,840 | 142 | 112 | 75 |
| idle | 142 | 295,840 | 142 | 113 | 74 |
| jump | 142 | 295,840 | 142 | 112 | 73 |
| greensom-to-sao | 142 | 305,398 | 314 | 121 | 80 |
| sao-to-tempest | 151 | 558,584 | 368 | 258 | 176 |

Draw calls, triangles and geometry counts are identical to Phase 2 (367 geometries on the long leg there, 368 here): texturing changes what a fragment costs, not how much is drawn. Jumping still builds nothing (142 geometries in load, idle and jump alike).

Run 1 of the same build had one frame of 86.7 ms in the load leg, which is the first seconds while the workers start and the first chunks upload, and nothing over 18 ms after that (p99 17.6 ms overall, 0 frames over 50 ms in the walking legs). The table is run 2. I found no cause for the spike beyond load on the machine: in the other runs of the committed renderer the load leg's worst frame was between 25 and 34 ms.

The worst single frame of the long walking leg is 29.4 ms here against 22.1 ms in Phase 2. Over the eight runs of the committed renderer I made (including the two recorded for step 3.2) it was 18.0, 20.1, 21.9, 22.2, 23.1, 23.3, 26.8 and 29.4 ms, so Phase 2's 22.1 sits inside that spread and the higher figures are one or two frames at a time on a shared machine, not a trend. No frame over 50 ms occurred in a walking leg in any of those runs, and p99 stayed between 17.6 and 18.5 ms.

## Targets

Same targets as Phase 2 (production, render distance 8):

| Target | Result | Met |
| --- | --- | --- |
| jump leg p99 under 20 ms | 17.8 ms | yes |
| walking legs p99 under 25 ms | 17.7 ms and 17.7 ms | yes |
| zero frames over 50 ms while walking | 0 and 0 (worst walking frame 29.4 ms) | yes |
| overall average at least 58 fps | 60.0 fps | yes |
| geometry count flat in the soak (last sample within 10 percent of the 30 s sample) | 352 against 355, minus 0.8 percent | yes |
| no console errors | 0 page errors in the smoke run, the sandbox and all six world screenshots | yes |

## Soak

`?bench=soak`, 90 s closed loop at sprint speed: 60.0 fps, p99 17.7 ms, max 23.3 ms, no frame over 50 ms (the load leg before it: max 26.1 ms). The `gl.info` geometry count follows the Phase 2 soak sample for sample (159, 193, 240, 311, 343, 355, ..., 376 at 85 s, 352 at the end), which is expected since the world, the chunk windows and the flythrough are the same.

## Memory

The JS heap is higher than after Phase 2: about 112 MB at rest against 75 MB, and 258 MB at the end of the long leg against 176 MB (the soak, which loops over fixed ground, sits between 119 and 148 MB against 76 to 98 MB). That is the vertex size: a textured vertex is 76 bytes against 36, and Three.js keeps the typed arrays of every geometry on the JS side after uploading them. It is not in the Phase 2 targets and nothing else moved, but it is a real cost of this phase, so it is recorded here.

I tried the usual fix, dropping each attribute's array after Three.js uploads it (`BufferAttribute.onUpload`), because chunk geometry is never read back or edited. It works: the long leg ended at 79 to 92 MB, the soak at 24 to 82 MB. I did not keep it. Over ten production runs with the change, the long walking leg's worst frame was above 28 ms in five (28.9, 30.4, 33.3, 44.6 and 91 ms; one of them was a frame over 50 ms), against one of eight runs without it (29.4 ms) and none over 50 ms. The machine was noisy for all of them, so that comparison is suggestive rather than conclusive, and a change that might make the tail worse is not something to slip into a step about screenshots. It is the first thing to try again when memory matters, with a quiet machine for the comparison; the code was about fifteen lines in `ChunkRenderer`.

## Mip check at distance

`world-distant-terrain.png` ([screens/p3/world-distant-terrain.png](screens/p3/world-distant-terrain.png), camera at 45 blocks height looking over the plaza and the grass out to the fog) shows the far ground as flat, even colour with no moire, and the layers of the texture array do not show through each other. A still cannot show shimmer, so I measured it: two screenshots with the camera moved 0.04 blocks, mean absolute difference per channel (0 to 255) over three bands of rows, for the real build and for a control build identical except that the minification filter was `NearestFilter` (no mipmaps):

| Rows | Far ground (440 to 520) | Middle (520 to 640) | Near (640 to 800) |
| --- | ---: | ---: | ---: |
| mipmapped (shipped) | 0.16 | 0.66 | 1.90 |
| no mipmaps (control) | 4.19 | 5.63 | 6.02 |
| share of samples that changed by more than 24, shipped | 0.00% | 0.06% | 0.07% |
| the same, control | 1.72% | 3.97% | 4.66% |

Moving the camera a hair changes far pixels about 25 times less with mipmaps than without, which is what no shimmer means. The control build was thrown away; nothing in the tree uses nearest minification.

## Screenshots

`docs/screens/p3/world-*.png` are taken at the same five viewpoints as `docs/screens/p2/after-*.png` (same camera, same lights and fog, production build), plus `world-distant-terrain.png`. I looked at each one against its Phase 2 pair.

| Viewpoint | What changed from the flat version |
| --- | --- |
| spawn | Planks and logs on the houses, red roof scales, cobblestone road with a visible pattern, grass blades on the hedge blocks, leaves with holes on the trees, glass panes with a frame. Same layout and the same overall colours as the flat version, which was dim in this light too. |
| great-tower | Stone brick walls with mortar and the tower's window grid are readable. The road is cobblestone and reads almost black here. |
| tempest-plaza | Plaster walls with grain, dark log posts, dark plank roofs, cobblestone plinth and a brick-pattern road. |
| amestris | Factory brick and obsidian roofs, chimneys in brick, an iron kerb. Dark: the zone's fog and the factory brick and obsidian tiles are dark, and the light is the old twilight. |
| bosse-castle | A marble wall and a gold block above it, and a ground with a faint grain that fades smoothly toward the horizon. |
| distant-terrain | See above. |

All of them are dim because the scene lights are the old twilight ones; brightness is a Phase 5 matter (baked light and a day cycle), not a material problem. The block sandbox ([textures.md](textures.md#block-sandbox)) shows the same tiles under neutral light.
