import { describe, expect, it } from 'vitest';
import { DOWN, EAST, HORIZONTAL_SIDES, NORTH, SOUTH, UP, WEST } from '../../engine/models/Side';
import { SLAB_BOTTOM, SLAB_TOP, SlabModel } from '../../engine/models/SlabModel';
import { STAIR_UPSIDE_DOWN, StairModel, stairState } from '../../engine/models/StairModel';
import { CUBE_MODEL } from '../../engine/models/CubeModel';
import { extent, normalOf, quadBounds, rounded } from './helpers';

const slab = new SlabModel();
const stairs = new StairModel();

const popcount = (n: number) => n.toString(2).replace(/0/g, '').length;

describe('CubeModel', () => {
  it('is a full cube that covers every side', () => {
    expect(CUBE_MODEL.isFullCube).toBe(true);
    for (let side = 0; side < 6; side++) {
      expect(CUBE_MODEL.occludesFace(0, side)).toBe(true);
      expect(CUBE_MODEL.faceCoverage(0, side)).toBe(15);
    }
    expect(CUBE_MODEL.quads(0)).toHaveLength(6);
    expect(rounded(CUBE_MODEL.collisionBoxes(0))).toEqual([[0, 0, 0, 1, 1, 1]]);
  });
});

describe('SlabModel', () => {
  it('is half a cube, low for state 0 and high for state 1', () => {
    expect(slab.isFullCube).toBe(false);
    expect(rounded(slab.collisionBoxes(SLAB_BOTTOM))).toEqual([[0, 0, 0, 1, 0.5, 1]]);
    expect(rounded(slab.collisionBoxes(SLAB_TOP))).toEqual([[0, 0.5, 0, 1, 1, 1]]);
    expect(quadBounds(slab.quads(SLAB_BOTTOM))).toEqual({ min: [0, 0, 0], max: [1, 0.5, 1] });
    expect(quadBounds(slab.quads(SLAB_TOP))).toEqual({ min: [0, 0.5, 0], max: [1, 1, 1] });
  });

  it('only reads bit 0 of the state', () => {
    expect(slab.quads(2)).toBe(slab.quads(0));
    expect(slab.quads(3)).toBe(slab.quads(1));
  });

  it('draws six faces', () => {
    expect(slab.quads(SLAB_BOTTOM)).toHaveLength(6);
    expect(slab.quads(SLAB_TOP)).toHaveLength(6);
  });

  it('covers the face on its flat side and half of each wall', () => {
    const covered = (state: number) => [EAST, WEST, UP, DOWN, SOUTH, NORTH].map((s) => slab.occludesFace(state, s));
    expect(covered(SLAB_BOTTOM)).toEqual([false, false, false, true, false, false]);
    expect(covered(SLAB_TOP)).toEqual([false, false, true, false, false, false]);
    // Quarters: the walls are cut in y, so a low slab covers the two low quarters of each wall.
    expect([EAST, WEST, SOUTH, NORTH].map((s) => slab.faceCoverage(SLAB_BOTTOM, s))).toEqual([5, 5, 3, 3]);
    expect([EAST, WEST, SOUTH, NORTH].map((s) => slab.faceCoverage(SLAB_TOP, s))).toEqual([10, 10, 12, 12]);
  });

  it('shows half of the tile on its walls, so it lines up with the cubes beside it', () => {
    const wall = slab.quads(SLAB_BOTTOM).find((q) => q.cullSide === NORTH)!;
    const v = [0, 1, 2, 3].map((i) => wall.uvs[i * 2 + 1]);
    expect(Math.min(...v)).toBeCloseTo(0.5);
    expect(Math.max(...v)).toBeCloseTo(1);
    const upper = slab.quads(SLAB_TOP).find((q) => q.cullSide === NORTH)!;
    const vUpper = [0, 1, 2, 3].map((i) => upper.uvs[i * 2 + 1]);
    expect(Math.min(...vUpper)).toBeCloseTo(0);
    expect(Math.max(...vUpper)).toBeCloseTo(0.5);
  });
});

