import { BlockRegistry } from '../engine/BlockRegistry';
import { VoxelverseGenerator, createVoxelverseGenerator } from './VoxelverseGenerator';

// The one place that says which generator the mesh workers use. gameWorld.ts builds the same generator for the main
// thread (same registry contents, same default seed), and a test keeps the two in step.
export const createWorkerGenerator = (registry: BlockRegistry): VoxelverseGenerator => createVoxelverseGenerator(registry);
