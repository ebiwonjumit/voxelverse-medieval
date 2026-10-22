import { createDefaultRegistry } from '../content/blocks';
import { createWorkerGenerator } from '../worldgen/createWorkerGenerator';
import { meshTransferables } from './ChunkMesher';
import { MeshJobMessage, MeshResultMessage } from './MeshWorkerPool';
import { runMeshJob } from './runMeshJob';

// Entry point of the mesh worker. It is the one file in meshing/ that wires in content/ and worldgen/,
// because a worker has to build its own registry and generator: nothing but messages crosses over.
const registry = createDefaultRegistry();
const generator = createWorkerGenerator(registry);

const scope = self as unknown as {
  onmessage: ((event: { data: MeshJobMessage }) => void) | null;
  postMessage(message: MeshResultMessage, transfer: ArrayBuffer[]): void;
};

scope.onmessage = ({ data }) => {
  try {
    const mesh = runMeshJob(data.cx, data.cz, data.lod, generator, registry);
    scope.postMessage({ id: data.id, mesh }, meshTransferables(mesh));
  } catch (err) {
    scope.postMessage({ id: data.id, error: err instanceof Error ? err.message : String(err) }, []);
  }
};
