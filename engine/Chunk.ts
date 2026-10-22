import { Cell } from './cell';
import {
  CHUNK_SIZE, SECTION_COUNT, SECTION_VOLUME, cellIndex, inWorldY, localY, sectionIndex,
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
