import type { BlockRef } from './BlueprintBuilder';
import { RoofProfile, RoofRing, FLARED, ringAt } from './roofProfile';

// Roof shells, built from a profile (roofProfile.ts). Each roof is a cross-section swept round or along a rectangle, so
// the same profile makes a gable, a hip, a hip and gable, or the skirt of an upper storey. Cells are placed through the
// `RoofSink`, which the builder implements, with roles and not block ids, so the style pack decides the tile.

/** Inclusive rectangle in blueprint coordinates. */
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export type Facing = 0 | 1 | 2 | 3; // the way a stair climbs: north, east, south, west

export interface RoofSink {
  /** Puts a role's block at a cell, with a state. */
  put(x: number, y: number, z: number, role: 'roofBlock' | 'roofStairs' | 'roofSlab' | 'ridge' | 'ridgeHorn', state?: number): void;
  /** Fills a wall cell. */
  fill(x: number, y: number, z: number, block: BlockRef): void;
  /** True when ridge caps exist in this style (the ridge is not the plain roof block). */
  readonly hasRidge: boolean;
  readonly hasHorn: boolean;
}

export interface RoofOptions {
  profile?: RoofProfile;
  /** Gables: the way the ridge runs. Default 'x'. */
  axis?: 'x' | 'z';
  /** How far the roof reaches past the gable walls, in blocks. Default 1. */
  endOverhang?: number;
  /** Raise the four eave corners, in half blocks: 0 none, 2 a block, 3 a block and a half. */
  tips?: number;
  /** What fills the gable triangles. Default the plain plaster wall. */
  gableWall?: BlockRef;
  /** Put a ridge cap along the crest. Default true when the style has one. */
  ridgeCap?: boolean;
  /** Hip and gable: how many rings of hip run round the gable. Default the profile's overhang + 1. */
  hipRings?: number;
}

export interface RoofInfo {
  /** The outer rectangle of the roof, eaves included. */
  outer: Rect;
  /** The level of the first roof cell (above the wall's last course). */
  base: number;
  /** The highest cell, ridge cap included. */
  top: number;
  /** The level of the crest cells' tops (where a chimney or finial may start). */
  crestTop: number;
  /** For a gable or hip and gable: the rectangle of the wall whose ends carry the gable triangles, and the ridge axis. */
  gable?: { wall: Rect; axis: 'x' | 'z' };
}

export const shrink = (r: Rect, n: number): Rect => ({ x0: r.x0 + n, z0: r.z0 + n, x1: r.x1 - n, z1: r.z1 - n });
export const grow = (r: Rect, n: number): Rect => shrink(r, -n);
const width = (r: Rect): number => r.x1 - r.x0 + 1;
const depth = (r: Rect): number => r.z1 - r.z0 + 1;

/** Facing of the stair on an edge cell, towards the inside of the roof. */
const inward = (x: number, z: number, r: Rect): Facing => {
  if (z === r.z0) return 2;
  if (z === r.z1) return 0;
  if (x === r.x0) return 1;
  return 3;
};

const putRing = (sink: RoofSink, x: number, z: number, base: number, ring: RoofRing, facing: Facing | null): void => {
  const y = base + ring.y;
  switch (ring.shape) {
    case 'block':
      sink.put(x, y, z, 'roofBlock');
      break;
    case 'slab':
      sink.put(x, y, z, 'roofSlab', 0);
      break;
    case 'slabTop':
      sink.put(x, y, z, 'roofSlab', 1);
      break;
    case 'stair':
      // A corner has no direction: a cube stands there.
      if (facing === null) sink.put(x, y, z, 'roofBlock');
      else sink.put(x, y, z, 'roofStairs', facing);
      break;
  }
};

/** A ridge cap along a line, with horned ends when the style has them. `axis` is the way the line runs. */
const ridgeLine = (sink: RoofSink, x0: number, z0: number, x1: number, z1: number, y: number, axis: 'x' | 'z'): void => {
  if (!sink.hasRidge) return;
  const along = axis === 'x' ? [x0, x1] : [z0, z1];
  for (let t = along[0]; t <= along[1]; t++) {
    const x = axis === 'x' ? t : x0;
    const z = axis === 'z' ? t : z0;
    const first = t === along[0];
    const last = t === along[1];
    // The horn is written at the east end of a ridge along x (state 0) and the south end of one along z (state 1);
    // turning by two puts it at the other end.
    const baseTurn = axis === 'x' ? 0 : 1;
    if (sink.hasHorn && (first || last)) sink.put(x, y, z, 'ridgeHorn', (baseTurn + (first ? 2 : 0)) & 3);
    else sink.put(x, y, z, 'ridge', baseTurn);
  }
};

