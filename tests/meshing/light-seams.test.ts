import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { ChunkCache } from '../../meshing/ChunkCache';
import { BucketData, MeshData, meshTriangleCount } from '../../meshing/ChunkMesher';
import { runMeshJob } from '../../meshing/runMeshJob';
import { createWorkerGenerator } from '../../worldgen/createWorkerGenerator';
import { LodLevel } from '../../worldConstants';

const registry = createDefaultRegistry();
const generator = createWorkerGenerator(registry);

// Light of the vertices on the shared border of two chunks, keyed by position and face direction in world coordinates:
// both chunks mesh their own faces, so a vertex that lies on the border has to read the same light from either side or the
// border shows as a line. Faces that look up or down have vertices on both sides of the border; that is what is compared.
const borderVertices = (mesh: MeshData, axis: 0 | 2, at: number): Map<string, number[]> => {
  const out = new Map<string, number[]>();
  const origin = [mesh.cx * 32, 0, mesh.cz * 32];
  for (const name of ['opaque', 'cutout', 'water'] as const) {
    const b: BucketData = mesh[name];
    for (let v = 0; v < b.positions.length / 3; v++) {
      if (b.positions[v * 3 + axis] !== at) continue;
      if (Math.abs(b.normals[v * 3 + 1]) !== 1) continue;
      const key = [name, b.positions[v * 3] + origin[0], b.positions[v * 3 + 1], b.positions[v * 3 + 2] + origin[2], b.normals[v * 3 + 1]].join(',');
      out.set(key, [b.light[v * 4], b.light[v * 4 + 1], b.light[v * 4 + 2], b.light[v * 4 + 3]]);
    }
  }
  return out;
};

describe('no light seams at chunk borders', () => {
  const cache = new ChunkCache(generator, 64);
  const job = (cx: number, cz: number) => runMeshJob(cx, cz, LodLevel.HIGH, generator, registry, undefined, cache);

  const cases: Array<[string, [number, number], [number, number], 0 | 2]> = [
    ['Town of Beginnings, east border of (0, 0)', [0, 0], [1, 0], 0],
    ['Town of Beginnings, south border of (0, 0)', [0, 0], [0, 1], 2],
    ['the Great Tower corner, east border of (-1, -1)', [-1, -1], [0, -1], 0],
    ['Greensom, south border of (0, 9)', [0, 9], [0, 10], 2],
  ];

  for (const [name, a, b, axis] of cases) {
    it(`agrees on every shared vertex: ${name}`, () => {
      const meshA = job(...a);
      const meshB = job(...b);
      const left = borderVertices(meshA, axis, 32);
      const right = borderVertices(meshB, axis, 0);
      let shared = 0;
      for (const [key, light] of left) {
        const other = right.get(key);
        if (!other) continue;
        shared++;
        expect(other).toEqual(light);
      }
      // There has to be something to compare: the borders of these chunks have ground along them.
      expect(shared).toBeGreaterThan(30);
      expect(meshTriangleCount(meshA)).toBeGreaterThan(0);
    });
  }
});
