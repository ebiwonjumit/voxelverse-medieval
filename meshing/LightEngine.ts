import { BlockRegistry } from '../engine/BlockRegistry';
import { Chunk } from '../engine/Chunk';
import { MAX_BLOCK_ID } from '../engine/cell';
import { CHUNK_SIZE, SECTION_COUNT, SECTION_HEIGHT, WORLD_MAX_Y, WORLD_MIN_Y } from '../engine/coords';

// Baked light for one chunk, pure data code (no three, no DOM) so it runs in the mesh worker.
//
// Two channels, 0 to 15 each. Sky light is 15 in every cell above the highest cell of its column that blocks or dims
// light, and floods down and sideways from there losing 1 per block. Block light floods from `emits`. Opaque blocks
// stop both; everything else lets light through at a cost of max(1, lightDim) per block. Light fills open sky columns
// without loss going straight down (a well or a skylight stays at 15 to its floor), the way a hole in a roof does.
//
// A light value is exact for a cell and the ring around the chunk when the reader has the 3x3 chunks around it,
// because light dies after 15 blocks: only cells within 15 of the ring can matter, and that fits inside one chunk.

// The imported constants below are copied into module locals because the hot loops read them millions of times, and
// under vite-node (the test runner) an imported binding is a property lookup, 10 times slower than a local.
const SIZE = CHUNK_SIZE;
const ID_MASK = MAX_BLOCK_ID;

export const LIGHT_MAX = 15;
// How far past the chunk LightData answers. The mesher reads the cell in front of every face, and smooth lighting
// averages the cells around a vertex, so one block is all it needs.
export const LIGHT_RING = 1;
const SPAN = SIZE + 2 * LIGHT_RING;
const SECTION_AREA = SPAN * SPAN;

// A cell's light is one byte: sky in the high nibble, block light in the low one.
export const SKY_FULL = 0xf0;
export const skyOf = (packed: number): number => packed >> 4;
export const blockOf = (packed: number): number => packed & 15;

// What the light engine reads: the chunks around the one being lit. A chunk that is not there reads as air, which is
// what an unloaded neighbour at the edge of the world would be, so callers should supply all nine.
export interface LightReader {
  getChunk(cx: number, cz: number): Chunk | null | undefined;
}

// A reader over chunks you already have, which is all the worker and the tests need.
export class ChunkGrid implements LightReader {
  private readonly chunks = new Map<string, Chunk>();

  constructor(chunks: Iterable<Chunk> = []) {
    for (const chunk of chunks) this.add(chunk);
  }

  add(chunk: Chunk): this {
    this.chunks.set(`${chunk.cx},${chunk.cz}`, chunk);
    return this;
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(`${cx},${cz}`);
  }
}

// The light of one chunk and a one block ring around it: local x and z run from -1 to CHUNK_SIZE. Stored per section
// of 16 layers like the cells, and a section where every cell has the same light (open sky above the ground, solid
// rock below it) costs one byte instead of an array.
export class LightData {
  constructor(
    readonly cx: number,
    readonly cz: number,
    private readonly sections: ReadonlyArray<Uint8Array | null>,
    private readonly uniform: Uint8Array,
  ) {}

  // Sky and block light packed in one byte, see skyOf and blockOf. Above the world is open sky, below it is dark.
  get(lx: number, y: number, lz: number): number {
    if (lx < -LIGHT_RING || lx >= SIZE + LIGHT_RING || lz < -LIGHT_RING || lz >= SIZE + LIGHT_RING) {
      throw new RangeError(`Light at (${lx}, ${lz}) is outside the chunk and its ring`);
    }
    if (y > WORLD_MAX_Y) return SKY_FULL;
    if (y < WORLD_MIN_Y) return 0;
    const s = (y - WORLD_MIN_Y) >> 4;
    const section = this.sections[s];
    if (!section) return this.uniform[s];
    return section[((y - WORLD_MIN_Y) & 15) * SECTION_AREA + (lz + LIGHT_RING) * SPAN + lx + LIGHT_RING];
  }

  sky(lx: number, y: number, lz: number): number {
    return this.get(lx, y, lz) >> 4;
  }

  block(lx: number, y: number, lz: number): number {
    return this.get(lx, y, lz) & 15;
  }

  // Sections that had to be stored cell by cell, for memory and tests.
  storedSections(): number {
    let n = 0;
    for (const s of this.sections) if (s) n++;
    return n;
  }
}

// Per registry lookup tables, indexed by block id. cost is what a step into the block costs, or OPAQUE if it stops
// light; skyBlock is 1 for blocks that are opaque or dim, which end a column of open sky.
const OPAQUE = 255;

interface Tables {
  size: number;
  cost: Uint8Array;
  skyBlock: Uint8Array;
  emits: Uint8Array;
  anyEmitter: boolean;
}

