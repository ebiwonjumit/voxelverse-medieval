import { Chunk } from '../engine/Chunk';
import { WorldGenerator } from '../engine/WorldGenerator';
import { Cell, packCell } from '../engine/cell';
import { CHUNK_SIZE } from '../engine/coords';
import { CellReader } from './CellReader';

// One chunk plus the generator's answer for the ring around it. A worker therefore generates a single
// chunk per job and never needs its neighbours. Ring cells come from sampleCell, or from sampleBlock (state 0) for a
// generator without one, which give the same cell as generateChunk would for a block the generator can describe one
// at a time (see LegacyZoneAdapter).
export class PaddedChunkReader implements CellReader {
  private readonly x0: number;
  private readonly z0: number;

  constructor(private readonly chunk: Chunk, private readonly generator: WorldGenerator) {
    this.x0 = chunk.cx * CHUNK_SIZE;
    this.z0 = chunk.cz * CHUNK_SIZE;
  }

  getCell(x: number, y: number, z: number): Cell {
    const lx = x - this.x0;
    const lz = z - this.z0;
    if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) return this.chunk.getCell(lx, y, lz);
    return this.generator.sampleCell ? this.generator.sampleCell(x, y, z) : packCell(this.generator.sampleBlock(x, y, z));
  }

  copyChunkCells(out: Uint16Array, minY: number, maxY: number, offset: number, rowStride: number, zStride: number): void {
    this.chunk.copyCells(out, minY, maxY, offset, rowStride, zStride);
  }

  yRange(): { minY: number; maxY: number } | null {
    return this.chunk.allocatedYRange();
  }
}
