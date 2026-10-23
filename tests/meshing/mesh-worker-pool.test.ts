import { describe, expect, it, vi } from 'vitest';
import { MeshWorkerPool, defaultPoolSize } from '../../meshing/MeshWorkerPool';
import { LodLevel } from '../../worldConstants';
import { fakeWorkerFactory, quadMesh } from './fakeWorkers';

const setup = (size = 1) => {
  const { factory, workers } = fakeWorkerFactory();
  const results: Array<{ cx: number; cz: number; lod: LodLevel }> = [];
  const errors: string[] = [];
  const pool = new MeshWorkerPool(factory, {
    onResult: (mesh, lod) => results.push({ cx: mesh.cx, cz: mesh.cz, lod }),
    onError: (_cx, _cz, message) => errors.push(message),
  }, size);
  return { pool, workers, results, errors };
};

describe('defaultPoolSize', () => {
  it('uses the spare cores, between 1 and 4', () => {
    expect(defaultPoolSize(1)).toBe(1);
    expect(defaultPoolSize(2)).toBe(1);
    expect(defaultPoolSize(4)).toBe(3);
    expect(defaultPoolSize(5)).toBe(4);
    expect(defaultPoolSize(16)).toBe(4);
  });

  it('falls back to a small pool when the core count is unknown', () => {
    expect(defaultPoolSize(undefined)).toBeGreaterThanOrEqual(1);
    expect(defaultPoolSize(undefined)).toBeLessThanOrEqual(4);
  });
});

