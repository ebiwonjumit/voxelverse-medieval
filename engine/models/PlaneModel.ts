import { Box, BlockModel, ModelQuad } from './BlockModel';

/**
 * Models drawn with upright planes instead of boxes. Nothing about them can be bumped into or hide a neighbour. The
 * planes are fixed, so the quads are built once.
 */
export abstract class PlaneModel implements BlockModel {
  readonly isFullCube = false;
  protected abstract readonly planes: readonly ModelQuad[];

  quads(): readonly ModelQuad[] {
    return this.planes;
  }

  collisionBoxes(): readonly Box[] {
    return [];
  }

  occludesFace(): boolean {
    return false;
  }

  faceCoverage(): number {
    return 0;
  }
}
