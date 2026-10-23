import { BlockRegistry } from './BlockRegistry';
import { Chunk } from './Chunk';
import { ChunkStore } from './ChunkStore';
import { WorldGenerator } from './WorldGenerator';
import { Cell, cellId, cellState, packCell } from './cell';
import { chunkCoord, inWorldY, localCoord } from './coords';

// The one query API for blocks. Loaded chunks answer from their stored cells. Anything else
// (a chunk that is not loaded, or a height outside the world) is answered by the generator,
// so callers like player collision never trigger chunk generation.
export class VoxelWorld {
  private readonly store = new ChunkStore();

  constructor(readonly registry: BlockRegistry, private readonly generator: WorldGenerator) {}

  get loadedChunks(): number {
    return this.store.size;
  }

  hasChunk(cx: number, cz: number): boolean {
    return this.store.has(cx, cz);
  }

  loadChunk(cx: number, cz: number): Chunk {
    const existing = this.store.get(cx, cz);
    if (existing) return existing;
    const chunk = this.store.getOrCreate(cx, cz);
    this.generator.generateChunk(chunk);
    return chunk;
  }

  unloadChunk(cx: number, cz: number): boolean {
    return this.store.delete(cx, cz);
  }

  getCell(x: number, y: number, z: number): Cell {
    if (inWorldY(y)) {
      const chunk = this.store.get(chunkCoord(x), chunkCoord(z));
      if (chunk) return chunk.getCell(localCoord(x), y, localCoord(z));
    }
    return this.generator.sampleCell ? this.generator.sampleCell(x, y, z) : packCell(this.generator.sampleBlock(x, y, z));
  }

  getBlock(x: number, y: number, z: number): number {
    return cellId(this.getCell(x, y, z));
  }

  getState(x: number, y: number, z: number): number {
    return cellState(this.getCell(x, y, z));
  }

  isSolid(x: number, y: number, z: number): boolean {
    return this.registry.isSolid(this.getBlock(x, y, z));
  }

  terrainHeight(x: number, z: number): number {
    return this.generator.terrainHeight(x, z);
  }

  zoneNameAt(x: number, z: number): string {
    return this.generator.zoneNameAt(x, z);
  }
}
