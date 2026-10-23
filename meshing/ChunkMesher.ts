import { BlockRegistry } from '../engine/BlockRegistry';
import { MAX_BLOCK_ID, cellId } from '../engine/cell';
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from '../engine/coords';
import { FACE_BOTTOM, FACE_SIDE, FACE_TOP, TINT_FOLIAGE, TextureLayout, createTextureLayout } from '../engine/TextureLayout';
import { BlockType } from '../worldConstants';
import { CellReader } from './CellReader';
import { grassTint, LEAVES_TINT_SCALE } from './biomeTint';

// Turns one chunk of cells into triangle lists. Pure data in, typed arrays out, so it runs in a worker.
//
// Coordinates: x and z are chunk-local, 0..CHUNK_SIZE, and y is the world height. A block at (x, y, z)
// fills the unit cube from (x, y, z) to (x + 1, y + 1, z + 1). The old renderer centred cubes on whole
// numbers, so the render code places the chunk half a block back on every axis to match.
//
// Three buckets because they are drawn differently: opaque blocks, cutout blocks (see-through or smaller
// than a cube: leaves, glass, flowers, fences...) and water.
//
// Textures: every vertex carries the texture array layer of its face and a uv inside the tile (u runs left to
// right and v from the top row of the tile down, as the tile's pixels are stored). Which layer a face uses comes
// from the TextureLayout. Faces with a partly tinted tile (a grass side) also carry the layer of the tint mask,
// drawn over the base layer in the tint colour.

export interface BucketData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array; // linear rgb multiplier per vertex: ambient occlusion (white when it is off)
  tints: Float32Array;  // linear rgb biome tint, white for faces that take none
  uvs: Float32Array;    // two per vertex, 0..1 inside the tile
  layers: Float32Array; // two per vertex: base layer, and the tint overlay layer or -1
  indices: Uint32Array;
}

export interface MeshData {
  cx: number;
  cz: number;
  opaque: BucketData;
  cutout: BucketData;
  water: BucketData;
}

export const BUCKET_NAMES = ['opaque', 'cutout', 'water'] as const;

// Every buffer in the mesh, for postMessage's transfer list.
export const meshTransferables = (mesh: MeshData): ArrayBuffer[] => {
  const buffers: ArrayBuffer[] = [];
  for (const name of BUCKET_NAMES) {
    const b = mesh[name];
    buffers.push(b.positions.buffer as ArrayBuffer, b.normals.buffer as ArrayBuffer,
      b.colors.buffer as ArrayBuffer, b.tints.buffer as ArrayBuffer, b.uvs.buffer as ArrayBuffer,
      b.layers.buffer as ArrayBuffer, b.indices.buffer as ArrayBuffer);
  }
  return buffers;
};

export const meshTriangleCount = (mesh: MeshData): number =>
  (mesh.opaque.indices.length + mesh.cutout.indices.length + mesh.water.indices.length) / 3;

// --- Legacy shapes -----------------------------------------------------------------------------------------
// Copied from the instance scaling in the old World.tsx: a box of size (sx, sy, sz) centred on the block
// centre, moved by dy in y. Their random rotations were dropped. They draw all six faces and never hide a
// neighbour.
export interface LegacyBox {
  sx: number;
  sy: number;
  sz: number;
  dy: number;
}

