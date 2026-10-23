
# VoxelVerse: Anime Worlds

**VoxelVerse** is an ambitious open-world procedural voxel exploration engine built with React Three Fiber. It features an infinite world inspired by iconic fantasy anime settings, where every zone offers a distinct atmosphere, architectural style, and biome.

## 🌍 The World

The world is generated procedurally using noise functions and a custom "Zone System" that blends different thematic areas seamlessly.

### Current Zones
1.  **Greensom Village (Spawn)**: A humble starting area with a central well, detailed cottages, farming plots, and a meandering stream.
2.  **Town of Beginnings (Center)**: Inspired by *Sword Art Online*. A classic medieval city with white plaster/timber houses and a massive central tower.
3.  **Federation of Tempest (East)**: Inspired by *That Time I Got Reincarnated as a Slime*. A lush, magical forest city with Japanese-fusion architecture and paved stone roads.
4.  **Amestris District (West)**: Inspired by *Fullmetal Alchemist*. An industrial zone with red factory bricks, smoggy grey skies, and iron structures.
5.  **Kingdom of Bosse (North)**: Inspired by *Ranking of Kings*. A heavenly, golden-tinted realm with marble castle walls and gold spires.
6.  **Kingdom of Fremmevilla (North-East)**: Inspired by *Knights & Magic*. A high-fantasy mecha kingdom featuring massive stone hangars and steel beam construction.
7.  **Magnolia Town (South-West)**: Inspired by *Fairy Tail*. A vibrant, European-style guild town with light wood architecture and a magical pink atmosphere.

## 🎮 Controls

*   **W / A / S / D**: Move Character
*   **Mouse**: Look Around
*   **Space**: Jump
*   **Click**: Lock Mouse Cursor

## ✨ Key Features

*   **Infinite Procedural Terrain**: Rolling hills, mountains, and rivers generated on the fly.
*   **Modular Architecture**:
    *   **Zone System**: Each anime world is encapsulated in its own module, allowing for infinite expansion of new themes without cluttering the core logic.
    *   **Atmosphere Control**: Each zone dictates its own fog color, density, and lighting, which blend smoothly as you travel.
*   **Dynamic Atmosphere**:
    *   **Day/Night Cycle**: Real-time sun orbit, changing shadows, and ambient lighting.
    *   **Biome Blending**: Grass and foliage colors interpolate between zones (e.g., from clear blue SAO skies to industrial Amestris smog).
*   **Organic World Generation**:
    *   **Roads**: Paths wander organically using noise-based dithering and change materials based on distance from civilization.
    *   **Vegetation**: Procedural placement of trees (Oak, Birch, Pine), flowers, and crops.
*   **Visual Fidelity**:
    *   **Custom Shaders**: Procedural noise textures, edge darkening (AO), and directional material logic (Dirt sides on Grass blocks).
    *   **Optimized Rendering**: Face-culled chunk meshes built in web workers, 8 chunks of render distance, upload budget per frame (see docs/renderer.md).

## 🛠️ Development

```bash
npm run dev         # start the game at http://localhost:3000
npm run typecheck   # TypeScript, no emit
npm test            # Vitest unit tests (tests/)
npm run bench       # scripted flythrough in headless Chrome, needs the dev server running
npm run textures:sheet   # dump the texture catalog to docs/screens/p3/catalog.png
npm run bench -- --smoke   # loads the real game, lands the player, walks forward, reports page errors
npm run bench -- --soak    # 90 s closed-loop walk, prints geometry and triangle counts every 5 s
npm run bench -- --shot docs/screens/p2/spawn.png --url "http://localhost:3000/?shot=0,10,300,0,0"
node bench/shots.mjs --prefix before --url http://localhost:3000   # every viewpoint in bench/viewpoints.json
node bench/shots.mjs --prefix world --dir docs/screens/p3 --url http://localhost:3000   # the same, into another folder
npm run bench -- --shot docs/screens/p3/blocks.png --url "http://localhost:3000/?sandbox=blocks"   # block sandbox screenshot
```

Screenshot mode: `/?shot=x,y,z,yawDeg,pitchDeg` parks the camera, hides the HUD and sets `window.__SHOT_READY__` when the world has loaded. Yaw 0 looks toward -z and positive yaw turns left; positive pitch looks up. `--shot <file.png>` waits for that flag and saves a 1280x800 PNG. Soak mode: `/?bench=soak` (or `npm run bench -- --soak`) records `gl.info` memory and render counters, plus the world renderer's own stats, into `result.soak`.

Block sandbox: `/?sandbox=blocks` replaces the game with every registered block as a labelled cube on a grid under fixed neutral light, plus the grass and leaves under each zone's biome tint; drag to orbit. `&view=close` shows a few materials up close, `&focus=wood_plank,marble` any blocks by short name, `&cam=px,py,pz,tx,ty,tz` sets the camera. It raises `window.__SHOT_READY__` like `?shot`, so `--shot` works on it (see [docs/textures.md](docs/textures.md#block-sandbox)).

Open `/?bench` in a browser to run the same flythrough by hand. Baseline numbers and how to read them are in [docs/perf-baseline.md](docs/perf-baseline.md); the results after the Phase 2 rebuild are in [docs/perf-after-p2.md](docs/perf-after-p2.md) and after the textures in [docs/perf-after-p3.md](docs/perf-after-p3.md). The block and chunk layer is described in [docs/engine.md](docs/engine.md), the mesher in [docs/meshing.md](docs/meshing.md), the block models (stairs, slabs, fences, panes, plants) in [docs/models.md](docs/models.md), player collision and stepping in [docs/collision.md](docs/collision.md), the renderer and workers in [docs/renderer.md](docs/renderer.md), and the block textures, the texture array and the material in [docs/textures.md](docs/textures.md).

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
