import { AIR_CELL, Cell, packCell } from '../../engine/cell';
import { MirrorAxis, mirrorCell, turnCell } from './orientation';

// A blueprint is a small volume of cells (block id and state, see engine/cell.ts) that a building kit draws and a zone
// stamps into the world. It is sparse in meaning: a cell is either set (a block, or air, which carves) or unset (the
// blueprint says nothing there and the ground, a road or a tree stays as it was). It is stored densely over its own
// bounding box, because buildings are compact and zone code asks one cell at a time, so a lookup is one array read.
//
// Coordinates are the blueprint's own: x east, y up, z south, any integers, negative included. By convention a kit
// builds with the footprint's north west corner at x = 0, z = 0 and the front of the building facing south, and y = 0
// is the row of the ground surface (y below 0 is foundation, y above it is the building). A Placement puts a blueprint
// into the world.
//
// Unset is stored as 0xffff: block id 4095 with state 15, which no block uses (ids stop at 255).

export const NO_CELL = -1;
const EMPTY = 0xffff;
// A guard against a runaway builder: no building is this large.
const MAX_VOLUME = 64 * 1024 * 1024;

export interface Bounds {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
}

/** A note on a blueprint that is not a block: where a tree should grow, where a door opens onto the street. */
export interface Marker {
  /** What the marker is for: 'tree', 'door', 'lamp', 'garden'... Kits and zone code agree on the names. */
  kind: string;
  x: number;
  y: number;
  z: number;
  /** A direction 0 north, 1 east, 2 south, 3 west when the marker has one (a door's outward side). */
  facing?: number;
  /** A free label, for example the tree species. */
  tag?: string;
}

const rotatePoint = (x: number, z: number, turns: number): [number, number] => {
  // One clockwise turn seen from above takes east (+x) to south (+z): (x, z) -> (-z, x).
  switch (((turns % 4) + 4) % 4) {
    // `0 - v` and not `-v`, so a zero stays +0.
    case 1: return [0 - z, x];
    case 2: return [0 - x, 0 - z];
    case 3: return [z, 0 - x];
    default: return [x, z];
  }
};

export class Blueprint {
  private data = new Uint16Array(0);
  // The allocated box. `data` covers x0..x0+sx-1 and so on, in layout y, then z, then x.
  private x0 = 0;
  private y0 = 0;
  private z0 = 0;
  private sx = 0;
  private sy = 0;
  private sz = 0;
  private count = 0;
  // The tight bounds of the set cells. Clearing a cell can leave them too large, so they are rebuilt on demand.
  private tight: Bounds | null = null;
  private tightStale = false;
  private readonly marks: Marker[] = [];

  constructor(readonly name = 'blueprint') {}

  /** Number of set cells (air carvings included). */
  get size(): number {
    return this.count;
  }

  get empty(): boolean {
    return this.count === 0;
  }

  get markers(): readonly Marker[] {
    return this.marks;
  }

  addMarker(marker: Marker): void {
    this.marks.push({ ...marker });
  }

  /** Makes room for a box up front, so a builder that knows its footprint grows nothing as it goes. */
  reserve(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): void {
    this.ensure(minX, minY, minZ);
    this.ensure(maxX, maxY, maxZ);
  }