describe('StairModel', () => {
  // The side the tall back of a stair is on, by facing.
  const backSide = (facing: number) => HORIZONTAL_SIDES[facing];

  it('builds the state byte from facing and half', () => {
    expect(stairState(0)).toBe(0);
    expect(stairState(3)).toBe(3);
    expect(stairState(2, true)).toBe(2 | STAIR_UPSIDE_DOWN);
    expect(stairState(5)).toBe(1); // facing is two bits
  });

  it('has eight variants and ignores bit 3', () => {
    for (let state = 0; state < 8; state++) expect(stairs.quads(state + 8)).toBe(stairs.quads(state));
    const distinct = new Set(Array.from({ length: 8 }, (_, s) => stairs.quads(s)));
    expect(distinct.size).toBe(8);
  });

  for (let facing = 0; facing < 4; facing++) {
    describe(`facing ${['north', 'east', 'south', 'west'][facing]}, bottom half`, () => {
      const state = stairState(facing);
      const quads = stairs.quads(state);
      const back = backSide(facing);

      it('draws eleven faces, two steps tall at the back and one step at the front', () => {
        expect(quads).toHaveLength(11);
        expect(rounded(stairs.collisionBoxes(state))).toHaveLength(2);
        const volume = stairs.collisionBoxes(state).reduce((v, b) => v + (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]), 0);
        expect(volume).toBeCloseTo(0.75);
      });

      it('has the full-height top on the back half and the tread on the front half', () => {
        const axis = back === EAST || back === WEST ? 0 : 2;
        const high = back === EAST || back === SOUTH; // the back is at the high end of the axis
        const tops = quads.filter((q) => normalOf(q) === '0,1,0');
        expect(tops).toHaveLength(2);
        const roof = tops.find((q) => extent(q)[1][0] === 1)!;
        const tread = tops.find((q) => extent(q)[1][0] === 0.5)!;
        expect(extent(roof)[axis]).toEqual(high ? [0.5, 1] : [0, 0.5]);
        expect(extent(tread)[axis]).toEqual(high ? [0, 0.5] : [0.5, 1]);
      });

      it('has a riser between them, facing the low side, half a block tall', () => {
        const low = back ^ 1; // opposite side
        const riser = quads.find((q) => q.cullSide === -1 && normalOf(q) !== '0,1,0')!;
        const n = [riser.nx, riser.ny, riser.nz];
        const expected = [0, 0, 0];
        expected[low === EAST || low === WEST ? 0 : 2] = low === EAST || low === SOUTH ? 1 : -1;
        expect(n).toEqual(expected);
        expect(extent(riser)[1]).toEqual([0.5, 1]);
      });

      it('covers its base, its back and three quarters of each side wall', () => {
        const covered = [EAST, WEST, UP, DOWN, SOUTH, NORTH].filter((s) => stairs.occludesFace(state, s));
        expect(covered.sort()).toEqual([DOWN, back].sort());
        for (const side of [EAST, WEST, SOUTH, NORTH]) {
          if (side === back) continue;
          const mask = stairs.faceCoverage(state, side);
          const sideways = side !== (back ^ 1);
          // The side walls and the front are cut into steps. The front wall is only the low half.
          expect(popcount(mask)).toBe(sideways ? 3 : 2);
        }
        expect(stairs.faceCoverage(state, UP)).not.toBe(15);
        expect(popcount(stairs.faceCoverage(state, UP))).toBe(2);
      });
    });
  }

  for (let facing = 0; facing < 4; facing++) {
    it(`mirrors facing ${facing} upside down: the base is the top and the tall back stays put`, () => {
      const up = stairs.quads(stairState(facing));
      const down = stairs.quads(stairState(facing, true));
      expect(down).toHaveLength(up.length);
      const mirror = (e: number[][]) => [e[0], [1 - e[1][1], 1 - e[1][0]], e[2]].map((p) => p.map((v) => Math.round(v * 1e4) / 1e4));
      expect(down.map((q) => JSON.stringify(extent(q))).sort())
        .toEqual(up.map((q) => JSON.stringify(mirror(extent(q)))).sort());
      const covered = [EAST, WEST, UP, DOWN, SOUTH, NORTH].filter((s) => stairs.occludesFace(stairState(facing, true), s));
      expect(covered.sort()).toEqual([UP, HORIZONTAL_SIDES[facing]].sort());
    });
  }

  it('hangs the tread under the roof when upside down', () => {
    const quads = stairs.quads(stairState(0, true));
    const undersides = quads.filter((q) => normalOf(q) === '0,-1,0');
    expect(undersides.map((q) => extent(q)[1][0]).sort()).toEqual([0, 0.5]);
    expect(rounded(stairs.collisionBoxes(stairState(0, true))).sort()).toEqual(
      [[0, 0.5, 0.5, 1, 1, 1], [0, 0, 0, 1, 1, 0.5]].sort());
  });
});
