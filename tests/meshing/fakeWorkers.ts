import { BucketData, MeshData } from '../../meshing/ChunkMesher';
import { MeshJobMessage, MeshResultMessage, PoolWorker, WorkerFactory } from '../../meshing/MeshWorkerPool';

// A worker that never answers on its own. Tests decide when each job finishes.
export class FakeWorker implements PoolWorker {
  onmessage: PoolWorker['onmessage'] = null;
  onerror: PoolWorker['onerror'] = null;
  posted: MeshJobMessage[] = [];
  terminated = false;

  postMessage(message: MeshJobMessage): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  private handled = 0;

  get unanswered(): number {
    return this.posted.length - this.handled;
  }

  // Answers the oldest unanswered job.
  answer(build: (job: MeshJobMessage) => MeshResultMessage = (job) => ({ id: job.id, mesh: quadMesh(job.cx, job.cz) })): MeshJobMessage {
    const job = this.posted[this.handled++];
    if (!job) throw new Error('no job to answer');
    this.onmessage?.({ data: build(job) });
    return job;
  }
}

export const fakeWorkerFactory = (): { factory: WorkerFactory; workers: FakeWorker[] } => {
  const workers: FakeWorker[] = [];
  return {
    workers,
    factory: () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    },
  };
};

const emptyBucket = (): BucketData => ({
  positions: new Float32Array(0), normals: new Float32Array(0), colors: new Float32Array(0), indices: new Uint32Array(0),
});

// One upward-facing unit quad at chunk-local (x 0..1, y 5, z 0..1) in the chosen bucket, or two quads far apart
// in x and y so the bounds are easy to predict.
export const quadMesh = (cx: number, cz: number, buckets: Array<'opaque' | 'cutout' | 'water'> = ['opaque']): MeshData => {
  const mesh: MeshData = { cx, cz, opaque: emptyBucket(), cutout: emptyBucket(), water: emptyBucket() };
  for (const name of buckets) {
    mesh[name] = {
      positions: new Float32Array([0, 5, 0, 1, 5, 0, 1, 5, 1, 0, 5, 1, 30, 20, 31, 31, 20, 31, 31, 20, 32, 30, 20, 32]),
      normals: new Float32Array(24).map((_, i) => (i % 3 === 1 ? 1 : 0)),
      colors: new Float32Array(24).fill(0.5),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]),
    };
  }
  return mesh;
};
