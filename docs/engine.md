# Voxel core

Phase 1 of the rebuild plan added a block and chunk layer under the game. The player and the HUD read from it on the main thread, and since Phase 2 the mesh workers build chunks from the same generator, which since the integration step is the Phase 6 generator ([worldgen.md](worldgen.md#wired-into-the-game)). How they get on screen is in [renderer.md](renderer.md).

## Layout

| Folder | What is in it |
| --- | --- |
| `engine/` | Voxel core: `coords`, `cell`, `BlockRegistry`, `Chunk`, `ChunkStore`, `VoxelWorld`, the `WorldGenerator` interface, box `collision` ([collision.md](collision.md)) and `spawn` (`standingEyeY`, the eye height for standing on a column). No Three.js, no React. `engine/models/` holds the block models, see [models.md](models.md). |
| `content/` | Block definitions. `blocks.ts` registers the legacy blocks (ids 0 to 47), then calls `registerNatureBlocks` (`blocksNature.ts`, ids 48 to 79) for the wilderness, `registerShapedBlocks` (`blocksShaped.ts`, the stairs, slabs and pane at ids 80 to 92) and `registerTempestBlocks` (`blocksTempest.ts`, the 72 blocks of the city at ids 128 to 199, see [tempest-blocks.md](tempest-blocks.md); the smoke vent at id 200 comes with the living-world effects, see [effects.md](effects.md); ids 201 to 255 are still free). `content/textures/` holds the generated pixel-art tiles, see [textures.md](textures.md). |
| `meshing/` | Pure chunk mesher, the light engine and the mesh worker pool, worker-safe. See [meshing.md](meshing.md) and [light.md](light.md). |
| `render/` | The Three.js chunk renderer and `SkySystem`, the day/night clock, sky dome and fog. See [renderer.md](renderer.md) and [sky.md](sky.md). |
| `worldgen/` | Things that implement `WorldGenerator`. `VoxelverseGenerator` is the Phase 6 generator described in [worldgen.md](worldgen.md): biomes, rivers, vegetation, roads and bridges between the zones, the legacy zone interiors inside them. It is what the game runs on (`createWorkerGenerator.ts` for the workers, `gameWorld.ts` for the main thread). `LegacyZoneAdapter` wraps the old zones alone and is kept as the reference the parity and timing tests compare against; the game does not use it. |
| `worldConstants.ts` | Numbers and enums (`BlockType`, `LodLevel`) with no Three.js import, so generation can run in a worker. `constants.ts` re-exports them and adds the Three.js vectors. |
| `gameWorld.ts` | The `voxelWorld`, `blockRegistry` and `worldGenerator` (a `VoxelverseGenerator`) the game uses on the main thread. |

`engine/` never imports from `worldgen/`, `content/` or `zones/` (a test checks it). `meshing/` reads the engine but, like it, has no Three.js or DOM. The generator is passed in.

## World shape

- Chunks are 32 x 32 blocks, split into 16 sections of 16 blocks.
- Height runs from y = -64 to y = 191. A section is only allocated when something that is not air is written to it.
- Terrain height is clamped to y = -48 through 120. The old coast sank forever and the old mountains rose forever, so this keeps both inside the world and leaves 70 blocks of room for the Great Tower.

## Cells

One cell is a `Uint16`: the low 12 bits are the block id (0 to 4095), the high 4 bits are the block state (0 to 15). What the state means belongs to the block's model: a slab's half, a stair's facing and half. Models that only look different next to other blocks (fences, panes) store nothing, see [models.md](models.md).

What the state bits mean, per model (`engine/models/`, details and the quads each produces in [models.md](models.md)):

| Model | Bits | Meaning |
| --- | --- | --- |
| `CubeModel` (no model) | none | ignored |
| `SlabModel` | bit 0 | 0 fills the lower half, 1 the upper half |
| `StairModel` | bits 0-1, bit 2 | facing, the way you climb (the tall back is on that side): 0 north (-z), 1 east (+x), 2 south (+z), 3 west (-x); bit 2 set is upside down. Build it with `stairState(facing, upsideDown)` |
| `FenceModel`, `PaneModel` | none | which sides they join is read from the four neighbours whenever the block is meshed or bumped into, never stored |
| `CrossModel`, `CropModel`, `BoxModel`, `PlateModel` | none | one look each (a crop's growth stage is a block of its own) |
| `OrientedBoxModel` | bits 0-1 | quarter turns clockwise from how the boxes are written, 0 to 3: a ridge cap with its horn, an awning, a curtain, a sign. The texture turns with the boxes |

A model ignores state bits it does not use, so a stray bit never changes anything. Bit 3 of a stair's state and bits 1 to 3 of a slab's are unused today; a model that starts using bits must say so in this table. A new model kind declares its states here and in [models.md](models.md), and shows up in `?sandbox=models` by itself.

## Blocks

`BlockRegistry` holds a `BlockDef` per block: id, name, flat colour, `solid`, `opaque`, `emits`, and optionally `lightDim`, `faces`, `tint`, `model`, `holdsWater` `sway` (how far the wind moves it, 0 to 1, see [effects.md](effects.md)), `fx` (a set of `BlockFx` bits from `engine/blockFx.ts`: which living-world effects start from the block) and `flicker` (how strongly its glow flickers, 0 to 1). The legacy blocks keep their old `BlockType` numbers as ids, so the old zones work without changes. Registration rejects duplicate ids and names, any colour that is not `#rrggbb`, a `faces` object with a missing name and a `tint` other than `grass` or `foliage`.

### Light

`emits` (0 to 15) is the block light a block gives off and `opaque` decides whether it stops light. `lightDim` (0 to 15, default 0) is how much a see-through block soaks up: leaves use 1, so they shade what is under them. `registry.emission(id)` and `registry.lightDim(id)` are the table lookups the light engine uses. The rules and the engine are in [light.md](light.md).

### Textures on blocks

```ts
faces?: { top: string; bottom: string; side: string };  // names from the texture catalog
tint?: 'grass' | 'foliage';
```

`faces` names a tile for the top, the bottom and the four sides. The engine only carries the names; `render/AtlasBuilder.ts` and `engine/TextureLayout.ts` turn them into texture array layers (see [textures.md](textures.md)). All 47 legacy blocks except air have faces, assigned in `content/blocks.ts` (grass is `grass_top` / `dirt` / `grass_side`, logs are `log_top` on both ends and `log_side` around). Blocks with a model (fences, flowers, crops, stairs) wear those tiles on the faces of their shape; ones drawn as a single picture (flowers, crops, fences) use one tile on every face.

A block with no `faces`, or whose face names a tile the catalog does not have, is drawn as a full cube in a flat tile of its registry `color`. That is the contract for blocks added by other branches: register an id and a colour and it shows up, textured later. The layout records unknown names in `layout.missing`.

`tint` says which biome colour multiplies the block's tintable faces: `grass` is the zone blend, `foliage` is the same blend times 0.7 (as the old leaves were). A face is only tinted if its tile takes a tint (grey tiles flagged `tint` in the catalog), so grass gets it on the top and the side fringe but not on the dirt bottom, and oak leaves get it everywhere. Birch and pine leaves are not tinted, as before.

### Models

```ts
model?: BlockModel;      // default: a plain cube
holdsWater?: boolean;    // the cell also holds a cube of water (a lily pad)
sway?: number;           // 0..1, how far the wind moves the block (leaves, grass, bamboo); visual only
fx?: number;             // BlockFx bits: PETALS, HABITAT, SMOKE, LAMP, EMBERS; where particles start from; visual only
flicker?: number;        // 0..1, how strongly the block's own glow flickers (a lantern 0.5, a hearth 1); visual only
```

`model` says what the block looks like, where it can be bumped into and which sides of its cell it covers. A block with no model, and any block whose id the registry does not know, is a cube, so a block added by another branch with only an id and a colour still draws as a full cube in its flat colour. `registry.model(id)` is the lookup. `opaque` now means "a solid material that hides the faces of neighbours it covers": a stair is opaque but only hides what its model covers. Models, their state bits and how faces are culled against them are in [models.md](models.md).

## Querying blocks

```ts
import { voxelWorld } from './gameWorld';

voxelWorld.getBlock(x, y, z);   // block id
voxelWorld.getState(x, y, z);   // state 0..15
voxelWorld.isSolid(x, y, z);
voxelWorld.loadChunk(cx, cz);   // generate and keep a chunk
voxelWorld.unloadChunk(cx, cz);
```

Loaded chunks answer from their stored cells. Anything else, which means a chunk that is not loaded or a height outside the world, is answered by the generator one block at a time. So the player's collision checks never cause a chunk to be generated. Collision reads whole cells through `getCell`, so it sees block models and their state, not only the solid flag.

## Generator interface

`generateChunk(chunk, options?)` takes an optional `{ lod }`: `LodLevel.HIGH` (the default) or `LodLevel.LOW`, which a generator may use to leave out small detail that nobody can see from far away. `VoxelWorld.loadChunk` and the parity tests use the default. The mesh workers pass HIGH within 2 chunks of the player and LOW beyond. `sampleBlock` always answers at full detail. A generator may also implement `sampleCell(x, y, z)`, the whole cell with its state, which the mesher uses for the ring around a chunk and `VoxelWorld.getCell` for unloaded chunks; without it the state of those cells reads as 0. `VoxelverseGenerator` implements it (zones answer `getCell`), because the Tempest city places stairs, awnings and ridge horns whose facing must survive a chunk border; the legacy zones place none.

## Legacy adapter

The game no longer uses it (see [worldgen.md](worldgen.md#wired-into-the-game)); it stays as the reference that the Phase 6 generator's zone cores are checked against, and these parity tests keep guarding the zones themselves. `LegacyZoneAdapter` fills a chunk exactly the way `getBlockAt` answers a single block (at HIGH detail; at LOW it passes `LodLevel.LOW` to the zones, which then skip lanterns, crops, lily pads and the like): stone below the ground, water above it up to the water level, and the zone's own blocks from the ground up to 64 blocks above. Tests compare it with the old function:

- 10,000 random points across 50 chunks, including the coast and mountains.
- Every block above the ground in 12 landmark chunks (the Great Tower, Greensom, Bosse, Fremmevilla, Magnolia and, before step 7.5, Tempest's Coliseum and Town Hall), more than 500,000 comparisons. Tempest is no longer compared with the adapter, since the game's Tempest is the city zone; the old zone is still the legacy adapter's Tempest.
- 5,000 points in chunks that are not loaded.

## Meshing and rendering architecture

The whole path from block data to pixels, as of Phase 5 step 3 (baked light and the sky system):

```
main thread                                   worker (1 to 4)
-----------                                   ---------------
Player / bench / shot camera
  writes playerState {x, y, z}
SkyRig (React) -> SkySystem.update(dt, camera, player zone)
  clock -> sun, moon, daylight, sky colours, fog, zone atmosphere
World (React) -> ChunkRenderer.setDaylight / setSkyLightColor, ChunkRenderer.update(x, z)
  chunk of the player changed?
  yes: wanted ring = 8 chunks, LOD by ring
       MeshWorkerPool.request(cx, cz, lod) -->  mesh.worker.ts
                                                 ChunkCache: the chunk and its 8 neighbours
                                                   (VoxelverseGenerator.generateChunk (lod), kept in a small LRU)
                                                 computeChunkLight (sky and block light, 3x3 chunks)
                                                 NeighbourReader (chunk + 1 block ring from the neighbours)
                                                 meshChunk -> opaque / cutout / water
                                                   (texture layer, uv, tint and baked light per vertex)
  <-- MeshData, 21 buffers transferred      <--
  upload queue, 2 geometries per frame
  Mesh per bucket in ChunkRenderer.group, three shared materials sampling one texture array
  collision and HUD: voxelWorld (main thread, never generates chunks for rendering)
    Player: moveAABB(voxelWorld, player box, velocity * dt) against the block models, see collision.md
```

- **Two copies of the world, on purpose.** Workers generate the chunk they mesh and, for its light, the eight around it (cached per worker, see [light.md](light.md#the-worker)). The main thread keeps its own `VoxelWorld` for collision and the HUD, answered by the generator block by block, so physics never waits on rendering. Both build the same `VoxelverseGenerator` from the same seed, and the tests keep its `sampleBlock` and `generateChunk` identical and the two threads in agreement (`tests/worldgen/integration.test.ts`), which is why chunk borders meet without a seam.
- **Nothing on the main thread depends on height.** The renderer recomputes only when the player's chunk changes, so a jump sends no job and rebuilds nothing. The old renderer rebuilt every visible chunk because `playerY` was a React dependency.
- **Meshes are plain Three.js objects, not React.** `components/World.tsx` creates one `ChunkRenderer` and calls `update` from a frame hook. There is no per-chunk component, no instancing and no per-chunk material.
- **Faces are culled in the mesher** (a face is drawn unless the block beside it covers the side it looks at, which a model decides, see [models.md](models.md)), each vertex carries a layer of the block texture array, a uv, a biome tint and its baked light (sky, block light, ambient occlusion and glow, see [light.md](light.md)). Chunk materials are unlit and shade from that light with `uDaylight` and `uSkyLight` uniforms that the sky clock sets every frame, so there are no Three.js scene lights at all and day and night re-mesh nothing. The fog colour and distances come from the sky system (the time of day blended with the player's zone `fogColor` and `fogDensity`, never thinner than the render distance needs); the water wave is unchanged. See [sky.md](sky.md).
- **Budgets keep frames even.** At most 2 geometries are uploaded per frame, nearest chunk first. The job queue is ranked by distance to the player when a worker frees up. Chunks are dropped one chunk beyond the render distance (hysteresis) and their geometries disposed.
- **One layout, two builders.** The mesher writes texture layer numbers into vertices in a worker; the atlas builder fills the texture array on the main thread. Both build an `engine/TextureLayout` from the same catalog and registry (`content/textures/layout.ts`), which is deterministic, so layer numbers agree without passing any texture data to the worker. A test checks the layout is identical when built twice.
- **Layers.** `meshing/` and `engine/` import neither Three.js nor React (a test checks both), so a worker can load them. `render/` and `components/` are the only places that touch Three.js; `mesh.worker.ts` is the only file in `meshing/` that imports `content/` and `worldgen/`.

Details: [meshing.md](meshing.md) for the mesher, [renderer.md](renderer.md) for the pool and the Three.js side, [light.md](light.md) for baked light and [sky.md](sky.md) for the clock, the sky and the fog. Measured results against the baseline, with the soak and before and after screenshots, are in [perf-after-p2.md](perf-after-p2.md), and with the Phase 6 world in the game in [perf-after-integration.md](perf-after-integration.md).
- **A page to look at blocks.** `?sandbox=blocks` (`components/sandbox/`) meshes every registered block with the same `meshChunk`, layout, texture array and materials as the world and shows them on a grid under neutral light. It is selected in `App.tsx` before the game mounts and needs no world, workers or player. See [textures.md](textures.md#block-sandbox).
- **A page to look at models.** `?sandbox=models` (also in `components/sandbox/`, sharing the page code of the block sandbox) shows every block that has a model in every state, labelled, under the same neutral light, and a small house built from stairs, slabs, fences and panes. `&view=close`, `&view=joins` and `&view=house` frame parts of it. See [models.md](models.md#model-sandbox).
