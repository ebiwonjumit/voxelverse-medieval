import { LodLevel } from '../worldConstants';
import { Chunk } from './Chunk';

export interface GenerateOptions {
  // How much small detail to build. Defaults to HIGH. Far chunks ask for LOW because nobody sees the detail.
  lod?: LodLevel;
}

// What the voxel world needs from whatever makes the terrain. The core only knows this interface,
// so generators (the legacy zones now, new zones later) live outside it and can run in a worker.
export interface WorldGenerator {
  // Fill a chunk with blocks.
  generateChunk(chunk: Chunk, options?: GenerateOptions): void;

  // Block id at a single position, without building a chunk. Also used outside the world's height range.
  sampleBlock(x: number, y: number, z: number): number;

  terrainHeight(x: number, z: number): number;
  zoneNameAt(x: number, z: number): string;
}
