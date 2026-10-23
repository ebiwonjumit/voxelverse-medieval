import { describe, expect, it } from 'vitest';
import { FENCE_EAST, FENCE_NORTH, FENCE_SOUTH, FENCE_WEST, FenceModel } from '../../engine/models/FenceModel';
import { PaneModel } from '../../engine/models/PaneModel';
import { BlockType } from '../../worldConstants';
import { ShapedBlock } from '../../content/blocksShaped';
import { around, quadBounds, rounded, STONE } from './helpers';

const fence = new FenceModel();
const pane = new PaneModel();
const FENCE = BlockType.WOOD_FENCE;
const PANE = ShapedBlock.GLASS_PANE;

// Neighbour offsets for the four directions, in the order of the mask bits: north, east, south, west.
const DIRECTIONS: Array<[number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const popcount = (n: number) => n.toString(2).replace(/0/g, '').length;

// A neighbourhood with `id` beside the block on every direction whose bit is set in mask.
const withNeighbours = (mask: number, id: number) =>
  around(DIRECTIONS.flatMap(([dx, dz], d): Array<[number, number, number, number]> => (mask & (1 << d) ? [[dx, 0, dz, id]] : [])));

describe('FenceModel', () => {
  it('is a post on its own, a quarter of a block wide and a full block tall', () => {
    const quads = fence.quads(0, around());
    expect(quads).toHaveLength(6);
    expect(quadBounds(quads)).toEqual({ min: [0.375, 0, 0.375], max: [0.625, 1, 0.625] });
    expect(fence.quads(0)).toBe(quads); // without a neighbourhood it is the same bare post
  });

  it('does not store its connections: the state is ignored', () => {
    for (let state = 0; state < 16; state++) expect(fence.quads(state, around())).toBe(fence.quads(0, around()));
  });

  for (let mask = 0; mask < 16; mask++) {
    const label = ['north', 'east', 'south', 'west'].filter((_, d) => mask & (1 << d)).join(' + ') || 'nothing';

    it(`joined to fences on: ${label}`, () => {
      const nb = withNeighbours(mask, FENCE);
      const quads = fence.quads(0, nb);
      // The post keeps all six faces. Each arm is two rails of four visible faces: the end against the neighbour
      // and the end against the post are not drawn.
      expect(quads).toHaveLength(6 + 8 * popcount(mask));
      const { min, max } = quadBounds(quads);
      // An arm runs to the edge of the cell, on the side it joins.
      expect(min[0]).toBe(mask & FENCE_WEST ? 0 : 0.375);
      expect(max[0]).toBe(mask & FENCE_EAST ? 1 : 0.625);
      expect(min[2]).toBe(mask & FENCE_NORTH ? 0 : 0.375);
      expect(max[2]).toBe(mask & FENCE_SOUTH ? 1 : 0.625);
    });

    it(`joined to stone on: ${label}`, () => {
      expect(fence.quads(0, withNeighbours(mask, STONE))).toHaveLength(6 + 8 * popcount(mask));
    });
  }

  it('joins fences and solid full blocks, and nothing else', () => {
    const count = (id: number) => fence.quads(0, around([[1, 0, 0, id]])).length;
    expect(count(FENCE)).toBe(14);
    expect(count(STONE)).toBe(14);
    expect(count(BlockType.GRASS)).toBe(14);
    expect(count(BlockType.GLASS)).toBe(6);        // see-through
    expect(count(BlockType.LEAVES)).toBe(6);
    expect(count(BlockType.WATER)).toBe(6);
    expect(count(BlockType.FLOWER_RED)).toBe(6);   // not a full cube
    expect(count(ShapedBlock.STONE_BRICK_SLAB)).toBe(6);
    expect(count(PANE)).toBe(6);
    expect(count(0)).toBe(6);
    expect(count(4000)).toBe(6);                   // an id nobody registered
  });

  it('only looks at the four sides, not at blocks above, below or diagonal', () => {
    const nb = around([[0, 1, 0, FENCE], [0, -1, 0, FENCE], [1, 0, 1, FENCE], [-1, 0, -1, STONE], [1, 1, 0, FENCE]]);
    expect(fence.quads(0, nb)).toHaveLength(6);
  });

  it('draws the two rails of an arm at the heights fence rails sit at', () => {
    const arm = fence.quads(0, withNeighbours(FENCE_EAST, FENCE)).filter((q) => quadBounds([q]).max[0] > 0.625);
    const ys = new Set(arm.flatMap((q) => [0, 1, 2, 3].map((i) => Math.round(q.corners[i * 3 + 1] * 16))));
    expect([...ys].sort((a, b) => a - b)).toEqual([6, 9, 12, 15]);
  });

  describe('collision', () => {
    it('is a post that stops the player at a block and a half', () => {
      expect(rounded(fence.collisionBoxes(0, around()))).toEqual([[0.375, 0, 0.375, 0.625, 1.5, 0.625]]);
    });

    it('adds a box as tall as the post for each joined side', () => {
      const boxes = rounded(fence.collisionBoxes(0, withNeighbours(FENCE_NORTH | FENCE_EAST, FENCE)));
      expect(boxes).toEqual([
        [0.375, 0, 0.375, 0.625, 1.5, 0.625],
        [0.375, 0, 0, 0.625, 1.5, 0.375],
        [0.625, 0, 0.375, 1, 1.5, 0.625],
      ]);
      for (let mask = 0; mask < 16; mask++) {
        expect(fence.collisionBoxes(0, withNeighbours(mask, FENCE))).toHaveLength(1 + popcount(mask));
      }
    });

    it('is only the post when asked without a neighbourhood', () => {
      expect(fence.collisionBoxes(0)).toHaveLength(1);
    });
  });

  it('covers nothing, so it hides no neighbour', () => {
    for (let side = 0; side < 6; side++) expect(fence.occludesFace(0, side)).toBe(false);
  });
});

describe('PaneModel', () => {
  it('draws a cross when it joins nothing, two sixteenths thick', () => {
    const quads = pane.quads(0, around());
    expect(quadBounds(quads)).toEqual({ min: [0, 0, 0], max: [1, 1, 1] });
    // Post: top and bottom. Four arms of five faces (the end against the post is not drawn).
    expect(quads).toHaveLength(2 + 4 * 5);
    expect(pane.quads(0)).toBe(quads);
  });

  for (let mask = 1; mask < 16; mask++) {
    const label = ['north', 'east', 'south', 'west'].filter((_, d) => mask & (1 << d)).join(' + ');
    it(`joined to panes on: ${label}`, () => {
      const quads = pane.quads(0, withNeighbours(mask, PANE));
      // The post loses the face each arm grows from; each arm has four visible faces.
      expect(quads).toHaveLength(6 - popcount(mask) + 4 * popcount(mask));
      const { min, max } = quadBounds(quads);
      expect(min[0]).toBe(mask & FENCE_WEST ? 0 : 0.4375);
      expect(max[0]).toBe(mask & FENCE_EAST ? 1 : 0.5625);
      expect(min[2]).toBe(mask & FENCE_NORTH ? 0 : 0.4375);
      expect(max[2]).toBe(mask & FENCE_SOUTH ? 1 : 0.5625);
      expect(min[1]).toBe(0);
      expect(max[1]).toBe(1);
    });
  }

  it('joins panes, glass and solid cubes, but not fences, leaves or slabs', () => {
    const count = (id: number) => pane.quads(0, around([[1, 0, 0, id]])).length;
    const joined = 6 - 1 + 4;
    const alone = 2 + 4 * 5;
    expect(count(PANE)).toBe(joined);
    expect(count(BlockType.GLASS)).toBe(joined);
    expect(count(STONE)).toBe(joined);
    expect(count(FENCE)).toBe(alone);
    expect(count(ShapedBlock.WOOD_PLANK_SLAB)).toBe(alone);
    expect(count(BlockType.WATER)).toBe(alone);
    expect(count(0)).toBe(alone);
  });

  it('collides with what it draws', () => {
    expect(rounded(pane.collisionBoxes(0, withNeighbours(FENCE_NORTH, PANE)))).toEqual([
      [0.4375, 0, 0.4375, 0.5625, 1, 0.5625],
      [0.4375, 0, 0, 0.5625, 1, 0.4375],
    ]);
    expect(pane.collisionBoxes(0, around())).toHaveLength(5);
  });

  it('covers nothing', () => {
    for (let side = 0; side < 6; side++) expect(pane.occludesFace(0, side)).toBe(false);
  });
});
