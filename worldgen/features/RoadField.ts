// What the features need to know about roads, so trees never grow on one. The real network (worldgen/roads) answers
// it, and a test can pass any shape it likes.
export interface RoadMask {
  // True if a road, bridge or verge lies within `margin` blocks of the column.
  isRoad(x: number, z: number, margin?: number): boolean;
}

export const NO_ROADS: RoadMask = { isRoad: () => false };
