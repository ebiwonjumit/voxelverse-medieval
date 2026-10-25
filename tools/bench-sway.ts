// What the wind weights and the water depth cost the mesher, in node: the same chunk meshed with `sway: false` (no weights,
// no per-quad work) and with the default, with baked light and cached neighbours as a worker has them. Median of 15 after
// warm-up, alternating the two so a busy machine hits both. Run it on a quiet machine.
//   npx vite-node tools/bench-sway.ts
import { createDefaultRegistry } from './../content/blocks';
import { createDefaultTextureLayout } from './../content/textures/layout';
import { ChunkCache } from './../meshing/ChunkCache';
import { meshChunk, meshTriangleCount } from './../meshing/ChunkMesher';
import { ChunkGrid, computeChunkLight } from './../meshing/LightEngine';
import { NeighbourReader } from './../meshing/NeighbourReader';
import { createWorkerGenerator } from './../worldgen/createWorkerGenerator';
import { LodLevel } from './../worldConstants';

const registry = createDefaultRegistry();
const generator = createWorkerGenerator(registry);
const layout = createDefaultTextureLayout(registry);
const SPOTS: Array<[string, number, number]> = [
  ['spawn, Greensom', 0, 9],
  ['Town of Beginnings', 0, 0],
  ['Tempest, farms and ponds', 52, 1],
  ['Tempest, river', 56, -2],
  ['bamboo grove', 31, -27],
  ['sakura grove', 46, 31],
  ['wetland ponds', -27, 35],
];
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

console.log('chunk                       sway off   sway on   change   triangles  swaying vertices');
for (const [name, cx, cz] of SPOTS) {
  const cache = new ChunkCache(generator);
  const chunks = cache.neighbourhood(cx, cz, LodLevel.HIGH);
  const light = computeChunkLight(new ChunkGrid(chunks), cx, cz, registry);
  const run = (sway: boolean) => {
    const t = performance.now();
    const mesh = meshChunk(new NeighbourReader(chunks), cx, cz, registry, { layout, light, sway });
    return { ms: performance.now() - t, mesh };
  };
  for (let i = 0; i < 5; i++) { run(false); run(true); }
  const off: number[] = [];
  const on: number[] = [];
  let last = run(true).mesh;
  for (let i = 0; i < 15; i++) {
    off.push(run(false).ms);
    const r = run(true);
    on.push(r.ms);
    last = r.mesh;
  }
  const verts = last.opaque.sway.length + last.cutout.sway.length;
  const a = median(off);
  const b = median(on);
  console.log(`${name.padEnd(27)} ${a.toFixed(1).padStart(6)} ms ${b.toFixed(1).padStart(6)} ms ${(((b - a) / a) * 100).toFixed(0).padStart(5)} %   ${String(meshTriangleCount(last)).padStart(8)}  ${verts}`);
}