export const LEGACY_BOXES: Readonly<Record<number, LegacyBox>> = {
  [BlockType.FLOWER_YELLOW]: { sx: 0.3, sy: 0.4, sz: 0.3, dy: -0.3 },
  [BlockType.FLOWER_RED]: { sx: 0.3, sy: 0.4, sz: 0.3, dy: -0.3 },
  [BlockType.SMALL_ROCK]: { sx: 0.4, sy: 0.2, sz: 0.4, dy: -0.4 },
  [BlockType.MAGIC_CRYSTAL]: { sx: 0.6, sy: 0.8, sz: 0.6, dy: 0 },
  [BlockType.WOOD_FENCE]: { sx: 0.25, sy: 1, sz: 0.25, dy: 0 },
  [BlockType.WHEAT]: { sx: 0.8, sy: 0.7, sz: 0.8, dy: -0.15 },
  [BlockType.WHEAT_STAGE_1]: { sx: 0.5, sy: 0.3, sz: 0.5, dy: -0.35 },
  [BlockType.WHEAT_STAGE_2]: { sx: 0.6, sy: 0.5, sz: 0.6, dy: -0.25 },
  [BlockType.FARMLAND]: { sx: 1, sy: 0.9, sz: 1, dy: -0.05 },
  [BlockType.LILY_PAD]: { sx: 0.6, sy: 0.05, sz: 0.6, dy: 0.51 },
  [BlockType.SUGARCANE]: { sx: 0.2, sy: 1, sz: 0.2, dy: 0 },
  [BlockType.TALL_GRASS]: { sx: 0.6, sy: 0.6, sz: 0.6, dy: -0.2 },
  [BlockType.LANTERN]: { sx: 0.3, sy: 0.4, sz: 0.3, dy: -0.2 },
  [BlockType.RED_APPLE]: { sx: 0.2, sy: 0.2, sz: 0.2, dy: 0 },
};

// The old renderer drew a water cube in the same cell as a lily pad. The pad's cell is full of water here too.
const HOLDS_WATER = new Set<number>([BlockType.LILY_PAD]);

// --- Tables ------------------------------------------------------------------------------------------------
// Full-strength vertex AO multipliers by occlusion level (0 = both sides solid, 3 = open).
const AO_FULL = [0.55, 0.7, 0.85, 1.0];

/**
 * How much vertex ambient occlusion is baked into colours: 0 is off (flat colours, the Phase 2 look), 1 is
 * the full 0.55..1.0 range. It is off by default because Phase 2 promises the same look as the old renderer;
 * Phase 6 (baked light) is where it can be switched back on. Tests pass an explicit strength to cover the AO code.
 */
export const AO_STRENGTH = 0;

export interface MeshOptions {
  aoStrength?: number;
  /** Which texture layer each face uses. Without one every block draws as a flat tile of its registry colour. */
  layout?: TextureLayout;
}

// A registry's flat-only layout, for callers that bring no catalog (most of the mesher tests).
const flatLayouts = new WeakMap<BlockRegistry, TextureLayout>();
const flatLayoutFor = (registry: BlockRegistry): TextureLayout => {
  let layout = flatLayouts.get(registry);
  if (!layout || layout.registrySize !== registry.size) {
    layout = createTextureLayout([], registry);
    flatLayouts.set(registry, layout);
  }
  return layout;
};

const aoTable = (strength: number): Float32Array => {
  const t = new Float32Array(4);
  for (let i = 0; i < 4; i++) t[i] = 1 - (1 - AO_FULL[i]) * strength;
  return t;
};

const KIND_AIR = 0;
const KIND_CUBE = 1;
const KIND_WATER = 2;
const KIND_BOX = 3;

// Neighbour value for everything below the bottom of the world: solid, so no faces are drawn down there.
const VOID = 0xfffe;
const TABLE_SIZE = 0x10000;

interface BlockTables {
  size: number;
  kind: Uint8Array;
  opaque: Uint8Array;  // hides the faces of its neighbours
  wet: Uint8Array;     // contains water, so water faces next to it are not drawn
}

const tableCache = new WeakMap<BlockRegistry, BlockTables>();

const getTables = (registry: BlockRegistry): BlockTables => {
  const cached = tableCache.get(registry);
  if (cached && cached.size === registry.size) return cached;

  const kind = new Uint8Array(TABLE_SIZE);
  const opaque = new Uint8Array(TABLE_SIZE);
  const wet = new Uint8Array(TABLE_SIZE);
  for (let id = 1; id <= MAX_BLOCK_ID; id++) {
    if (registry.has(id)) {
      const def = registry.get(id);
      kind[id] = id === BlockType.WATER ? KIND_WATER : LEGACY_BOXES[id] ? KIND_BOX : KIND_CUBE;
      opaque[id] = kind[id] === KIND_CUBE && def.opaque ? 1 : 0;
    } else {
      // Ids the registry has never heard of still show up, as magenta cubes (the layout's unknown tile).
      kind[id] = KIND_CUBE;
    }
    wet[id] = id === BlockType.WATER || HOLDS_WATER.has(id) ? 1 : 0;
  }
  opaque[VOID] = 1;
  const tables = { size: registry.size, kind, opaque, wet };
  tableCache.set(registry, tables);
  return tables;
};

