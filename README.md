
# VoxelVerse: Anime Worlds

**VoxelVerse** is an open-world voxel exploration game built with React Three Fiber. It features a large seeded world inspired by iconic fantasy anime settings: seven hand-built zones with their own atmosphere and architecture, joined by roads and bridges through eleven biomes of forest, meadow, wetland, coast and mountain, all under a day and night cycle.

## 🌍 The World

The land between the zones is generated from a seed (`WORLD_SEED`): the same world every time, built chunk by chunk in web workers and answered block by block on the main thread, with both agreeing exactly (see docs/worldgen.md). The zones keep their hand-built interiors and blend into the wilderness at their edges.

### Current Zones
1.  **Greensom Village (Spawn)**: A humble starting area with a central well, detailed cottages, farming plots, and a meandering stream.
2.  **Town of Beginnings (Center)**: Inspired by *Sword Art Online*. A classic medieval city with white plaster/timber houses and a massive central tower.
3.  **Federation of Tempest (East)**: Inspired by *That Time I Got Reincarnated as a Slime*. A lush, magical forest city with Japanese-fusion architecture and paved stone roads.
4.  **Amestris District (West)**: Inspired by *Fullmetal Alchemist*. An industrial zone with red factory bricks, smoggy grey skies, and iron structures.
5.  **Kingdom of Bosse (North)**: Inspired by *Ranking of Kings*. A heavenly, golden-tinted realm with marble castle walls and gold spires.
6.  **Kingdom of Fremmevilla (North-East)**: Inspired by *Knights & Magic*. A high-fantasy mecha kingdom featuring massive stone hangars and steel beam construction.
7.  **Magnolia Town (South-West)**: Inspired by *Fairy Tail*. A vibrant, European-style guild town with light wood architecture and a magical pink atmosphere.

## 🎮 Controls

| Key | Does |
| --- | --- |
| W / A / S / D | Move |
| Mouse | Look around |
| Space | Jump |
| Shift | Sprint |
| Click | Lock the mouse cursor |
| H | Show or hide the help |
| F3 | Debug panel (position, zone, chunks, time of day) |
| F4 | Sky preset: live cycle, dawn, noon, dusk, night, the old fixed twilight, and round |
| `[` and `]` | Time of day one hour back or forward |
| `-` and `=` | Time slower or faster (1x is a 20 minute day, 200x a day in 6 seconds); `-` at 1x stops the clock |

## ✨ Key Features

*   **Seeded World** (docs/worldgen.md):
    *   **Biomes**: Meadow, birch and oak woods, cedar forest, pine forest, bamboo and sakura groves, wetland, rocky hills, alpine snow and beaches, laid out by climate noise with ragged borders. A cedar and sakura belt rings Tempest, the south is dense forest, the east climbs to snow-capped mountains and the west ends at a sea.
    *   **Rivers and ponds**: Meandering rivers that widen towards the coast, with sand and gravel banks and reed beds; ponds in the wetlands.
    *   **Roads and bridges**: Six roads link the zones gate to gate, bend gently, change from cobblestone to path to dirt with distance from civilisation, level the ground they cross and carry fence-post lanterns every 64 blocks. Where a road meets a river it becomes a plank bridge with rails and log piers.
    *   **Zone edges**: The old cliffs at the borders of Bosse and Amestris are gone: each zone's ground blends into the wilderness over its outer band.
    *   **Vegetation**: Oak, birch, pine, cedar, sakura and bamboo, undergrowth, fallen logs, boulders, mushrooms and wildflowers, placed so a tree that crosses a chunk border is the same in both chunks.
*   **Zones** (docs/engine.md):
    *   **Zone System**: Each anime world is encapsulated in its own module, allowing for infinite expansion of new themes without cluttering the core logic.
    *   **Atmosphere Control**: Each zone dictates its own fog color, density, and lighting, which blend smoothly as you travel.
*   **Day and Night** (docs/sky.md, docs/light.md):
    *   **Cycle**: A 20 minute day with a moving sun and moon, dawn and dusk colours, stars, and baked sky light that fades to night while lanterns keep shining. Each zone's `skyTint`, `fogColor` and `fogDensity` shape the sky and the fog.
    *   **Smooth light**: Sky light and block light are baked into the chunk meshes with ambient occlusion, so time of day re-meshes nothing.
    *   **Biome Blending**: Grass and foliage colors interpolate between zones (e.g., from clear blue SAO skies to industrial Amestris smog).