/**
 * Hip rings from the outer edge of `outer` inwards: ring i is the boundary of the rectangle shrunk by i. Returns the
 * rectangle left inside the last ring (or null when the roof closed), and the level the next ring would start at.
 * With `crest` the roof closes: the last one or two rows become the crest.
 */
const hipRings = (
  sink: RoofSink, outer: Rect, base: number, profile: RoofProfile, toRing: number, crest: boolean, cap: boolean,
): { inner: Rect | null; crestTop: number } => {
  let crestTop = base;
  for (let i = 0; i < toRing; i++) {
    const r = shrink(outer, i);
    if (r.x1 < r.x0 || r.z1 < r.z0) return { inner: null, crestTop };
    const w = width(r);
    const d = depth(r);
    if (crest && Math.min(w, d) <= 2) {
      // The roof closes. The crest is level with the backs of the last ring's stairs.
      const prev = ringAt(profile, Math.max(i - 1, 0));
      const level = base + prev.y;
      for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) sink.put(x, level, z, 'roofBlock');
      crestTop = level + 1;
      if (cap && Math.min(w, d) === 1) {
        if (w >= d) ridgeLine(sink, r.x0, r.z0, r.x1, r.z0, crestTop, 'x');
        else ridgeLine(sink, r.x0, r.z0, r.x0, r.z1, crestTop, 'z');
      }
      return { inner: null, crestTop };
    }
    const ring = ringAt(profile, i);
    for (let x = r.x0; x <= r.x1; x++) {
      for (let z = r.z0; z <= r.z1; z++) {
        if (x !== r.x0 && x !== r.x1 && z !== r.z0 && z !== r.z1) continue;
        const cornerX = x === r.x0 || x === r.x1;
        const cornerZ = z === r.z0 || z === r.z1;
        putRing(sink, x, z, base, ring, cornerX && cornerZ ? null : inward(x, z, r));
      }
    }
    crestTop = base + ring.y + 1;
  }
  const inner = shrink(outer, toRing);
  return { inner: inner.x1 < inner.x0 || inner.z1 < inner.z0 ? null : inner, crestTop };
};

/**
 * Turns the four eave corners up. The corner column is solid and rises `half` half-blocks over the lip's top (so 2 is a
 * block higher than the eave beside it, 1 a slab), and with 3 or more the two cells beside it on each edge rise too.
 */
export const cornerTips = (sink: RoofSink, outer: Rect, base: number, profile: RoofProfile, half: number): void => {
  if (half <= 0) return;
  const y = base + ringAt(profile, 0).y;
  const corners: Array<[number, number, number, number]> = [
    [outer.x0, outer.z0, 1, 1], [outer.x1, outer.z0, -1, 1], [outer.x0, outer.z1, 1, -1], [outer.x1, outer.z1, -1, -1],
  ];
  // A column over a cell whose own top is at y + 1 (a cube, or the lip of a slab): `n` half-blocks more.
  const rise = (x: number, z: number, n: number): void => {
    sink.put(x, y, z, 'roofBlock');
    for (let k = 0; k < Math.floor(n / 2); k++) sink.put(x, y + 1 + k, z, 'roofBlock');
    if (n % 2 === 1) sink.put(x, y + 1 + Math.floor(n / 2), z, 'roofSlab', 0);
  };
  for (const [cx, cz, sx, sz] of corners) {
    rise(cx, cz, half);
    // Past three half-blocks the cells beside the corner rise too, a half block less for every cell along the edge, so a tall
    // tip sweeps up out of the eave (the curve of a pagoda roof) instead of standing alone. The second ring in from the edge
    // follows the first three half blocks lower, so the tip has some thickness from the front and is not a fin.
    if (half >= 3) {
      for (let k = 1; half - k > 0; k++) {
        for (const [nx, nz, ix, iz] of [[cx + sx * k, cz, 0, sz], [cx, cz + sz * k, sx, 0]]) {
          if (nx < outer.x0 || nx > outer.x1 || nz < outer.z0 || nz > outer.z1) continue;
          rise(nx, nz, half - k);
          const px = nx + ix, pz = nz + iz;
          if (half - k - 3 > 0 && px >= outer.x0 && px <= outer.x1 && pz >= outer.z0 && pz <= outer.z1) rise(px, pz, half - k - 3);
        }
      }
    }
  }
};

