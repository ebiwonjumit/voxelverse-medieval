
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

Model sandbox: `/?sandbox=models` shows every block model in every state (stairs in all eight, slabs top and bottom, how fences and panes join their neighbours, plants and the rest), labelled, plus a small house built from stairs, slabs, fences and panes. `&view=close`, `&view=joins` and `&view=house` frame parts of it and `&cam=px,py,pz,tx,ty,tz` sets the camera; it raises `__SHOT_READY__` too (see [docs/models.md](docs/models.md#model-sandbox)).

Open `/?bench` in a browser to run the same flythrough by hand. Baseline numbers and how to read them are in [docs/perf-baseline.md](docs/perf-baseline.md); the results after the Phase 2 rebuild are in [docs/perf-after-p2.md](docs/perf-after-p2.md) and after the textures in [docs/perf-after-p3.md](docs/perf-after-p3.md). The generated world (noise, zones, biomes, rivers, roads, how it is wired into the game) is in [docs/worldgen.md](docs/worldgen.md) and what it costs in [docs/perf-after-integration.md](docs/perf-after-integration.md). The block and chunk layer is described in [docs/engine.md](docs/engine.md), the mesher in [docs/meshing.md](docs/meshing.md), baked sky and block light, smooth lighting, the worker's chunk cache and the lit materials in [docs/light.md](docs/light.md), the day/night clock, sky dome, fog and zone atmosphere in [docs/sky.md](docs/sky.md) (measured in [docs/perf-after-p5.md](docs/perf-after-p5.md)), the block models (stairs, slabs, fences, panes, plants) in [docs/models.md](docs/models.md), player collision and stepping in [docs/collision.md](docs/collision.md), the renderer and workers in [docs/renderer.md](docs/renderer.md), and the block textures, the texture array and the material in [docs/textures.md](docs/textures.md).

The world is meshed in web workers, so `npm run dev` and `vite build` both bundle `meshing/mesh.worker.ts`; nothing extra to run. The `--smoke` run also checks that the page reports no errors.

## 🗺️ Development Roadmap

### Stage 1: Environmental Distinctiveness (Completed)
**Goal:** The player should know where they are just by looking at the sky, lighting, and terrain colors.

- [x] **Zone System Architecture:** Modular file structure & optimizations.
- [x] **Dynamic Atmosphere:** Zone-specific fog and sky tint blending.
- [x] **Biome Blending:** Smooth transitions for ground blocks and foliage colors.
- [x] **Visual Fidelity:** Shaders for textures, AO, and material variations.

### Stage 2: Zone Detailing & Visual Polish (Current Focus)
**Goal:** Approach each zone sequentially to define its identity with specific props and details.

- [x] **Greensom Village:** Crops, fences, well details.
- [ ] **Town of Beginnings:** Market stalls, fountains, tower interior.
- [ ] **Federation of Tempest:** Japanese roofing, stone pavements, lanterns.
- [ ] **Amestris District:** Smokestacks, pipes, storage tanks.
- [ ] **Bosse / Fremmevilla / Magnolia:** Unique architectural props.

### Stage 3: The "Living" World (NPCs)
**Goal:** Populate the world with inhabitants.

- [ ] **NPC Primitives:** Blocky character models.
- [ ] **State Machines:** AI behaviors (Idle, Wander, LookAtPlayer).
- [ ] **Themed Spawning:** Knights, Slimes, Alchemists unique to their zones.

### Stage 4: The Dungeon System
**Goal:** The core gameplay loop.

- [ ] **Dimension Swapping:** Seamless transition to Dungeon scenes.
- [ ] **Procedural Dungeons:** 100-floor generation logic.
- [ ] **Mob Spawning:** Enemy encounters and combat.

---

*Built with React, Three.js, and React Three Fiber.*
