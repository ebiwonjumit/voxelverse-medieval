# Voxel core

Phase 1 of the rebuild plan added a block and chunk layer under the game. The old renderer still draws the world the old way. Nothing but the player and the HUD reads from the new layer yet.

## Layout

| Folder | What is in it |
| --- | --- |
| `engine/` | Voxel core: `coords`, `cell`, `BlockRegistry`, `Chunk`, `ChunkStore`, `VoxelWorld` and the `WorldGenerator` interface. No Three.js, no React. |
| `content/` | Block definitions. `blocks.ts` registers the legacy blocks. |
| `meshing/` | Pure chunk mesher: turns a chunk into triangle lists in a worker-safe way. See [meshing.md](meshing.md). |
| `worldgen/` | Things that implement `WorldGenerator`. `LegacyZoneAdapter` wraps the old zones. |
| `worldConstants.ts` | Numbers and enums with no Three.js import, so generation can run in a worker. `constants.ts` re-exports them and adds the Three.js vectors. |
| `gameWorld.ts` | The `voxelWorld` and `blockRegistry` the game uses on the main thread. |

`engine/` never imports from `worldgen/` or `content/`. `meshing/` reads the engine but, like it, has no Three.js or DOM. The generator is passed in.

## World shape

- Chunks are 32 x 32 blocks, split into 16 sections of 16 blocks.
- Height runs from y = -64 to y = 191. A section is only allocated when something that is not air is written to it.
- Terrain height is clamped to y = -48 through 120. The old coast sank forever and the old mountains rose forever, so this keeps both inside the world and leaves 70 blocks of room for the Great Tower.

## Cells

One cell is a `Uint16`: the low 12 bits are the block id (0 to 4095), the high 4 bits are the block state (0 to 15). State is unused until shaped blocks arrive in Phase 4.

## Blocks

`BlockRegistry` holds a `BlockDef` per block: id, name, flat colour, `solid`, `opaque` and `emits`. The legacy blocks keep their old `BlockType` numbers as ids, so the old zones work without changes. Registration rejects duplicate ids and names, and any colour that is not `#rrggbb`.

## Querying blocks

```ts
import { voxelWorld } from './gameWorld';

voxelWorld.getBlock(x, y, z);   // block id
voxelWorld.getState(x, y, z);   // state 0..15
voxelWorld.isSolid(x, y, z);
voxelWorld.loadChunk(cx, cz);   // generate and keep a chunk
voxelWorld.unloadChunk(cx, cz);
```

Loaded chunks answer from their stored cells. Anything else, which means a chunk that is not loaded or a height outside the world, is answered by the generator one block at a time. So the player's collision checks never cause a chunk to be generated.

## Legacy adapter

`LegacyZoneAdapter` fills a chunk exactly the way `getBlockAt` answers a single block: stone below the ground, water above it up to the water level, and the zone's own blocks from the ground up to 64 blocks above. Tests compare it with the old function:

- 10,000 random points across 50 chunks, including the coast and mountains.
- Every block above the ground in 12 landmark chunks (the Great Tower, Tempest's Coliseum and Town Hall, Greensom, Bosse, Fremmevilla, Magnolia), more than 500,000 comparisons.
- 5,000 points in chunks that are not loaded.
