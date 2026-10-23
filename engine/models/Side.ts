// The six sides of a cell, in the order the mesher draws them. A side is the direction a face looks.
// Axes are 0 = x (east), 1 = y (up), 2 = z (south). The block grid is the same as the world: -z is north.

export const EAST = 0;
export const WEST = 1;
export const UP = 2;
export const DOWN = 3;
export const SOUTH = 4;
export const NORTH = 5;

export interface SideInfo {
  axis: number;
  sign: number;
  /** The two axes spanning a face. They are picked so u x v points along the normal, which makes the corner order
   *  (-,-) (+,-) (+,+) (-,+) counter-clockwise seen from outside. */
  u: number;
  v: number;
}

export const SIDES: readonly SideInfo[] = [
  { axis: 0, sign: 1, u: 1, v: 2 },
  { axis: 0, sign: -1, u: 2, v: 1 },
  { axis: 1, sign: 1, u: 2, v: 0 },
  { axis: 1, sign: -1, u: 0, v: 2 },
  { axis: 2, sign: 1, u: 0, v: 1 },
  { axis: 2, sign: -1, u: 1, v: 0 },
];

export const SIDE_DX: readonly number[] = [1, -1, 0, 0, 0, 0];
export const SIDE_DY: readonly number[] = [0, 0, 1, -1, 0, 0];
export const SIDE_DZ: readonly number[] = [0, 0, 0, 0, 1, -1];

/** The side facing the other way. A face on side s is hidden by what the neighbour covers on side s ^ 1. */
export const oppositeSide = (side: number): number => side ^ 1;

/** The four horizontal sides in turning order: north, east, south, west. Stair facings and fence bits use this order. */
export const HORIZONTAL_SIDES: readonly number[] = [NORTH, EAST, SOUTH, WEST];
