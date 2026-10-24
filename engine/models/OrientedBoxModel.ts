import { Box } from './BlockModel';
import { ShapeModel, ShapeSpec } from './ShapeModel';
import { UvMode, rotateBox } from './shape';

/**
 * A fixed set of boxes that can stand four ways: a roof ridge along x or z, an awning that slopes towards any street, a
 * curtain across a door on either axis. The boxes are authored in one orientation and turned clockwise (seen from above)
 * around the middle of the cell, and the texture turns with them, so a stripe keeps running along the object.
 *
 * State, bits 0 and 1: the number of quarter turns clockwise from the way the boxes are written, so what faced north in
 * the source faces east at 1, south at 2 and west at 3. The other bits are unused. Collision follows the drawn boxes.
 */
export class OrientedBoxModel extends ShapeModel {
  constructor(private readonly boxes: readonly Box[], private readonly uv: UvMode = 'cell') {
    super(false);
  }

  protected variantOf(state: number): number {
    return state & 3;
  }

  protected build(turns: number): ShapeSpec {
    return { parts: this.boxes.map((box) => ({ box: rotateBox(box, turns) })), uv: this.uv, uvTurns: turns };
  }
}

/** The state of an oriented block turned `turns` quarter turns clockwise from how it is authored. */
export const orientedState = (turns: number): number => ((turns % 4) + 4) % 4;
