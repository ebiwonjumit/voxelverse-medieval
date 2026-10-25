// Roof profiles as data. A roof is read from its outer edge towards its crest, one ring (one block of run) at a time, and
// each ring says which block stands there and how high. A profile is the cross-section of the eave, so changing the data
// changes the curve of every roof built from it: a straight stair roof, a gentle one, or the flared eave of a pagoda that
// runs nearly flat for the first blocks, then climbs, with the very tip turned up.
//
// The block shapes and what they put in a cell at level L (the cell from L to L + 1):
//   block     the whole cell: surface at L + 1
//   slab      the lower half: surface at L + 0.5
//   slabTop   the upper half, nothing under it: surface at L + 1, and a thin sheet seen from below (an eave lip)
//   stair     a stair that climbs inwards: the low step outside (L + 0.5), the back inside (L + 1)
//
// Levels are blocks above `base`, the cell on top of the wall's last course; the ring over the wall (ring `overhang`) is
// the first that can sit at level 0 without floating, and rings outside it may dip below 0 where the eave drops.

export type RoofShape = 'block' | 'stair' | 'slab' | 'slabTop';

export interface RoofRing {
  shape: RoofShape;
  /** Cell level in blocks above the base. */
  y: number;
}

export interface RoofProfile {
  readonly name: string;
  /** Rings from the outer edge inwards. Rings past the end repeat `tail`. */
  readonly rings: readonly RoofRing[];
  /** How many rings lie outside the wall line: ring `overhang` is the one over the wall. */
  readonly overhang: number;
  /**
   * What happens past the last ring: 'steep' climbs a block per ring with stairs, 'gentle' alternates a slab and a stair
   * and climbs half a block per ring.
   */
  readonly tail: 'steep' | 'gentle';
}

const ring = (shape: RoofShape, y: number): RoofRing => ({ shape, y });

/** The ring at index i, extending the profile with its tail past the data. */
export const ringAt = (profile: RoofProfile, i: number): RoofRing => {
  const n = profile.rings.length;
  if (i < n) return profile.rings[i];
  let cur = profile.rings[n - 1];
  for (let k = n; k <= i; k++) {
    if (profile.tail === 'steep') {
      cur = ring('stair', cur.y + 1);
    } else if (cur.shape === 'slab') {
      cur = ring('stair', cur.y);
    } else {
      // After a stair, a block or a lip the surface is at y + 1, where the next slab starts.
      cur = ring('slab', cur.y + 1);
    }
  }
  return cur;
};

/** One block of rise per block of run, one block of overhang. The plain roof of a Western gable. */
export const STEEP: RoofProfile = {
  name: 'steep',
  overhang: 1,
  tail: 'steep',
  rings: [ring('stair', -1), ring('stair', 0)],
};

/** Half a block of rise per block of run: slab, stair, slab, stair. */
export const GENTLE: RoofProfile = {
  name: 'gentle',
  overhang: 2,
  tail: 'gentle',
  rings: [ring('slab', -1), ring('stair', -1), ring('slab', 0)],
};

/**
 * The curved eave: two blocks of overhang, the first a lip turned up, the second running flat, then a stair over the
 * wall and a steeper one for every ring after it, so the surface is concave and the tip is raised. This is the
 * profile of the town's ordinary roofs: it needs a span of eleven or more to show its curve.
 */
export const FLARED: RoofProfile = {
  name: 'flared',
  overhang: 2,
  tail: 'steep',
  rings: [ring('slabTop', 0), ring('slab', 0), ring('stair', 0), ring('stair', 1)],
};

/** The same eave for a narrow roof (a gate, a porch): one ring of overhang, a lifted lip, then the steep run. */
export const FLARED_TIGHT: RoofProfile = {
  name: 'flared-tight',
  overhang: 1,
  tail: 'steep',
  rings: [ring('slabTop', 0), ring('stair', 0), ring('stair', 1)],
};

/** A deeper flare for the big roofs: three blocks of overhang and a longer, lower sweep, steepening to the crest. */
export const FLARED_DEEP: RoofProfile = {
  name: 'flared-deep',
  overhang: 3,
  tail: 'steep',
  rings: [
    ring('slabTop', 0), ring('slab', 0), ring('slab', 0), ring('stair', 0),
    ring('slab', 1), ring('stair', 1), ring('stair', 2),
  ],
};

export const ROOF_PROFILES: Readonly<Record<string, RoofProfile>> = {
  [STEEP.name]: STEEP,
  [GENTLE.name]: GENTLE,
  [FLARED.name]: FLARED,
  [FLARED_TIGHT.name]: FLARED_TIGHT,
  [FLARED_DEEP.name]: FLARED_DEEP,
};
