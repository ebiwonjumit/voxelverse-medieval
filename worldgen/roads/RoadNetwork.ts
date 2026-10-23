import { getZone } from '../../zones';
import { SimplexNoise, hash2 } from '../noise';
import { WILDERNESS_NAME } from '../zones/ZoneInfo';
import { DECK_HALF, RoadField, RoadHit, SHOULDER, clearRoadHit, newRoadHit } from './RoadField';
import { buildProfile } from './RoadProfile';
import { EDGES, EdgeDef, END_PIN, FLARE } from './layout';

const smoothstep = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// Distance between the vertices of a road, nominally. Short enough that the sides of a bend look smooth.
const SPACING = 2;
// Edge buckets of the spatial index are this many blocks wide.
const CELL = 8;
// A bucket holds every segment within half a width plus this much of the bucket, which covers the shoulder and the
// furthest margin a feature asks for (the widest feature radius plus one is 9).
const REACH = 11;
// Waypoints: a post every this many blocks of road, and one near each end (the junctions).
const POST_EVERY = 64;
const POST_OFFSET = 2.2;
const JUNCTION_INSET = 6;
// How much the edge of the road wanders, in blocks either way, away from the gates.
const JITTER = 0.55;

// A road's vertices, for tools and tests. Index 0 is at the first gate and the last is at the second.
export interface RoadEdge {
  readonly name: string;
  readonly importance: number;
  readonly x: Float64Array;
  readonly z: Float64Array;
  readonly half: Float64Array;     // half width at each vertex, before edge jitter
  readonly level: Float64Array;    // road surface height (float)
  readonly bridge: Uint8Array;
  readonly arc: Float64Array;      // distance along the road
  // The vertices between these (inclusive) are in the wilderness; the rest are inside a zone's footprint, where the
  // road is painted onto the zone's own ground.
  readonly wildFrom: number;
  readonly wildTo: number;
}

export interface Waypoint { x: number; z: number }

export type NaturalHeight = (x: number, z: number) => number;
export type IsWild = (x: number, z: number) => boolean;

const isWilderness: IsWild = (x, z) => getZone(Math.round(x), Math.round(z)).name === WILDERNESS_NAME;

const BIAS = 32768;
const cellKey = (cx: number, cz: number): number => (cx + BIAS) * 65536 + (cz + BIAS);
const postKey = (x: number, z: number): number => (x + 1048576) * 2097152 + (z + 1048576);

// Gates linked by noisy splines, sampled densely, with the height of each road worked out ahead of time. A query
// finds the nearest centreline point through grid buckets that already hold every segment that could be that near, so
// it costs the same wherever in the world it is asked and a handful of distance tests where a road is. Everything is
// computed from the seed, once, when the network is built.
export class RoadNetwork implements RoadField {
  readonly edges: RoadEdge[] = [];
  readonly waypoints: Waypoint[] = [];

  // Vertices of every road, one after another.
  private vx = new Float64Array(0);
  private vz = new Float64Array(0);
  private vhalf = new Float64Array(0);
  private vjit = new Float64Array(0);
  private vlevel = new Float64Array(0);
  private vbridge = new Uint8Array(0);
  private varc = new Float64Array(0);
  // Segment s joins vertex segA[s] and the next one.
  private segA = new Int32Array(0);
  private segEdge = new Int16Array(0);
  // The first and last vertex of every road, to cut the road off square at its gates.
  private edgeFirst = new Int32Array(0);
  private edgeLast = new Int32Array(0);
  private readonly cells = new Map<number, Int32Array>();
  private readonly posts = new Set<number>();
  private readonly edgeNoise: SimplexNoise;
  private readonly jitterNoise: SimplexNoise;
  private readonly widthNoise: SimplexNoise;
  private readonly scratch = newRoadHit();

  constructor(readonly seed: number, natural: NaturalHeight, wild: IsWild = isWilderness, defs: readonly EdgeDef[] = EDGES) {
    const make = (salt: number) => new SimplexNoise(hash2(salt, 0x70ad, seed) | 0);
    this.edgeNoise = make(81);
    this.jitterNoise = make(82);
    this.widthNoise = make(83);
    defs.forEach((def, i) => this.edges.push(this.buildEdge(def, i, natural, wild)));
    this.index();
    this.placeWaypoints(wild);
  }

