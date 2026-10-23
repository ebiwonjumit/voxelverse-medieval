import { describe, expect, it } from 'vitest';
import { ModelQuad } from '../../engine/models/BlockModel';
import { BoxModel } from '../../engine/models/BoxModel';
import { CropModel } from '../../engine/models/CropModel';
import { CrossModel } from '../../engine/models/CrossModel';
import { PlateModel } from '../../engine/models/PlateModel';
import { DOWN, EAST, NORTH, SOUTH, UP, WEST } from '../../engine/models/Side';
import { extent, normalOf, quadBounds, rounded } from './helpers';

// The cross product of the first triangle of a quad, to compare its winding with its normal.
const windingDot = (q: ModelQuad): number => {
  const p = (i: number) => [q.corners[i * 3], q.corners[i * 3 + 1], q.corners[i * 3 + 2]];
  const [a, b, c] = [p(0), p(1), p(2)];
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  return cross[0] * q.nx + cross[1] * q.ny + cross[2] * q.nz;
};

describe('CrossModel', () => {
  const cross = new CrossModel(0.8, 0.8);

  it('is two planes, each drawn on both sides, so four quads', () => {
    expect(cross.quads(0)).toHaveLength(4);
  });

  it('stands upright on the diagonals, inside the cell', () => {
    expect(quadBounds(cross.quads(0))).toEqual({ min: [0.1, 0, 0.1], max: [0.9, 0.8, 0.9] });
    for (const q of cross.quads(0)) {
      expect(q.ny).toBe(0);
      expect(Math.hypot(q.nx, q.nz)).toBeCloseTo(1);
      expect(q.cullSide).toBe(-1);
    }
  });

  it('turns each plane both ways, with the winding agreeing with the normal', () => {
    const quads = cross.quads(0);
    const normals = quads.map((q) => `${q.nx.toFixed(3)},${q.nz.toFixed(3)}`);
    expect(new Set(normals).size).toBe(4);
    for (const q of quads) expect(windingDot(q)).toBeGreaterThan(0);
    // Two planes at right angles: normals come in opposite pairs, the pairs perpendicular.
    const unique = quads.map((q) => [q.nx, q.nz]);
    const dots = unique.map((n) => unique.map((m) => Math.round(n[0] * m[0] + n[1] * m[1])));
    for (const row of dots) expect(row.slice().sort()).toEqual([-1, 0, 0, 1]);
  });

  it('shows the whole tile on each side with the bottom of the picture at the bottom', () => {
    for (const q of cross.quads(0)) {
      expect([...q.uvs].map((v) => Math.round(v))).toEqual([0, 1, 1, 1, 1, 0, 0, 0].map((v) => v));
      // The bottom corners are the first two.
      expect(q.corners[1]).toBe(0);
      expect(q.corners[4]).toBe(0);
      expect(q.corners[7]).toBeCloseTo(0.8);
    }
  });

  it('has no collision and covers nothing', () => {
    expect(cross.collisionBoxes(0)).toEqual([]);
    for (let s = 0; s < 6; s++) {
      expect(cross.occludesFace(0, s)).toBe(false);
      expect(cross.faceCoverage(0, s)).toBe(0);
    }
    expect(cross.isFullCube).toBe(false);
  });

  it('keeps the same quads whatever the state', () => {
    expect(cross.quads(5)).toBe(cross.quads(0));
  });
});

describe('CropModel', () => {
  const crop = new CropModel();

  it('is four planes laid out like a number sign, each on both sides, so eight quads', () => {
    expect(crop.quads(0)).toHaveLength(8);
  });

  it('puts the planes a quarter in from each edge', () => {
    const lines = new Set<string>();
    for (const q of crop.quads(0)) {
      const e = extent(q);
      if (e[0][0] === e[0][1]) lines.add(`x=${e[0][0]}`);
      if (e[2][0] === e[2][1]) lines.add(`z=${e[2][0]}`);
    }
    expect([...lines].sort()).toEqual(['x=0.25', 'x=0.75', 'z=0.25', 'z=0.75']);
  });

  it('stands a sixteenth lower than its cell, on top of farmland, and reaches the edges of the cell', () => {
    expect(quadBounds(crop.quads(0))).toEqual({ min: [0, -0.0625, 0], max: [1, 0.9375, 1] });
  });

  it('has the winding agree with the normal on every quad, and no collision', () => {
    for (const q of crop.quads(0)) expect(windingDot(q)).toBeGreaterThan(0);
    expect(crop.collisionBoxes(0)).toEqual([]);
    expect(crop.occludesFace(0, UP)).toBe(false);
  });

  it('faces every plane both ways', () => {
    const normals = new Set(crop.quads(0).map(normalOf));
    expect(normals.size).toBe(4);
  });
});

