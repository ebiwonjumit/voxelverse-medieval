import { Box, BlockModel, ModelQuad, Neighbourhood } from './BlockModel';
import { BoxPart, CompiledShape, UvMode, compileBoxes } from './shape';

/** What a model with boxes for geometry hands over for one variant of itself. */
export interface ShapeSpec {
  parts: BoxPart[];
  uv?: UvMode;
  /** Boxes that stop the player, when they differ from the drawn ones (a fence is taller than it looks). */
  collision?: Box[];
}

/**
 * Base of every model made of boxes. A model has a handful of variants (a stair has 8, a fence 16); each is
 * compiled once, the first time it is asked for, and the compiled quads are shared by every cell that uses it.
 * So meshing a shaped block is a table lookup, not geometry work.
 */
export abstract class ShapeModel implements BlockModel {
  readonly connectGroup?: string;
  private readonly shapes = new Map<number, CompiledShape>();

  constructor(readonly isFullCube = false) {}

  /** Which variant the state, and the blocks around, select. Without a neighbourhood: as if nothing was beside it. */
  protected abstract variantOf(state: number, nb?: Neighbourhood): number;

  protected abstract build(variant: number): ShapeSpec;

  protected shape(variant: number): CompiledShape {
    let shape = this.shapes.get(variant);
    if (!shape) {
      const spec = this.build(variant);
      shape = compileBoxes(spec.parts, spec.uv ?? 'cell', spec.collision);
      this.shapes.set(variant, shape);
    }
    return shape;
  }

  quads(state: number, nb?: Neighbourhood): readonly ModelQuad[] {
    return this.shape(this.variantOf(state, nb)).quads;
  }

  collisionBoxes(state: number, nb?: Neighbourhood): readonly Box[] {
    return this.shape(this.variantOf(state, nb)).collision;
  }

  faceCoverage(state: number, side: number): number {
    return this.shape(this.variantOf(state)).coverage[side];
  }

  occludesFace(state: number, side: number): boolean {
    return this.faceCoverage(state, side) === 15;
  }
}

// --- Box helpers -------------------------------------------------------------------------------------------

/** Turns a box a quarter turn clockwise (seen from above) around the middle of the cell, `turns` times. North becomes east. */
export const rotateBox = (box: Box, turns: number): Box => {
  let [x0, y0, z0, x1, y1, z1] = box;
  for (let t = 0; t < ((turns % 4) + 4) % 4; t++) {
    // (x, z) -> (1 - z, x) about the centre of the cell.
    const nx0 = 1 - z1;
    const nx1 = 1 - z0;
    const nz0 = x0;
    const nz1 = x1;
    x0 = nx0; x1 = nx1; z0 = nz0; z1 = nz1;
  }
  return [x0, y0, z0, x1, y1, z1];
};

/** Mirrors a box top to bottom. */
export const flipBoxY = (box: Box): Box => [box[0], 1 - box[4], box[2], box[3], 1 - box[1], box[5]];
