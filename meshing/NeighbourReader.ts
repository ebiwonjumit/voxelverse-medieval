import { Chunk } from '../engine/Chunk';
import { Cell } from '../engine/cell';
import { chunkCoord, localCoord } from '../engine/coords';
import { CellReader } from './CellReader';

// The chunk being meshed read through the chunks around it: the one block ring the mesher asks about comes from the
// neighbours' own cells instead of the generator's block-by-block answer, which is how a job that already holds its 3x3
// for lighting avoids sampling the generator thousands of times. `chunks` is the neighbourhood row by row from the north
// west chunk, so the one being meshed is the fifth (see ChunkCache.neighbourhood).
export class NeighbourReader implements CellReader {
  private readonly center: Chunk;

  constructor(private readonly chunks: readonly Chunk[]) {
    if (chunks.length !== 9) throw new RangeError('A neighbourhood is nine chunks');
    this.center = chunks[4];
  }

  getCell(x: number, y: number, z: number): Cell {
    const dx = chunkCoord(x) - this.center.cx;
    const dz = chunkCoord(z) - this.center.cz;
    if (dx < -1 || dx > 1 || dz < -1 || dz > 1) throw new RangeError(`(${x}, ${z}) is more than one chunk from the centre`);
    return this.chunks[(dz + 1) * 3 + dx + 1].getCell(localCoord(x), y, localCoord(z));
  }

  copyChunkCells(out: Uint16Array, minY: number, maxY: number, offset: number, rowStride: number, zStride: number): void {
    this.center.copyCells(out, minY, maxY, offset, rowStride, zStride);
  }

  yRange(): { minY: number; maxY: number } | null {
    return this.center.allocatedYRange();
  }
}