describe('BoxModel', () => {
  it('draws its box with six faces and collides with it', () => {
    const rock = new BoxModel([[0.3, 0, 0.3, 0.7, 0.2, 0.7]]);
    expect(rock.quads(0)).toHaveLength(6);
    expect(quadBounds(rock.quads(0))).toEqual({ min: [0.3, 0, 0.3], max: [0.7, 0.2, 0.7] });
    expect(rounded(rock.collisionBoxes(0))).toEqual([[0.3, 0, 0.3, 0.7, 0.2, 0.7]]);
    expect(rock.isFullCube).toBe(false);
    for (let s = 0; s < 6; s++) expect(rock.occludesFace(0, s)).toBe(false);
  });

  it('squeezes the whole tile onto each face by default', () => {
    const apple = new BoxModel([[0.4, 0.4, 0.4, 0.6, 0.6, 0.6]]);
    for (const q of apple.quads(0)) {
      const u = [0, 1, 2, 3].map((i) => q.uvs[i * 2]);
      const v = [0, 1, 2, 3].map((i) => q.uvs[i * 2 + 1]);
      expect([Math.min(...u), Math.max(...u), Math.min(...v), Math.max(...v)].map((n) => Math.round(n * 1e4) / 1e4))
        .toEqual([0, 1, 0, 1]);
    }
  });

  describe('as farmland, a cube 15/16 high', () => {
    const farmland = new BoxModel([[0, 0, 0, 1, 15 / 16, 1]], 'cell');

    it('covers its base and nothing else completely', () => {
      const covered = [EAST, WEST, UP, DOWN, SOUTH, NORTH].map((s) => farmland.occludesFace(0, s));
      expect(covered).toEqual([false, false, false, true, false, false]);
      // Its walls cover the lower half of the face; the thin strip above is open.
      expect(farmland.faceCoverage(0, NORTH)).toBe(3);
      expect(farmland.faceCoverage(0, EAST)).toBe(5);
    });

    it('keeps the tile at full scale: the walls show the top 15/16 of it, the top the whole tile', () => {
      const wall = farmland.quads(0).find((q) => q.cullSide === NORTH)!;
      const v = [0, 1, 2, 3].map((i) => wall.uvs[i * 2 + 1]);
      expect(Math.min(...v)).toBeCloseTo(1 / 16);
      expect(Math.max(...v)).toBeCloseTo(1);
      const top = farmland.quads(0).find((q) => q.ny === 1)!;
      expect(extent(top)).toEqual([[0, 1], [0.9375, 0.9375], [0, 1]]);
      expect(top.cullSide).toBe(-1);
    });

    it('collides with the whole 15/16 block', () => {
      expect(rounded(farmland.collisionBoxes(0))).toEqual([[0, 0, 0, 1, 0.9375, 1]]);
    });
  });
});

describe('PlateModel', () => {
  const pad = new PlateModel(0.2, 0.985);

  it('is a flat box 1/16 high, inset from the edges', () => {
    expect(pad.quads(0)).toHaveLength(6);
    const { min, max } = quadBounds(pad.quads(0));
    expect(min[0]).toBeCloseTo(0.2);
    expect(max[0]).toBeCloseTo(0.8);
    expect(min[2]).toBeCloseTo(0.2);
    expect(max[2]).toBeCloseTo(0.8);
    expect(min[1]).toBeCloseTo(0.985);
    expect(max[1] - min[1]).toBeCloseTo(1 / 16);
  });

  it('covers nothing and shows the whole tile on its top', () => {
    for (let s = 0; s < 6; s++) expect(pad.occludesFace(0, s)).toBe(false);
    const top = pad.quads(0).find((q) => q.ny === 1)!;
    const u = [0, 1, 2, 3].map((i) => top.uvs[i * 2]);
    expect([Math.min(...u), Math.max(...u)]).toEqual([0, 1]);
    expect(rounded(pad.collisionBoxes(0))).toHaveLength(1);
  });
});
