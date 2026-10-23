import { describe, expect, it } from 'vitest';
import { ShapedBlock } from '../../content/blocksShaped';
import { HORIZONTAL_SIDES, SIDE_DX, SIDE_DY, SIDE_DZ, DOWN, EAST, NORTH, SOUTH, UP, WEST } from '../../engine/models/Side';
import { SLAB_BOTTOM, SLAB_TOP } from '../../engine/models/SlabModel';
import { stairState } from '../../engine/models/StairModel';
import { createTextureLayout } from '../../engine/TextureLayout';
import { meshChunk } from '../../meshing/ChunkMesher';
import { BlockType } from '../../worldConstants';
import { WHITE, MapReader, Quad, faceCount, quadsOf, registry, totalFaces } from './helpers';

const SLAB = ShapedBlock.STONE_BRICK_SLAB;
const STAIRS = ShapedBlock.STONE_BRICK_STAIRS;
const SIDE_NAMES = ['east', 'west', 'up', 'down', 'south', 'north'];

const mesh = (reader: MapReader) => meshChunk(reader, 0, 0, registry);

// The mesher's flat layout, to tell the white test cube from the stair by its layer.
const flat = createTextureLayout([], registry);
const whiteLayer = flat.faceLayer(WHITE, 2);
const all = (m: ReturnType<typeof mesh>): Quad[] => [...quadsOf(m.opaque), ...quadsOf(m.cutout)];

// Quads of the cube at (5,5,5) that look in `side`. Positions are chunk-local, so this is a plain cube face test.
const normalFor = (side: number) => [SIDE_DX[side], SIDE_DY[side], SIDE_DZ[side]].join(',');
const cubeFaces = (quads: Quad[], side: number) =>
  quads.filter((q) => q.normal.join(',') === normalFor(side) && q.corners.every((c) =>
    c.pos[0] >= 5 && c.pos[0] <= 6 && c.pos[1] >= 5 && c.pos[1] <= 6 && c.pos[2] >= 5 && c.pos[2] <= 6));

describe('a cube beside a slab', () => {
  // The cube sits at (5, 5, 5); the slab goes on one side of it.
  const beside = (side: number, state: number) => {
    const slab: [number, number, number, number, number] =
      [5 + SIDE_DX[side], 5 + SIDE_DY[side], 5 + SIDE_DZ[side], SLAB, state];
    return all(mesh(new MapReader([[5, 5, 5, WHITE], slab])));
  };

  for (const [stateName, state] of [['bottom', SLAB_BOTTOM], ['top', SLAB_TOP]] as const) {
    for (let side = 0; side < 6; side++) {
      // The cube's face looks at the slab's face on the opposite side. A slab covers only its flat side completely.
      const hidden = state === SLAB_BOTTOM ? (side ^ 1) === DOWN : (side ^ 1) === UP;
      it(`${hidden ? 'hides' : 'keeps'} the ${SIDE_NAMES[side]} face of the cube next to a ${stateName} slab`, () => {
        expect(cubeFaces(beside(side, state), side)).toHaveLength(hidden ? 0 : 1);
      });
    }
  }

  it('hides the slab face that touches the cube, and the whole wall when the cube is full', () => {
    // Slab to the east of the cube: its west wall lies against the cube, a full cube that covers all of it.
    const quads = all(mesh(new MapReader([[5, 5, 5, WHITE], [6, 5, 5, SLAB, SLAB_BOTTOM]])));
    const slabQuads = quads.filter((q) => q.corners.some((c) => c.pos[0] > 6));
    expect(slabQuads).toHaveLength(5);
    expect(slabQuads.some((q) => q.normal[0] === -1)).toBe(false);
  });

  it('hides the slab base on a cube below it and its top on a cube above', () => {
    const below = all(mesh(new MapReader([[5, 4, 5, WHITE], [5, 5, 5, SLAB, SLAB_BOTTOM]])));
    expect(below.filter((q) => q.normal[1] === -1 && q.corners[0].pos[1] === 5)).toHaveLength(0);
    // The top face of a low slab is below the cell's top, so a cube above does not hide it.
    const above = all(mesh(new MapReader([[5, 6, 5, WHITE], [5, 5, 5, SLAB, SLAB_BOTTOM]])));
    expect(above.filter((q) => q.normal[1] === 1 && q.corners[0].pos[1] === 5.5)).toHaveLength(1);
    // A top slab under a cube: its top is flush with the cell, so the cube hides it.
    const under = all(mesh(new MapReader([[5, 6, 5, WHITE], [5, 5, 5, SLAB, SLAB_TOP]])));
    expect(under.filter((q) => q.normal[1] === 1 && q.corners[0].pos[1] === 6)).toHaveLength(0);
  });
});