const tableCache = new WeakMap<BlockRegistry, Tables>();

const tablesFor = (registry: BlockRegistry): Tables => {
  const cached = tableCache.get(registry);
  // Blocks can be registered after the first call (tests do), so the size is part of the key.
  if (cached && cached.size === registry.size) return cached;
  const cost = new Uint8Array(ID_MASK + 1).fill(1);
  const skyBlock = new Uint8Array(ID_MASK + 1);
  const emits = new Uint8Array(ID_MASK + 1);
  let anyEmitter = false;
  for (const def of registry.all()) {
    const dim = registry.lightDim(def.id);
    if (def.opaque) {
      cost[def.id] = OPAQUE;
      skyBlock[def.id] = 1;
    } else {
      cost[def.id] = Math.max(1, dim);
      skyBlock[def.id] = dim > 0 ? 1 : 0;
    }
    emits[def.id] = def.emits;
    if (def.emits > 0) anyEmitter = true;
  }
  const tables = { size: registry.size, cost, skyBlock, emits, anyEmitter };
  tableCache.set(registry, tables);
  return tables;
};

// Work area. The 3x3 chunks are copied into one dense grid, GRID wide, with the centre chunk at GRID_OFFSET. Only the
// middle REACH blocks around the chunk are ever lit (see the header), so floods stay between LO and HI.
const GRID = SIZE * 3;
const LAYER = GRID * GRID;
const REACH = LIGHT_MAX + LIGHT_RING;
const LO = SIZE - REACH;
const HI = 2 * SIZE + REACH - 1;
const LIGHT_HEADROOM = SECTION_HEIGHT; // block light climbs at most 14 layers above the highest section

// Scratch buffers are reused between calls: a worker lights one chunk after another and allocating several
// megabytes each time would be most of the cost.
const scratch = {
  cells: new Uint16Array(0),
  sky: new Uint8Array(0),
  block: new Uint8Array(0),
  queue: new Int32Array(1 << 16),
  top: new Int16Array(LAYER),
  active: new Int32Array(LAYER),
  section: new Uint8Array(SECTION_AREA * SECTION_HEIGHT),
};

const ensureGrid = (rows: number): void => {
  if (scratch.cells.length < rows * LAYER) {
    scratch.cells = new Uint16Array(rows * LAYER);
    scratch.sky = new Uint8Array(rows * LAYER);
    scratch.block = new Uint8Array(rows * LAYER);
  }
};

// Spread light from the cells in the queue. light holds each cell's level; a neighbour takes the level minus the cost of
// stepping into it if that is higher than what it has. Costs can be above 1, so a cell may be queued again.
const flood = (light: Uint8Array, cells: Uint16Array, cost: Uint8Array, tail0: number, rows: number): void => {
  let q = scratch.queue;
  let head = 0;
  let tail = tail0;
  const top = rows * LAYER;

  const relax = (n: number, level: number): void => {
    const c = cost[cells[n] & ID_MASK];
    if (c === OPAQUE) return;
    const next = level - c;
    if (next <= light[n]) return;
    light[n] = next;
    if (next > 1) {
      if (tail === q.length) {
        const bigger = new Int32Array(q.length * 2);
        bigger.set(q);
        q = bigger;
        scratch.queue = bigger;
      }
      q[tail++] = n;
    }
  };

  while (head < tail) {
    const idx = q[head++];
    const level = light[idx];
    if (level <= 1) continue;
    const layer = (idx / LAYER) | 0;
    const rem = idx - layer * LAYER;
    const gz = (rem / GRID) | 0;
    const gx = rem - gz * GRID;
    if (gx > LO) relax(idx - 1, level);
    if (gx < HI) relax(idx + 1, level);
    if (gz > LO) relax(idx - GRID, level);
    if (gz < HI) relax(idx + GRID, level);
    if (idx >= LAYER) relax(idx - LAYER, level);
    if (idx + LAYER < top) relax(idx + LAYER, level);
  }
};

