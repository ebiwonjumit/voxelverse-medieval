import { createDefaultRegistry } from './content/blocks';
import { VoxelWorld } from './engine/VoxelWorld';
import { createVoxelverseGenerator } from './worldgen/VoxelverseGenerator';

// The world the game queries on the main thread: collision, the HUD and the zone name. The mesh workers build the same
// generator (worldgen/createWorkerGenerator.ts), so both threads see one world.
export const blockRegistry = createDefaultRegistry();
export const worldGenerator = createVoxelverseGenerator(blockRegistry);
export const voxelWorld = new VoxelWorld(blockRegistry, worldGenerator);
