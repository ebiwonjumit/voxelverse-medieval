import { createDefaultRegistry } from '../../content/blocks';
import { Cell, packCell } from '../../engine/cell';
import { CellNeighbourhood } from '../../engine/models/CellNeighbourhood';
import { Box, ModelQuad } from '../../engine/models/BlockModel';
import { BlockType } from '../../worldConstants';

export const registry = createDefaultRegistry();

/** A neighbourhood over a few cells, listed as [x, y, z, id, state?]. Anything else is air. The block is at (0, 0, 0). */
export const around = (cells: Array<[number, number, number, number, number?]> = []) => {
  const map = new Map<string, Cell>();
  for (const [x, y, z, id, state] of cells) map.set(`${x},${y},${z}`, packCell(id, state ?? 0));
  return new CellNeighbourhood(registry, (x, y, z) => map.get(`${x},${y},${z}`) ?? 0).at(0, 0, 0);
};

export const STONE = BlockType.STONE;

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

export const quadBounds = (quads: readonly ModelQuad[]): Bounds => {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const q of quads) {
    for (let i = 0; i < 12; i += 3) {
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], q.corners[i + a]);
        max[a] = Math.max(max[a], q.corners[i + a]);
      }
    }
  }
  const r = (v: number) => Math.round(v * 1e4) / 1e4;
  return { min: min.map(r) as [number, number, number], max: max.map(r) as [number, number, number] };
};

/** A quad's corner as plain numbers, rounded so float32 noise does not matter. */
export const corner = (q: ModelQuad, i: number): number[] =>
  [0, 1, 2].map((a) => Math.round(q.corners[i * 3 + a] * 1e4) / 1e4);

/** The extent of a quad along each axis, as [min, max] pairs rounded to 4 places. */
export const extent = (q: ModelQuad): number[][] =>
  [0, 1, 2].map((a) => {
    const values = [0, 1, 2, 3].map((i) => q.corners[i * 3 + a]);
    return [Math.min(...values), Math.max(...values)].map((v) => Math.round(v * 1e4) / 1e4);
  });

export const normalOf = (q: ModelQuad): string => `${q.nx},${q.ny},${q.nz}`;

export const sameBox = (a: Box, b: Box): boolean => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
export const rounded = (boxes: readonly Box[]): number[][] => boxes.map((b) => b.map((v) => Math.round(v * 1e4) / 1e4));