describe('slabs beside slabs', () => {
  const walls = (a: number, b: number) => {
    const m = mesh(new MapReader([[5, 5, 5, SLAB, a], [6, 5, 5, SLAB, b]]));
    return all(m).filter((q) => q.normal[0] !== 0);
  };

  it('hide the walls that face each other when they are the same half', () => {
    for (const half of [SLAB_BOTTOM, SLAB_TOP]) {
      // Each slab keeps its far wall only.
      const quads = walls(half, half);
      expect(quads).toHaveLength(2);
      expect(quads.map((q) => q.normal[0]).sort()).toEqual([-1, 1]);
      for (const q of quads) expect(q.corners.every((c) => c.pos[0] === (q.normal[0] > 0 ? 7 : 5))).toBe(true);
    }
  });

  it('hide nothing of each other when one is low and one is high', () => {
    expect(walls(SLAB_BOTTOM, SLAB_TOP)).toHaveLength(4);
    expect(walls(SLAB_TOP, SLAB_BOTTOM)).toHaveLength(4);
  });

  it('hide the walls along z too', () => {
    const m = mesh(new MapReader([[5, 5, 5, SLAB, SLAB_TOP], [5, 5, 6, SLAB, SLAB_TOP]]));
    expect(all(m).filter((q) => q.normal[2] !== 0)).toHaveLength(2);
  });

  it('stacked: a high slab under a low slab hides the faces that touch, since each covers its flat side', () => {
    // The high slab's top and the low slab's base lie in the same plane, so neither is ever seen.
    const m = mesh(new MapReader([[5, 5, 5, SLAB, SLAB_TOP], [5, 6, 5, SLAB, SLAB_BOTTOM]]));
    expect(totalFaces(m)).toBe(12 - 2);
  });

  it('stacked: a low slab under a high slab keeps both, a half block apart', () => {
    const m = mesh(new MapReader([[5, 5, 5, SLAB, SLAB_BOTTOM], [5, 6, 5, SLAB, SLAB_TOP]]));
    expect(totalFaces(m)).toBe(12);
  });
});

describe('stairs', () => {
  // Which side the tall back is on, per facing: north, east, south, west.
  const BACK = HORIZONTAL_SIDES;

  describe('against a cube on each side, in all eight orientations', () => {
    for (let state = 0; state < 8; state++) {
      const facing = state & 3;
      const upsideDown = (state & 4) !== 0;
      const back = BACK[facing];
      const label = `facing ${['north', 'east', 'south', 'west'][facing]}${upsideDown ? ' upside down' : ''}`;

      // The cube is at (5,5,5) and the stair beside it. The cube's face on `side` looks at the stair's face on side ^ 1.
      const coveredSides = new Set([upsideDown ? UP : DOWN, back]);
      it(`${label}: the cube loses exactly the faces the stair covers completely`, () => {
        for (let side = 0; side < 6; side++) {
          const stair: [number, number, number, number, number] =
            [5 + SIDE_DX[side], 5 + SIDE_DY[side], 5 + SIDE_DZ[side], STAIRS, state];
          const quads = all(mesh(new MapReader([[5, 5, 5, WHITE], stair])));
          const hidden = coveredSides.has(side ^ 1);
          expect(cubeFaces(quads, side), `${SIDE_NAMES[side]} of the cube`).toHaveLength(hidden ? 0 : 1);
        }
      });

      // How many quads of the stair lie flat against each side of its cell: two for the base (one per step), one
      // for the roof, one for the back and one for the front (the low step), and two for each lateral wall (an L).
      const flushCounts = (side: number) => {
        const base = upsideDown ? UP : DOWN;
        if (side === base) return 2;
        if (side === (base ^ 1)) return 1;
        if (side === back || side === (back ^ 1)) return 1;
        return 2;
      };

      it(`${label}: the stair loses the faces that lie against a cube, and no others`, () => {
        for (let side = 0; side < 6; side++) {
          const cube: [number, number, number, number] = [5 + SIDE_DX[side], 5 + SIDE_DY[side], 5 + SIDE_DZ[side], WHITE];
          const stairQuads = (reader: MapReader) => quadsOf(mesh(reader).opaque).filter((q) => q.layer !== whiteLayer).length;
          const alone = stairQuads(new MapReader([[5, 5, 5, STAIRS, state]]));
          const next = stairQuads(new MapReader([[5, 5, 5, STAIRS, state], cube]));
          expect(alone).toBe(11);
          expect(alone - next, `cube on the ${SIDE_NAMES[side]}`).toBe(flushCounts(side));
        }
      });
    }
  });

  it('draws eleven faces on its own', () => {
    for (let state = 0; state < 8; state++) {
      expect(faceCount(mesh(new MapReader([[5, 5, 5, STAIRS, state]])).opaque)).toBe(11);
    }
  });

  it('hides the L-shaped wall between two stairs that face the same way', () => {
    // North-facing stairs side by side along x: each side wall is two quads, and they all face each other.
    const both = mesh(new MapReader([[5, 5, 5, STAIRS, stairState(0)], [6, 5, 5, STAIRS, stairState(0)]]));
    expect(faceCount(both.opaque)).toBe(22 - 4);
  });

  it('hides only the part of a wall that the next stair covers', () => {
    // A north-facing stair beside an east-facing one. The east-facing stair has its low step on this side, covering
    // the lower half of the wall; the tall part of the first stair's wall stays.
    const m = mesh(new MapReader([[5, 5, 5, STAIRS, stairState(0)], [6, 5, 5, STAIRS, stairState(1)]]));
    const first = quadsOf(m.opaque).filter((q) => q.normal[0] === 1 && q.corners.every((c) => c.pos[0] === 6));
    // The low step's wall is gone. The tall back's wall stays: the next stair covers only its lower half.
    expect(first).toHaveLength(1);
    const ys = first[0].corners.map((c) => c.pos[1]);
    const zs = first[0].corners.map((c) => c.pos[2]);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([5, 6]);
    expect([Math.min(...zs), Math.max(...zs)]).toEqual([5, 5.5]);
  });

  it('hides a slab wall behind a stair that covers it, and a stair wall behind a taller block only in part', () => {
    // A low slab beside a bottom stair: the slab wall is the lower half, covered by the stair's lower wall.
    const m = mesh(new MapReader([[5, 5, 5, SLAB, SLAB_BOTTOM], [6, 5, 5, STAIRS, stairState(2)]]));
    expect(quadsOf(m.opaque).filter((q) => q.normal[0] === 1 && q.corners.every((c) => c.pos[0] === 6))).toHaveLength(0);
  });
});

