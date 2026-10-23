import { FACE_BOTTOM, FACE_SIDE, FACE_TOP } from '../TextureLayout';
import { Box, ModelQuad } from './BlockModel';
import { DOWN, SIDES, UP } from './Side';

// Turns boxes into the quads the mesher draws. Models describe themselves as a few boxes; this works out which of
// their faces can be seen, what texture coordinates they get, which quarters of the cell's sides they cover and
// which side they sit flat against (so a neighbour can hide them).

const EPS = 1e-6;
const CORNER_U = [-1, 1, 1, -1];
const CORNER_V = [-1, -1, 1, 1];

/** A box and the sides it must not draw, as a bit mask over the sides (bit s set: skip side s). */
export interface BoxPart {
  box: Box;
  skip?: number;
}

/**
 * How a box wears its texture. `cell` lays the tile over the whole cell and shows the part the box covers, so a slab
 * shows the lower half of the tile and lines up with the cubes beside it. `stretch` squeezes the whole tile onto each
 * face, which suits small objects drawn as one picture (an apple, a lantern).
 */
export type UvMode = 'cell' | 'stretch';

export interface CompiledShape {
  quads: ModelQuad[];
  collision: Box[];
  /** Per side, the covered quarters (see BlockModel.faceCoverage). */
  coverage: Uint8Array;
}

const faceKind = (side: number): number => (side === UP ? FACE_TOP : side === DOWN ? FACE_BOTTOM : FACE_SIDE);

/**
 * Texture coordinates of a point on a face of a unit box. The mapping is the one the mesher uses for cube faces: walls
 * read left to right as seen from outside, the top of a tile points north on a top face and south on a bottom face.
 */
export const faceUv = (side: number, x: number, y: number, z: number, out: Float32Array, at: number): void => {
  const { axis, sign } = SIDES[side];
  if (axis === 1) {
    out[at] = x;
    out[at + 1] = sign > 0 ? z : 1 - z;
  } else {
    // Facing +x the viewer's right is -z, facing -x it is +z, facing +z it is +x, facing -z it is -x.
    const rightIsHigh = (axis === 0) !== (sign > 0);
    const along = axis === 0 ? z : x;
    out[at] = rightIsHigh ? along : 1 - along;
    out[at + 1] = 1 - y;
  }
};

type Rect = [number, number, number, number]; // u0, u1, v0, v1

// What is left of rect a once rect b is taken away, if that is still one rectangle. Null when nothing is left.
// When b would cut a notch out of the middle the face is kept whole: the part behind b is never seen, and one
// quad is cheaper than several.
const subtract = (a: Rect, b: Rect): Rect | null => {
  const u0 = Math.max(a[0], b[0]);
  const u1 = Math.min(a[1], b[1]);
  const v0 = Math.max(a[2], b[2]);
  const v1 = Math.min(a[3], b[3]);
  if (u1 - u0 <= EPS || v1 - v0 <= EPS) return a;
  const coversU = u0 <= a[0] + EPS && u1 >= a[1] - EPS;
  const coversV = v0 <= a[2] + EPS && v1 >= a[3] - EPS;
  if (coversU && coversV) return null;
  if (coversV) {
    if (u0 <= a[0] + EPS) return [u1, a[1], a[2], a[3]];
    if (u1 >= a[1] - EPS) return [a[0], u0, a[2], a[3]];
  } else if (coversU) {
    if (v0 <= a[2] + EPS) return [a[0], a[1], v1, a[3]];
    if (v1 >= a[3] - EPS) return [a[0], a[1], a[2], v0];
  }
  return a;
};

// The tangent axes of a side in x, y, z order, which is how quarters are numbered.
const tangents = (axis: number): [number, number] => (axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1]);

// A face is cut into four quarters. Quarter q is (second axis high ? 2 : 0) | (first axis high ? 1 : 0) and the masks
// below have bit 1 << q set for it.
const touchedQuarters = (lo0: number, hi0: number, lo1: number, hi1: number): number => {
  const low0 = lo0 < 0.5 - EPS;
  const high0 = hi0 > 0.5 + EPS;
  const low1 = lo1 < 0.5 - EPS;
  const high1 = hi1 > 0.5 + EPS;
  let mask = 0;
  if (low0 && low1) mask |= 1;
  if (high0 && low1) mask |= 2;
  if (low0 && high1) mask |= 4;
  if (high0 && high1) mask |= 8;
  return mask;
};

