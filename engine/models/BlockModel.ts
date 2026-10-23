import type { BlockRegistry } from '../BlockRegistry';
import type { Cell } from '../cell';

// A block model says what a block looks like and where it can be bumped into, for one state of that block.
// Everything is in cell coordinates: the cell fills 0..1 on each axis, x east, y up, z south.

/** An axis-aligned box: x0, y0, z0, x1, y1, z1. It may stick out of the cell (a fence is 1.5 high). */
export type Box = readonly [number, number, number, number, number, number];

/**
 * One face of a model, ready for the mesher. The corners run counter-clockwise seen from the front, starting at the
 * low corner of the face's own (u, v) axes (see Side.ts). Quads are shared between cells: never change one.
 */
export interface ModelQuad {
  /** Twelve numbers, xyz per corner. */
  readonly corners: Float32Array;
  /** Eight numbers, uv per corner. v = 0 is the top row of the tile. */
  readonly uvs: Float32Array;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  /** Which texture of the block it wears: FACE_TOP, FACE_BOTTOM or FACE_SIDE from TextureLayout. */
  readonly face: number;
  /** The side of the cell this quad lies flat against, or -1. Only such quads can be hidden by a neighbour. */
  readonly cullSide: number;
  /** The quarters of that side the quad touches (see faceCoverage). A quad is hidden when the neighbour covers all of them. */
  readonly need: number;
  /** The quad is the whole face of the cell on cullSide, so ambient occlusion can treat it as a cube face. */
  readonly fullFace: boolean;
}

/**
 * What a model may ask about the blocks around it. `cell(0, 0, 0)` is the block itself. The mesher answers from its
 * padded grid, the game from the world, tests from a map.
 */
export interface Neighbourhood {
  readonly registry: BlockRegistry;
  cell(dx: number, dy: number, dz: number): Cell;
}

export interface BlockModel {
  /** A plain 1 x 1 x 1 cube, so the mesher can use its fast cube path. */
  readonly isFullCube: boolean;
  /** Models with the same group connect to each other (fence posts, glass panes). */
  readonly connectGroup?: string;

  /**
   * The faces of the block. `state` is the 0..15 state of the cell and its meaning belongs to the model. Models whose
   * shape depends on the blocks beside them (fences, panes) read `nb`; without one they draw as if nothing was there.
   */
  quads(state: number, nb?: Neighbourhood): readonly ModelQuad[];

  /** The boxes that stop the player. The block's own `solid` flag still decides whether they are used at all. */
  collisionBoxes(state: number, nb?: Neighbourhood): readonly Box[];

  /** The block fully covers its face on `side`, so a neighbour's face looking at it is never seen. */
  occludesFace(state: number, side: number): boolean;

  /**
   * Which of the four quarters of the face on `side` the block covers completely, as a 4-bit mask. A face is split in
   * halves along its two axes taken in x, y, z order, so quarter q is `(upper half of the second axis ? 2 : 0) |
   * (upper half of the first ? 1 : 0)` and bit `1 << q` of the mask is set when it is covered. 15 is the whole face.
   * It lets a slab hide the side of the slab beside it.
   */
  faceCoverage(state: number, side: number): number;
}
