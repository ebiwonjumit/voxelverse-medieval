import { ModelQuad } from './BlockModel';
import { PlaneModel } from './PlaneModel';
import { doubleSidedPlane } from './shape';

// Crops stand in four planes laid out like a number sign, a quarter in from each edge, each drawn on both sides, so
// eight quads. They stand a sixteenth lower than the cell: farmland is 15/16 high and the crop grows out of its top.
// How grown a crop is lives in its tile (one block per growth stage), so the shape never changes. The state is unused.
const SINK = 1 / 16;

export class CropModel extends PlaneModel {
  protected readonly planes: readonly ModelQuad[];

  constructor() {
    super();
    const y0 = -SINK;
    const y1 = 1 - SINK;
    this.planes = [
      ...doubleSidedPlane(0.25, 0, 0.25, 1, y0, y1),
      ...doubleSidedPlane(0.75, 0, 0.75, 1, y0, y1),
      ...doubleSidedPlane(0, 0.25, 1, 0.25, y0, y1),
      ...doubleSidedPlane(0, 0.75, 1, 0.75, y0, y1),
    ];
  }
}