describe('model buckets and neighbours that are not opaque', () => {
  it('puts stairs and slabs in the opaque bucket and the pane in the cutout bucket', () => {
    const m = mesh(new MapReader([[1, 1, 1, STAIRS, 0], [5, 1, 1, SLAB, 0], [9, 1, 1, ShapedBlock.GLASS_PANE, 0]]));
    expect(faceCount(m.opaque)).toBe(11 + 6);
    expect(faceCount(m.cutout)).toBe(22);
    expect(faceCount(m.water)).toBe(0);
  });

  it('does not hide a face behind glass or leaves, even when the glass is a cube', () => {
    const m = mesh(new MapReader([[5, 5, 5, SLAB, SLAB_BOTTOM], [5, 4, 5, BlockType.GLASS]]));
    expect(m.opaque.indices.length / 6).toBe(6);
  });

  it('draws water against a slab: water is not hidden by a partial wall', () => {
    const m = mesh(new MapReader([[5, 5, 5, SLAB, SLAB_BOTTOM], [6, 5, 5, BlockType.WATER]]));
    expect(faceCount(m.water)).toBe(6);
  });

  it('hides water against the base of a slab above it', () => {
    const m = mesh(new MapReader([[5, 6, 5, SLAB, SLAB_TOP], [5, 5, 5, BlockType.WATER]]));
    // The slab is in the upper half of the cell above, so its base is half a block up: the water top stays.
    expect(m.water.indices.length / 6).toBe(6);
    const m2 = mesh(new MapReader([[5, 6, 5, SLAB, SLAB_BOTTOM], [5, 5, 5, BlockType.WATER]]));
    // A low slab fills the bottom of its cell, so it covers the water's top face.
    expect(m2.water.indices.length / 6).toBe(5);
  });

  it('keeps the world floor as solid for a slab at the bottom', () => {
    const m = mesh(new MapReader([[5, -64, 5, SLAB, SLAB_BOTTOM]]));
    expect(totalFaces(m)).toBe(5);
  });

  it('joins a fence to a cube: an arm is drawn and the cube keeps every face', () => {
    const m = mesh(new MapReader([[5, 5, 5, BlockType.WOOD_FENCE], [6, 5, 5, WHITE]]));
    // Post: 6. East arm: two rails of 4 faces. The thin arm covers none of the cube's wall, so the cube keeps all 6.
    expect(faceCount(m.cutout)).toBe(6 + 8);
    expect(faceCount(m.opaque)).toBe(6);
    expect(faceCount(mesh(new MapReader([[5, 5, 5, BlockType.WOOD_FENCE]])).cutout)).toBe(6);
  });
});

describe('side constants', () => {
  it('match the order the mesher draws sides in', () => {
    expect([EAST, WEST, UP, DOWN, SOUTH, NORTH]).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
