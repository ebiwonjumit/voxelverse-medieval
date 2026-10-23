import { Box } from './BlockModel';
import { ShapeModel, ShapeSpec, flipBoxY, rotateBox } from './ShapeModel';

// Straight stairs. State: bits 0-1 the facing, bit 2 the half (0 bottom, 1 upside down).
//
// Facing is the way you climb: the tall back of the stair is on that side and the low step on the other. Facings
// turn clockwise seen from above, 0 north (-z), 1 east (+x), 2 south (+z), 3 west (-x), the same order as
// HORIZONTAL_SIDES.
export const STAIR_NORTH = 0;
export const STAIR_EAST = 1;
export const STAIR_SOUTH = 2;
export const STAIR_WEST = 3;
export const STAIR_UPSIDE_DOWN = 4;

/** The state byte of a stair. */
export const stairState = (facing: number, upsideDown = false): number => (facing & 3) | (upsideDown ? STAIR_UPSIDE_DOWN : 0);

// Facing north, bottom half: the low step in front (south) and the full-height back behind it.
const STEP: Box = [0, 0, 0.5, 1, 0.5, 1];
const BACK: Box = [0, 0, 0, 1, 1, 0.5];

export class StairModel extends ShapeModel {
  protected variantOf(state: number): number {
    return state & 7;
  }

  protected build(variant: number): ShapeSpec {
    const turns = variant & 3;
    const place = (box: Box): Box => {
      const turned = rotateBox(box, turns);
      return variant & STAIR_UPSIDE_DOWN ? flipBoxY(turned) : turned;
    };
    return { parts: [{ box: place(STEP) }, { box: place(BACK) }] };
  }
}
