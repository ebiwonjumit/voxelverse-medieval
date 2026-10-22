import { createDefaultRegistry } from './content/blocks';
import { VoxelWorld } from './engine/VoxelWorld';
import { LegacyZoneAdapter } from './worldgen/LegacyZoneAdapter';

// The world the game queries on the main thread. Until the new zones exist, the old ones feed it
// through the adapter.
export const blockRegistry = createDefaultRegistry();
export const voxelWorld = new VoxelWorld(blockRegistry, new LegacyZoneAdapter(blockRegistry));
