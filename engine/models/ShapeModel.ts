import { Box, BlockModel, ModelQuad, Neighbourhood } from './BlockModel';
import { BoxPart, CompiledShape, UvMode, compileBoxes, rotateBox } from './shape';

export { rotateBox };

/** What a model with boxes for geometry hands over for one variant of itself. */
export interface ShapeSpec {
  parts: BoxPart[];
  uv?: UvMode;
  /** Boxes that stop the player, when they differ from the drawn ones (a fence is taller than it looks). */
  collision?: Box[];
  /** The parts are an authored shape turned this many quarter turns, and the texture turns with them (see compileBoxes). */
  uvTurns?: number;
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
      shape = compileBoxes(spec.parts, spec.uv ?? 'cell', spec.collision, spec.uvTurns);
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

/** Mirrors a box top to bottom. */
export const flipBoxY = (box: Box): Box => [box[0], 1 - box[4], box[2], box[3], 1 - box[1], box[5]];