// --- Output buffers ----------------------------------------------------------------------------------------
class Bucket {
  private positions = new Float32Array(3 * 1024);
  private normals = new Float32Array(3 * 1024);
  private colors = new Float32Array(3 * 1024);
  private tints = new Float32Array(3 * 1024);
  private uvs = new Float32Array(2 * 1024);
  private layers = new Float32Array(2 * 1024);
  private indices = new Uint32Array(6 * 512);
  vertexCount = 0;
  private indexCount = 0;

  private reserve(vertices: number, indices: number): void {
    if ((this.vertexCount + vertices) * 3 > this.positions.length) {
      const length = Math.max(this.positions.length * 2, (this.vertexCount + vertices) * 3);
      this.positions = grow(this.positions, length);
      this.normals = grow(this.normals, length);
      this.colors = grow(this.colors, length);
      this.tints = grow(this.tints, length);
      const length2 = (length / 3) * 2;
      this.uvs = grow(this.uvs, length2);
      this.layers = grow(this.layers, length2);
    }
    if (this.indexCount + indices > this.indices.length) {
      const next = new Uint32Array(Math.max(this.indices.length * 2, this.indexCount + indices));
      next.set(this.indices);
      this.indices = next;
    }
  }

  // Four corners in counter-clockwise order seen from outside. Two triangles share either the 0-2 diagonal
  // or, when flip is set, the 1-3 diagonal. The tile is stretched over the whole face.
  quad(
    corners: Float32Array, nx: number, ny: number, nz: number, colors: Float32Array, flip: boolean,
    faceIndex: number, layer: number, overlay: number, tr: number, tg: number, tb: number,
  ): void {
    this.reserve(4, 6);
    const base = this.vertexCount;
    for (let i = 0; i < 4; i++) {
      const o = (base + i) * 3;
      this.positions[o] = corners[i * 3];
      this.positions[o + 1] = corners[i * 3 + 1];
      this.positions[o + 2] = corners[i * 3 + 2];
      this.normals[o] = nx;
      this.normals[o + 1] = ny;
      this.normals[o + 2] = nz;
      this.colors[o] = colors[i * 3];
      this.colors[o + 1] = colors[i * 3 + 1];
      this.colors[o + 2] = colors[i * 3 + 2];
      this.tints[o] = tr;
      this.tints[o + 1] = tg;
      this.tints[o + 2] = tb;
      const o2 = (base + i) * 2;
      this.uvs[o2] = FACE_UV[faceIndex * 8 + i * 2];
      this.uvs[o2 + 1] = FACE_UV[faceIndex * 8 + i * 2 + 1];
      this.layers[o2] = layer;
      this.layers[o2 + 1] = overlay;
    }
    const ix = this.indices;
    let k = this.indexCount;
    if (flip) {
      ix[k++] = base + 1; ix[k++] = base + 2; ix[k++] = base + 3;
      ix[k++] = base + 1; ix[k++] = base + 3; ix[k++] = base;
    } else {
      ix[k++] = base; ix[k++] = base + 1; ix[k++] = base + 2;
      ix[k++] = base; ix[k++] = base + 2; ix[k++] = base + 3;
    }
    this.indexCount = k;
    this.vertexCount = base + 4;
  }

  finish(): BucketData {
    const v = this.vertexCount * 3;
    const v2 = this.vertexCount * 2;
    return {
      positions: this.positions.slice(0, v),
      normals: this.normals.slice(0, v),
      colors: this.colors.slice(0, v),
      tints: this.tints.slice(0, v),
      uvs: this.uvs.slice(0, v2),
      layers: this.layers.slice(0, v2),
      indices: this.indices.slice(0, this.indexCount),
    };
  }
}

const grow = (a: Float32Array, length: number): Float32Array => {
  const next = new Float32Array(length);
  next.set(a);
  return next;
};