  private ensure(x: number, y: number, z: number): void {
    if (this.sx > 0 && x >= this.x0 && x < this.x0 + this.sx && y >= this.y0 && y < this.y0 + this.sy && z >= this.z0 && z < this.z0 + this.sz) return;
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) throw new RangeError(`Blueprint coordinates must be integers, got ${x},${y},${z}`);
    const grow = 6;
    let nx0: number, ny0: number, nz0: number, nx1: number, ny1: number, nz1: number;
    if (this.sx === 0) {
      [nx0, ny0, nz0, nx1, ny1, nz1] = [x, y, z, x, y, z];
    } else {
      nx0 = Math.min(this.x0, x); ny0 = Math.min(this.y0, y); nz0 = Math.min(this.z0, z);
      nx1 = Math.max(this.x0 + this.sx - 1, x); ny1 = Math.max(this.y0 + this.sy - 1, y); nz1 = Math.max(this.z0 + this.sz - 1, z);
      // Leave slack on the sides that grew, so a builder working outwards does not copy at every step.
      if (nx0 < this.x0) nx0 -= grow;
      if (ny0 < this.y0) ny0 -= grow;
      if (nz0 < this.z0) nz0 -= grow;
      if (nx1 > this.x0 + this.sx - 1) nx1 += grow;
      if (ny1 > this.y0 + this.sy - 1) ny1 += grow;
      if (nz1 > this.z0 + this.sz - 1) nz1 += grow;
    }
    const nsx = nx1 - nx0 + 1;
    const nsy = ny1 - ny0 + 1;
    const nsz = nz1 - nz0 + 1;
    if (nsx * nsy * nsz > MAX_VOLUME) throw new RangeError(`Blueprint ${this.name} would span ${nsx}x${nsy}x${nsz} cells`);
    const next = new Uint16Array(nsx * nsy * nsz).fill(EMPTY);
    for (let yy = 0; yy < this.sy; yy++) {
      for (let zz = 0; zz < this.sz; zz++) {
        const from = (yy * this.sz + zz) * this.sx;
        const to = ((yy + this.y0 - ny0) * nsz + (zz + this.z0 - nz0)) * nsx + (this.x0 - nx0);
        next.set(this.data.subarray(from, from + this.sx), to);
      }
    }
    this.data = next;
    this.x0 = nx0; this.y0 = ny0; this.z0 = nz0;
    this.sx = nsx; this.sy = nsy; this.sz = nsz;
  }

  private index(x: number, y: number, z: number): number {
    return ((y - this.y0) * this.sz + (z - this.z0)) * this.sx + (x - this.x0);
  }

  private inside(x: number, y: number, z: number): boolean {
    return x >= this.x0 && x < this.x0 + this.sx && y >= this.y0 && y < this.y0 + this.sy && z >= this.z0 && z < this.z0 + this.sz;
  }

  /** Sets a cell. AIR_CELL carves: the stamp clears whatever was there. */
  set(x: number, y: number, z: number, cell: Cell): void {
    if (!Number.isInteger(cell) || cell < 0 || cell >= EMPTY) throw new RangeError(`Cell ${cell} is not a block`);
    this.ensure(x, y, z);
    const i = this.index(x, y, z);
    if (this.data[i] === EMPTY) {
      this.count++;
      const t = this.tight;
      if (t) {
        if (x < t.minX) t.minX = x; if (x > t.maxX) t.maxX = x;
        if (y < t.minY) t.minY = y; if (y > t.maxY) t.maxY = y;
        if (z < t.minZ) t.minZ = z; if (z > t.maxZ) t.maxZ = z;
      } else if (this.count === 1) {
        this.tight = { minX: x, minY: y, minZ: z, maxX: x, maxY: y, maxZ: z };
      } else {
        this.tightStale = true;
      }
    }
    this.data[i] = cell;
  }

  setBlock(x: number, y: number, z: number, id: number, state = 0): void {
    this.set(x, y, z, packCell(id, state));
  }

  /** Sets air: the stamp will remove what stands there. */
  carve(x: number, y: number, z: number): void {
    this.set(x, y, z, AIR_CELL);
  }

  /** The cell, or NO_CELL where the blueprint has nothing. */
  get(x: number, y: number, z: number): number {
    if (!this.inside(x, y, z)) return NO_CELL;
    const v = this.data[this.index(x, y, z)];
    return v === EMPTY ? NO_CELL : v;
  }

  has(x: number, y: number, z: number): boolean {
    return this.get(x, y, z) !== NO_CELL;
  }

  /** True when the cell is set to something other than air. */
  solid(x: number, y: number, z: number): boolean {
    const c = this.get(x, y, z);
    return c !== NO_CELL && c !== AIR_CELL;
  }

  /** Unsets a cell, so the blueprint says nothing there. */
  unset(x: number, y: number, z: number): void {
    if (!this.inside(x, y, z)) return;
    const i = this.index(x, y, z);
    if (this.data[i] === EMPTY) return;
    this.data[i] = EMPTY;
    this.count--;
    this.tightStale = true;
    if (this.count === 0) this.tight = null;
  }

  /** The smallest box holding every set cell, inclusive, or null for an empty blueprint. */
  bounds(): Bounds | null {
    if (this.count === 0) return null;
    if (this.tightStale || !this.tight) this.rebuildBounds();
    return { ...this.tight! };
  }

  private rebuildBounds(): void {
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let y = 0; y < this.sy; y++) {
      for (let z = 0; z < this.sz; z++) {
        const row = (y * this.sz + z) * this.sx;
        for (let x = 0; x < this.sx; x++) {
          if (this.data[row + x] === EMPTY) continue;
          const wx = x + this.x0, wy = y + this.y0, wz = z + this.z0;
          if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
          if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
          if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
        }
      }
    }
    this.tight = { minX, minY, minZ, maxX, maxY, maxZ };
    this.tightStale = false;
  }

  /** Calls `fn` for every set cell, bottom to top, then north to south, then west to east. */
  forEach(fn: (x: number, y: number, z: number, cell: Cell) => void): void {
    const b = this.bounds();
    if (!b) return;
    for (let y = b.minY; y <= b.maxY; y++) {
      for (let z = b.minZ; z <= b.maxZ; z++) {
        const row = this.index(b.minX, y, z);
        for (let x = 0; x <= b.maxX - b.minX; x++) {
          const v = this.data[row + x];
          if (v !== EMPTY) fn(b.minX + x, y, z, v);
        }
      }
    }
  }

  /** Every set cell as `x,y,z,cell` rows, in the order of forEach. For tests and tools. */
  cells(): Array<[number, number, number, Cell]> {
    const out: Array<[number, number, number, Cell]> = [];
    this.forEach((x, y, z, c) => out.push([x, y, z, c]));
    return out;
  }

  clone(name = this.name): Blueprint {
    const copy = new Blueprint(name);
    this.forEach((x, y, z, c) => copy.set(x, y, z, c));
    for (const m of this.marks) copy.addMarker(m);
    return copy;
  }

  /**
   * A stable 32-bit hash of the cells and markers: the same buildings hash the same whatever order their cells were set
   * in, and any change to a position, a block or a state changes it. Positions count, so a moved copy hashes differently.
   */
  hash(): number {
    let h = 0x811c9dc5;
    const mix = (v: number): void => {
      h = Math.imul(h ^ (v | 0), 0x01000193);
      h ^= h >>> 15;
    };
    this.forEach((x, y, z, c) => { mix(x); mix(y); mix(z); mix(c); });
    mix(this.count);
    for (const m of [...this.marks].sort(compareMarkers)) {
      mix(m.x); mix(m.y); mix(m.z); mix(m.facing ?? -1);
      for (let i = 0; i < m.kind.length; i++) mix(m.kind.charCodeAt(i));
      mix(0x2e);
      for (const ch of m.tag ?? '') mix(ch.charCodeAt(0));
    }
    return h >>> 0;
  }

  // --- Transforms. Each returns a new blueprint and leaves this one alone. -----------------------------------------

  private transformed(name: string, map: (x: number, y: number, z: number, cell: Cell) => [number, number, number, Cell], markerMap: (m: Marker) => Marker): Blueprint {
    const out = new Blueprint(name);
    const b = this.bounds();
    if (!b) return out;
    this.forEach((x, y, z, c) => {
      const [nx, ny, nz, nc] = map(x, y, z, c);
      out.set(nx, ny, nz, nc);
    });
    for (const m of this.marks) out.addMarker(markerMap(m));
    return out;
  }

  /** Turned `turns` quarter turns clockwise seen from above, about x = 0, z = 0. Stairs, ridges and awnings turn with it. */
  rotated(turns: number): Blueprint {
    const t = ((turns % 4) + 4) % 4;
    if (t === 0) return this.clone();
    return this.transformed(
      this.name,
      (x, y, z, c) => {
        const [nx, nz] = rotatePoint(x, z, t);
        return [nx, y, nz, turnCell(c, t)];
      },
      (m) => {
        const [nx, nz] = rotatePoint(m.x, m.z, t);
        return { ...m, x: nx, z: nz, ...(m.facing !== undefined ? { facing: (m.facing + t) & 3 } : {}) };
      },
    );
  }

  /** Mirrored across x = 0 (axis 'x', east and west swap) or z = 0 (axis 'z', north and south swap). */
  mirrored(axis: MirrorAxis): Blueprint {
    return this.transformed(
      this.name,
      (x, y, z, c) => [axis === 'x' ? 0 - x : x, y, axis === 'z' ? 0 - z : z, mirrorCell(c, axis)],
      (m) => ({
        ...m,
        x: axis === 'x' ? 0 - m.x : m.x,
        z: axis === 'z' ? 0 - m.z : m.z,
        ...(m.facing !== undefined ? { facing: mirrorFacing(m.facing, axis) } : {}),
      }),
    );
  }

  translated(dx: number, dy: number, dz: number): Blueprint {
    return this.transformed(this.name, (x, y, z, c) => [x + dx, y + dy, z + dz, c], (m) => ({ ...m, x: m.x + dx, y: m.y + dy, z: m.z + dz }));
  }

  /**
   * Copies another blueprint into this one, moved by (dx, dy, dz). `over` (the default) lets its cells replace
   * what is here; `under` only fills cells that are still unset.
   */
  merge(other: Blueprint, dx = 0, dy = 0, dz = 0, mode: 'over' | 'under' = 'over'): this {
    other.forEach((x, y, z, c) => {
      if (mode === 'under' && this.has(x + dx, y + dy, z + dz)) return;
      this.set(x + dx, y + dy, z + dz, c);
    });
    for (const m of other.markers) this.addMarker({ ...m, x: m.x + dx, y: m.y + dy, z: m.z + dz });
    return this;
  }
}

