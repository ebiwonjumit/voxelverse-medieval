import { describe, expect, it } from 'vitest';
import { Box, ModelQuad } from '../../engine/models/BlockModel';
import { BoxModel } from '../../engine/models/BoxModel';
import { OrientedBoxModel, orientedState } from '../../engine/models/OrientedBoxModel';
import { rotateBox } from '../../engine/models/shape';
import { EAST, NORTH, SOUTH, UP, WEST } from '../../engine/models/Side';
import { quadBounds, rounded } from './helpers';

// An awning-like shape that is clearly not symmetric: a thin plate against the north wall, half a cell deep and
// 2/16 thick, high in the cell, and a lower one in front of it.
const BOXES: Box[] = [
  [0, 12 / 16, 0, 1, 14 / 16, 0.5],
  [0, 10 / 16, 0.5, 1, 12 / 16, 1],
];
const model = new OrientedBoxModel(BOXES);

const r = (v: number) => Math.round(v * 1e4) / 1e4;
const turnPoint = (x: number, z: number, turns: number): [number, number] => {
  for (let t = 0; t < turns; t++) [x, z] = [1 - z, x];
  return [r(x), r(z)];
};
const SIDE_AFTER = (side: number, turns: number): number => {
  const order = [NORTH, EAST, SOUTH, WEST];
  const at = order.indexOf(side);
  return at < 0 ? side : order[(at + turns) % 4];
};

/** Every corner of a quad as "x,y,z:u,v", so quads can be compared as sets however their corners are ordered. */
const cornerKeys = (q: ModelQuad, turns = 0): string[] =>
  [0, 1, 2, 3].map((i) => {
    const [x, z] = turnPoint(q.corners[i * 3], q.corners[i * 3 + 2], turns);
    return `${x},${r(q.corners[i * 3 + 1])},${z}:${r(q.uvs[i * 2])},${r(q.uvs[i * 2 + 1])}`;
  }).sort();

const extentOf = (q: ModelQuad) => {
  const span = (axis: number) => {
    const values = [0, 1, 2, 3].map((i) => q.corners[i * 3 + axis]);
    return r(Math.max(...values) - Math.min(...values));
  };
  return { x: span(0), z: span(2) };
};

const sideOf = (q: ModelQuad): number => (q.nx > 0 ? EAST : q.nx < 0 ? WEST : q.ny > 0 ? UP : q.ny < 0 ? 3 : q.nz > 0 ? SOUTH : NORTH);

describe('OrientedBoxModel', () => {
  it('draws the boxes as written at state 0, exactly like a BoxModel in cell mode', () => {
    const plain = new BoxModel(BOXES, 'cell');
    const a = model.quads(0);
    const b = plain.quads(0);
    expect(a).toHaveLength(b.length);
    a.forEach((q, i) => {
      expect([...q.corners]).toEqual([...b[i].corners]);
      expect([...q.uvs]).toEqual([...b[i].uvs]);
      expect(q.face).toBe(b[i].face);
    });
  });

  it('turns the boxes a quarter turn clockwise per step, in the geometry and in the collision', () => {
    for (let turns = 0; turns < 4; turns++) {
      const want = BOXES.map((b) => rotateBox(b, turns));
      expect(rounded(model.collisionBoxes(turns))).toEqual(rounded(want));
      const bounds = quadBounds(model.quads(turns));
      const union = quadBounds(want.flatMap((b) => new BoxModel([b], 'cell').quads(0)));
      expect(bounds).toEqual(union);
    }
    // North becomes east: the plate against the north wall now lies against the east wall.
    const [x0, , , x1] = model.collisionBoxes(1)[0];
    expect(r(x0)).toBe(0.5);
    expect(r(x1)).toBe(1);
  });

  it('turns the texture with the geometry: every quad shows what it showed before, on the side it moved to', () => {
    const base = model.quads(0);
    for (let turns = 1; turns < 4; turns++) {
      const turned = model.quads(turns);
      expect(turned).toHaveLength(base.length);
      const seen = new Map(turned.map((q) => [`${sideOf(q)}:${cornerKeys(q).join('|')}`, q]));
      for (const q of base) {
        // Same texture coordinates at the same corners, once the corners are carried through the same turn.
        const key = `${SIDE_AFTER(sideOf(q), turns)}:${cornerKeys(q, turns).join('|')}`;
        const match = seen.get(key);
        expect(match, `quad on side ${sideOf(q)} after ${turns} turns`).toBeDefined();
        expect(match!.face).toBe(q.face);
      }
    }
  });

  it('shows the same part of the tile on a turned top face, which is what makes the stripes follow the object', () => {
    // The top of the high plate covers z 0 to 0.5 of the cell at state 0, so it samples the upper half of the tile.
    const top = (state: number) => model.quads(state).filter((q) => q.ny > 0 && q.corners[1] > 0.8)[0];
    const range = (q: ModelQuad, axis: number) => {
      const values = [...q.uvs].filter((_, i) => i % 2 === axis);
      return [Math.min(...values), Math.max(...values)];
    };
    expect(range(top(0), 0)).toEqual([0, 1]);
    expect(range(top(0), 1)).toEqual([0, 0.5]);
    // Turned once, the plate lies against the east wall (a long thin strip along z) but still wears the same half of
    // the tile, turned with it.
    expect(range(top(1), 0)).toEqual([0, 1]);
    expect(range(top(1), 1)).toEqual([0, 0.5]);
    expect(extentOf(top(1))).toEqual({ x: 0.5, z: 1 });
  });

  it('moves what a turned shape covers with it, so the neighbour that hides its face is the right one', () => {
    const wall = new OrientedBoxModel([[0, 0, 0, 1, 1, 0.25]]);
    // Authored against the north wall: covers its north side completely.
    expect(wall.occludesFace(0, NORTH)).toBe(true);
    expect(wall.occludesFace(0, EAST)).toBe(false);
    expect(wall.occludesFace(1, EAST)).toBe(true);
    expect(wall.occludesFace(2, SOUTH)).toBe(true);
    expect(wall.occludesFace(3, WEST)).toBe(true);
    expect(wall.occludesFace(3, NORTH)).toBe(false);
    const q = wall.quads(1).find((quad) => quad.cullSide !== -1 && quad.fullFace);
    expect(q?.cullSide).toBe(EAST);
  });

  it('ignores the unused bits and repeats every four turns', () => {
    expect(model.quads(4)).toBe(model.quads(0));
    expect(model.quads(7)).toBe(model.quads(3));
    expect(orientedState(5)).toBe(1);
    expect(orientedState(-1)).toBe(3);
    expect(model.isFullCube).toBe(false);
  });

  it('shares its quads between cells in the same state', () => {
    expect(model.quads(2)).toBe(model.quads(2));
  });

  it('also turns the stretched mapping with the box, so a small object keeps its picture whole', () => {
    const lamp = new OrientedBoxModel([[4 / 16, 0, 2 / 16, 12 / 16, 8 / 16, 6 / 16]], 'stretch');
    for (let turns = 0; turns < 4; turns++) {
      for (const q of lamp.quads(turns)) {
        for (const v of q.uvs) {
          expect(v).toBeGreaterThanOrEqual(-1e-6);
          expect(v).toBeLessThanOrEqual(1 + 1e-6);
        }
      }
    }
  });
});
