import { ChunkStore } from '../engine/ChunkStore';
import { LodLevel } from '../worldConstants';
import { MeshData } from './ChunkMesher';

// What goes to a mesh worker and what comes back. The worker meshes with its own generator, so the job
// only names the chunk.
export interface MeshJobMessage {
  id: number;
  cx: number;
  cz: number;
  lod: LodLevel;
}

export type MeshResultMessage = { id: number; mesh: MeshData } | { id: number; error: string };

// The part of a Worker the pool uses, so tests can pass a fake.
export interface PoolWorker {
  postMessage(message: MeshJobMessage): void;
  terminate(): void;
  onmessage: ((event: { data: MeshResultMessage }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
}

export type WorkerFactory = () => PoolWorker;

export interface PoolHandlers {
  onResult(mesh: MeshData, lod: LodLevel): void;
  onError?(cx: number, cz: number, message: string): void;
}

// One worker per spare core, but never more than 4: each holds its own copy of the generator, and more
// than that stops helping because the main thread has to upload what they finish.
export const defaultPoolSize = (hardwareConcurrency: number | undefined): number =>
  Math.min(Math.max((hardwareConcurrency ?? 2) - 1, 1), 4);

interface Job extends MeshJobMessage {
  key: number;
}

interface Slot {
  worker: PoolWorker;
  job: Job | null;
}

// Meshes chunks in a few workers. Jobs wait in a queue and the nearest one to the player goes next.
// A chunk has at most one live request: asking again replaces it, and cancelling it makes any result
// that is already on its way get dropped on arrival.
export class MeshWorkerPool {
  private readonly slots: Slot[] = [];
  private readonly queue: Job[] = [];
  // Chunk key -> id of the request whose result is still wanted.
  private readonly wanted = new Map<number, number>();
  private nextId = 1;
  private playerCx = 0;
  private playerCz = 0;
  private disposed = false;

  constructor(factory: WorkerFactory, private readonly handlers: PoolHandlers, size = defaultPoolSize(undefined)) {
    for (let i = 0; i < size; i++) {
      const worker = factory();
      const slot: Slot = { worker, job: null };
      worker.onmessage = (event) => this.finish(slot, event.data);
      worker.onerror = (event) => this.finish(slot, undefined, event.message ?? 'mesh worker failed');
      this.slots.push(slot);
    }
  }

  get size(): number {
    return this.slots.length;
  }

  // Requests whose result has not been delivered yet, queued or running.
  get pending(): number {
    return this.wanted.size;
  }

  // Jobs that have been handed to a worker and not finished, stale ones included.
  get running(): number {
    return this.slots.reduce((n, s) => n + (s.job ? 1 : 0), 0);
  }

  setPlayerChunk(cx: number, cz: number): void {
    this.playerCx = cx;
    this.playerCz = cz;
  }

  request(cx: number, cz: number, lod: LodLevel): void {
    if (this.disposed) return;
    const key = ChunkStore.keyOf(cx, cz);
    this.dropQueued(key);
    const job: Job = { id: this.nextId++, cx, cz, lod, key };
    this.wanted.set(key, job.id);
    this.queue.push(job);
    this.pump();
  }

  // Returns true when the job had not started and was removed. A job that is already running cannot be
  // stopped, but its result is dropped when it arrives.
  cancel(cx: number, cz: number): boolean {
    const key = ChunkStore.keyOf(cx, cz);
    const wasQueued = this.dropQueued(key);
    this.wanted.delete(key);
    return wasQueued;
  }

  dispose(): void {
    this.disposed = true;
    for (const slot of this.slots) {
      slot.worker.onmessage = null;
      slot.worker.onerror = null;
      slot.worker.terminate();
    }
    this.slots.length = 0;
    this.queue.length = 0;
    this.wanted.clear();
  }

  private dropQueued(key: number): boolean {
    const i = this.queue.findIndex((j) => j.key === key);
    if (i < 0) return false;
    this.queue.splice(i, 1);
    return true;
  }

  // Nearest chunk to the player first, oldest request first among equals. The distance is read when a
  // worker frees up, so a job queued while the player was elsewhere is ranked by where they are now.
  private takeNearest(): Job | undefined {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < this.queue.length; i++) {
      const j = this.queue[i];
      const d = (j.cx - this.playerCx) ** 2 + (j.cz - this.playerCz) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best < 0 ? undefined : this.queue.splice(best, 1)[0];
  }

  private pump(): void {
    for (const slot of this.slots) {
      if (slot.job) continue;
      const job = this.takeNearest();
      if (!job) return;
      slot.job = job;
      slot.worker.postMessage({ id: job.id, cx: job.cx, cz: job.cz, lod: job.lod });
    }
  }

  private finish(slot: Slot, result: MeshResultMessage | undefined, failure?: string): void {
    const job = slot.job;
    if (!job || (result && result.id !== job.id)) return;
    slot.job = null;
    if (this.wanted.get(job.key) === job.id) {
      this.wanted.delete(job.key);
      if (result && 'mesh' in result) this.handlers.onResult(result.mesh, job.lod);
      else this.handlers.onError?.(job.cx, job.cz, failure ?? (result && 'error' in result ? result.error : 'unknown error'));
    }
    this.pump();
  }
}