const compareMarkers = (a: Marker, b: Marker): number =>
  a.y - b.y || a.z - b.z || a.x - b.x || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) || (a.tag ?? '').localeCompare(b.tag ?? '');

const mirrorFacing = (facing: number, axis: MirrorAxis): number =>
  axis === 'x' ? (facing === 1 ? 3 : facing === 3 ? 1 : facing) : facing === 0 ? 2 : facing === 2 ? 0 : facing;

/** How a blueprint stands in the world: which turn, which corner. */
export interface PlacementOptions {
  /** World position of the blueprint's x = 0, y = 0, z = 0 after turning. */
  x: number;
  y: number;
  z: number;
  /** Quarter turns clockwise seen from above, 0 to 3. */
  turns?: number;
  /** Mirror across the blueprint's own x = 0 before turning. */
  mirror?: boolean;
}

/**
 * A blueprint standing at a place in the world, turned and maybe mirrored. The turn is done once when the placement is
 * made, so asking about a world cell is a single array read: that is what a zone's `getBlock` does for every block of
 * every chunk near a building.
 */
export class Placement {
  readonly blueprint: Blueprint;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly turns: number;
  private readonly world: Bounds | null;

  constructor(source: Blueprint, options: PlacementOptions) {
    this.turns = (((options.turns ?? 0) % 4) + 4) % 4;
    let bp = source;
    if (options.mirror) bp = bp.mirrored('x');
    if (this.turns !== 0) bp = bp.rotated(this.turns);
    this.blueprint = bp;
    this.x = options.x;
    this.y = options.y;
    this.z = options.z;
    const b = bp.bounds();
    this.world = b && {
      minX: b.minX + this.x, minY: b.minY + this.y, minZ: b.minZ + this.z,
      maxX: b.maxX + this.x, maxY: b.maxY + this.y, maxZ: b.maxZ + this.z,
    };
  }