/** A hip roof over the wall rectangle `wall`, whose last course is at `plateY`. */
export const hipRoof = (sink: RoofSink, wall: Rect, plateY: number, options: RoofOptions = {}): RoofInfo => {
  const profile = options.profile ?? FLARED;
  const base = plateY + 1;
  const outer = grow(wall, profile.overhang);
  const cap = options.ridgeCap ?? true;
  const rings = Math.ceil(Math.min(width(outer), depth(outer)) / 2) + 1;
  const { crestTop } = hipRings(sink, outer, base, profile, rings, true, cap);
  if (options.tips) cornerTips(sink, outer, base, profile, options.tips);
  return { outer, base, top: crestTop + (cap && sink.hasRidge ? 1 : 0), crestTop };
};

/**
 * A gable roof over `wall`, the ridge along `axis`. The ends of the roof reach `endOverhang` blocks past the gable walls,
 * and the gable triangles are filled with `gableWall`.
 */
export const gableRoof = (sink: RoofSink, wall: Rect, plateY: number, options: RoofOptions = {}): RoofInfo => {
  const profile = options.profile ?? FLARED;
  const axis = options.axis ?? 'x';
  const e = options.endOverhang ?? 1;
  const base = plateY + 1;
  const o = profile.overhang;
  const outer: Rect = axis === 'x'
    ? { x0: wall.x0 - e, x1: wall.x1 + e, z0: wall.z0 - o, z1: wall.z1 + o }
    : { x0: wall.x0 - o, x1: wall.x1 + o, z0: wall.z0 - e, z1: wall.z1 + e };
  const cap = options.ridgeCap ?? true;
  // Cross-section coordinate c runs across the ridge (z for an x ridge) and t along it.
  const c0 = axis === 'x' ? outer.z0 : outer.x0;
  const c1 = axis === 'x' ? outer.z1 : outer.x1;
  const t0 = axis === 'x' ? outer.x0 : outer.z0;
  const t1 = axis === 'x' ? outer.x1 : outer.z1;
  const place = (t: number, c: number, y: number, role: Parameters<RoofSink['put']>[3], state?: number): void =>
    axis === 'x' ? sink.put(t, y, c, role, state) : sink.put(c, y, t, role, state);
  // The level, relative to the base, up to which the gable wall is needed for each across coordinate.
  const under = new Map<number, number>();
  let crestTop = base;
  for (let i = 0; ; i++) {
    const a = c0 + i;
    const b = c1 - i;
    if (a > b) break;
    const span = b - a + 1;
    if (span <= 2) {
      const prev = ringAt(profile, Math.max(i - 1, 0));
      const level = base + prev.y;
      for (let t = t0; t <= t1; t++) for (let c = a; c <= b; c++) place(t, c, level, 'roofBlock');
      for (let c = a; c <= b; c++) under.set(c, prev.y);
      crestTop = level + 1;
      if (cap && span === 1) ridgeLine(sink, axis === 'x' ? t0 : a, axis === 'x' ? a : t0, axis === 'x' ? t1 : a, axis === 'x' ? a : t1, crestTop, axis);
      break;
    }
    const ring = ringAt(profile, i);
    // On an x ridge the cell nearer north (a) climbs south, and on a z ridge the one nearer west climbs east.
    const faceA: Facing = axis === 'x' ? 2 : 1;
    const faceB: Facing = axis === 'x' ? 0 : 3;
    for (let t = t0; t <= t1; t++) {
      const put = (c: number, f: Facing): void => {
        const r = ring;
        const y = base + r.y;
        switch (r.shape) {
          case 'block': place(t, c, y, 'roofBlock'); break;
          case 'slab': place(t, c, y, 'roofSlab', 0); break;
          case 'slabTop': place(t, c, y, 'roofSlab', 1); break;
          case 'stair': place(t, c, y, 'roofStairs', f); break;
        }
      };
      put(a, faceA);
      put(b, faceB);
    }
    under.set(a, ring.y);
    under.set(b, ring.y);
    crestTop = base + ring.y + 1;
  }
  // The gable walls stand on the plate at both ends of the walls and rise to the underside of the roof.
  {
    const fillBlock = options.gableWall ?? 'wall';
    const ends = axis === 'x' ? [wall.x0, wall.x1] : [wall.z0, wall.z1];
    const cLo = axis === 'x' ? wall.z0 : wall.x0;
    const cHi = axis === 'x' ? wall.z1 : wall.x1;
    for (const t of ends) {
      for (let c = cLo; c <= cHi; c++) {
        const top = under.get(c) ?? 0;
        for (let k = 0; k < top; k++) {
          if (axis === 'x') sink.fill(t, base + k, c, fillBlock);
          else sink.fill(c, base + k, t, fillBlock);
        }
      }
    }
  }
  if (options.tips) cornerTips(sink, outer, base, profile, options.tips);
  return { outer, base, top: crestTop + (cap && sink.hasRidge ? 1 : 0), crestTop, gable: { wall, axis } };
};

