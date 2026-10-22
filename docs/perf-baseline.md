# Performance baseline (before the engine rebuild)

Measured on 22 Oct 2026 at commit `6f15a44` plus the Phase 0 harness, before any rendering changes.
Phase 2 is judged against these numbers.

## Setup

- Apple M4, Chrome (headless), ANGLE Metal, 1280x713 viewport, device pixel ratio 1.
- Render distance 3 chunks (96 blocks), the current setting.
- One full run each of the dev server (`npm run dev`) and the production build (`vite build` then `vite preview`).
- Raw results are in [`bench-baseline-dev.json`](bench-baseline-dev.json) and [`bench-baseline-prod.json`](bench-baseline-prod.json).

## How to rerun

```bash
npm run dev                         # terminal 1
npm run bench                       # terminal 2, about 2.5 minutes, writes docs/bench-latest.json
npm run bench -- --quick            # short smoke test of the harness, numbers are not comparable
```

The same flythrough runs in any browser at `http://localhost:3000/?bench` and shows a results panel when it finishes.
Keep the window visible and in front for the whole run, because browsers pause rendering for hidden pages.

The route is a fixed camera path that replaces the player. It writes `playerState` every frame, as `Player` does. (The baseline numbers below were taken before Phase 2, when this went through React state every frame, which was part of the cost. The results after the rebuild are in [renderer.md](renderer.md).)

| Leg | What it does |
| --- | --- |
| load | Stand at spawn for 6 s while the first chunks generate |
| idle | Stand still for 6 s |
| jump | Stand at spawn and jump every 1.2 s for 6 s, using the real jump height and air time |
| greensom-to-sao | Sprint from spawn through the south gate to the plaza (about 255 blocks) |
| sao-to-tempest | Sprint along the east highway to the edge of Tempest (1,380 blocks) |

## Results (frame times in ms)

Dev server:

| Leg | fps | p50 | p95 | p99 | max | frames over 50 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| load | 57.3 | 16.7 | 18.4 | 18.8 | 285 | 1 |
| idle | 60.1 | 16.6 | 18.3 | 18.7 | 18.8 | 0 |
| **jump** | **5.8** | **259.4** | 290.4 | 312.2 | 312.2 | **22** |
| greensom-to-sao | 56.2 | 16.6 | 18.5 | 50.7 | 264.5 | 14 |
| sao-to-tempest | 56.7 | 16.6 | 18.4 | 66.0 | 214 | 61 |
| overall | 54.6 | 16.6 | 18.4 | 75.1 | 312.2 | 98 |

Production build:

| Leg | fps | p50 | p95 | p99 | max | frames over 50 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| load | 58.4 | 16.6 | 18.4 | 18.8 | 193 | 1 |
| idle | 60.1 | 16.6 | 18.1 | 18.6 | 18.7 | 0 |
| **jump** | **9.7** | **173.4** | 184.9 | 189.0 | 189 | **32** |
| greensom-to-sao | 57.8 | 16.6 | 18.1 | 56.3 | 183.4 | 15 |
| sao-to-tempest | 58.4 | 16.6 | 18.3 | 47.2 | 142.4 | 56 |
| overall | 56.3 | 16.6 | 18.3 | 65.6 | 193 | 104 |

Renderer load, which is the same in both runs: 17 to 19 draw calls and about 2 to 2.7 million triangles per frame at only 3 chunks of render distance.

## What the numbers show

- **Standing still is fine.** 60 fps at p99 under 19 ms, so the cost is in rebuilding, not drawing.
- **Jumping is the worst case.** Each jump rebuilds every visible chunk because `playerY` is a dependency of the chunk memo. Frame time is 170 to 260 ms in the middle of a jump. This is the clearest target for Phase 2.
- **Walking causes hitches.** Crossing chunk borders generates chunks synchronously on the main thread. There are 14 to 15 frames over 50 ms on the short leg and 56 to 61 on the long one, with the worst frames at 140 to 265 ms.
- **The dev server is slower than production** mainly in the jump leg. Use production numbers for performance claims and dev numbers for what you feel while working.

## Soak baseline and screenshots

Added in Phase 2 step 2.1, before the renderer changes, so the new renderer can be compared with the old one.

- Soak: `npm run bench -- --soak` walks a closed loop (Greensom, south road, plaza, west and east roads, home) at sprint speed for 90 s and samples `gl.info` every 5 s. The old renderer on the production build, [`bench-baseline-soak-prod.json`](bench-baseline-soak-prod.json): 59.1 fps, soak leg p99 31 ms with 39 frames over 50 ms, geometries 27 to 36 (the instanced chunks share one box geometry, so this was never the leak risk), 1.7 to 2.7 million triangles per frame, 29 live chunks and 337 chunk mounts in 90 s.
- Screenshots: `docs/screens/p2/before-*.png` come from the old renderer on the production build at 1280x800 (`node bench/shots.mjs --prefix before`). The Phase 2 end step takes `after-*.png` at the same five viewpoints in `bench/viewpoints.json`. The old world is about 100 blocks of visible terrain because of the fog, so expect the after shots to differ mainly in distance.

## Console noise found while measuring

`DayNightCycle` calls `new Color('#385865ca')` inside `useRef(...)`, which runs on every render. Three.js does not accept 8-digit hex and logs a warning, so the console receives one warning per frame (more than 25,000 in a few minutes). `COLORS.WATER` (`'#5194ffff'`) has the same problem. This is not fixed in Phase 0 so the baseline matches current behaviour. `DayNightCycle` is replaced in Phase 5 and the colour constants move into the block registry in Phase 1.

## Phase 2 targets

| Measure | Now (production) | Target |
| --- | --- | --- |
| Render distance | 3 chunks | 8 chunks |
| jump leg p99 | 189 ms | under 20 ms |
| Walking legs p99 | 47 to 56 ms | under 25 ms |
| Frames over 50 ms while walking | 15 to 56 per leg | 0 |
| Overall fps | 56 | 60 |
| Geometry count after a 5 minute walk | not tracked | flat |