  // The road's path: a Hermite curve that leaves the first gate heading away from its zone and arrives at the second
  // heading into its zone, plus a wandering sideways offset that fades out towards both gates.
  private buildEdge(def: EdgeDef, e: number, natural: NaturalHeight, wild: IsWild): RoadEdge {
    const a = def.from;
    const b = def.to;
    const chord = Math.hypot(b.x - a.x, b.z - a.z);
    const k = chord * 0.5;
    const m0x = a.dx * k, m0z = a.dz * k;
    const m1x = -b.dx * k, m1z = -b.dz * k;
    const dense = Math.ceil(chord) + 1;
    const dxs = new Float64Array(dense + 1);
    const dzs = new Float64Array(dense + 1);
    const cum = new Float64Array(dense + 1);
    for (let i = 0; i <= dense; i++) {
      const t = i / dense, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      dxs[i] = h00 * a.x + h10 * m0x + h01 * b.x + h11 * m1x;
      dzs[i] = h00 * a.z + h10 * m0z + h01 * b.z + h11 * m1z;
      if (i > 0) cum[i] = cum[i - 1] + Math.hypot(dxs[i] - dxs[i - 1], dzs[i] - dzs[i - 1]);
    }
    const total = cum[dense];
    const n = Math.max(2, Math.round(total / SPACING)) + 1;
    const bx = new Float64Array(n), bz = new Float64Array(n);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const s = (total * i) / (n - 1);
      while (j < dense - 1 && cum[j + 1] < s) j++;
      const f = cum[j + 1] > cum[j] ? (s - cum[j]) / (cum[j + 1] - cum[j]) : 0;
      bx[i] = dxs[j] + (dxs[j + 1] - dxs[j]) * f;
      bz[i] = dzs[j] + (dzs[j + 1] - dzs[j]) * f;
    }
    bx[0] = a.x; bz[0] = a.z; bx[n - 1] = b.x; bz[n - 1] = b.z;

