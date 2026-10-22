import { Chunk } from './Chunk';
import { chunkCoord } from './coords';

const OFFSET = 1 << 20;
const SPAN = 1 << 21;

export class ChunkStore implements Iterable<Chunk> {
  private readonly chunks = new Map<number, Chunk>();

  // Chunk coordinates within +-2^20 map to a unique integer key.
  static keyOf(cx: number, cz: number): number {
    return (cx + OFFSET) * SPAN + (cz + OFFSET);
  }

  get size(): number {
    return this.chunks.size;
  }

  get(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(ChunkStore.keyOf(cx, cz));
  }

  has(cx: number, cz: number): boolean {
    return this.chunks.has(ChunkStore.keyOf(cx, cz));
  }

  getOrCreate(cx: number, cz: number): Chunk {
    const key = ChunkStore.keyOf(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  delete(cx: number, cz: number): boolean {
    return this.chunks.delete(ChunkStore.keyOf(cx, cz));
  }

  chunkAtBlock(x: number, z: number): Chunk | undefined {
    return this.get(chunkCoord(x), chunkCoord(z));
  }

  [Symbol.iterator](): Iterator<Chunk> {
    return this.chunks.values();
  }
}
