import { MILE } from '../../worldConstants';

// What the generator needs to know about each legacy zone without asking the zone: where it is, how big it is,
// and how far in from its edge the terrain should hand over to the wilderness. The shapes repeat the zones'
// own isInside() tests, and a test keeps the two in step.

export type ZoneShape =
  | { kind: 'circle'; cx: number; cz: number; radius: number }
  | { kind: 'square'; cx: number; cz: number; half: number };

export interface ZoneInfo {
  name: string;
  shape: ZoneShape;
  // Width of the falloff band just inside the edge. The zone's height is weighted by a smoothstep that is 0 on
  // the edge and 1 at this distance in. 0 means no extra band: the zone already ends exactly on the wilderness.
  band: number;
  // Up to this size (same shape, smaller) the generator returns the legacy zone's own height. Tests rely on it.
  // Between the core and the edge (the band) the zone's height is extended outwards from the core's rim.
  core: number;
}

export const WILDERNESS_NAME = 'Wilderness';

export const ZONE_INFOS: readonly ZoneInfo[] = [
  // Its own blend runs 150 -> 200, but on the main roads it heads for a fixed 7 instead of the wilderness
  // height, which would leave a step at the edge. The band replaces that blend.
  { name: 'Town of Beginnings', shape: { kind: 'circle', cx: 0, cz: 0, radius: 200 }, band: 60, core: 140 },
  // Same story on its north road, and its stream is cut off by a circle of radius 50 that pokes out of the core's
  // corners, so a band over the last 25 blocks.
  { name: 'Greensom Village', shape: { kind: 'square', cx: 0, cz: 300, half: 70 }, band: 25, core: 45 },
  // These two blend to the height they are given over their last 100 blocks and meet the wilderness exactly.
  { name: 'Federation of Tempest', shape: { kind: 'circle', cx: 3 * MILE, cz: 0, radius: 700 }, band: 0, core: 550 },
  { name: 'Amestris District', shape: { kind: 'circle', cx: -3 * MILE, cz: 0, radius: 700 }, band: 0, core: 550 },
  // Flat constants with a hard edge: they get a band so the ground slopes into the wilderness.
  { name: 'Kingdom of Bosse', shape: { kind: 'circle', cx: 0, cz: -3 * MILE, radius: 700 }, band: 100, core: 600 },
  { name: 'Kingdom of Fremmevilla', shape: { kind: 'circle', cx: 1600, cz: -1600, radius: 250 }, band: 50, core: 200 },
  { name: 'Magnolia Town', shape: { kind: 'circle', cx: -1600, cz: 1600, radius: 250 }, band: 50, core: 200 },
];

const BY_NAME = new Map(ZONE_INFOS.map((info) => [info.name, info]));

export const zoneInfoByName = (name: string): ZoneInfo | undefined => BY_NAME.get(name);

// Distance in blocks from the zone's edge to the point, positive inside. Circles measure along the radius and the
// square uses the nearer side, which is how each zone's own blend measures it.
export const insetFromEdge = (shape: ZoneShape, x: number, z: number): number => {
  const dx = x - shape.cx;
  const dz = z - shape.cz;
  if (shape.kind === 'circle') return shape.radius - Math.sqrt(dx * dx + dz * dz);
  return shape.half - Math.max(Math.abs(dx), Math.abs(dz));
};

export const zoneContains = (info: ZoneInfo, x: number, z: number): boolean => {
  const dx = x - info.shape.cx;
  const dz = z - info.shape.cz;
  if (info.shape.kind === 'circle') return Math.sqrt(dx * dx + dz * dz) < info.shape.radius;
  return Math.abs(dx) < info.shape.half && Math.abs(dz) < info.shape.half;
};

// The nearest point to (x, z) that is inside the zone's core, or the point itself if it already is. The band uses
// the zone's height at this point, so whatever the legacy code does near its edge (road strips, cut-off streams)
// never reaches the border. The core limit is one block inside so integer columns land on real core columns.
export const clampToCore = (info: ZoneInfo, x: number, z: number, out: { x: number; z: number }): void => {
  const dx = x - info.shape.cx;
  const dz = z - info.shape.cz;
  const limit = info.core - 1;
  if (info.shape.kind === 'circle') {
    const d = Math.sqrt(dx * dx + dz * dz);
    const k = d > limit ? limit / d : 1;
    out.x = info.shape.cx + dx * k;
    out.z = info.shape.cz + dz * k;
  } else {
    out.x = info.shape.cx + (dx > limit ? limit : dx < -limit ? -limit : dx);
    out.z = info.shape.cz + (dz > limit ? limit : dz < -limit ? -limit : dz);
  }
};

// Furthest a zone's own terrain reaches from its centre, for callers that want a bounding box.
export const zoneExtent = (info: ZoneInfo): number =>
  info.shape.kind === 'circle' ? info.shape.radius : info.shape.half * Math.SQRT2;
