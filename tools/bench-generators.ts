// What a mesh worker pays per chunk for each generator, in node: the Phase 6 generator against the legacy adapter, at
// both detail levels, on the places a walk from Greensom to Tempest passes through. Used to decide whether the chunk
// cache needs tuning after the generator was wired in (docs/perf-after-integration.md).
//   npx vite-node tools/bench-generators.ts
import { createDefaultRegistry } from '../content/blocks';
import { Chunk } from '../engine/Chunk';
import { WorldGenerator } from '../engine/WorldGenerator';
import { LodLevel } from '../worldConstants';
import { LegacyZoneAdapter } from '../worldgen/LegacyZoneAdapter';
import { createVoxelverseGenerator } from '../worldgen/VoxelverseGenerator';

const registry = createDefaultRegistry();
const generators: Array<[string, WorldGenerator]> = [
  ['legacy', new LegacyZoneAdapter(registry)],
  ['phase 6', createVoxelverseGenerator(registry)],
];

const grid = (x0: number, z0: number, n = 6): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push([x0 + i, z0 + j]);
  return out;
};

const places: Array<[string, Array<[number, number]>]> = [
  ['Greensom (spawn)', grid(-3, 7)],
  ['Town of Beginnings', grid(-3, -3)],
  ['road, x 250 to 500', grid(8, -2)],
  ['road, x 800 to 1000', grid(25, -2)],
  ['Tempest', grid(44, -3)],
  ['cedar belt', grid(40, 26)],
  ['south forest (dense)', grid(10, 140)],
  ['mountains', grid(340, -10)],
];

for (const lod of [LodLevel.HIGH, LodLevel.LOW]) {
  console.log(lod === LodLevel.HIGH ? '\nHIGH detail, ms per chunk' : '\nLOW detail, ms per chunk');
  console.log('place'.padEnd(24) + generators.map(([n]) => n.padStart(10)).join(''));
  for (const [name, chunks] of places) {
    const cells = generators.map(([, gen]) => {
      for (const [cx, cz] of chunks.slice(0, 3)) gen.generateChunk(new Chunk(cx, cz), { lod }); // warm up
      const t0 = performance.now();
      for (const [cx, cz] of chunks) gen.generateChunk(new Chunk(cx, cz), { lod });
      return ((performance.now() - t0) / chunks.length).toFixed(1).padStart(10);
    });
    console.log(name.padEnd(24) + cells.join(''));
  }
}
