
# VoxelVerse Development Roadmap

## Stage 1: Environmental Distinctiveness (Completed)
**Goal:** The player should know where they are just by looking at the sky, lighting, and terrain colors, not just the block types.

- [x] **Zone System Architecture:**
    - [x] Implement object-oriented zone management.
    - [x] **Refactor:** Modular file structure (one file per zone).
    - [x] **Optimization:** Column-based generation and Level of Detail (LOD) culling.
- [x] **Anime Zones:** SAO, Greensom, Tempest, Amestris, Bosse, Fremmevilla, Magnolia.
- [x] **Dynamic Atmosphere:** Implement zone-specific `AtmosphereSettings` (fog color, sky tint) and ensure smooth transitions between them.
- [x] **Biome Blending:** Smooth transitions for ground blocks and foliage colors based on zones.
- [x] **Road Refinement:** Organic dithering edges and material transitions.
- [x] **Visual Fidelity:**
    - [x] Procedural noise textures for all blocks.
    - [x] Edge darkening (Ambient Occlusion simulation).
    - [x] "Grass Top / Dirt Side" shader logic.

## Stage 2: Zone Detailing & Visual Polish (Current Focus)
**Goal:** Approach each zone sequentially to define its identity with specific props, architecture, and organic details.

### Zone 1: Greensom Village (Spawn)
- [x] **Vegetation:** 3D crops (wheat stages), varying tall grass density, lily pads in river.
- [ ] **Architecture:** Porches, chimneys, flower boxes, well details.
- [ ] **Props:** Wooden fences, lanterns on posts, crates.

### Zone 2: Town of Beginnings (SAO)
- [ ] **Plaza:** Market stalls, central fountain, benches, paving patterns.
- [ ] **The Great Tower:** Intricate entrance arch, procedural interior (ground floor).
- [ ] **Walls:** Gate mechanisms, battlements, flags.

### Zone 3: Federation of Tempest
- [ ] **Roads:** Paved stone texture with custom patterns.
- [ ] **Architecture:** Japanese-style curved roofs, sliding doors, tatami mats.
- [ ] **Lighting:** Magic ore lanterns (glowing blue/green).

### Zone 4: Amestris District
- [ ] **Industry:** Smokestacks with particle effects, piping systems, storage tanks.
- [ ] **Atmosphere:** Dense smog, darker lighting.

### Zone 5: Kingdom of Bosse
- [ ] **Royalty:** Marble textures, gold trim, giant pillars.
- [ ] **Terrain:** Perched on a high plateau/cliff.

### Zone 6: Fremmevilla & Magnolia
- [ ] **Fremmevilla:** Massive hangar doors, steel scaffolding, cranes.
- [ ] **Magnolia:** Canal systems, bridges, guild flags.

## Stage 3: The "Living" World (NPCs)
**Goal:** Populate the world with inhabitants relevant to their zones.

- [ ] **NPC Primitives:** Create `Villager` component using simple box geometries.
- [ ] **State Machines:** Implement `Idle`, `Wander`, `LookAtPlayer`, and `Flee` behaviors.
- [ ] **Zone Spawning:**
    - Knights in SAO.
    - Goblins/Slimes in Tempest.
    - State Alchemists in Amestris.

## Stage 4: The Dungeon System
**Goal:** The core gameplay loop.

- [ ] **Dimension Swapping:** Unload Overworld / Load Dungeon Scene when entering a portal.
- [ ] **Procedural Layouts:** Generate rooms and corridors for 100 floors.
- [ ] **Mob Spawning:** Logic for enemy encounters.
