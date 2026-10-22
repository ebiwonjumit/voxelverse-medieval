import { BlockRegistry } from '../engine/BlockRegistry';
import { WorldGenerator } from '../engine/WorldGenerator';
import { LegacyZoneAdapter } from './LegacyZoneAdapter';

// The one place that says which generator the mesh workers use. When the new world generation lands,
// this is the line that changes, and the worker and the pool stay as they are.
export const createWorkerGenerator = (registry: BlockRegistry): WorldGenerator => new LegacyZoneAdapter(registry);