// --- Faces -------------------------------------------------------------------------------------------------
// Each face has a normal axis (0 x, 1 y, 2 z) with a sign and two tangent axes u and v. The tangents are
// chosen so u x v points along the normal, which makes the corner order (-,-) (+,-) (+,+) (-,+) counter-clockwise
// from outside.
interface Face {
  axis: number;
  sign: number;
  u: number;
  v: number;
}

const FACES: readonly Face[] = [
  { axis: 0, sign: 1, u: 1, v: 2 },
  { axis: 0, sign: -1, u: 2, v: 1 },
  { axis: 1, sign: 1, u: 2, v: 0 },
  { axis: 1, sign: -1, u: 0, v: 2 },
  { axis: 2, sign: 1, u: 0, v: 1 },
  { axis: 2, sign: -1, u: 1, v: 0 },
];

const CORNER_U = [-1, 1, 1, -1];
const CORNER_V = [-1, -1, 1, 1];

// Which of top / bottom / side (the TextureLayout face kinds) each face above is.
const FACE_KIND = [FACE_SIDE, FACE_SIDE, FACE_TOP, FACE_BOTTOM, FACE_SIDE, FACE_SIDE];

// Tile coordinates of the four corners of each face, two numbers per corner. Walls are drawn upright and
// read left to right as seen from outside, so a tile is never mirrored. The top of a tile (v = 0) points
// north (-z) on the top face and south on the bottom face.
const FACE_UV = (() => {
  const table = new Float32Array(6 * 8);
  FACES.forEach((face, f) => {
    for (let i = 0; i < 4; i++) {
      const hi = [0, 0, 0];
      hi[face.u] = CORNER_U[i] > 0 ? 1 : 0;
      hi[face.v] = CORNER_V[i] > 0 ? 1 : 0;
      let u: number;
      let v: number;
      if (face.axis === 1) {
        u = hi[0];
        v = face.sign > 0 ? hi[2] : 1 - hi[2];
      } else {
        // Facing +x the viewer's right is -z, facing -x it is +z, facing +z it is +x, facing -z it is -x.
        const rightIsHigh = (face.axis === 0) !== (face.sign > 0);
        const along = hi[face.axis === 0 ? 2 : 0];
        u = rightIsHigh ? along : 1 - along;
        v = 1 - hi[1];
      }
      table[f * 8 + i * 2] = u;
      table[f * 8 + i * 2 + 1] = v;
    }
  });
  return table;
})();

// Padded grid: the chunk plus one block on every side, x fastest, then z, then y.
const PAD = CHUNK_SIZE + 2;
const STRIDE = [1, PAD * PAD, PAD]; // per axis: x, y, z

// Scratch space, reused so meshing allocates nothing per face.
const cornerBuf = new Float32Array(12);
const colorBuf = new Float32Array(12);
const aoBuf = new Int8Array(4);
const tintCache = new Float32Array(CHUNK_SIZE * CHUNK_SIZE * 3);
const tintKnown = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
const tmpRgb = new Float32Array(3);
const lo = new Float64Array(3);
const hi = new Float64Array(3);

// Emits one face of an axis-aligned box. lo and hi are the box corners, in chunk-local coordinates.
const emitBoxFace = (
  bucket: Bucket, f: number,
  x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
  colors: Float32Array, flip: boolean, layer: number, overlay: number, tr: number, tg: number, tb: number,
): void => {
  const face = FACES[f];
  lo[0] = x0; lo[1] = y0; lo[2] = z0;
  hi[0] = x1; hi[1] = y1; hi[2] = z1;
  const normalAt = face.sign > 0 ? hi[face.axis] : lo[face.axis];
  for (let i = 0; i < 4; i++) {
    const o = i * 3;
    cornerBuf[o + face.axis] = normalAt;
    cornerBuf[o + face.u] = CORNER_U[i] > 0 ? hi[face.u] : lo[face.u];
    cornerBuf[o + face.v] = CORNER_V[i] > 0 ? hi[face.v] : lo[face.v];
  }
  bucket.quad(cornerBuf, face.axis === 0 ? face.sign : 0, face.axis === 1 ? face.sign : 0,
    face.axis === 2 ? face.sign : 0, colors, flip, f, layer, overlay, tr, tg, tb);
};

