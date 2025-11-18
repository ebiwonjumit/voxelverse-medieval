# VoxelVerse Development Roadmap

## Stage 1: Environmental Distinctiveness (Current Focus)
**Goal:** The player should know where they are just by looking at the sky, lighting, and terrain colors, not just the block types.

- [x] **Zone System Architecture:**
    - [x] Implement object-oriented zone management.
    - [x] **Refactor:** Modular file structure (one file per zone).
    - [x] **Optimization:** Column-based generation and Level of Detail (LOD) culling.
- [x] **Anime Zones:**
    - [x] SAO (Start): Standard blue skies, medieval architecture.
    - [x] Greensom (New Spawn): Clear skies, humble village, dirt roads.
    - [x] Tempest (East): Greenish magic fog, Japanese/Fantasy fusion.
    - [x] Amestris (West): Industrial smog, grey skies, factory bricks.
    - [x] Kingdom of Bosse (North): Bright heavenly gold/white atmosphere, castle architecture.
    - [x] Kingdom of Fremmevilla (NE): Cool blue tech atmosphere, massive steel hangars (Knights & Magic).
    - [x] Magnolia Town (SW): Pink magic vibe, European guild architecture (Fairy Tail).
- [x] **Dynamic Atmosphere:** Implement zone-specific `AtmosphereSettings` (fog color, sky tint) and ensure smooth transitions between them.
- [x] **Biome Blending:** Smooth transitions for ground blocks and foliage colors based on zones.
- [x] **Road Refinement:** Organic dithering edges and material transitions based on distance.

## Stage 2: Structural Complexity
**Goal:** Cities should feel organic and lived-in, not just placed on a grid.

- [ ] **Road Networks (Advanced):** Implement "Random Walker" algorithms for winding paths within cities.
- [ ] **Density Maps:** Use noise to determine city centers (tall buildings) vs outskirts (cottages).
- [ ] **Interiors:** Logic to carve out hollow rooms inside procedural houses.
- [ ] **Props:** Add fences, lamp posts, and market stalls.

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