import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { Chunk } from '../../engine/Chunk';
import { meshChunk, meshTriangleCount } from '../../meshing/ChunkMesher';
import { PaddedChunkReader } from '../../meshing/PaddedChunkReader';
import { LegacyZoneAdapter } from '../../worldgen/LegacyZoneAdapter';

const registry = createDefaultRegistry();
const generator = new LegacyZoneAdapter(registry);

// Chunk (0, 9) holds the spawn point at Greensom (0, 300), chunk (0, 0) is the Town of Beginnings with the Great Tower,
// (-1, -1) is the tower's north-west corner and (53, 0) is Tempest's Coliseum, the densest build in the old world.
const SPOTS: Array<[string, number, number]> = [
  ['spawn (Greensom)', 0, 9],
  ['Town of Beginnings', 0, 0],
  ['Great Tower corner', -1, -1],
  ['Tempest Coliseum', 53, 0],
];

const TARGET_MS = 25;
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

describe('chunk mesher timing (LegacyZoneAdapter chunks, node)', () => {
  for (const [name, cx, cz] of SPOTS) {
    it(`meshes ${name} in under ${TARGET_MS} ms`, () => {
      const chunk = new Chunk(cx, cz);
      generator.generateChunk(chunk);
      const reader = new PaddedChunkReader(chunk, generator);
      for (let i = 0; i < 3; i++) meshChunk(reader, cx, cz, registry); // warm up the JIT

      const times: number[] = [];
      let mesh = meshChunk(reader, cx, cz, registry);
      for (let i = 0; i < 9; i++) {
        const t = performance.now();
        mesh = meshChunk(reader, cx, cz, registry);
        times.push(performance.now() - t);
      }
      const med = median(times);
      console.log(`[mesher] ${name} chunk (${cx}, ${cz}): median ${med.toFixed(1)} ms, `
        + `min ${Math.min(...times).toFixed(1)} ms, max ${Math.max(...times).toFixed(1)} ms, `
        + `${meshTriangleCount(mesh)} triangles`);
      expect(med).toBeLessThan(TARGET_MS);
    });
  }
});