/**
 * A hip and gable roof (irimoya): hip rings round the edge, then a gable on top whose triangles stand back from the
 * eaves, so the roof shows four sloping faces below and two gable faces above.
 */
export const hipGableRoof = (sink: RoofSink, wall: Rect, plateY: number, options: RoofOptions = {}): RoofInfo => {
  const profile = options.profile ?? FLARED;
  const base = plateY + 1;
  const outer = grow(wall, profile.overhang);
  const longX = width(outer) >= depth(outer);
  const short = Math.min(width(outer), depth(outer));
  // The upper gable needs at least three blocks of width: with fewer, the roof is a plain hip.
  let m = options.hipRings ?? profile.overhang + 1;
  m = Math.max(1, Math.min(m, Math.floor((short - 3) / 2)));
  if (short < 5 || m < 1) return hipRoof(sink, wall, plateY, options);
  const cap = options.ridgeCap ?? true;
  const { inner } = hipRings(sink, outer, base, profile, m, false, cap);
  if (!inner) return hipRoof(sink, wall, plateY, options);
  const upperAxis = longX ? 'x' : 'z';
  // The upper gable is an ordinary gable over `inner`, whose cross-section continues the profile at ring m.
  const shifted: RoofProfile = {
    name: `${profile.name}-upper`,
    overhang: 0,
    tail: profile.tail,
    rings: Array.from({ length: Math.max(profile.rings.length - m, 1) }, (_, k) => ringAt(profile, m + k)),
  };
  // Re-express the upper levels from the hip's ring m: they are already relative to the base, so keep them.
  const upperWall: Rect = inner;
  const info = gableRoof(sink, upperWall, plateY, {
    profile: shifted, axis: upperAxis, endOverhang: 1, gableWall: options.gableWall, ridgeCap: cap,
  });
  // Under the gable's overhang the last hip ring would leave a slit between its low step and the barge above: make
  // that stretch of the ring solid, level with the barge's underside.
  const last = ringAt(profile, m - 1);
  const [e0, e1] = upperAxis === 'x' ? [inner.x0 - 1, inner.x1 + 1] : [inner.z0 - 1, inner.z1 + 1];
  const [a0, a1] = upperAxis === 'x' ? [inner.z0, inner.z1] : [inner.x0, inner.x1];
  for (const e of [e0, e1]) {
    for (let c = a0; c <= a1; c++) {
      if (upperAxis === 'x') sink.put(e, base + last.y, c, 'roofBlock');
      else sink.put(c, base + last.y, e, 'roofBlock');
    }
  }
  if (options.tips) cornerTips(sink, outer, base, profile, options.tips);
  return { outer, base, top: info.top, crestTop: info.crestTop, gable: { wall: upperWall, axis: upperAxis } };
};

/**
 * The skirt roof round a lower storey (a mokoshi): `rings` rings of the profile from the outer edge, with nothing
 * above them. The next storey's walls stand inside the returned rectangle. Returns null if the rings use up the roof.
 */
export const eaveRings = (sink: RoofSink, outer: Rect, base: number, rings: number, profile: RoofProfile = FLARED, tips = 0): Rect | null => {
  const { inner } = hipRings(sink, outer, base, profile, rings, false, false);
  if (tips) cornerTips(sink, outer, base, profile, tips);
  return inner;
};
