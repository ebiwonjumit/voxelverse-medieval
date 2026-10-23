import { Box, BlockModel, ModelQuad, Neighbourhood } from './BlockModel';

/**
 * Models drawn with upright planes instead of boxes. Nothing about them can be bumped into or hide a neighbour. The
 * planes are fixed, so the quads are built once.
 */
export abstract class PlaneModel implements BlockModel {
  readonly isFullCube = false;
  protected abstract readonly planes: readonly ModelQuad[];

  quads(_state?: number, _nb?: Neighbourhood): readonly ModelQuad[] {
    return this.planes;
  }

  collisionBoxes(_state?: number, _nb?: Neighbourhood): readonly Box[] {
    return [];
  }

  occludesFace(_state?: number, _side?: number): boolean {
    return false;
  }

  faceCoverage(_state?: number, _side?: number): number {
    return 0;
  }
}
