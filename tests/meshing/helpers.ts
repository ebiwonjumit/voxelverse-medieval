import { createDefaultRegistry } from '../../content/blocks';
import { Cell, packCell } from '../../engine/cell';
import { BucketData, MeshData } from '../../meshing/ChunkMesher';
import { CellReader } from '../../meshing/CellReader';

export const registry = createDefaultRegistry();

// A plain block well above every range the game uses (legacy 0-47, nature 48-79, shaped 80-127, Tempest 128-255), so
// other branches adding blocks never collide with it. White is linear 1, which makes colours easy to predict.
export const WHITE = 4000;
registry.register({ id: WHITE, name: 'test:white', color: '#ffffff', solid: true, opaque: true, emits: 0 });

// A reader over a handful of cells in world coordinates. Anything not listed is air.
export class MapReader implements CellReader {
  private readonly cells = new Map<string, Cell>();

  // Blocks are [x, y, z, id] or [x, y, z, id, state].
  constructor(blocks: Array<[number, number, number, number, number?]> = []) {
    for (const [x, y, z, id, state] of blocks) this.set(x, y, z, id, state);
  }

  set(x: number, y: number, z: number, id: number, state = 0): this {
    this.cells.set(`${x},${y},${z}`, packCell(id, state));
    return this;
  }

  getCell(x: number, y: number, z: number): Cell {
    return this.cells.get(`${x},${y},${z}`) ?? 0;
  }
}

export const faceCount = (bucket: BucketData): number => bucket.indices.length / 6;
export const totalFaces = (mesh: MeshData): number =>
  faceCount(mesh.opaque) + faceCount(mesh.cutout) + faceCount(mesh.water);

export interface Quad {
  index: number;  // which quad in the bucket
  normal: [number, number, number];
  corners: Array<{
    pos: [number, number, number];
    sky: number;    // baked sky light, 0..1
    block: number;  // baked block light, 0..1
    ao: number;     // ambient occlusion multiplier, 0.55..1
    glow: number;   // the block's own emission, 0..1
    tint: [number, number, number]; // biome tint, white when the face takes none
    uv: [number, number];
  }>;
  layer: number;   // base texture layer
  overlay: number; // tint overlay layer, or -1
  indices: number[]; // the six indices, relative to the quad's first vertex
}

// Quads are written as four vertices followed by six indices, one after another.
export const quadsOf = (bucket: BucketData): Quad[] => {
  const out: Quad[] = [];
  for (let q = 0; q < bucket.positions.length / 12; q++) {
    const v0 = q * 4;
    const corners = [];
    for (let i = 0; i < 4; i++) {
      const o = (v0 + i) * 3;
      corners.push({
        pos: [bucket.positions[o], bucket.positions[o + 1], bucket.positions[o + 2]] as [number, number, number],
        sky: bucket.light[(v0 + i) * 4],
        block: bucket.light[(v0 + i) * 4 + 1],
        ao: bucket.light[(v0 + i) * 4 + 2],
        glow: bucket.light[(v0 + i) * 4 + 3],
        tint: [bucket.tints[o], bucket.tints[o + 1], bucket.tints[o + 2]] as [number, number, number],
        uv: [bucket.uvs[(v0 + i) * 2], bucket.uvs[(v0 + i) * 2 + 1]] as [number, number],
      });
    }
    const o = v0 * 3;
    out.push({
      index: q,
      normal: [bucket.normals[o], bucket.normals[o + 1], bucket.normals[o + 2]],
      corners,
      layer: bucket.layers[v0 * 2],
      overlay: bucket.layers[v0 * 2 + 1],
      indices: Array.from(bucket.indices.slice(q * 6, q * 6 + 6)).map((i) => i - v0),
    });
  }
  return out;
};

export const bounds = (bucket: BucketData) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < bucket.positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], bucket.positions[i + a]);
      max[a] = Math.max(max[a], bucket.positions[i + a]);
    }
  }
  return { min, max };
};
