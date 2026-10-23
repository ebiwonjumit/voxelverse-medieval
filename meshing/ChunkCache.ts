import { Chunk } from '../engine/Chunk';
import { ChunkStore } from '../engine/ChunkStore';
import { WorldGenerator } from '../engine/WorldGenerator';
import { LodLevel } from '../worldConstants';

// Lighting a chunk needs the eight chunks around it as well. A worker meshes one chunk per job, and the nine jobs of a
// neighbourhood would each generate the same nine chunks, so the worker keeps the ones it has generated in a small LRU
// and every job reads its 3x3 from it. A chunk is generated once per worker for as long as it stays in the cache, which
// is as long as jobs keep asking for it: the pool sends the nearest chunk to the player next, so the neighbours of a chunk
// are meshed close together in time.
//
// Chunks are kept per detail level. A job at a given level reads all nine chunks at that level, so the light it computes
// matches the cells it meshes (at LOW the generator leaves out lanterns and the like, and a lantern that is not drawn in
// the next chunk should not light this one).

// A neighbourhood is 9 chunks and a chunk with 4 sections is about 130 KB, so 64 is a few rows of neighbourhoods and
// about 8 MB per worker.
export const DEFAULT_CACHE_CHUNKS = 64;

export class ChunkCache {
  private readonly chunks = new Map<number, Chunk>(); // iteration order is least to most recently used
  hits = 0;
  generated = 0;

  constructor(private readonly generator: WorldGenerator, readonly capacity = DEFAULT_CACHE_CHUNKS) {
    if (capacity < 9) throw new RangeError('The cache must hold at least the 9 chunks of one neighbourhood');
  }

  get size(): number {
    return this.chunks.size;
  }

  private static key(cx: number, cz: number, lod: LodLevel): number {
    return ChunkStore.keyOf(cx, cz) * 2 + (lod === LodLevel.HIGH ? 1 : 0);
  }

  has(cx: number, cz: number, lod: LodLevel): boolean {
    return this.chunks.has(ChunkCache.key(cx, cz, lod));
  }

  // The chunk, generated if it is not cached, and marked as the most recently used.
  get(cx: number, cz: number, lod: LodLevel): Chunk {
    const key = ChunkCache.key(cx, cz, lod);
    let chunk = this.chunks.get(key);
    if (chunk) {
      this.hits++;
      this.chunks.delete(key);
      this.chunks.set(key, chunk);
      return chunk;
    }
    chunk = new Chunk(cx, cz);
    this.generator.generateChunk(chunk, { lod });
    this.generated++;
    this.chunks.set(key, chunk);
    if (this.chunks.size > this.capacity) {
      const oldest = this.chunks.keys().next().value as number;
      this.chunks.delete(oldest);
    }
    return chunk;
  }

  // The nine chunks around (cx, cz), row by row from the north west one: what the light engine and the mesher read.
  // Fetching them together keeps them from pushing each other out, because the cache holds at least nine.
  neighbourhood(cx: number, cz: number, lod: LodLevel): Chunk[] {
    const chunks: Chunk[] = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) chunks.push(this.get(cx + dx, cz + dz, lod));
    }
    return chunks;
  }

  clear(): void {
    this.chunks.clear();
  }
}
