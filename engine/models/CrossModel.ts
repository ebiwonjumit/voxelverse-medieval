import { ModelQuad } from './BlockModel';
import { PlaneModel } from './PlaneModel';
import { doubleSidedPlane } from './shape';

/**
 * Two planes crossing on the diagonals of the cell, like flowers, tall grass and sugarcane. Each plane is drawn on
 * both sides, so it has four quads. `width` is the length of each plane and `height` how tall they stand. The state is unused.
 */
export class CrossModel extends PlaneModel {
  protected readonly planes: readonly ModelQuad[];

  constructor(readonly width = 0.9, readonly height = 0.9) {
    super();
    const a = 0.5 - width / 2;
    const b = 0.5 + width / 2;
    this.planes = [...doubleSidedPlane(a, a, b, b, 0, height), ...doubleSidedPlane(a, b, b, a, 0, height)];
  }
}
