import { TerrainField } from '../terrain/TerrainField';
import {
  LANDMARKS, Landmark, TEMPEST_CENTER_X, TEMPEST_CENTER_Z, TEMPEST_GROUND, TEMPEST_RADIUS, landmarkById, localX, localZ, riverDistance,
  OUTER_ROAD_HALF, ROADS, RoadSegment,
} from './layout';

// The ground of the Tempest zone. The town and its farms are flat at y = 8; beyond them the ground hands over to the
// wilderness along a smooth ramp, so the zone ends on exactly the height it is given at its footprint's edge (the
// blender gives the zone no band of its own). On top of that, in this order:
//   - the four roads out are levelled: across their width the ground is the height along their centre-line, so a road
//     never tilts or steps, and it climbs with the land (the north road gently, up to the cave)
//   - the river carves its channel and banks (water stands at the world's water level, 3), and a bridge crosses it
//   - the two ponds are shallow bowls: their water stands one block below the street, placed by the zone
//   - a small hill carries the memorial cairn
// Every step of this is a smooth function, and its slope is below one block per column, so adjacent columns never differ
// by more than a block (a test measures the whole footprint).

const smoothstep = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Where the wilderness starts to show: from this distance from the centre the land eases from y = 8 towards the natural height. */
export const BLEND_START = 300;
/** The half width of the river's water, in cells, and the bank that rises from it. */
export const RIVER_WATER_HALF = 3.5;
const BANK_SLOPE = 0.75;
/** The ponds: water level one block under the street. */
export const POND_WATER_Y = TEMPEST_GROUND - 1;
export const POND_BED_Y = TEMPEST_GROUND - 2;
const CAIRN_HILL = 5;
const CAIRN_HILL_RADIUS = 18;
/** The levelling of a road out fades over this many cells beyond its edge, and away again towards the footprint's edge. */
const CORRIDOR_FADE = 12;
const CORRIDOR_END_FROM = 620;

const RIVER_BOUNDS = { x0: 100, x1: 400, z0: -520, z1: 500 };

interface OuterRoad { seg: RoadSegment; alongX: boolean }
const OUTER_ROADS: readonly OuterRoad[] = ROADS
  .filter((r) => r.kind === 'road')
  .map((seg) => ({ seg, alongX: seg.rect!.x1 - seg.rect!.x0 > seg.rect!.z1 - seg.rect!.z0 }));

const ponds = LANDMARKS.filter((l) => l.kind === 'pond');
const cairn = landmarkById('south-cairn') as Landmark;
const cairnCircle = cairn.shape as { kind: 'circle'; cx: number; cz: number; r: number };

export class TempestTerrain {
  private readonly field: TerrainField;

  constructor(readonly seed: number) {
    this.field = new TerrainField(seed);
  }

  /** The height of the land before any road, river or landmark is cut into it: y = 8 in the town, the wilderness beyond. */
  land(x: number, z: number, baseH: number): number {
    const d = Math.hypot(x - TEMPEST_CENTER_X, z - TEMPEST_CENTER_Z);
    if (d <= BLEND_START) return TEMPEST_GROUND;
    if (d >= TEMPEST_RADIUS) return baseH;
    return TEMPEST_GROUND + (baseH - TEMPEST_GROUND) * smoothstep((d - BLEND_START) / (TEMPEST_RADIUS - BLEND_START));
  }

