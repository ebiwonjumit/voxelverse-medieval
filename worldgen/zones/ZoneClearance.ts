import { ZONE_INFOS, insetFromEdge } from './ZoneInfo';

// Distance in blocks from a point to the nearest legacy zone footprint. Positive outside every zone, zero or
// negative inside one. Things that must stay clear of the zones (rivers, trees, roads' neighbours) use it.
export const clearanceFromZones = (x: number, z: number): number => {
  let nearest = Infinity;
  for (let i = 0; i < ZONE_INFOS.length; i++) {
    const outside = -insetFromEdge(ZONE_INFOS[i].shape, x, z);
    if (outside < nearest) nearest = outside;
  }
  return nearest;
};