    // Sideways wandering, in blocks, along the road's own length.
    const x = new Float64Array(n), z = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const s = (total * i) / (n - 1);
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      const tx = bx[i1] - bx[i0], tz = bz[i1] - bz[i0];
      const tl = Math.hypot(tx, tz) || 1;
      const fade = smoothstep(Math.min(s, total - s) / END_PIN);
      const wander = def.bend === 0 ? 0 :
        def.bend * fade * (0.7 * this.edgeNoise.noise2(s / def.wavelength, e * 13.7) + 0.3 * this.edgeNoise.noise2(s / (def.wavelength * 0.37) + 50, e * 13.7 + 5));
      x[i] = bx[i] - (tz / tl) * wander;
      z[i] = bz[i] + (tx / tl) * wander;
    }

    const len = new Float64Array(n - 1);
    const arc = new Float64Array(n);
    for (let i = 0; i < n - 1; i++) { len[i] = Math.hypot(x[i + 1] - x[i], z[i + 1] - z[i]); arc[i + 1] = arc[i] + len[i]; }
    const length = arc[n - 1];

    // Half width: 3 to 4 blocks plus the importance, wider near a gate to match the zone's own road there.
    const half = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const s = arc[i];
      if (length < 2 * FLARE) {
        half[i] = a.half + (b.half - a.half) * smoothstep(s / length);
        continue;
      }
      const base = 0.5 * (3 + 0.5 + 0.5 * this.widthNoise.noise2(s / 90, e * 7.3) + def.importance);
      const fa = 1 - smoothstep(s / FLARE);
      const fb = 1 - smoothstep((length - s) / FLARE);
      half[i] = base + (a.half - base) * fa + (b.half - base) * fb;
    }

    // Where the road is in the wilderness; the stretches inside a footprint follow the zone's ground.
    let wildFrom = -1, wildTo = -1;
    for (let i = 0; i < n; i++) {
      if (!wild(x[i], z[i])) continue;
      if (wildFrom < 0) wildFrom = i;
      wildTo = i;
    }
    if (wildFrom < 0) throw new Error(`Road ${def.name} never leaves its zones`);
    for (let i = wildFrom; i <= wildTo; i++) {
      if (!wild(x[i], z[i])) throw new Error(`Road ${def.name} leaves the wilderness and returns at vertex ${i}`);
    }

    const count = wildTo - wildFrom + 1;
    const natH = new Float64Array(count);
    for (let i = 0; i < count; i++) natH[i] = natural(x[wildFrom + i], z[wildFrom + i]);
    const profile = buildProfile(natH, len.slice(wildFrom, wildFrom + count - 1));
    const level = new Float64Array(n);
    const bridge = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const w = Math.min(count - 1, Math.max(0, i - wildFrom));
      level[i] = profile.level[w];
      bridge[i] = i >= wildFrom && i <= wildTo ? profile.bridge[w] : 0;
    }
    return { name: def.name, importance: def.importance, x, z, half, level, bridge, arc, wildFrom, wildTo };
  }

  private index(): void {
    let total = 0;
    for (const edge of this.edges) total += edge.x.length;
    this.vx = new Float64Array(total); this.vz = new Float64Array(total);
    this.vhalf = new Float64Array(total); this.vjit = new Float64Array(total);
    this.vlevel = new Float64Array(total); this.vbridge = new Uint8Array(total); this.varc = new Float64Array(total);
    const segA: number[] = [], segEdge: number[] = [];
    this.edgeFirst = new Int32Array(this.edges.length);
    this.edgeLast = new Int32Array(this.edges.length);
    let base = 0;
    this.edges.forEach((edge, e) => {
      const n = edge.x.length;
      this.edgeFirst[e] = base;
      this.edgeLast[e] = base + n - 1;
      const length = edge.arc[n - 1];
      for (let i = 0; i < n; i++) {
        const v = base + i;
        this.vx[v] = edge.x[i]; this.vz[v] = edge.z[i];
        this.vhalf[v] = edge.half[i]; this.vlevel[v] = edge.level[i];
        this.vbridge[v] = edge.bridge[i]; this.varc[v] = edge.arc[i];
        // The edge of the road only wanders once it is clear of the gate, so it meets the zone's road at its width.
        this.vjit[v] = JITTER * smoothstep(Math.min(edge.arc[i], length - edge.arc[i]) / 30);
      }
      for (let i = 0; i < n - 1; i++) {
        segA.push(base + i);
        segEdge.push(e);
      }
      base += n;
    });
    this.segA = Int32Array.from(segA);
    this.segEdge = Int16Array.from(segEdge);

    const build = new Map<number, number[]>();
    for (let s = 0; s < segA.length; s++) {
      const a = segA[s];
      const reach = Math.max(this.vhalf[a], this.vhalf[a + 1], DECK_HALF + 0.5) + JITTER + REACH;
      const x0 = Math.min(this.vx[a], this.vx[a + 1]) - reach, x1 = Math.max(this.vx[a], this.vx[a + 1]) + reach;
      const z0 = Math.min(this.vz[a], this.vz[a + 1]) - reach, z1 = Math.max(this.vz[a], this.vz[a + 1]) + reach;
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
          const key = cellKey(cx, cz);
          const list = build.get(key);
          if (list) list.push(s); else build.set(key, [s]);
        }
      }
    }
    for (const [key, list] of build) this.cells.set(key, Int32Array.from(list));
  }

  // A fence post with a lantern every POST_EVERY blocks of road, alternating sides, and one just inside the wilderness
  // at each end of every road, where it meets a zone.
  private placeWaypoints(wild: IsWild): void {
    for (const edge of this.edges) {
      const first = edge.arc[edge.wildFrom], last = edge.arc[edge.wildTo];
      const wanted: number[] = [];
      if (last - first > 2 * JUNCTION_INSET + 8) wanted.push(first + JUNCTION_INSET, last - JUNCTION_INSET);
      else wanted.push((first + last) / 2);
      for (let s = POST_EVERY; s < edge.arc[edge.arc.length - 1]; s += POST_EVERY) {
        if (s > first + JUNCTION_INSET + 24 && s < last - JUNCTION_INSET - 24) wanted.push(s);
      }
      wanted.forEach((s, n) => {
        const p = this.pointAt(edge, s);
        const side = n % 2 === 0 ? 1 : -1;
        const x = Math.round(p.x - p.tz * side * (p.half + POST_OFFSET));
        const z = Math.round(p.z + p.tx * side * (p.half + POST_OFFSET));
        if (!wild(x, z) || p.bridge) return;
        this.waypoints.push({ x, z });
        this.posts.add(postKey(x, z));
      });
    }
  }

  // Position, unit tangent and half width at distance s along a road.
  private pointAt(edge: RoadEdge, s: number): { x: number; z: number; tx: number; tz: number; half: number; bridge: boolean } {
    const n = edge.arc.length;
    let i = 0;
    while (i < n - 2 && edge.arc[i + 1] < s) i++;
    const f = Math.min(1, Math.max(0, (s - edge.arc[i]) / (edge.arc[i + 1] - edge.arc[i])));
    const tx = edge.x[i + 1] - edge.x[i], tz = edge.z[i + 1] - edge.z[i];
    const tl = Math.hypot(tx, tz);
    return {
      x: edge.x[i] + tx * f, z: edge.z[i] + tz * f, tx: tx / tl, tz: tz / tl,
      half: edge.half[i] + (edge.half[i + 1] - edge.half[i]) * f,
      bridge: edge.bridge[i] === 1 || edge.bridge[i + 1] === 1,
    };
  }

  query(x: number, z: number, out: RoadHit = newRoadHit()): RoadHit {
    clearRoadHit(out);
    const bucket = this.cells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!bucket) return out;
    const vx = this.vx, vz = this.vz;
    let best = -1, bestD2 = Infinity, bestT = 0;
    for (let k = 0; k < bucket.length; k++) {
      const s = bucket[k];
      const a = this.segA[s];
      const ex = vx[a + 1] - vx[a], ez = vz[a + 1] - vz[a];
      let t = ((x - vx[a]) * ex + (z - vz[a]) * ez) / (ex * ex + ez * ez);
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const px = vx[a] + ex * t - x, pz = vz[a] + ez * t - z;
      const d2 = px * px + pz * pz;
      if (d2 < bestD2) { bestD2 = d2; best = s; bestT = t; }
    }
    if (best < 0) return out;

    // A road ends square at its gates. The rounded joint between the last two segments would otherwise reach round the
    // end, past the gate and onto the zone's own road.
    const e = this.segEdge[best];
    const f = this.edgeFirst[e], l = this.edgeLast[e];
    // Half a block of slack, because the first segment is not exactly square to the zone's road.
    if (((x - vx[f]) * (vx[f + 1] - vx[f]) + (z - vz[f]) * (vz[f + 1] - vz[f])) / Math.hypot(vx[f + 1] - vx[f], vz[f + 1] - vz[f]) < -0.5) return out;
    if (((x - vx[l]) * (vx[l - 1] - vx[l]) + (z - vz[l]) * (vz[l - 1] - vz[l])) / Math.hypot(vx[l - 1] - vx[l], vz[l - 1] - vz[l]) < -0.5) return out;

    const a = this.segA[best];
    const lerp = (arr: Float64Array): number => arr[a] + (arr[a + 1] - arr[a]) * bestT;
    const distance = Math.sqrt(bestD2);
    const bridge = this.vbridge[bestT < 0.5 ? a : a + 1] === 1;
    let half = lerp(this.vhalf) + lerp(this.vjit) * this.jitterNoise.noise2(x * 0.17, z * 0.17 + 31);
    if (half < 0.8) half = 0.8;
    // Beside a bridge the ground is cut back to clear the whole deck.
    const reach = bridge && half < DECK_HALF + 0.5 ? DECK_HALF + 0.5 : half;
    const gap = distance - reach;

    out.distance = distance;
    out.width = half * 2;
    out.importance = this.edges[this.segEdge[best]].importance;
    out.bridge = bridge;
    out.level = lerp(this.vlevel);
    out.arc = lerp(this.varc);
    out.edge = this.segEdge[best];
    out.gap = gap;
    out.onRoad = bridge ? distance <= DECK_HALF : distance <= half;
    out.weight = gap <= 0 ? 1 : gap >= SHOULDER ? 0 : 1 - smoothstep(gap / SHOULDER);
    return out;
  }

  isRoad(x: number, z: number, margin = 0): boolean {
    const hit = this.query(x, z, this.scratch);
    return hit.edge >= 0 && hit.gap <= margin;
  }

  // True where a waypoint's fence post stands.
  hasPost(x: number, z: number): boolean {
    return this.posts.size > 0 && this.posts.has(postKey(x, z));
  }

  postsIn(x0: number, z0: number, x1: number, z1: number): Waypoint[] {
    return this.waypoints.filter((p) => p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1);
  }

  // The vertex of an edge nearest an arc length, for the tests and the map tool.
  edgeOf(name: string): RoadEdge {
    const found = this.edges.find((e) => e.name === name);
    if (!found) throw new Error(`No road called ${name}`);
    return found;
  }
}

const cache = new Map<number, RoadNetwork>();

// The network depends on the seed alone, so one is shared by every generator with that seed.
export const roadNetworkFor = (seed: number, natural: NaturalHeight): RoadNetwork => {
  let net = cache.get(seed);
  if (!net) { net = new RoadNetwork(seed, natural); cache.set(seed, net); }
  return net;
};
