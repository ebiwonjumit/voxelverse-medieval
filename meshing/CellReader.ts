import { Cell } from '../engine/cell';

// What the mesher reads. Coordinates are world blocks. A reader has to answer for the chunk being meshed
// and for a one block ring around it, which is all the mesher ever asks about.
export interface CellReader {
  getCell(x: number, y: number, z: number): Cell;

  // Optional fast path for the chunk proper: writes the cell (id and state) at (lx, y, lz) to
  // out[offset + (y - minY) * rowStride + lz * zStride + lx] for y in minY..maxY, leaving air cells alone.
  // The mesher passes a zeroed array. Without this it reads the chunk one getCell at a time.
  copyChunkCells?(out: Uint16Array, minY: number, maxY: number, offset: number, rowStride: number, zStride: number): void;

  // Lowest and highest y that can hold a block inside the chunk itself, or null if it is all air.
  // Optional: without it the mesher scans the whole world height.
  yRange?(): { minY: number; maxY: number } | null;
}