// No ambient occlusion: every corner is fully lit.
const LIT = new Float32Array(12).fill(1);

export const meshChunk = (
  reader: CellReader, cx: number, cz: number, registry: BlockRegistry, options: MeshOptions = {},
): MeshData => {
  const aoStrength = options.aoStrength ?? AO_STRENGTH;
  const aoMul = aoStrength > 0 ? aoTable(aoStrength) : null;
  const tables = getTables(registry);
  const layout = options.layout ?? flatLayoutFor(registry);
  const { kind, opaque, wet } = tables;
  const opaqueB = new Bucket();
  const cutoutB = new Bucket();
  const waterB = new Bucket();

  const finish = (): MeshData => ({
    cx, cz, opaque: opaqueB.finish(), cutout: cutoutB.finish(), water: waterB.finish(),
  });

  const range = reader.yRange ? reader.yRange() : { minY: WORLD_MIN_Y, maxY: WORLD_MAX_Y };
  if (!range) return finish();
  const minY = Math.max(range.minY, WORLD_MIN_Y);
  const maxY = Math.min(range.maxY, WORLD_MAX_Y);
  if (minY > maxY) return finish();

  // Copy the chunk and its ring into one padded array of block ids, so the hot loop below is plain
  // array arithmetic. One extra row above and below the scanned range holds the neighbours of its ends.
  const rowMin = minY - 1;
  const rowMax = maxY + 1;
  const rows = rowMax - rowMin + 1;
  const grid = new Uint16Array(PAD * PAD * rows);
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  if (reader.copyChunkIds) {
    // Chunk interior in bulk; the ring and the world-edge rows are filled below.
    reader.copyChunkIds(grid, minY, maxY, PAD * PAD + PAD + 1, PAD * PAD, PAD);
  }
  for (let row = 0; row < rows; row++) {
    const y = rowMin + row;
    const base = row * PAD * PAD;
    if (y < WORLD_MIN_Y) {
      grid.fill(VOID, base, base + PAD * PAD);
    } else if (y <= WORLD_MAX_Y) {
      for (let pz = 0; pz < PAD; pz++) {
        const edgeRow = pz === 0 || pz === PAD - 1;
        for (let px = 0; px < PAD; px++) {
          if (!edgeRow && px > 0 && px < PAD - 1 && reader.copyChunkIds) continue;
          grid[base + pz * PAD + px] = cellId(reader.getCell(x0 + px - 1, y, z0 + pz - 1));
        }
      }
    }
  }

  tintKnown.fill(0);

  for (let y = minY; y <= maxY; y++) {
    const rowBase = (y - rowMin) * PAD * PAD;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const i = rowBase + (lz + 1) * PAD + lx + 1;
        const id = grid[i];
        if (id === 0) continue;
        const k = kind[id];

        if (k === KIND_BOX) {
          const box = LEGACY_BOXES[id];
          if (wet[id]) emitWaterCube(waterB, grid, i, lx, y, lz, tables, layout);
          emitLegacyBox(cutoutB, box, lx, y, lz, layout, id);
        } else if (k === KIND_WATER) {
          emitWaterCube(waterB, grid, i, lx, y, lz, tables, layout);
        } else {
          emitCube(opaque[id] ? opaqueB : cutoutB, grid, i, id, lx, y, lz, x0, z0, tables, layout, aoMul);
        }
      }
    }
  }

  return finish();
};

const emitWaterCube = (
  bucket: Bucket, grid: Uint16Array, i: number, lx: number, y: number, lz: number, tables: BlockTables,
  layout: TextureLayout,
): void => {
  const { opaque, wet } = tables;
  const layers = layout.faceLayers;
  for (let f = 0; f < 6; f++) {
    const face = FACES[f];
    const nb = grid[i + face.sign * STRIDE[face.axis]];
    if (opaque[nb] || wet[nb]) continue;
    const layer = layers[BlockType.WATER * 3 + FACE_KIND[f]];
    emitBoxFace(bucket, f, lx, y, lz, lx + 1, y + 1, lz + 1, LIT, false, layer, layout.overlayOf[layer], 1, 1, 1);
  }
};

