import { ShapeModel, ShapeSpec } from './ShapeModel';

/** Which half a slab fills, in bit 0 of the state. */
export const SLAB_BOTTOM = 0;
export const SLAB_TOP = 1;

/** A half-height block. State bit 0: 0 fills the lower half, 1 the upper half. */
export class SlabModel extends ShapeModel {
  protected variantOf(state: number): number {
    return state & 1;
  }

  protected build(variant: number): ShapeSpec {
    return { parts: [{ box: variant === SLAB_TOP ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1] }] };
  }
}
