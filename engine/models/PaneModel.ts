import { Box, Neighbourhood } from './BlockModel';
import { joins } from './connect';
import { ShapeModel, ShapeSpec, rotateBox } from './ShapeModel';
import { BoxPart } from './shape';
import { HORIZONTAL_SIDES, SIDE_DX, SIDE_DZ } from './Side';

/** Panes join each other, solid blocks and glass. */
export const PANE_GROUP = 'pane';

// A thin upright pane, two sixteenths thick. Like fences its connections are read from the four neighbours when it is
// meshed, as a mask with bit 0 north, 1 east, 2 south, 3 west, and the state is unused. A pane that joins nothing
// draws the full cross, so it never shrinks to a pillar.
const POST: Box = [7 / 16, 0, 7 / 16, 9 / 16, 1, 9 / 16];
const ARM: Box = [7 / 16, 0, 0, 9 / 16, 1, 7 / 16];

export class PaneModel extends ShapeModel {
  readonly connectGroup = PANE_GROUP;

  protected variantOf(_state: number, nb?: Neighbourhood): number {
    if (!nb) return 0;
    let mask = 0;
    for (let d = 0; d < 4; d++) {
      const side = HORIZONTAL_SIDES[d];
      if (joins(nb, SIDE_DX[side], SIDE_DZ[side], PANE_GROUP, true)) mask |= 1 << d;
    }
    return mask;
  }

  protected build(mask: number): ShapeSpec {
    const parts: BoxPart[] = [{ box: POST }];
    for (let d = 0; d < 4; d++) {
      const joined = (mask & (1 << d)) !== 0;
      if (!joined && mask !== 0) continue;
      // A joined arm ends against its neighbour, so that end is not drawn.
      parts.push({ box: rotateBox(ARM, d), skip: joined ? 1 << HORIZONTAL_SIDES[d] : 0 });
    }
    return { parts };
  }
}
