import { FX_KIND_COUNT } from '../../engine/blockFx';
import { SITE_STRIDE } from '../../meshing/ChunkMesher';

export { SITE_STRIDE };

// The places the effects can start from, as the mesher found them (MeshData.sites): per chunk, one list of sites per kind.
// The renderer hands each chunk's lists over when its mesh arrives and takes them back when the chunk is dropped; the emitters
// ask for a random site near the player. Nothing here scans the world, and nothing allocates after a chunk has been stored:
// the chunks around the player are gathered into a fixed array when the player changes chunk or the store changes, and a pick
// is a walk over that array.
//
// A site is SITE_STRIDE ints in a list: world x, y, z of the block (its centre; blocks are centred on whole numbers in world
// space) and `block id | drop << 12`.

export const SITE_X = 0;
export const SITE_Y = 1;
export const SITE_Z = 2;
export const SITE_AUX = 3;

export const siteBlock = (aux: number): number => aux & 0xfff;
/** The cells of air under a petal site, from the underside of the leaf down to what is below the air. */
export const siteDrop = (aux: number): number => aux >> 12;

const CHUNK = 32;
/** How far around the player's chunk (in chunks) the store gathers sites: 3 is 96 blocks, past what any emitter uses. */
export const NEAR_RADIUS_CHUNKS = 3;
const NEAR_CAPACITY = (2 * NEAR_RADIUS_CHUNKS + 1) * (2 * NEAR_RADIUS_CHUNKS + 1);

export interface ChunkSites {
  cx: number;
  cz: number;
  /** One list per kind (FX_KINDS order), SITE_STRIDE ints a site. */
  lists: Int32Array[];
}

const keyOf = (cx: number, cz: number): number => (cx + 32768) * 65536 + (cz + 32768);

export class SiteStore {
  /** Changes whenever a chunk is stored or removed. */
  version = 0;
  /** The chunks around the player, filled by `refresh`. Only the first `nearCount` entries are live. */
  readonly near: ChunkSites[] = [];
  nearCount = 0;
  /** How many sites of each kind there are in the near chunks. */
  readonly nearTotals = new Int32Array(FX_KIND_COUNT);
  /** How many chunks are stored. */
  get size(): number {
    return this.byKey.size;
  }

  private readonly byKey = new Map<number, ChunkSites>();
  private nearCx = NaN;
  private nearCz = NaN;
  private nearVersion = -1;
  /** Bumped whenever `refresh` actually gathered again, so a consumer of the near chunks (the halos) knows to rebuild. */
  gathered = 0;

  constructor() {
    for (let i = 0; i < NEAR_CAPACITY; i++) this.near.push({ cx: 0, cz: 0, lists: [] });
  }

  /** Stores the lists of a chunk, replacing any it had. The arrays are kept, not copied. */
  set(cx: number, cz: number, lists: Int32Array[]): void {
    this.byKey.set(keyOf(cx, cz), { cx, cz, lists });
    this.version++;
  }

  delete(cx: number, cz: number): void {
    if (this.byKey.delete(keyOf(cx, cz))) this.version++;
  }

  clear(): void {
    this.byKey.clear();
    this.version++;
  }

  /** The sites of a chunk, or undefined if it has none stored. */
  get(cx: number, cz: number): ChunkSites | undefined {
    return this.byKey.get(keyOf(cx, cz));
  }