const coveredQuarters = (lo0: number, hi0: number, lo1: number, hi1: number): number => {
  const low0 = lo0 <= EPS && hi0 >= 0.5 - EPS;
  const high0 = lo0 <= 0.5 + EPS && hi0 >= 1 - EPS;
  const low1 = lo1 <= EPS && hi1 >= 0.5 - EPS;
  const high1 = lo1 <= 0.5 + EPS && hi1 >= 1 - EPS;
  let mask = 0;
  if (low0 && low1) mask |= 1;
  if (high0 && low1) mask |= 2;
  if (low0 && high1) mask |= 4;
  if (high0 && high1) mask |= 8;
  return mask;
};

export const compileBoxes = (parts: readonly BoxPart[], uv: UvMode, collision?: readonly Box[]): CompiledShape => {
  const quads: ModelQuad[] = [];
  const coverage = new Uint8Array(6);

  parts.forEach((part, index) => {
    const b = part.box;
    for (let side = 0; side < 6; side++) {
      const { axis, sign, u, v } = SIDES[side];
      const plane = sign > 0 ? b[3 + axis] : b[axis];
      const flush = sign > 0 ? Math.abs(plane - 1) < EPS : Math.abs(plane) < EPS;
      const [t0, t1] = tangents(axis);

      // The part always counts toward what the cell covers, even where it draws nothing.
      if (flush) coverage[side] |= coveredQuarters(b[t0], b[3 + t0], b[t1], b[3 + t1]);
      if (part.skip && part.skip & (1 << side)) continue;

      let rect: Rect | null = [b[u], b[3 + u], b[v], b[3 + v]];
      for (let other = 0; other < parts.length && rect; other++) {
        if (other === index) continue;
        const o = parts[other].box;
        const spans = sign > 0 ? o[axis] <= plane + EPS && o[3 + axis] > plane + EPS
          : o[axis] < plane - EPS && o[3 + axis] >= plane - EPS;
        if (spans) rect = subtract(rect, [o[u], o[3 + u], o[v], o[3 + v]]);
      }
      if (!rect || rect[1] - rect[0] <= EPS || rect[3] - rect[2] <= EPS) continue;

      const corners = new Float32Array(12);
      const uvs = new Float32Array(8);
      const point = [0, 0, 0];
      for (let i = 0; i < 4; i++) {
        point[axis] = plane;
        point[u] = CORNER_U[i] > 0 ? rect[1] : rect[0];
        point[v] = CORNER_V[i] > 0 ? rect[3] : rect[2];
        corners[i * 3] = point[0];
        corners[i * 3 + 1] = point[1];
        corners[i * 3 + 2] = point[2];
        if (uv === 'stretch') {
          for (let a = 0; a < 3; a++) point[a] = (point[a] - b[a]) / (b[3 + a] - b[a]);
        }
        faceUv(side, point[0], point[1], point[2], uvs, i * 2);
      }

      let need = 0;
      let full = false;
      if (flush) {
        const lo0 = u === t0 ? rect[0] : rect[2];
        const hi0 = u === t0 ? rect[1] : rect[3];
        const lo1 = u === t0 ? rect[2] : rect[0];
        const hi1 = u === t0 ? rect[3] : rect[1];
        need = touchedQuarters(lo0, hi0, lo1, hi1);
        full = lo0 <= EPS && hi0 >= 1 - EPS && lo1 <= EPS && hi1 >= 1 - EPS;
      }
      quads.push({
        corners, uvs, nx: axis === 0 ? sign : 0, ny: axis === 1 ? sign : 0, nz: axis === 2 ? sign : 0,
        face: faceKind(side), cullSide: flush ? side : -1, need, fullFace: full,
      });
    }
  });

  return { quads, collision: collision ? [...collision] : parts.map((p) => p.box), coverage };
};

/**
 * An upright plane from (x0, z0) to (x1, z1), y0 to y1, drawn on both sides. The cutout material draws one side of a
 * face only, so a plant needs a second quad turned the other way. The tile runs from the first end to the second.
 */
export const doubleSidedPlane = (
  x0: number, z0: number, x1: number, z1: number, y0: number, y1: number,
): ModelQuad[] => {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const length = Math.hypot(dx, dz);
  // Facing the first quad the plane's start is on the left. Its normal is the horizontal turn of the plane's direction.
  const nx = -dz / length;
  const nz = dx / length;
  const make = (ax: number, az: number, bx: number, bz: number, sx: number, sz: number): ModelQuad => ({
    corners: Float32Array.of(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az),
    uvs: Float32Array.of(0, 1, 1, 1, 1, 0, 0, 0),
    nx: sx, ny: 0, nz: sz, face: FACE_SIDE, cullSide: -1, need: 0, fullFace: false,
  });
  return [make(x0, z0, x1, z1, nx, nz), make(x1, z1, x0, z0, -nx, -nz)];
};
