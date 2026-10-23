// How a block of a feature is placed relative to the ground.
export enum Place {
  // y = ground at the feature's origin + dy. For trunks and canopies, which keep their shape on a slope.
  ORIGIN = 0,
  // y = ground of the block's own column + dy, and only on soil a plant can root in.
  SOIL = 1,
  // y = ground of the block's own column + dy, on any land above the water line (boulders, fallen logs).
  LAND = 2,
  // y = ground of the block's own column + dy, only on the shore: land at the water line (reeds).
  SHORE = 3,
}

// The blocks of one feature as offsets from its origin, in the order they are placed. Parallel typed arrays, so a
// cached feature is a few kilobytes.
export class BlockList {
  dx = new Int8Array(256);
  dy = new Int16Array(256);
  dz = new Int8Array(256);
  id = new Uint16Array(256);
  place = new Uint8Array(256);
  length = 0;

  add(dx: number, dy: number, dz: number, id: number, place: Place = Place.ORIGIN): void {
    if (this.length === this.id.length) this.grow();
    const n = this.length++;
    this.dx[n] = dx;
    this.dy[n] = dy;
    this.dz[n] = dz;
    this.id[n] = id;
    this.place[n] = place;
  }

  private grow(): void {
    const cap = this.id.length * 2;
    const widen = <T extends Int8Array | Int16Array | Uint16Array | Uint8Array>(a: T): T => {
      const b = new (a.constructor as new (n: number) => T)(cap);
      b.set(a);
      return b;
    };
    this.dx = widen(this.dx);
    this.dy = widen(this.dy);
    this.dz = widen(this.dz);
    this.id = widen(this.id);
    this.place = widen(this.place);
  }
}
