import { RIVER_FLOOR } from '../water/RiverField';
import { RoadMask } from '../features/RoadField';

// Half width of a bridge deck: planks for every column up to 2.5 blocks from the centreline, so five wide.
export const DECK_HALF = 2.5;
// The terrain is blended from the road level to the natural height across this many blocks beyond the road's edge.
export const SHOULDER = 6;

// What the road network knows about one column. Filled in by RoadField.query; pass the same object again in hot
// loops to avoid allocating.
export interface RoadHit {
  onRoad: boolean;      // the column lies within the road's (jittered) edge
  distance: number;     // blocks to the nearest point of a road centreline, Infinity if none is near
  width: number;        // full width of the road here, edge jitter included
  importance: number;   // 0..1, how main the road is
  bridge: boolean;      // the road is on a bridge here (the deck is the columns within DECK_HALF)
  // The rest is what terrain levelling and bridge building need.
  level: number;        // road surface height at the nearest centreline point, as a float (floor is the surface block)
  weight: number;       // 0..1, how much the terrain is pulled to the level: 1 on the road, easing out over the shoulder
  gap: number;          // distance minus the road's half width: negative on the road, the distance to its edge off it
  arc: number;          // blocks along the road from its start, for periodic things (bridge piers)
  edge: number;         // index of the road, -1 if no road is near
}

export const newRoadHit = (): RoadHit => ({
  onRoad: false, distance: Infinity, width: 0, importance: 0, bridge: false,
  level: 0, weight: 0, gap: Infinity, arc: 0, edge: -1,
});

export const clearRoadHit = (hit: RoadHit): RoadHit => {
  hit.onRoad = false; hit.distance = Infinity; hit.width = 0; hit.importance = 0; hit.bridge = false;
  hit.level = 0; hit.weight = 0; hit.gap = Infinity; hit.arc = 0; hit.edge = -1;
  return hit;
};

// A set of roads that can be asked about any column in O(1).
export interface RoadField extends RoadMask {
  query(x: number, z: number, out?: RoadHit): RoadHit;
}

// How much of the fill beside a bridge a column of this natural height gets: nothing at the river's floor, all of it
// from a block and a half above, easing in smoothly in between. A hard dry/wet switch left a cliff between the two, and filling
// the wet columns would dam the river; the channel floor itself never gets any.
const FILL_RANGE = 1.5;
const dryness = (natural: number): number => {
  const t = (natural - RIVER_FLOOR) / FILL_RANGE;
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
};

// The ground height of a wilderness column given the natural height and what the road says about it.
//  - on and beside a road: pulled to the road level (cut and fill), the pull easing out over the shoulder;
//  - beside a bridge: pulled to one block under the deck. Ground above that is cut. Ground below it is filled only in
//    proportion to how far it is above the river's floor, so a river is never dammed and the approaches of the
//    bridge climb on an embankment that meets the filled road without a cliff.
export const levelHeight = (natural: number, hit: RoadHit): number => {
  if (hit.weight <= 0) return natural;
  if (hit.bridge) {
    const under = hit.level - 1;
    if (natural > under) return natural + (under - natural) * hit.weight;
    return natural + (under - natural) * hit.weight * dryness(natural);
  }
  return hit.weight >= 1 ? hit.level : natural + (hit.level - natural) * hit.weight;
};