*   **Blocks** (docs/textures.md, docs/models.md):
    *   **Textured**: Pixel-art tiles generated in code for every block, packed in one texture array, with grass sides, tinted leaves and animated water.
    *   **Shaped blocks**: Stairs in eight orientations, slabs, fences and panes that join their neighbours, plants, crops and small props, each with its own collision box; the player steps up stairs and slabs.
*   **Performance** (docs/renderer.md, docs/perf-after-integration.md): Face-culled chunk meshes built in web workers, 8 chunks of render distance, an upload budget per frame, and 60 fps with no frame over 50 ms on the benchmark flythrough and the soak.

## 🛠️ Development

```bash
npm run dev         # start the game at http://localhost:3000
npm run typecheck   # TypeScript, no emit
npm test            # Vitest unit tests (tests/)
PERF_TOLERANCE=4 npm test   # same, with the wall-clock limits multiplied (what CI uses on slow runners)
npm audit --omit=dev   # dependency check for what ships, see docs/dependencies.md
npm run bench       # scripted flythrough in headless Chrome, needs the dev server running
npm run textures:sheet   # dump the texture catalog to docs/screens/p3/catalog.png
npm run bench -- --smoke   # loads the real game, lands the player, walks forward, presses F4 and ] to check the sky keys, reports page errors
npm run bench -- --soak    # 90 s closed-loop walk, prints geometry and triangle counts every 5 s (?bench=soak&soakSeconds=260 for a longer one)
npm run map         # biome, road and block maps of the generated world into docs/maps/ (docs/worldgen.md#tools)
npx vite-node tools/bench-generators.ts   # chunk generation time, new generator against the legacy one
npm run bench -- --shot docs/screens/p2/spawn.png --url "http://localhost:3000/?shot=0,10,300,0,0"
node bench/shots.mjs --prefix before --url http://localhost:3000   # every viewpoint in bench/viewpoints.json
node bench/shots.mjs --prefix world --dir docs/screens/p3 --url http://localhost:3000   # the same, into another folder
npm run bench -- --shot docs/screens/p3/blocks.png --url "http://localhost:3000/?sandbox=blocks"   # block sandbox screenshot
npm run bench -- --shot docs/screens/p5/night-spawn.png --url "http://localhost:3000/?shot=0,10,300,0,0&sky=night"   # the same view at night
```

Screenshot mode: `/?shot=x,y,z,yawDeg,pitchDeg` parks the camera, hides the HUD and sets `window.__SHOT_READY__` when the world has loaded. Yaw 0 looks toward -z and positive yaw turns left; positive pitch looks up. `--shot <file.png>` waits for that flag and saves a 1280x800 PNG. Soak mode: `/?bench=soak` (or `npm run bench -- --soak`) records `gl.info` memory and render counters, plus the world renderer's own stats, into `result.soak`.

Time of day: the sky runs a 20 minute day starting at 09:00 (see [docs/sky.md](docs/sky.md)). `/?sky=dawn|noon|dusk|night|twilight|cycle` picks a preset, `/?time=18:30` (or `7.5`) starts at an hour and stops there, `&sky=cycle` or `&speed=0..3` lets it run, `&daylength=seconds` changes the length of the day. `?shot` pages default to `sky=noon`; `?bench` runs the live cycle. `/?daylight=0..1` overrides only how much baked sky light the chunks show (1 is noon, 0 the darkest night) and leaves the sky and fog on the clock. Block light (lanterns, crystals) is never scaled by the time of day.

Block sandbox: `/?sandbox=blocks` replaces the game with every registered block as a labelled cube on a grid under fixed neutral light, plus the grass and leaves under each zone's biome tint; drag to orbit. `&view=close` shows a few materials up close, `&focus=wood_plank,marble` any blocks by short name, `&cam=px,py,pz,tx,ty,tz` sets the camera. It raises `window.__SHOT_READY__` like `?shot`, so `--shot` works on it (see [docs/textures.md](docs/textures.md#block-sandbox)).

CI (`.github/workflows/ci.yml`) runs typecheck, tests and the build on every pull request and push to main. Dependency audit results and what remains are in [docs/dependencies.md](docs/dependencies.md).

