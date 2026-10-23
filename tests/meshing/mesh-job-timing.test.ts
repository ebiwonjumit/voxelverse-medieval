import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { ChunkCache } from '../../meshing/ChunkCache';
import { meshTriangleCount } from '../../meshing/ChunkMesher';
import { runMeshJob } from '../../meshing/runMeshJob';
import { createWorkerGenerator } from '../../worldgen/createWorkerGenerator';
import { LodLevel } from '../../worldConstants';
import { tolerant } from '../perf';

const registry = createDefaultRegistry();
const generator = createWorkerGenerator(registry);

// The same four places as mesher-timing.test.ts.
const SPOTS: Array<[string, number, number]> = [
  ['spawn (Greensom)', 0, 9],
  ['Town of Beginnings', 0, 0],
  ['Great Tower corner', -1, -1],
  ['Tempest Coliseum', 53, 0],
];

// What a worker spends on one job once its cache holds the neighbours: light plus mesh, as runMeshJob measures them.
// The Phase 2 target for meshing alone was 25 ms; baked light has to fit in the same budget.
const TARGET_MS = 25;
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

describe('mesh job timing (light and mesh, neighbours cached, node)', () => {
  for (const [name, cx, cz] of SPOTS) {
    it(`lights and meshes ${name} in under ${TARGET_MS} ms`, () => {
      const cache = new ChunkCache(generator);
      for (let i = 0; i < 3; i++) runMeshJob(cx, cz, LodLevel.HIGH, generator, registry, undefined, cache); // warm the JIT and the cache
      const light: number[] = [];
      const mesh: number[] = [];
      const total: number[] = [];
      let last = runMeshJob(cx, cz, LodLevel.HIGH, generator, registry, undefined, cache);
      for (let i = 0; i < 9; i++) {
        last = runMeshJob(cx, cz, LodLevel.HIGH, generator, registry, undefined, cache);
        const t = last.timing!;
        expect(t.generated).toBe(0);
        light.push(t.light);
        mesh.push(t.mesh);
        total.push(t.light + t.mesh);
      }
      console.log(`[job] ${name} chunk (${cx}, ${cz}): light ${median(light).toFixed(1)} ms, mesh ${median(mesh).toFixed(1)} ms, `
        + `together ${median(total).toFixed(1)} ms (max ${Math.max(...total).toFixed(1)}), ${meshTriangleCount(last)} triangles`);
      expect(median(total)).toBeLessThan(tolerant(TARGET_MS));
    });
  }
});
