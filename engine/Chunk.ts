import { Cell } from './cell';
import {
  CHUNK_SIZE, SECTION_COUNT, SECTION_HEIGHT, SECTION_VOLUME, WORLD_MAX_Y, WORLD_MIN_Y, cellIndex, inWorldY, localY, sectionIndex,
} from './coords';

const checkLocal = (lx: number, lz: number): void => {
  if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) {
    throw new RangeError(`Local coordinates (${lx}, ${lz}) are outside the chunk`);
  }
};

// One column of the world, CHUNK_SIZE wide in x and z. Sections are allocated on first write,
// so open sky and empty ground cost nothing.
export class Chunk {
  private readonly sections: Array<Uint16Array | null> = new Array(SECTION_COUNT).fill(null);

  constructor(readonly cx: number, readonly cz: number) {}

  // lx and lz are local to the chunk (0..CHUNK_SIZE-1). y is a world height.
  getCell(lx: number, y: number, lz: number): Cell {
    checkLocal(lx, lz);
    if (!inWorldY(y)) return 0;
    const section = this.sections[sectionIndex(y)];
    return section ? section[cellIndex(lx, localY(y), lz)] : 0;
  }

  setCell(lx: number, y: number, lz: number, cell: Cell): void {
    checkLocal(lx, lz);
    if (!inWorldY(y)) throw new RangeError(`Height ${y} is outside the world`);
    const index = sectionIndex(y);
    let section = this.sections[index];
    if (!section) {
      if (cell === 0) return;
      section = new Uint16Array(SECTION_VOLUME);
      this.sections[index] = section;
    }
    section[cellIndex(lx, localY(y), lz)] = cell;
  }

  // Lowest and highest y covered by an allocated section, or null for an empty chunk.
  // Everything outside this range is air, so the mesher never scans it.
  allocatedYRange(): { minY: number; maxY: number } | null {
    let first = -1;
    let last = -1;
    for (let i = 0; i < SECTION_COUNT; i++) {
      if (!this.sections[i]) continue;
      if (first < 0) first = i;
      last = i;
    }
    if (first < 0) return null;
    return { minY: WORLD_MIN_Y + first * SECTION_HEIGHT, maxY: WORLD_MIN_Y + (last + 1) * SECTION_HEIGHT - 1 };
  }

  // Bulk read for the mesher. Writes the cell (block id and state) at (lx, y, lz) to
  // out[offset + (y - minY) * rowStride + lz * zStride + lx] for every y in minY..maxY. Cells in sections that
  // were never allocated are skipped, so out must start out zeroed (air).
  copyCells(out: Uint16Array, minY: number, maxY: number, offset: number, rowStride: number, zStride: number): void {
    const lo = Math.max(minY, WORLD_MIN_Y);
    const hi = Math.min(maxY, WORLD_MAX_Y);
    for (let y = lo; y <= hi; y++) {
      const section = this.sections[sectionIndex(y)];
      if (!section) continue;
      const rowOut = offset + (y - minY) * rowStride;
      let src = localY(y) * CHUNK_SIZE * CHUNK_SIZE;
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const dst = rowOut + lz * zStride;
        for (let lx = 0; lx < CHUNK_SIZE; lx++) out[dst + lx] = section[src + lx];
        src += CHUNK_SIZE;
      }
    }
  }

  allocatedSections(): number {
    let n = 0;
    for (const s of this.sections) if (s) n++;
    return n;
  }

  isEmpty(): boolean {
    for (const s of this.sections) {
      if (!s) continue;
      for (let i = 0; i < s.length; i++) if (s[i] !== 0) return false;
    }
    return true;
  }
}
