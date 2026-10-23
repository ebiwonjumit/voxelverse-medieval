import { ShapeModel, ShapeSpec } from './ShapeModel';

/** A flat square 1/16 thick, lying at height `y` of its cell and inset from the edges: a lily pad. The state is unused. */
export class PlateModel extends ShapeModel {
  constructor(private readonly inset: number, private readonly y: number, private readonly thickness = 1 / 16) {
    super(false);
  }

  protected variantOf(): number {
    return 0;
  }

  protected build(): ShapeSpec {
    const { inset, y, thickness } = this;
    return { parts: [{ box: [inset, y, inset, 1 - inset, y + thickness, 1 - inset] }], uv: 'stretch' };
  }
}
