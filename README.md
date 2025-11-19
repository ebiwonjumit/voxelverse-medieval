
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
    *   **Optimized Rendering**: Column-Major generation and InstancedMesh for high performance.

## 🗺️ Development Roadmap

### Stage 1: Environmental Distinctiveness (Completed)
**Goal:** The player should know where they are just by looking at the sky, lighting, and terrain colors.

- [x] **Zone System Architecture:** Modular file structure & optimizations.
- [x] **Dynamic Atmosphere:** Zone-specific fog and sky tint blending.
- [x] **Biome Blending:** Smooth transitions for ground blocks and foliage colors.
- [x] **Visual Fidelity:** Shaders for textures, AO, and material variations.

### Stage 2: Zone Detailing & Visual Polish (Current Focus)
**Goal:** Approach each zone sequentially to define its identity with specific props and details.

- [ ] **Greensom Village:** Crops, fences, well details.
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
