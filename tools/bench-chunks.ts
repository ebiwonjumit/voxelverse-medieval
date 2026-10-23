// How long chunk generation takes in node.
//   npx vite-node tools/bench-chunks.ts
import { createDefaultRegistry } from '../content/blocks';
import { Chunk } from '../engine/Chunk';
import { createVoxelverseGenerator } from '../worldgen/VoxelverseGenerator';

const gen = createVoxelverseGenerator(createDefaultRegistry());

const time = (label: string, spots: Array<[number, number]>): void => {
  for (const [cx, cz] of spots.slice(0, 3)) gen.generateChunk(new Chunk(cx, cz)); // warm up
  const t0 = performance.now();
  for (const [cx, cz] of spots) gen.generateChunk(new Chunk(cx, cz));
  const ms = (performance.now() - t0) / spots.length;
  console.log(`${label.padEnd(28)} ${ms.toFixed(2)} ms per chunk (${spots.length} chunks)`);
};

const grid = (x0: number, z0: number, n = 8): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push([x0 + i, z0 + j]);
  return out;
};

time('wilderness (hills)', grid(20, 20));
time('belt forest (cedar etc)', grid(40, 26));
time('river valleys', grid(8, 3));
time('south forest (dense)', grid(10, 140));
time('wilderness (forest)', grid(-20, 200));
time('wilderness (mountains)', grid(340, -10));
time('open sea', grid(-130, 0));
time('Town of Beginnings', grid(-4, -4));
time('Tempest', grid(44, -4));
