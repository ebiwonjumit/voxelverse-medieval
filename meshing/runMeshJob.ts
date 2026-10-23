import { BlockRegistry } from '../engine/BlockRegistry';
import { TextureLayout } from '../engine/TextureLayout';
import { WorldGenerator } from '../engine/WorldGenerator';
import { LodLevel } from '../worldConstants';
import { ChunkCache } from './ChunkCache';
import { MeshData, meshChunk } from './ChunkMesher';
import { ChunkGrid, computeChunkLight } from './LightEngine';
import { NeighbourReader } from './NeighbourReader';

// One unit of work for a mesh worker: get the chunk and its eight neighbours, light the chunk, mesh it. Kept apart from
// the worker's message plumbing so tests can run it in node. A worker passes its own cache, so the neighbours its jobs
// share are generated once; without one the job generates its nine chunks and forgets them.
export const runMeshJob = (
  cx: number, cz: number, lod: LodLevel, generator: WorldGenerator, registry: BlockRegistry, layout?: TextureLayout,
  cache: ChunkCache = new ChunkCache(generator, 9),
): MeshData => {
  const generatedBefore = cache.generated;
  const t0 = performance.now();
  const chunks = cache.neighbourhood(cx, cz, lod);
  const t1 = performance.now();
  const light = computeChunkLight(new ChunkGrid(chunks), cx, cz, registry);
  const t2 = performance.now();
  const mesh = meshChunk(new NeighbourReader(chunks), cx, cz, registry, { layout, light });
  const t3 = performance.now();
  mesh.timing = { generate: t1 - t0, light: t2 - t1, mesh: t3 - t2, generated: cache.generated - generatedBefore };
  return mesh;
};