  /**
   * Ground height at a column, before rounding: what the zone's getHeight answers. `baseH` is the wilderness height there,
   * the same noise the zone blender passes in.
   */
  height(x: number, z: number, baseH: number): number {
    const lx = localX(x);
    const lz = localZ(z);
    const d = Math.hypot(lx, lz);
    if (d >= TEMPEST_RADIUS) return baseH;
    let h = this.land(x, z, baseH);

    if (d > BLEND_START - 40) h = this.levelRoads(x, z, d, h);

    // The river and its banks: the lower of the land and the channel's profile, so it cuts down and never builds up.
    if (lx > RIVER_BOUNDS.x0 && lx < RIVER_BOUNDS.x1 && lz > RIVER_BOUNDS.z0 && lz < RIVER_BOUNDS.z1) {
      const rd = riverDistance(x, z);
      if (rd < 30) h = Math.min(h, riverProfile(rd));
    }

    // Ponds: shallow bowls, a block or two under the street.
    for (const p of ponds) {
      const c = p.shape as { cx: number; cz: number; r: number };
      const pd = Math.hypot(x - c.cx, z - c.cz);
      if (pd < c.r) h = Math.min(h, pondBowl(pd, c.r));
    }

    // The cairn's hill.
    const cd = Math.hypot(x - cairnCircle.cx, z - cairnCircle.cz);
    if (cd < CAIRN_HILL_RADIUS) h += CAIRN_HILL * (0.5 + 0.5 * Math.cos((Math.PI * cd) / CAIRN_HILL_RADIUS));
    return h;
  }

  /** The height of the wilderness at a point, for callers that have no column to hand. */
  natural(x: number, z: number): number {
    return this.field.height(x, z);
  }

  /** Whole-cell ground, as the generator's blender floors it. */
  ground(x: number, z: number): number {
    return Math.floor(this.height(x, z, this.field.height(x, z)));
  }

  // Across a road out, the ground is the land's height along the road's centre-line. The effect eases off beside the road
  // and towards the footprint's edge (where the ground must be exactly the natural height again).
  private levelRoads(x: number, z: number, d: number, h: number): number {
    if (d >= TEMPEST_RADIUS - 8) return h;
    for (const { seg, alongX } of OUTER_ROADS) {
      const r = seg.rect!;
      // Across and along the road, from its centre-line; the along coordinate is clamped to the road's extent.
      const across = alongX ? Math.abs(z - (r.z0 + r.z1) / 2) : Math.abs(x - (r.x0 + r.x1) / 2);
      if (across > OUTER_ROAD_HALF + CORRIDOR_FADE) continue;
      const cx = alongX ? Math.max(r.x0, Math.min(r.x1, x)) : (r.x0 + r.x1) / 2;
      const cz = alongX ? (r.z0 + r.z1) / 2 : Math.max(r.z0, Math.min(r.z1, z));
      const cd = Math.hypot(cx - TEMPEST_CENTER_X, cz - TEMPEST_CENTER_Z);
      // Within the grid the road is on the flat town ground already.
      if (cd <= BLEND_START) continue;
      const along = alongX ? Math.abs(x - cx) : Math.abs(z - cz);
      if (along > 0) continue; // only the road itself and the stretch beside it; its end is covered by the land's own ramp
      const centre = this.land(cx, cz, this.field.height(cx, cz));
      const w = (1 - smoothstep((across - OUTER_ROAD_HALF - 1) / CORRIDOR_FADE)) * (1 - smoothstep((d - CORRIDOR_END_FROM) / (TEMPEST_RADIUS - 8 - CORRIDOR_END_FROM)));
      return h + (centre - h) * w;
    }
    return h;
  }
}

/** The channel: a deep bed in the middle, shallow shelves where the water ends, then a bank rising 0.75 a cell. */
export const riverProfile = (distance: number): number => {
  if (distance <= RIVER_WATER_HALF) return 2.5 * Math.pow(distance / RIVER_WATER_HALF, 1.4);
  return 2.5 + BANK_SLOPE * (distance - RIVER_WATER_HALF);
};

/** A pond is a shallow bowl: its bed two blocks under the street, rising to the street over the last 2.5 cells of the circle. */
export const pondBowl = (distance: number, radius: number): number => {
  const water = radius - 3;
  return POND_BED_Y + 2 * smoothstep((distance - water) / 2.5);
};

/** True inside a pond's water: the circle's inner part, where the zone stands water one block under the street. */
export const inPondWater = (x: number, z: number): boolean => {
  for (const p of ponds) {
    const c = p.shape as { cx: number; cz: number; r: number };
    if (Math.hypot(x - c.cx, z - c.cz) < c.r - 3) return true;
  }
  return false;
};