  /** World bounds of the set cells, inclusive. */
  bounds(): Bounds | null {
    return this.world && { ...this.world };
  }

  /** The cell at a world position, or NO_CELL where the blueprint has nothing. */
  cellAt(wx: number, wy: number, wz: number): number {
    const w = this.world;
    if (!w || wx < w.minX || wx > w.maxX || wy < w.minY || wy > w.maxY || wz < w.minZ || wz > w.maxZ) return NO_CELL;
    return this.blueprint.get(wx - this.x, wy - this.y, wz - this.z);
  }

  /** True when the placement has cells in the column or chunk-sized box. */
  touches(minX: number, minZ: number, maxX: number, maxZ: number): boolean {
    const w = this.world;
    return !!w && w.maxX >= minX && w.minX <= maxX && w.maxZ >= minZ && w.minZ <= maxZ;
  }

  /** Calls `sink` for every cell the placement sets, with world coordinates. */
  stamp(sink: (x: number, y: number, z: number, cell: Cell) => void): void {
    this.blueprint.forEach((x, y, z, c) => sink(x + this.x, y + this.y, z + this.z, c));
  }

  /** The markers in world coordinates. */
  markers(): Marker[] {
    return this.blueprint.markers.map((m) => ({ ...m, x: m.x + this.x, y: m.y + this.y, z: m.z + this.z }));
  }
}
