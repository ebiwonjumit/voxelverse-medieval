import { Box } from './BlockModel';
import { ShapeModel, ShapeSpec } from './ShapeModel';
import { UvMode } from './shape';

/**
 * One or more fixed boxes: a small rock, a lantern, an apple, a crystal, and farmland, which is a cube 15/16 high.
 * The state is unused. By default the tile is squeezed onto every face, since these tiles draw the whole object; pass
 * 'cell' for a box that is part of a surface (farmland) so the tile keeps its scale.
 */
export class BoxModel extends ShapeModel {
  constructor(private readonly boxes: readonly Box[], private readonly uv: UvMode = 'stretch') {
    super(false);
  }

  protected variantOf(): number {
    return 0;
  }

  protected build(): ShapeSpec {
    return { parts: this.boxes.map((box) => ({ box })), uv: this.uv };
  }
}