  /** Gathers the chunks around a position if it is in another chunk than last time or the store changed. Allocation free. */
  refresh(x: number, z: number): void {
    const cx = Math.floor((x + 0.5) / CHUNK);
    const cz = Math.floor((z + 0.5) / CHUNK);
    if (cx === this.nearCx && cz === this.nearCz && this.version === this.nearVersion) return;
    this.nearCx = cx;
    this.nearCz = cz;
    this.nearVersion = this.version;
    this.gathered++;
    this.nearTotals.fill(0);
    let n = 0;
    for (let dx = -NEAR_RADIUS_CHUNKS; dx <= NEAR_RADIUS_CHUNKS; dx++) {
      for (let dz = -NEAR_RADIUS_CHUNKS; dz <= NEAR_RADIUS_CHUNKS; dz++) {
        const entry = this.byKey.get(keyOf(cx + dx, cz + dz));
        if (!entry) continue;
        this.near[n++] = entry;
        for (let k = 0; k < FX_KIND_COUNT; k++) {
          const list = entry.lists[k];
          if (list) this.nearTotals[k] += list.length / SITE_STRIDE;
        }
      }
    }
    this.nearCount = n;
  }

  /**
   * Writes the site numbered `index` (0 to nearTotals[kind] - 1, in the order of the near chunks) into `out` as SITE_STRIDE
   * ints. Returns false when there is no such site. Allocation free.
   */
  site(kind: number, index: number, out: Int32Array): boolean {
    let remaining = index;
    for (let c = 0; c < this.nearCount; c++) {
      const list = this.near[c].lists[kind];
      if (!list) continue;
      const count = list.length / SITE_STRIDE;
      if (remaining < count) {
        const o = remaining * SITE_STRIDE;
        out[0] = list[o];
        out[1] = list[o + 1];
        out[2] = list[o + 2];
        out[3] = list[o + 3];
        return true;
      }
      remaining -= count;
    }
    return false;
  }

  /**
   * How many sites of `kind` lie in the near chunks whose square comes within `radius` of (x, z): an upper bound on the sites within
   * the radius, close enough when the radius is a chunk or more. Allocation free.
   */
  countWithin(kind: number, x: number, z: number, radius: number): number {
    let total = 0;
    for (let c = 0; c < this.nearCount; c++) {
      const entry = this.near[c];
      const list = entry.lists[kind];
      if (list && this.chunkWithin(entry, x, z, radius)) total += list.length / SITE_STRIDE;
    }
    return total;
  }

  /**
   * A site of `kind` chosen by a number in [0, 1) among those in near chunks that come within `radius` of (x, z), so an emitter with
   * a small radius does not spend its picks on sites a hundred blocks away. The site itself may still be outside the radius (its
   * chunk only comes near it). Returns false when there is none. Allocation free.
   */
  pickWithin(kind: number, r: number, x: number, z: number, radius: number, out: Int32Array): boolean {
    const total = this.countWithin(kind, x, z, radius);
    if (total === 0) return false;
    let remaining = Math.min(Math.floor(r * total), total - 1);
    for (let c = 0; c < this.nearCount; c++) {
      const entry = this.near[c];
      const list = entry.lists[kind];
      if (!list || !this.chunkWithin(entry, x, z, radius)) continue;
      const count = list.length / SITE_STRIDE;
      if (remaining < count) {
        const o = remaining * SITE_STRIDE;
        out[0] = list[o];
        out[1] = list[o + 1];
        out[2] = list[o + 2];
        out[3] = list[o + 3];
        return true;
      }
      remaining -= count;
    }
    return false;
  }

  private chunkWithin(entry: ChunkSites, x: number, z: number, radius: number): boolean {
    const minX = entry.cx * CHUNK - 0.5;
    const minZ = entry.cz * CHUNK - 0.5;
    const dx = x < minX ? minX - x : x > minX + CHUNK ? x - minX - CHUNK : 0;
    const dz = z < minZ ? minZ - z : z > minZ + CHUNK ? z - minZ - CHUNK : 0;
    return dx * dx + dz * dz <= radius * radius;
  }

  /** A site chosen by a number in [0, 1), the way the emitters draw one. */
  pick(kind: number, r: number, out: Int32Array): boolean {
    const total = this.nearTotals[kind];
    if (total === 0) return false;
    return this.site(kind, Math.min(Math.floor(r * total), total - 1), out);
  }
}
