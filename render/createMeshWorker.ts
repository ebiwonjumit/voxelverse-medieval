import { PoolWorker } from '../meshing/MeshWorkerPool';

// Vite recognises this exact form and bundles the worker with everything it imports.
export const createMeshWorker = (): PoolWorker =>
  new Worker(new URL('../meshing/mesh.worker.ts', import.meta.url), { type: 'module' }) as unknown as PoolWorker;
