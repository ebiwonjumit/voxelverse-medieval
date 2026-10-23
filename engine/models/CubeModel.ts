import { ShapeModel, ShapeSpec } from './ShapeModel';

/** The ordinary block: one cube. The mesher has its own fast path for it and never asks for its quads. */
export class CubeModel extends ShapeModel {
  constructor() {
    super(true);
  }

  protected variantOf(): number {
    return 0;
  }

  protected build(): ShapeSpec {
    return { parts: [{ box: [0, 0, 0, 1, 1, 1] }] };
  }
}

export const CUBE_MODEL = new CubeModel();