const emitLegacyBox = (
  bucket: Bucket, box: LegacyBox, lx: number, y: number, lz: number, layout: TextureLayout, id: number,
): void => {
  const cxm = lx + 0.5;
  const cym = y + 0.5 + box.dy;
  const czm = lz + 0.5;
  for (let f = 0; f < 6; f++) {
    const layer = layout.faceLayers[id * 3 + FACE_KIND[f]];
    emitBoxFace(bucket, f,
      cxm - box.sx / 2, cym - box.sy / 2, czm - box.sz / 2,
      cxm + box.sx / 2, cym + box.sy / 2, czm + box.sz / 2, LIT, false, layer, layout.overlayOf[layer], 1, 1, 1);
  }
};

const emitCube = (
  bucket: Bucket, grid: Uint16Array, i: number, id: number, lx: number, y: number, lz: number,
  x0: number, z0: number, tables: BlockTables, layout: TextureLayout, aoMul: Float32Array | null,
): void => {
  const { opaque } = tables;
  const selfOpaque = opaque[id] === 1;

  // Most blocks are buried stone, so test for that before doing any work.
  if (selfOpaque && opaque[grid[i + 1]] && opaque[grid[i - 1]] && opaque[grid[i + PAD]] && opaque[grid[i - PAD]]
    && opaque[grid[i + PAD * PAD]] && opaque[grid[i - PAD * PAD]]) return;

  for (let f = 0; f < 6; f++) {
    const face = FACES[f];
    const front = i + face.sign * STRIDE[face.axis];
    const nb = grid[front];
    if (opaque[nb]) continue;
    // See-through cubes of the same kind (leaves, glass) hide their shared faces.
    if (!selfOpaque && nb === id) continue;

    const slot = id * 3 + FACE_KIND[f];
    const layer = layout.faceLayers[slot];
    const overlay = layout.overlayOf[layer];

    // Biome tint, only on faces whose block asks for it and whose tile can take it.
    let tr = 1;
    let tg = 1;
    let tb = 1;
    const tintKind = layout.faceTint[slot];
    if (tintKind) {
      const col = lz * CHUNK_SIZE + lx;
      if (!tintKnown[col]) {
        grassTint(x0 + lx, z0 + lz, tmpRgb);
        tintCache[col * 3] = tmpRgb[0];
        tintCache[col * 3 + 1] = tmpRgb[1];
        tintCache[col * 3 + 2] = tmpRgb[2];
        tintKnown[col] = 1;
      }
      const scale = tintKind === TINT_FOLIAGE ? LEAVES_TINT_SCALE : 1;
      tr = tintCache[col * 3] * scale;
      tg = tintCache[col * 3 + 1] * scale;
      tb = tintCache[col * 3 + 2] * scale;
    }

    if (!aoMul) {
      emitBoxFace(bucket, f, lx, y, lz, lx + 1, y + 1, lz + 1, LIT, false, layer, overlay, tr, tg, tb);
      continue;
    }

    // Ambient occlusion per corner: the two blocks beside the corner and the one diagonal to it, all in
    // the layer in front of the face. Two sides touching hides the corner entirely.
    const su = STRIDE[face.u];
    const sv = STRIDE[face.v];
    for (let c = 0; c < 4; c++) {
      const du = CORNER_U[c] * su;
      const dv = CORNER_V[c] * sv;
      const s1 = opaque[grid[front + du]];
      const s2 = opaque[grid[front + dv]];
      const corner = opaque[grid[front + du + dv]];
      const level = s1 && s2 ? 0 : 3 - (s1 + s2 + corner);
      aoBuf[c] = level;
      const m = aoMul[level];
      colorBuf[c * 3] = m;
      colorBuf[c * 3 + 1] = m;
      colorBuf[c * 3 + 2] = m;
    }
    // Split along the diagonal joining the two brighter corners, otherwise the shading shows a crease.
    const flip = aoBuf[0] + aoBuf[2] < aoBuf[1] + aoBuf[3];
    emitBoxFace(bucket, f, lx, y, lz, lx + 1, y + 1, lz + 1, colorBuf, flip, layer, overlay, tr, tg, tb);
  }
};
