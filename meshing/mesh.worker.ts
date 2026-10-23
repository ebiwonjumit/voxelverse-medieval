import { createDefaultRegistry } from '../content/blocks';
import { createDefaultTextureLayout } from '../content/textures/layout';
import { createWorkerGenerator } from '../worldgen/createWorkerGenerator';
import { ChunkCache } from './ChunkCache';
import { meshTransferables } from './ChunkMesher';
import { MeshJobMessage, MeshResultMessage } from './MeshWorkerPool';
import { runMeshJob } from './runMeshJob';

// Entry point of the mesh worker. It is the one file in meshing/ that wires in content/ and worldgen/,
// because a worker has to build its own registry and generator: nothing but messages crosses over.
const registry = createDefaultRegistry();
const generator = createWorkerGenerator(registry);
// Built from the same catalog and registry as the main thread's atlas, so a layer number means the same tile on both sides.
const layout = createDefaultTextureLayout(registry);
// Jobs for neighbouring chunks share the chunks this worker has generated (the light of a chunk needs its eight neighbours).
const cache = new ChunkCache(generator);

const scope = self as unknown as {
  onmessage: ((event: { data: MeshJobMessage }) => void) | null;
  postMessage(message: MeshResultMessage, transfer: ArrayBuffer[]): void;
};

scope.onmessage = ({ data }) => {
  try {
    const mesh = runMeshJob(data.cx, data.cz, data.lod, generator, registry, layout, cache);
    scope.postMessage({ id: data.id, mesh }, meshTransferables(mesh));
  } catch (err) {
    scope.postMessage({ id: data.id, error: err instanceof Error ? err.message : String(err) }, []);
  }
};