// Light one chunk. `reader` supplies the chunk and its eight neighbours; the result covers the chunk and a one block
// ring. Pure and deterministic: the same cells always give the same light.
export const computeChunkLight = (reader: LightReader, cx: number, cz: number, registry: BlockRegistry): LightData => {
  const tables = tablesFor(registry);

  // The grid reaches one section above the highest block so that sky is open there and block light has room to climb.
  const chunks: Array<Chunk | null> = [];
  let highest = -Infinity;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const chunk = reader.getChunk(cx + dx, cz + dz) ?? null;
      chunks.push(chunk);
      const range = chunk ? chunk.allocatedYRange() : null;
      if (range && range.maxY > highest) highest = range.maxY;
    }
  }
  const uniform = new Uint8Array(SECTION_COUNT).fill(SKY_FULL);
  const sections: Array<Uint8Array | null> = new Array(SECTION_COUNT).fill(null);
  const out = new LightData(cx, cz, sections, uniform);
  if (highest === -Infinity) return out; // nothing but air: open sky everywhere

  const gridTop = Math.min(highest + LIGHT_HEADROOM, WORLD_MAX_Y);
  const rows = gridTop - WORLD_MIN_Y + 1;
  ensureGrid(rows);
  const { cells, sky, block, top, active, section } = scratch;
  const total = rows * LAYER;
  cells.fill(0, 0, total);
  sky.fill(0, 0, total);
  block.fill(0, 0, total);

  let i = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const chunk = chunks[i++];
      if (chunk) chunk.copyCells(cells, WORLD_MIN_Y, highest, (dz + 1) * SIZE * GRID + (dx + 1) * SIZE, LAYER, GRID);
    }
  }

  // Sky. Walk down from the top: a column stays open (sky 15) until its first blocking cell, which is its height.
  // Rows above `highest` are air, so they are open in every column.
  let open = 0;
  for (let gz = LO; gz <= HI; gz++) {
    for (let gx = LO; gx <= HI; gx++) active[open++] = gz * GRID + gx;
  }
  top.fill(-1);
  const skyBlock = tables.skyBlock;
  for (let row = rows - 1; row >= 0 && open > 0; row--) {
    const base = row * LAYER;
    let kept = 0;
    for (let k = 0; k < open; k++) {
      const col = active[k];
      if (skyBlock[cells[base + col] & ID_MASK]) {
        top[col] = row;
      } else {
        sky[base + col] = LIGHT_MAX;
        active[kept++] = col;
      }
    }
    open = kept;
  }

  // Seeds: open cells that touch a column whose blocker is at or above them. Everything else open is already 15 and
  // has nothing darker beside it to spread into. The cell just above a blocker is always a seed, so light can step
  // down into a dimming blocker such as leaves.
  let tail = 0;
  let q = scratch.queue;
  for (let gz = LO; gz <= HI; gz++) {
    for (let gx = LO; gx <= HI; gx++) {
      const col = gz * GRID + gx;
      const t = top[col];
      let tallest = t + 1;
      if (gx > LO && top[col - 1] > tallest) tallest = top[col - 1];
      if (gx < HI && top[col + 1] > tallest) tallest = top[col + 1];
      if (gz > LO && top[col - GRID] > tallest) tallest = top[col - GRID];
      if (gz < HI && top[col + GRID] > tallest) tallest = top[col + GRID];
      if (tallest > rows - 1) tallest = rows - 1;
      for (let row = t + 1; row <= tallest; row++) {
        if (tail === q.length) {
          const bigger = new Int32Array(q.length * 2);
          bigger.set(q);
          q = bigger;
          scratch.queue = bigger;
        }
        q[tail++] = row * LAYER + col;
      }
    }
  }
  flood(sky, cells, tables.cost, tail, rows);

  // Block light. Find the emitters in the lit area and flood from them.
  if (tables.anyEmitter) {
    const emits = tables.emits;
    tail = 0;
    q = scratch.queue;
    for (let row = 0; row < rows; row++) {
      for (let gz = LO; gz <= HI; gz++) {
        let idx = row * LAYER + gz * GRID + LO;
        for (let gx = LO; gx <= HI; gx++, idx++) {
          const cell = cells[idx];
          if (cell === 0) continue;
          const e = emits[cell & ID_MASK];
          if (e === 0) continue;
          block[idx] = e;
          if (tail === q.length) {
            const bigger = new Int32Array(q.length * 2);
            bigger.set(q);
            q = bigger;
            scratch.queue = bigger;
          }
          q[tail++] = idx;
        }
      }
    }
    if (tail > 0) flood(block, cells, tables.cost, tail, rows);
  }

  // Copy the chunk and its ring into sections, keeping a section as one byte when all its cells agree.
  const x0 = SIZE - LIGHT_RING;
  const sectionRows = rows / SECTION_HEIGHT;
  for (let s = 0; s < sectionRows; s++) {
    let same = true;
    let first = 0;
    let w = 0;
    for (let ly = 0; ly < SECTION_HEIGHT; ly++) {
      const layerBase = (s * SECTION_HEIGHT + ly) * LAYER;
      for (let lz = 0; lz < SPAN; lz++) {
        let idx = layerBase + (x0 + lz) * GRID + x0;
        for (let lx = 0; lx < SPAN; lx++, idx++) {
          const packed = (sky[idx] << 4) | block[idx];
          if (w === 0) first = packed;
          else if (packed !== first) same = false;
          section[w++] = packed;
        }
      }
    }
    if (same) uniform[s] = first;
    else sections[s] = section.slice();
  }
  return out;
};
