import { WATER_LEVEL } from '../../worldConstants';

// The height of a road along its length. Pure arithmetic on arrays, so it can be tested without a world.

// A road climbs at most this many blocks per block of length: one block in four, inside the one in three the phase asks.
export const MAX_GRADE = 0.25;
// A deck sits one block above the water.
export const DECK_LEVEL = WATER_LEVEL + 1;
// Where the natural ground is below the water line the road is a bridge. It also covers this many blocks of dry
// ground at each end, so the deck rests on land, and bridges closer together than BRIDGE_GAP are joined.
const BRIDGE_ABUT = 4;
const BRIDGE_GAP = 14;
// Radius, in vertices, of the box filter (run twice) that smooths the natural height into the road's.
const SMOOTH = 8;

export interface Profile {
  level: Float64Array;   // road surface height at each vertex, as a float (the surface block is its floor)
  bridge: Uint8Array;    // 1 where the road is a bridge
}

const boxBlur = (src: Float64Array, radius: number): Float64Array => {
  const n = src.length;
  const out = new Float64Array(n);
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + src[i];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - radius);
    const b = Math.min(n - 1, i + radius);
    out[i] = (prefix[b + 1] - prefix[a]) / (b - a + 1);
  }
  return out;
};

// Limits the change between neighbours to `grade` per block of length, keeping both ends where they are.
// `len[i]` is the distance from vertex i to i + 1.
const slew = (level: Float64Array, len: Float64Array, grade: number): void => {
  const n = level.length;
  for (let i = 1; i < n; i++) {
    const step = grade * len[i - 1];
    level[i] = Math.min(level[i - 1] + step, Math.max(level[i - 1] - step, level[i]));
  }
  for (let i = n - 2; i >= 0; i--) {
    const step = grade * len[i];
    level[i] = Math.min(level[i + 1] + step, Math.max(level[i + 1] - step, level[i]));
  }
};

// `natural[i]` is the ground height at vertex i without the road (a float), `len[i]` the distance to the next vertex.
// The first and last vertices keep their natural height exactly, because that is where the road meets a zone, whose
// ground the road must not step away from.
export const buildProfile = (natural: Float64Array, len: Float64Array, grade: number = MAX_GRADE): Profile => {
  const n = natural.length;
  const bridge = new Uint8Array(n);

  // Bridges: runs of water, widened at both ends and joined when close.
  const wet: number[] = [];
  for (let i = 1; i < n - 1; i++) if (natural[i] < WATER_LEVEL) wet.push(i);
  let arc = 0;
  const arcAt = new Float64Array(n);
  for (let i = 1; i < n; i++) { arc += len[i - 1]; arcAt[i] = arc; }
  const mark = (from: number, to: number): void => {
    for (let i = Math.max(1, from); i <= Math.min(n - 2, to); i++) bridge[i] = 1;
  };
  let lastEnd = -1;
  for (const i of wet) {
    let a = i;
    while (a > 1 && arcAt[i] - arcAt[a - 1] <= BRIDGE_ABUT) a--;
    let b = i;
    while (b < n - 2 && arcAt[b + 1] - arcAt[i] <= BRIDGE_ABUT) b++;
    mark(a, b);
    if (lastEnd >= 0 && arcAt[a] - arcAt[lastEnd] <= BRIDGE_GAP) mark(lastEnd, a);
    lastEnd = b;
  }

  // The natural ground, lifted to the deck where it is lower, then smoothed.
  const lifted = new Float64Array(n);
  for (let i = 0; i < n; i++) lifted[i] = natural[i] < DECK_LEVEL ? DECK_LEVEL : natural[i];
  lifted[0] = natural[0];
  lifted[n - 1] = natural[n - 1];
  const smooth = boxBlur(boxBlur(lifted, SMOOTH), SMOOTH);
  const level = new Float64Array(n);
  for (let i = 0; i < n; i++) level[i] = bridge[i] ? DECK_LEVEL : smooth[i];
  level[0] = natural[0];
  level[n - 1] = natural[n - 1];

  // Keep the target inside the cone the two pinned ends allow, so the passes below can honour both the grade and
  // the ends.
  const total = arcAt[n - 1];
  for (let i = 0; i < n; i++) {
    const lo = Math.max(natural[0] - grade * arcAt[i], natural[n - 1] - grade * (total - arcAt[i]));
    const hi = Math.min(natural[0] + grade * arcAt[i], natural[n - 1] + grade * (total - arcAt[i]));
    level[i] = lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, level[i]));
  }
  slew(level, len, grade);
  // A tiny lift, so a level that is meant to be a whole number floors to it whatever the rounding of the blend. The
  // ends are left alone: they are the zone's own height.
  for (let i = 1; i < n - 1; i++) level[i] += 0.001;
  level[0] = natural[0];
  level[n - 1] = natural[n - 1];
  return { level, bridge };
};