describe('MeshWorkerPool', () => {
  it('starts as many workers as asked for and hands each one job at a time', () => {
    const { pool, workers } = setup(2);
    expect(workers).toHaveLength(2);
    for (let i = 0; i < 5; i++) pool.request(i, 0, LodLevel.HIGH);
    expect(workers[0].posted).toHaveLength(1);
    expect(workers[1].posted).toHaveLength(1);
    expect(pool.pending).toBe(5);
    expect(pool.running).toBe(2);
  });

  it('sends the nearest queued chunk to the player first', () => {
    const { pool, workers } = setup(1);
    pool.setPlayerChunk(0, 0);
    pool.request(9, 9, LodLevel.LOW); // starts at once: the worker is idle
    pool.request(5, 0, LodLevel.LOW);
    pool.request(1, 1, LodLevel.HIGH);
    pool.request(-3, 0, LodLevel.LOW);
    pool.request(0, 2, LodLevel.LOW);

    const order: Array<[number, number]> = [];
    for (let i = 0; i < 5; i++) {
      const job = workers[0].answer();
      order.push([job.cx, job.cz]);
    }
    expect(order).toEqual([[9, 9], [1, 1], [0, 2], [-3, 0], [5, 0]]);
  });

  it('ranks queued jobs by where the player is now, not where they were when the job was queued', () => {
    const { pool, workers } = setup(1);
    pool.setPlayerChunk(0, 0);
    pool.request(0, 0, LodLevel.HIGH); // running
    pool.request(1, 0, LodLevel.HIGH);
    pool.request(20, 0, LodLevel.HIGH);
    pool.setPlayerChunk(20, 0);

    workers[0].answer();
    expect(workers[0].posted[1]).toMatchObject({ cx: 20, cz: 0 });
  });

  it('breaks ties in the order the requests came in', () => {
    const { pool, workers } = setup(1);
    pool.setPlayerChunk(0, 0);
    pool.request(8, 8, LodLevel.LOW); // running
    pool.request(1, 0, LodLevel.LOW);
    pool.request(0, 1, LodLevel.LOW);
    pool.request(-1, 0, LodLevel.LOW);
    for (let i = 0; i < 4; i++) workers[0].answer();
    expect(workers[0].posted.slice(1).map((j) => [j.cx, j.cz])).toEqual([[1, 0], [0, 1], [-1, 0]]);
  });

  it('delivers the mesh and the detail level it was built at', () => {
    const { pool, workers, results } = setup(1);
    pool.request(3, 4, LodLevel.LOW);
    workers[0].answer();
    expect(results).toEqual([{ cx: 3, cz: 4, lod: LodLevel.LOW }]);
    expect(pool.pending).toBe(0);
  });

  it('starts the next queued job when a worker finishes', () => {
    const { pool, workers } = setup(1);
    pool.request(0, 0, LodLevel.HIGH);
    pool.request(1, 0, LodLevel.HIGH);
    expect(workers[0].posted).toHaveLength(1);
    workers[0].answer();
    expect(workers[0].posted).toHaveLength(2);
  });

  describe('cancel', () => {
    it('removes a job that has not started, so no worker ever sees it', () => {
      const { pool, workers, results } = setup(1);
      pool.request(0, 0, LodLevel.HIGH); // running
      pool.request(7, 7, LodLevel.HIGH); // queued
      expect(pool.cancel(7, 7)).toBe(true);
      expect(pool.pending).toBe(1);

      workers[0].answer();
      expect(workers[0].posted.map((j) => j.cx)).toEqual([0]);
      expect(results.map((r) => r.cx)).toEqual([0]);
    });

    it('cannot stop a running job and says so, but drops its result', () => {
      const { pool, workers, results } = setup(1);
      pool.request(2, 2, LodLevel.HIGH);
      expect(pool.cancel(2, 2)).toBe(false);
      workers[0].answer();
      expect(results).toEqual([]);
      expect(pool.pending).toBe(0);
    });

    it('does nothing for a chunk that was never requested', () => {
      const { pool } = setup(1);
      expect(pool.cancel(1, 1)).toBe(false);
    });
  });

  describe('stale results', () => {
    it('drops the result of a request that was replaced while it ran', () => {
      const { pool, workers, results } = setup(2);
      pool.request(4, 4, LodLevel.LOW);  // running on worker 0
      pool.request(4, 4, LodLevel.HIGH); // replaces it, running on worker 1

      workers[0].answer(); // the old one finishes first
      expect(results).toEqual([]);
      expect(pool.pending).toBe(1);
      workers[1].answer();
      expect(results).toEqual([{ cx: 4, cz: 4, lod: LodLevel.HIGH }]);
    });

    it('replaces a queued request with the newer one instead of keeping both', () => {
      const { pool, workers } = setup(1);
      pool.request(0, 0, LodLevel.HIGH); // running
      pool.request(6, 6, LodLevel.LOW);
      pool.request(6, 6, LodLevel.HIGH);
      expect(pool.pending).toBe(2);
      workers[0].answer();
      expect(workers[0].posted[1]).toMatchObject({ cx: 6, cz: 6, lod: LodLevel.HIGH });
      workers[0].answer();
      expect(workers[0].posted).toHaveLength(2);
    });

    it('drops a result whose job id does not match the live request', () => {
      const { pool, workers, results } = setup(1);
      pool.request(1, 1, LodLevel.HIGH);
      const job = workers[0].posted[0];
      workers[0].onmessage?.({ data: { id: job.id + 100, mesh: quadMesh(1, 1) } });
      expect(results).toEqual([]);
    });
  });

  describe('errors', () => {
    it('reports a failed job once and keeps working', () => {
      const { pool, workers, results, errors } = setup(1);
      pool.request(0, 0, LodLevel.HIGH);
      pool.request(1, 0, LodLevel.HIGH);
      workers[0].answer((job) => ({ id: job.id, error: 'boom' }));
      expect(errors).toEqual(['boom']);
      workers[0].answer();
      expect(results).toEqual([{ cx: 1, cz: 0, lod: LodLevel.HIGH }]);
    });

    it('treats a worker script error as a failure of its job', () => {
      const { pool, workers, errors } = setup(1);
      pool.request(0, 0, LodLevel.HIGH);
      workers[0].onerror?.({ message: 'script died' });
      expect(errors).toEqual(['script died']);
      expect(pool.pending).toBe(0);
    });

    it('does not report an error for a cancelled job', () => {
      const { pool, workers, errors } = setup(1);
      pool.request(0, 0, LodLevel.HIGH);
      pool.cancel(0, 0);
      workers[0].answer((job) => ({ id: job.id, error: 'late' }));
      expect(errors).toEqual([]);
    });
  });

  it('terminates its workers and ignores later requests after dispose', () => {
    const { pool, workers } = setup(3);
    const terminate = workers.map((w) => vi.spyOn(w, 'terminate'));
    pool.dispose();
    for (const t of terminate) expect(t).toHaveBeenCalledOnce();
    pool.request(0, 0, LodLevel.HIGH);
    expect(pool.pending).toBe(0);
  });
});
