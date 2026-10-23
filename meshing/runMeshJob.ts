import { BlockRegistry } from '../engine/BlockRegistry';
import { Chunk } from '../engine/Chunk';
import { TextureLayout } from '../engine/TextureLayout';
import { WorldGenerator } from '../engine/WorldGenerator';
import { LodLevel } from '../worldConstants';
import { MeshData, meshChunk } from './ChunkMesher';
import { PaddedChunkReader } from './PaddedChunkReader';

// One unit of work for a mesh worker: generate the chunk, then mesh it. Kept apart from the worker's
// message plumbing so tests can run it in node.
export const runMeshJob = (
  cx: number, cz: number, lod: LodLevel, generator: WorldGenerator, registry: BlockRegistry, layout?: TextureLayout,
): MeshData => {
  const chunk = new Chunk(cx, cz);
  generator.generateChunk(chunk, { lod });
  return meshChunk(new PaddedChunkReader(chunk, generator), cx, cz, registry, { layout });
};
