import { Box, Neighbourhood } from './BlockModel';
import { joins } from './connect';
import { ShapeModel, ShapeSpec, rotateBox } from './ShapeModel';
import { BoxPart } from './shape';
import { HORIZONTAL_SIDES, SIDE_DX, SIDE_DZ } from './Side';

/** Fences join each other and solid blocks. */
export const FENCE_GROUP = 'fence';

// Connections are never stored. They are read from the four blocks around the fence when it is meshed or bumped
// into, as a mask: bit 0 north, bit 1 east, bit 2 south, bit 3 west. The state is unused.
export const FENCE_NORTH = 1;
export const FENCE_EAST = 2;
export const FENCE_SOUTH = 4;
export const FENCE_WEST = 8;

const POST: Box = [6 / 16, 0, 6 / 16, 10 / 16, 1, 10 / 16];
// The two rails of the north arm, from the edge of the cell to the post.
const RAILS: Box[] = [
  [7 / 16, 6 / 16, 0, 9 / 16, 9 / 16, 6 / 16],
  [7 / 16, 12 / 16, 0, 9 / 16, 15 / 16, 6 / 16],
];
// Players and mobs must not jump over a fence, so it stops them 1.5 blocks up and its arms are as wide as the post.
const COLLISION_HEIGHT = 1.5;
const COLLISION_POST: Box = [6 / 16, 0, 6 / 16, 10 / 16, COLLISION_HEIGHT, 10 / 16];
const COLLISION_ARM: Box = [6 / 16, 0, 0, 10 / 16, COLLISION_HEIGHT, 6 / 16];

export class FenceModel extends ShapeModel {
  readonly connectGroup = FENCE_GROUP;

  protected variantOf(_state: number, nb?: Neighbourhood): number {
    if (!nb) return 0;
    let mask = 0;
    for (let d = 0; d < 4; d++) {
      const side = HORIZONTAL_SIDES[d];
      if (joins(nb, SIDE_DX[side], SIDE_DZ[side], FENCE_GROUP, false)) mask |= 1 << d;
    }
    return mask;
  }

  protected build(mask: number): ShapeSpec {
    const parts: BoxPart[] = [{ box: POST }];
    const collision: Box[] = [COLLISION_POST];
    for (let d = 0; d < 4; d++) {
      if (!(mask & (1 << d))) continue;
      // The rail's far end lies against the neighbour, which is either a solid block or a fence with the same end.
      const skip = 1 << HORIZONTAL_SIDES[d];
      for (const rail of RAILS) parts.push({ box: rotateBox(rail, d), skip });
      collision.push(rotateBox(COLLISION_ARM, d));
    }
    return { parts, collision };
  }
}
