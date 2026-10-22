// What the features need to know about roads, so trees never grow on one. Step 6.4 supplies the real network;
// until then nothing is a road.
export interface RoadField {
  // True if a road, bridge or verge lies within `margin` blocks of the column.
  isRoad(x: number, z: number, margin?: number): boolean;
}

export const NO_ROADS: RoadField = { isRoad: () => false };