Tempest sandbox: `/?sandbox=blocks&view=tempest` lists the 72 Tempest blocks (ids 128 to 199) in id order, `&view=street` shows a street built from them, `&night=1` bakes the block light in and shows any view at night, and `&fov=60` with `&cam=` gives eye-level shots (see [docs/tempest-blocks.md](docs/tempest-blocks.md#sandbox-pages)).

Kit viewer: `/?sandbox=kits` shows buildings drawn by kits on flat ground through the real mesher and baked light, one demonstration set by default; `&kit=timber-house&variant=1`, `&row=roof-study` (every variant side by side), `&sky=noon|dusk|night`, `&view=iso|front|back|side|top|eye` and `&family=plaster-dark` choose what you see, and it raises `__SHOT_READY__` like the others (see [docs/tempest.md](docs/tempest.md#the-kit-viewer)). `npx vite-node tools/render-tempest-layout.ts` draws the Tempest layout as a map, and `npx vite-node tools/render-tempest-map.ts` the district planner's plan, the whole zone and (with `--ground`) the top block of every column ([docs/tempest.md](docs/tempest.md#the-maps)); `npx vite-node tools/bench-tempest-zone.ts` times a chunk of the zone in node.

Model sandbox: `/?sandbox=models` shows every block model in every state (stairs in all eight, slabs top and bottom, how fences and panes join their neighbours, plants and the rest), labelled, plus a small house built from stairs, slabs, fences and panes. `&view=close`, `&view=joins` and `&view=house` frame parts of it and `&cam=px,py,pz,tx,ty,tz` sets the camera; it raises `__SHOT_READY__` too (see [docs/models.md](docs/models.md#model-sandbox)).

Open `/?bench` in a browser to run the same flythrough by hand. Baseline numbers and how to read them are in [docs/perf-baseline.md](docs/perf-baseline.md); the results after the Phase 2 rebuild are in [docs/perf-after-p2.md](docs/perf-after-p2.md) and after the textures in [docs/perf-after-p3.md](docs/perf-after-p3.md). The generated world (noise, zones, biomes, rivers, roads, how it is wired into the game) is in [docs/worldgen.md](docs/worldgen.md) and what it costs in [docs/perf-after-integration.md](docs/perf-after-integration.md). The block and chunk layer is described in [docs/engine.md](docs/engine.md), the mesher in [docs/meshing.md](docs/meshing.md), baked sky and block light, smooth lighting, the worker's chunk cache and the lit materials in [docs/light.md](docs/light.md), the day/night clock, sky dome, fog and zone atmosphere in [docs/sky.md](docs/sky.md) (measured in [docs/perf-after-p5.md](docs/perf-after-p5.md)), the block models (stairs, slabs, fences, panes, plants) in [docs/models.md](docs/models.md), player collision and stepping in [docs/collision.md](docs/collision.md), the renderer and workers in [docs/renderer.md](docs/renderer.md), the block textures, the texture array and the material in [docs/textures.md](docs/textures.md), the Tempest city's blocks (ids 128 to 199: what each is, its model, its light) in [docs/tempest-blocks.md](docs/tempest-blocks.md), and the Tempest layout, the structures library, how to write a building kit, and the district planner, the zone and the countryside in [docs/tempest.md](docs/tempest.md).

The world is meshed in web workers, so `npm run dev` and `vite build` both bundle `meshing/mesh.worker.ts`; nothing extra to run. The `--smoke` run also checks that the page reports no errors.

## 🗺️ Plan and progress

VoxelVerse is partway through a rebuild. The goal is to make **Tempest and the wilderness around it** as detailed as the engine allows (textured blocks, shaped blocks, baked light, a living world), and then use that zone as the template for the other six. The rebuild runs in ten phases. Each phase ends with typecheck, tests, build and a benchmark or screenshots, and is checked by an independent review before it counts as done. Details for each piece are in `docs/`.

| Phase | What | Status |
| --- | --- | --- |
| P0 | Baseline and safety net: scripts, tests, a scripted flythrough benchmark, the starting numbers ([perf-baseline](docs/perf-baseline.md)) | Merged |
| P1 | Voxel core: block registry, chunks, `VoxelWorld`, an adapter for the old zones ([engine](docs/engine.md)) | Merged |
| P2 | Worker chunk renderer: face-culled meshes built in web workers, render distance 3 to 8 ([renderer](docs/renderer.md), [meshing](docs/meshing.md), [results](docs/perf-after-p2.md)) | Merged (PR #2) |
| P3 | Generated textures: 16x16 tiles in a mipmapped texture array, block sandbox ([textures](docs/textures.md)) | Merged (PR #2) |
| P4 | Shaped blocks and box collision: stairs, slabs, fences, panes, plants, stepping ([models](docs/models.md), [collision](docs/collision.md)) | Verified, in the next PR |
| P5 | Baked sky and block light, ambient occlusion, a 20 minute day and night cycle ([light](docs/light.md), [sky](docs/sky.md)) | Verified, in the next PR |
| P6 | Terrain, biomes, rivers and roads: seeded noise, zone blending, six roads with bridges ([worldgen](docs/worldgen.md)) | Merged (PR #1), connected to the game in the next PR |
| P7 | Tempest city: style pack, district planner, building kits, landmarks, interiors | In progress: step 7.1a, the block set (72 blocks, ids 128 to 199, 63 tiles, one new model), step 7.1b, the structure infrastructure (blueprints, the builder with curved-eave roofs, style packs, lots and kits, the Tempest layout from the owner's plan, the kit viewer), and step 7.2a, the district planner and `TempestCityZone` (about 290 lots, streets, lamps, the river, farms, pastures and forest, not yet connected to the game), are done ([tempest-blocks](docs/tempest-blocks.md), [tempest](docs/tempest.md)) |
| P8 | Living world: swaying foliage, animated water, fireflies, petals, smoke | Not started |
| P9 | Zone template: a guide for building a zone from a style pack and kits, Greensom ported as the test | Not started |

### Where things stand

- **Merged to `main`:** P0 to P3 and P6 (PR #1 and PR #2). The game on `main` still runs the old terrain, because the new generator was merged but not yet connected.
- **In the next PR:** P4 and P5, textures for the 23 nature blocks, the new generator running the game (biomes, rivers, roads, smooth zone edges), and this README.
- **Speed:** on the benchmark flythrough (production build, Apple M4, headless Chrome, 8 chunks of render distance) the game holds 60 fps with no frame over 50 ms. Before the rebuild, jumping ran at 9.7 fps with 189 ms frames ([results](docs/perf-after-integration.md)). Headless Chrome caps at 60 fps, so this shows the frame budget is met, not how much headroom is left.
- **Tests:** about 1,840 unit tests cover the voxel core, mesher, worker pool, textures, models, collision, light, sky, terrain, biomes and roads, the Tempest blocks, blueprints, builder, kits and layout, and compare the new world with the old one.

### What comes next

1. **Tempest city (P7):** the style pack is a block set (dark timber, white plaster, five roofs led by terracotta, paper and stone lanterns, bamboo and sakura: [docs/tempest-blocks.md](docs/tempest-blocks.md)), and the machinery to build with it is in: blueprints, a builder with curved-eave roofs, lots and kits, the layout of the town (the owner's plan: an avenue grid with diagonals, the civic compound, zoning, landmarks and the gates the roads need) and the kit viewer ([docs/tempest.md](docs/tempest.md)). The district planner and the zone (`worldgen/tempest/TempestCityZone.ts`) are written and tested, with the box house standing in for every building: it cuts the blocks into lots, lays the streets, lamps and trees, carves the river and ponds, plants the farms and forest, and builds any kit registered for a lot or landmark. Still to do are the building kits (townhouse, shop, inn, workshop, warehouse, villa), the hand-built landmarks (Town Hall, arena, gates, cave, bridge), house interiors, and connecting the zone to the game.
2. **Living world (P8):** foliage sway, animated water, pooled particles and lantern flicker.
3. **Zone template (P9):** `docs/zone-authoring.md`, with Greensom as the first zone built from it. The Town of Beginnings, Amestris, Bosse, Fremmevilla and Magnolia follow, in that order.

### Known issues

- Bosse, Fremmevilla and Magnolia are still small placeholders inside, and Amestris is basic. The new terrain blends them into the land, but their interiors wait for the zone template.
- A few timing-sensitive unit tests can fail when the machine is heavily loaded and pass on a rerun.
- The Phase 2 rule that the soak's geometry count stays within 10 percent of its 30 second value does not hold literally on the new scenery, because the soak loop passes through varied terrain. The count returns to the same peaks and troughs lap after lap ([explanation](docs/perf-after-integration.md)).
- JS heap use is higher than before the textures (about 120 to 200 MB while walking), because textured vertices are larger.

### Not planned in this rebuild

NPCs, dungeons, combat, breaking and placing blocks, sound and multiplayer. The engine does not stop any of them, and they remain the long-term goals:

- **NPCs:** blocky characters, behaviour state machines, themed spawning (knights, slimes, alchemists).
- **Dungeons:** swapping to dungeon scenes, 100-floor generation, mobs and combat.

---

*Built with React, Three.js, and React Three Fiber.*
