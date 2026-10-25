import { BlockRegistry } from '../engine/BlockRegistry';
import { FX_KIND_COUNT } from '../engine/blockFx';
import { Cell, MAX_BLOCK_ID } from '../engine/cell';
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from '../engine/coords';
import { BlockModel, ModelQuad, Neighbourhood } from '../engine/models/BlockModel';
import { SIDES } from '../engine/models/Side';
import { FACE_BOTTOM, FACE_SIDE, FACE_TOP, TINT_FOLIAGE, TextureLayout, createTextureLayout } from '../engine/TextureLayout';
import { BlockType } from '../worldConstants';
import { CellReader } from './CellReader';
import { defaultWildTint, grassTint, LEAVES_TINT_SCALE, WildTint } from './biomeTint';
import { LightData } from './LightEngine';

// Turns one chunk of cells into triangle lists. Pure data in, typed arrays out, so it runs in a worker.
//
// Coordinates: x and z are chunk-local, 0..CHUNK_SIZE, and y is the world height. A block at (x, y, z)
// fills the unit cube from (x, y, z) to (x + 1, y + 1, z + 1). The old renderer centred cubes on whole
// numbers, so the render code places the chunk half a block back on every axis to match.
//
// Three buckets because they are drawn differently: opaque blocks, cutout blocks (see-through or smaller
// than a cube: leaves, glass, flowers, fences...) and water.
//
// Cells keep their state. Plain cubes are meshed here, fast; every other block is meshed from the quads of its
// model (engine/models), which are built once per model and variant and shared, so a stair costs a table lookup.
// A face is hidden when the block beside it covers the side it looks at.
//
// Light: the mesher is handed the baked light of the chunk (LightEngine) and writes it into every vertex, so day and
// night never need a re-mesh: the shader multiplies sky light by a daylight uniform and leaves block light alone.
// Each corner of a face averages the light of the four cells around it in the layer in front of the face (the cell
// itself, the two beside the corner and the diagonal one, skipping cells that block light and the diagonal one when
// both sides block it, which would leak light round a corner), and gets an ambient occlusion factor from the same
// cells. A quad that is only part of a cell face takes the light of the cell in front of it, flat.
//
// Wind: a block with BlockDef.sway > 0 writes a per-vertex weight into the `sway` buffer (0 where the block is rooted, up
// to its strength where it moves most) and the chunk material displaces by it (docs/effects.md). The weights are worked
// out here, once, from the block's shape; nothing about the wind itself (time, direction) is known to the mesher. With
// `options.sway = false`, or in a registry where nothing sways, the buffer is empty and no per-quad work is done; a bucket
// with no swaying quad in it has an empty buffer too.
//
// Flicker: a block with BlockDef.flicker > 0 (a lantern, a hearth) writes its strength into every vertex of its quads in the
// `flicker` buffer, and the chunk material modulates the block's own brightness by a time-based pattern (docs/effects.md).
// The baked light is the same either way, so there is nothing to re-mesh; like `sway` the buffer is empty when no quad in
// the bucket flickers.
//
// Effect sites: while it walks the cells the mesher also notes where the living-world effects can start from, for the blocks
// whose BlockDef.fx says so (see `EffectSites` below): the underside of sakura leaves, plants fireflies hide in, chimney
// pots, lamps and hearths. The renderer's emitters pick their spawn points from these notes, so nothing on the main thread
// has to scan the world for them. `options.effects = false` skips both the sites and the flicker weights.
//
// Textures: every vertex carries the texture array layer of its face and a uv inside the tile (u runs left to
// right and v from the top row of the tile down, as the tile's pixels are stored). Which layer a face uses comes
// from the TextureLayout. Faces with a partly tinted tile (a grass side) also carry the layer of the tint mask,
// drawn over the base layer in the tint colour.

export interface BucketData {
  positions: Float32Array;
  normals: Float32Array;
  light: Float32Array;  // four per vertex: sky light, block light, ambient occlusion (all 0..1) and glow (0..1)
  tints: Float32Array;  // linear rgb biome tint, white for faces that take none
  uvs: Float32Array;    // two per vertex, 0..1 inside the tile
  layers: Float32Array; // two per vertex: base layer, and the tint overlay layer or -1
  // One per vertex: how far the wind moves it, 0..1 (see BlockDef.sway). Empty when sway is off and when nothing in the
  // bucket sways, so a bucket of stone carries no column of zeros.
  sway: Float32Array;
  // One per vertex: how much the block's glow flickers, 0..1 (see BlockDef.flicker). Empty when nothing in the bucket flickers.
  flicker: Float32Array;
  indices: Uint32Array;
}

// Where a mesh job spent its time, in ms, measured in the worker. Only jobs that run through runMeshJob have it.
export interface MeshTiming {
  generate: number;  // generating the chunks the job needed that the worker had not cached
  light: number;     // computing the baked light
  mesh: number;      // meshing
  generated: number; // how many chunks it generated (0 to 9)
}

/** Ints per site: world x, world y, world z, and `block id | drop << 12`. */
export const SITE_STRIDE = 4;

/** How many sites of each kind (see engine/blockFx.ts) one chunk keeps at most, and how sparsely: 1 in `keep` is noted. */
export const SITE_LIMITS: ReadonlyArray<{ cap: number; keep: number }> = [
  { cap: 96, keep: 3 },  // petals: leaves with air under them
  { cap: 128, keep: 4 }, // habitat: plants with air above them
  { cap: 24, keep: 1 },  // smoke: every vent
  { cap: 64, keep: 1 },  // lamps: every lamp
  { cap: 24, keep: 1 },  // embers: every hearth
];

/** The deepest fall a petal site records (the cells of air below the leaf, up to the ground), in blocks. */
export const SITE_DROP_MAX = 63;

export interface MeshData {
  cx: number;
  cz: number;
  opaque: BucketData;
  cutout: BucketData;
  water: BucketData;
  /**
   * Where the living-world effects can start in this chunk: one array per kind of BlockFx (indexed like FX_KINDS), SITE_STRIDE
   * ints a site. Empty arrays when `options.effects` is false or the chunk has none. See docs/effects.md.
   */
  sites: Int32Array[];
  timing?: MeshTiming;
}

export const BUCKET_NAMES = ['opaque', 'cutout', 'water'] as const;

// Every buffer in the mesh, for postMessage's transfer list.
export const meshTransferables = (mesh: MeshData): ArrayBuffer[] => {
  const buffers: ArrayBuffer[] = [];
  for (const name of BUCKET_NAMES) {
    const b = mesh[name];
    buffers.push(b.positions.buffer as ArrayBuffer, b.normals.buffer as ArrayBuffer,
      b.light.buffer as ArrayBuffer, b.tints.buffer as ArrayBuffer, b.uvs.buffer as ArrayBuffer,
      b.layers.buffer as ArrayBuffer, b.sway.buffer as ArrayBuffer, b.flicker.buffer as ArrayBuffer, b.indices.buffer as ArrayBuffer);
  }
  for (const sites of mesh.sites) buffers.push(sites.buffer as ArrayBuffer);
  return buffers;
};

export const meshTriangleCount = (mesh: MeshData): number =>
  (mesh.opaque.indices.length + mesh.cutout.indices.length + mesh.water.indices.length) / 3;

// --- Tables ------------------------------------------------------------------------------------------------
// Full-strength vertex AO multipliers by occlusion level (0 = both sides solid, 3 = open).
const AO_FULL = [0.55, 0.7, 0.85, 1.0];

/**
 * How much vertex ambient occlusion is baked: 0 is off, 1 is the full 0.55..1.0 range. It was off in Phase 2, which
 * promised the look of the old renderer, and is on now that light is baked: the shader multiplies it into the
 * lighting, so corners and creases read as corners and creases. Tests pass an explicit strength to cover other values.
 */
export const AO_STRENGTH = 1;

export interface MeshOptions {
  aoStrength?: number;
  /**
   * The baked light of this chunk and a one block ring, from `computeChunkLight`. Without it every vertex is lit as
   * open sky (sky 1, block 0), which is what tests and the sandbox pages want.
   */
  light?: LightData;
  /** Which texture layer each face uses. Without one every block draws as a flat tile of its registry colour. */
  layout?: TextureLayout;
  /**
   * The natural colour of grass and leaves in the wilderness, from the generator (see biomeTint.ts). Without one the
   * wilderness is a plain meadow green. It is read once per column of the chunk, not per face.
   */
  wildTint?: WildTint;
  /**
   * Write the per-vertex wind weights (default true). False leaves the `sway` buffers empty and skips every sway
   * computation, so a caller that never animates foliage pays nothing for it.
   */
  sway?: boolean;
  /**
   * Write the per-vertex flicker weights and note the effect sites (default true). False leaves the `flicker` buffers and
   * the site arrays empty and skips the work, so a caller that never shows the effects (most tests) pays nothing for them.
   */
  effects?: boolean;
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
const KIND_MODEL = 3;

const ID_MASK = MAX_BLOCK_ID;
const STATE_SHIFT = 12;
const STATES = 16;

// Neighbour value for everything below the bottom of the world: solid, so no faces are drawn down there.
const VOID = 0xfffe;
const TABLE_SIZE = 0x10000;

// All tables are indexed by the cell (block id in the low 12 bits, state above), so a stair facing north and one
// facing east can cover different sides.
interface BlockTables {
  size: number;
  kind: Uint8Array;
  occ: Uint8Array;     // bit s: the block fully covers its face on side s, so a face looking at it is hidden
  full: Uint8Array;    // covers all six sides: a plain opaque cube
  opaque: Uint8Array;  // an opaque material: drawn in the opaque bucket
  blocksLight: Uint8Array; // stops light, as the light engine sees it (opaque blocks, and the void below the world)
  glow: Float32Array;  // by block id: what it emits, 0..1, so the shader can make it shine
  sway: Float32Array;  // by block id: BlockDef.sway, 0..1
  anySway: boolean;    // some block in the registry sways
  fx: Uint8Array;      // by block id: BlockDef.fx, the BlockFx bits
  anyFx: boolean;      // some block has effect flags
  flicker: Float32Array; // by block id: BlockDef.flicker, 0..1
  anyFlicker: boolean; // some block flickers
  wet: Uint8Array;     // contains water, so water faces next to it are not drawn
  models: BlockModel[]; // by block id
}

const tableCache = new WeakMap<BlockRegistry, BlockTables>();

const getTables = (registry: BlockRegistry): BlockTables => {
  const cached = tableCache.get(registry);
  if (cached && cached.size === registry.size) return cached;

  const kind = new Uint8Array(TABLE_SIZE);
  const occ = new Uint8Array(TABLE_SIZE);
  const full = new Uint8Array(TABLE_SIZE);
  const opaque = new Uint8Array(TABLE_SIZE);
  const blocksLight = new Uint8Array(TABLE_SIZE);
  const glow = new Float32Array(MAX_BLOCK_ID + 1);
  const sway = new Float32Array(MAX_BLOCK_ID + 1);
  let anySway = false;
  const fx = new Uint8Array(MAX_BLOCK_ID + 1);
  const flicker = new Float32Array(MAX_BLOCK_ID + 1);
  let anyFx = false;
  let anyFlicker = false;
  const wet = new Uint8Array(TABLE_SIZE);
  const models: BlockModel[] = new Array(MAX_BLOCK_ID + 1);
  for (let id = 1; id <= MAX_BLOCK_ID; id++) {
    models[id] = registry.model(id);
    if (!registry.has(id)) {
      // Ids the registry has never heard of still show up, as magenta cubes (the layout's unknown tile).
      for (let state = 0; state < STATES; state++) kind[(state << STATE_SHIFT) | id] = KIND_CUBE;
      continue;
    }
    const def = registry.get(id);
    const model = models[id];
    glow[id] = registry.emission(id) / 15;
    sway[id] = registry.sway(id);
    if (sway[id] > 0) anySway = true;
    fx[id] = registry.fx(id);
    flicker[id] = registry.flicker(id);
    if (fx[id] > 0) anyFx = true;
    if (flicker[id] > 0) anyFlicker = true;
    for (let state = 0; state < STATES; state++) {
      const cell = (state << STATE_SHIFT) | id;
      if (id === BlockType.WATER) {
        kind[cell] = KIND_WATER;
        wet[cell] = 1;
        continue;
      }
      kind[cell] = model.isFullCube ? KIND_CUBE : KIND_MODEL;
      opaque[cell] = def.opaque ? 1 : 0;
      blocksLight[cell] = def.opaque ? 1 : 0;
      wet[cell] = def.holdsWater ? 1 : 0;
      if (def.opaque) {
        let mask = 0;
        for (let side = 0; side < 6; side++) if (model.occludesFace(state, side)) mask |= 1 << side;
        occ[cell] = mask;
        full[cell] = mask === 63 ? 1 : 0;
      }
    }
  }
  occ[VOID] = 63;
  full[VOID] = 1;
  blocksLight[VOID] = 1;
  const tables = { size: registry.size, kind, occ, full, opaque, blocksLight, glow, sway, anySway, fx, anyFx, flicker, anyFlicker, wet, models };
  tableCache.set(registry, tables);
  return tables;
};

// --- Output buffers ----------------------------------------------------------------------------------------
// The wind weights of the four corners of the quad about to be written, or null for a quad that does not sway. Bucket.quad
// reads it; a module variable because quad() already takes more arguments than is pleasant.
let quadSway: Float32Array | null = null;
// Per-corner tints of the quad about to be written (three numbers a corner), or null to give all four the scalar tint.
// Only water uses it: its tint channel carries depth and shore (see waterVertexData).
let quadTint: Float32Array | null = null;
// The flicker strength of the quad about to be written (0 for a quad that does not flicker): one number, the same at all four
// corners, because a flame is a property of the whole block.
let quadFlicker = 0;

class Bucket {
  private positions = new Float32Array(3 * 1024);
  private normals = new Float32Array(3 * 1024);
  private light = new Float32Array(4 * 1024);
  private tints = new Float32Array(3 * 1024);
  private uvs = new Float32Array(2 * 1024);
  private layers = new Float32Array(2 * 1024);
  private sway: Float32Array;
  private swayWritten = false;
  // Allocated by the first flickering quad, so a bucket without one (nearly every bucket) never carries it.
  private flicker: Float32Array | null = null;
  private indices = new Uint32Array(6 * 512);
  vertexCount = 0;
  private indexCount = 0;

  // With swayOn false the sway buffer stays empty and quad() never looks at quadSway. With it on, the buffer starts as
  // zeros, so a quad that does not sway needs no write at all, and a bucket none of whose quads sway ends up with no
  // buffer (the stone of a chunk does not upload a column of zeros).
  constructor(private readonly swayOn: boolean) {
    this.sway = new Float32Array(swayOn ? 1024 : 0);
  }

  private reserve(vertices: number, indices: number): void {
    if ((this.vertexCount + vertices) * 3 > this.positions.length) {
      const length = Math.max(this.positions.length * 2, (this.vertexCount + vertices) * 3);
      this.positions = grow(this.positions, length);
      this.normals = grow(this.normals, length);
      this.tints = grow(this.tints, length);
      const length2 = (length / 3) * 2;
      this.uvs = grow(this.uvs, length2);
      this.layers = grow(this.layers, length2);
      this.light = grow(this.light, (length / 3) * 4);
      if (this.swayOn) this.sway = grow(this.sway, length / 3);
      if (this.flicker) this.flicker = grow(this.flicker, length / 3);
    }
    if (this.indexCount + indices > this.indices.length) {
      const next = new Uint32Array(Math.max(this.indices.length * 2, this.indexCount + indices));
      next.set(this.indices);
      this.indices = next;
    }
  }

  // Four corners in counter-clockwise order seen from outside, moved by (ox, oy, oz). Two triangles share either
  // the 0-2 diagonal or, when flip is set, the 1-3 diagonal. uvs holds the four uv pairs from uvAt on.
  quad(
    corners: Float32Array, ox: number, oy: number, oz: number, uvs: Float32Array, uvAt: number,
    nx: number, ny: number, nz: number, lights: Float32Array, flip: boolean,
    layer: number, overlay: number, tr: number, tg: number, tb: number,
  ): void {
    this.reserve(4, 6);
    const base = this.vertexCount;
    for (let i = 0; i < 4; i++) {
      const o = (base + i) * 3;
      this.positions[o] = corners[i * 3] + ox;
      this.positions[o + 1] = corners[i * 3 + 1] + oy;
      this.positions[o + 2] = corners[i * 3 + 2] + oz;
      this.normals[o] = nx;
      this.normals[o + 1] = ny;
      this.normals[o + 2] = nz;
      if (quadTint) {
        this.tints[o] = quadTint[i * 3];
        this.tints[o + 1] = quadTint[i * 3 + 1];
        this.tints[o + 2] = quadTint[i * 3 + 2];
      } else {
        this.tints[o] = tr;
        this.tints[o + 1] = tg;
        this.tints[o + 2] = tb;
      }
      const o2 = (base + i) * 2;
      this.uvs[o2] = uvs[uvAt + i * 2];
      this.uvs[o2 + 1] = uvs[uvAt + i * 2 + 1];
      this.layers[o2] = layer;
      this.layers[o2 + 1] = overlay;
      const o4 = (base + i) * 4;
      this.light[o4] = lights[i * 4];
      this.light[o4 + 1] = lights[i * 4 + 1];
      this.light[o4 + 2] = lights[i * 4 + 2];
      this.light[o4 + 3] = lights[i * 4 + 3];
    }
    if (this.swayOn && quadSway) {
      for (let i = 0; i < 4; i++) this.sway[base + i] = quadSway[i];
      this.swayWritten = true;
    }
    if (quadFlicker > 0) {
      if (!this.flicker) this.flicker = new Float32Array(this.positions.length / 3);
      for (let i = 0; i < 4; i++) this.flicker[base + i] = quadFlicker;
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
      light: this.light.slice(0, this.vertexCount * 4),
      tints: this.tints.slice(0, v),
      uvs: this.uvs.slice(0, v2),
      layers: this.layers.slice(0, v2),
      sway: this.swayWritten ? this.sway.slice(0, this.vertexCount) : new Float32Array(0),
      flicker: this.flicker ? this.flicker.slice(0, this.vertexCount) : new Float32Array(0),
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
// Each face has a normal axis (0 x, 1 y, 2 z) with a sign and two tangent axes u and v, as the block models see
// them (engine/models/Side.ts). The tangents are chosen so u x v points along the normal, which makes the corner
// order (-,-) (+,-) (+,+) (-,+) counter-clockwise from outside.
const FACES = SIDES;

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

// Grid offset of the neighbour on each side, and the bit a block sets in `occ` for the face looking back at it.
const SIDE_OFFSET = FACES.map((face) => face.sign * STRIDE[face.axis]);
const FACING_BIT = FACES.map((_, side) => 1 << (side ^ 1));

// Scratch space, reused so meshing allocates nothing per face.
const cornerBuf = new Float32Array(12);
const lightBuf = new Float32Array(16);
const brightBuf = new Float32Array(4);
const tintCache = new Float32Array(CHUNK_SIZE * CHUNK_SIZE * 3);
const tintKnown = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
const tmpRgb = new Float32Array(3);
let activeWildTint: WildTint = defaultWildTint;
const tintOut = new Float32Array(3);
const lo = new Float64Array(3);
const hi = new Float64Array(3);
const swayBuf = new Float32Array(4);
const waterTintBuf = new Float32Array(12);
// Set per meshChunk call from the options and the registry: whether the sway weights are being written.
let swayActive = false;
// Whether the flicker weights are being written for this call.
let flickerActive = false;

// A stalk (bamboo, reeds) is a stack of the same block. Its weight grows with the height up the stack, over at most this
// many blocks, so a one block plant reaches its full strength at its tip and a tall stalk reaches it four blocks up.
const STALK_BLOCKS = 4;
// How far up and down the stack is looked at; beyond this the weight has long since saturated.
const STALK_SCAN = 8;
// Water this many cells deep or more is as dark as it gets.
export const WATER_DEPTH_MAX = 8;

// Where the effects start from, collected while the cells are walked. One scratch array per kind, sized to its cap, copied
// out at the end (like the buckets, nothing is allocated per cell).
const siteScratch: Int32Array[] = SITE_LIMITS.map((l) => new Int32Array(l.cap * SITE_STRIDE));
const siteCount = new Int32Array(FX_KIND_COUNT);

// Hash of a world cell, so which of the plants and leaves get a site does not depend on the chunk or the order they are met in.
const siteHash = (x: number, y: number, z: number): number =>
  (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 8;

// Notes cell `i` (world x, y, z) for each kind its block's flags name, if the kind's own rule lets it through.
const noteSites = (
  grid: Uint16Array, i: number, row: number, id: number, fx: number, wx: number, y: number, wz: number, kind: Uint8Array,
): void => {
  for (let k = 0; k < FX_KIND_COUNT; k++) {
    if (!(fx & (1 << k))) continue;
    const limit = SITE_LIMITS[k];
    const n = siteCount[k];
    if (n >= limit.cap) continue;
    if (limit.keep > 1 && siteHash(wx, y, wz) % limit.keep !== 0) continue;
    let aux = id;
    if (k === 0) {
      // Petals fall from the underside of a leaf that has air below it, down to whatever is under the air.
      if (kind[grid[i - PAD * PAD]] !== KIND_AIR) continue;
      let drop = 1;
      while (drop < SITE_DROP_MAX && drop < row && kind[grid[i - (drop + 1) * PAD * PAD]] === KIND_AIR) drop++;
      aux |= drop << 12;
    } else if (k === 1 && kind[grid[i + PAD * PAD]] !== KIND_AIR) {
      continue; // a firefly needs open air above the plant
    }
    const o = n * SITE_STRIDE;
    const out = siteScratch[k];
    out[o] = wx;
    out[o + 1] = y;
    out[o + 2] = wz;
    out[o + 3] = aux;
    siteCount[k] = n + 1;
  }
};

// Emits one face of an axis-aligned box. lo and hi are the box corners, in chunk-local coordinates.
const emitBoxFace = (
  bucket: Bucket, f: number,
  x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
  lights: Float32Array, flip: boolean, layer: number, overlay: number, tr: number, tg: number, tb: number,
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
  bucket.quad(cornerBuf, 0, 0, 0, FACE_UV, f * 8, face.axis === 0 ? face.sign : 0, face.axis === 1 ? face.sign : 0,
    face.axis === 2 ? face.sign : 0, lights, flip, layer, overlay, tr, tg, tb);
};

// The blocks around the cell being meshed, as models ask for them. One instance is moved along the grid.
class GridNeighbourhood implements Neighbourhood {
  i = 0;
  constructor(readonly registry: BlockRegistry, private readonly grid: Uint16Array) {}

  cell(dx: number, dy: number, dz: number): Cell {
    return this.grid[this.i + dx + dz * PAD + dy * PAD * PAD];
  }
}

export const meshChunk = (
  reader: CellReader, cx: number, cz: number, registry: BlockRegistry, options: MeshOptions = {},
): MeshData => {
  const aoStrength = options.aoStrength ?? AO_STRENGTH;
  const aoMul = aoStrength > 0 ? aoTable(aoStrength) : null;
  const lightData = options.light ?? null;
  const tables = getTables(registry);
  const layout = options.layout ?? flatLayoutFor(registry);
  const { kind, opaque, wet } = tables;
  // Water does not sway; its waves are made in the shader from where each vertex is.
  const swayOn = options.sway !== false && tables.anySway;
  swayActive = swayOn;
  // Flicker weights and effect sites: on unless the caller says no, and only when some block in the registry has them.
  const flickerOn = options.effects !== false && tables.anyFlicker;
  const sitesOn = options.effects !== false && tables.anyFx;
  flickerActive = flickerOn;
  quadSway = null;
  quadTint = null;
  quadFlicker = 0;
  siteCount.fill(0);
  const opaqueB = new Bucket(swayOn);
  const cutoutB = new Bucket(swayOn);
  const waterB = new Bucket(false);

  const finish = (): MeshData => ({
    cx, cz, opaque: opaqueB.finish(), cutout: cutoutB.finish(), water: waterB.finish(),
    sites: siteScratch.map((scratch, k) => scratch.slice(0, siteCount[k] * SITE_STRIDE)),
  });

  const range = reader.yRange ? reader.yRange() : { minY: WORLD_MIN_Y, maxY: WORLD_MAX_Y };
  if (!range) return finish();
  const minY = Math.max(range.minY, WORLD_MIN_Y);
  const maxY = Math.min(range.maxY, WORLD_MAX_Y);
  if (minY > maxY) return finish();

  // Copy the chunk and its ring into one padded array of cells, so the hot loop below is plain
  // array arithmetic. One extra row above and below the scanned range holds the neighbours of its ends.
  const rowMin = minY - 1;
  const rowMax = maxY + 1;
  const rows = rowMax - rowMin + 1;
  const grid = new Uint16Array(PAD * PAD * rows);
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  if (reader.copyChunkCells) {
    // Chunk interior in bulk; the ring and the world-edge rows are filled below.
    reader.copyChunkCells(grid, minY, maxY, PAD * PAD + PAD + 1, PAD * PAD, PAD);
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
          if (!edgeRow && px > 0 && px < PAD - 1 && reader.copyChunkCells) continue;
          grid[base + pz * PAD + px] = reader.getCell(x0 + px - 1, y, z0 + pz - 1);
        }
      }
    }
  }

  // The baked light in the same layout as the cells, so a cell and its light share an index.
  let lights: Uint8Array | null = null;
  if (lightData) {
    lights = new Uint8Array(PAD * PAD * rows);
    lightData.copyLayers(lights, rowMin, rowMax);
  }

  tintKnown.fill(0);
  activeWildTint = options.wildTint ?? defaultWildTint;
  const nbhd = new GridNeighbourhood(registry, grid);

  for (let y = minY; y <= maxY; y++) {
    const rowBase = (y - rowMin) * PAD * PAD;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const i = rowBase + (lz + 1) * PAD + lx + 1;
        const cell = grid[i];
        const k = kind[cell];
        if (k === KIND_AIR) continue;

        if (sitesOn) {
          const fx = tables.fx[cell & ID_MASK];
          if (fx !== 0) noteSites(grid, i, y - rowMin, cell & ID_MASK, fx, x0 + lx, y, z0 + lz, kind);
        }

        if (k === KIND_CUBE) {
          emitCube(opaque[cell] ? opaqueB : cutoutB, grid, lights, i, cell, lx, y, lz, x0, z0, tables, layout, aoMul);
        } else if (k === KIND_WATER) {
          emitWaterCube(waterB, grid, lights, i, lx, y, lz, tables, layout, y - rowMin);
        } else {
          if (wet[cell]) emitWaterCube(waterB, grid, lights, i, lx, y, lz, tables, layout, y - rowMin);
          nbhd.i = i;
          emitModel(opaque[cell] ? opaqueB : cutoutB, grid, lights, i, cell, lx, y, lz, x0, z0, tables, layout, aoMul, nbhd,
            y - rowMin, rows);
        }
      }
    }
  }

  return finish();
};

// How many cells of water or water-holding blocks there are from cell `i` down, at most WATER_DEPTH_MAX. `row` is the
// cell's row in the grid, so the walk never leaves it. 0 when the cell itself holds no water.
const waterColumn = (grid: Uint16Array, i: number, row: number, wet: Uint8Array): number => {
  let n = 0;
  while (n < WATER_DEPTH_MAX && n <= row && wet[grid[i - n * PAD * PAD]]) n++;
  return n;
};

// What a water vertex carries in its tint: r is how deep the water is (0 to 1, WATER_DEPTH_MAX cells or more is 1) and g
// how much of a shoreline it is (0 in open water, 1 where the three other cells around the corner are not water). The
// water shader reads them to darken the deep and lighten the edge; water takes no biome tint, so the channel was free.
// A top face takes both from the four cells around each corner, so they run smoothly across the surface; any other face
// takes its own column's depth and no shore.
const waterVertexData = (
  grid: Uint16Array, i: number, row: number, f: number, wet: Uint8Array,
): void => {
  const own = waterColumn(grid, i, row, wet);
  if (f !== 2) {
    const depth = own / WATER_DEPTH_MAX;
    for (let c = 0; c < 4; c++) {
      waterTintBuf[c * 3] = depth;
      waterTintBuf[c * 3 + 1] = 0;
      waterTintBuf[c * 3 + 2] = 0;
    }
    return;
  }
  const su = STRIDE[FACES[f].u];
  const sv = STRIDE[FACES[f].v];
  for (let c = 0; c < 4; c++) {
    const i1 = i + CORNER_U[c] * su;
    const i2 = i + CORNER_V[c] * sv;
    let depthSum = own;
    let water = 1;
    for (let k = 0; k < 3; k++) {
      const n = waterColumn(grid, k === 0 ? i1 : k === 1 ? i2 : i1 + CORNER_V[c] * sv, row, wet);
      if (n > 0) {
        depthSum += n;
        water++;
      }
    }
    waterTintBuf[c * 3] = depthSum / water / WATER_DEPTH_MAX;
    waterTintBuf[c * 3 + 1] = (4 - water) / 3;
    waterTintBuf[c * 3 + 2] = 0;
  }
};

const emitWaterCube = (
  bucket: Bucket, grid: Uint16Array, lights: Uint8Array | null, i: number, lx: number, y: number, lz: number,
  tables: BlockTables, layout: TextureLayout, row: number,
): void => {
  const { occ, wet } = tables;
  const layers = layout.faceLayers;
  for (let f = 0; f < 6; f++) {
    const nb = grid[i + SIDE_OFFSET[f]];
    if (occ[nb] & FACING_BIT[f] || wet[nb]) continue;
    const layer = layers[BlockType.WATER * 3 + FACE_KIND[f]];
    // Water is lit like everything else, but a shore does not darken it: no ambient occlusion.
    const flip = faceLight(grid, lights, i + SIDE_OFFSET[f], f, tables, null, 0);
    waterVertexData(grid, i, row, f, wet);
    quadTint = waterTintBuf;
    emitBoxFace(bucket, f, lx, y, lz, lx + 1, y + 1, lz + 1, lightBuf, flip, layer, layout.overlayOf[layer], 1, 1, 1);
    quadTint = null;
  }
};

// The biome tint of a face, or white when the block takes none there. Written to tintOut.
const faceTint = (layout: TextureLayout, slot: number, lx: number, lz: number, x0: number, z0: number): void => {
  const tintKind = layout.faceTint[slot];
  if (!tintKind) {
    tintOut[0] = tintOut[1] = tintOut[2] = 1;
    return;
  }
  const col = lz * CHUNK_SIZE + lx;
  if (!tintKnown[col]) {
    grassTint(x0 + lx, z0 + lz, tmpRgb, 0, activeWildTint);
    tintCache[col * 3] = tmpRgb[0];
    tintCache[col * 3 + 1] = tmpRgb[1];
    tintCache[col * 3 + 2] = tmpRgb[2];
    tintKnown[col] = 1;
  }
  const scale = tintKind === TINT_FOLIAGE ? LEAVES_TINT_SCALE : 1;
  tintOut[0] = tintCache[col * 3] * scale;
  tintOut[1] = tintCache[col * 3 + 1] * scale;
  tintOut[2] = tintCache[col * 3 + 2] * scale;
};

// Smooth light and ambient occlusion for the four corners of the face on side `f`, where `front` is the grid index of
// the cell in front of the face. A corner takes the average light of the four cells around it in that layer: the front
// cell, the two beside the corner and the diagonal one. Cells that block light are left out (their stored light is 0 and
// would only darken the average), and so is the diagonal cell when both beside it block, because light cannot reach a
// vertex through two touching walls. Ambient occlusion is the usual three-neighbour level from the same cells, counting
// only blocks that cover all six sides, so partial blocks (slabs, stairs) do not darken their neighbours. Fills lightBuf
// with sky, block, occlusion and `glow` per corner and returns whether to split the quad along its other diagonal.
// With no light data a corner is open sky.
const faceLight = (
  grid: Uint16Array, lights: Uint8Array | null, front: number, f: number, tables: BlockTables,
  aoMul: Float32Array | null, glow: number,
): boolean => {
  const { full, blocksLight } = tables;
  const face = FACES[f];
  const su = STRIDE[face.u];
  const sv = STRIDE[face.v];
  const cf = grid[front];
  const frontOpen = blocksLight[cf] === 0;
  for (let c = 0; c < 4; c++) {
    const i1 = front + CORNER_U[c] * su;
    const i2 = front + CORNER_V[c] * sv;
    const ic = i1 + CORNER_V[c] * sv;
    const c1 = grid[i1];
    const c2 = grid[i2];
    const cc = grid[ic];

    let sky = 1;
    let block = 0;
    if (lights) {
      let skySum = 0;
      let blockSum = 0;
      let n = 0;
      if (frontOpen) { const p = lights[front]; skySum += p >> 4; blockSum += p & 15; n++; }
      const o1 = blocksLight[c1];
      const o2 = blocksLight[c2];
      if (!o1) { const p = lights[i1]; skySum += p >> 4; blockSum += p & 15; n++; }
      if (!o2) { const p = lights[i2]; skySum += p >> 4; blockSum += p & 15; n++; }
      if (!blocksLight[cc] && !(o1 && o2)) { const p = lights[ic]; skySum += p >> 4; blockSum += p & 15; n++; }
      if (n > 0) {
        sky = skySum / (n * 15);
        block = blockSum / (n * 15);
      } else {
        sky = 0;
      }
    }

    let ao = 1;
    if (aoMul) {
      const s1 = full[c1];
      const s2 = full[c2];
      ao = aoMul[s1 && s2 ? 0 : 3 - (s1 + s2 + full[cc])];
    }
    const o = c * 4;
    lightBuf[o] = sky;
    lightBuf[o + 1] = block;
    lightBuf[o + 2] = ao;
    lightBuf[o + 3] = glow;
    brightBuf[c] = (sky + block) * ao;
  }
  // Split along the diagonal joining the two brighter corners, otherwise the shading shows a crease.
  return brightBuf[0] + brightBuf[2] < brightBuf[1] + brightBuf[3];
};

// Light for a quad that is only part of a cell face, or lies inside the cell: one value for all four corners, taken from
// `toward` (the cell the quad faces, or -1), else the block's own cell, else the brightest open cell around it (a stair's
// own cell blocks light, so a riser inside it looks at what is in front of it).
const flatLight = (
  grid: Uint16Array, lights: Uint8Array | null, i: number, toward: number, blocksLight: Uint8Array, glow: number,
): void => {
  let sky = 15;
  let block = 0;
  if (lights) {
    if (toward >= 0 && !blocksLight[grid[toward]]) {
      sky = lights[toward] >> 4;
      block = lights[toward] & 15;
    } else if (!blocksLight[grid[i]]) {
      sky = lights[i] >> 4;
      block = lights[i] & 15;
    } else {
      sky = 0;
      for (let s = 0; s < 6; s++) {
        const n = i + SIDE_OFFSET[s];
        if (blocksLight[grid[n]]) continue;
        const p = lights[n];
        if (p >> 4 > sky) sky = p >> 4;
        if ((p & 15) > block) block = p & 15;
      }
    }
  }
  for (let c = 0; c < 4; c++) {
    lightBuf[c * 4] = sky / 15;
    lightBuf[c * 4 + 1] = block / 15;
    lightBuf[c * 4 + 2] = 1;
    lightBuf[c * 4 + 3] = glow;
  }
};

const emitCube = (
  bucket: Bucket, grid: Uint16Array, lights: Uint8Array | null, i: number, cell: number, lx: number, y: number, lz: number,
  x0: number, z0: number, tables: BlockTables, layout: TextureLayout, aoMul: Float32Array | null,
): void => {
  const { occ, full, opaque } = tables;
  const id = cell & ID_MASK;
  const selfOpaque = opaque[cell] === 1;
  const glow = tables.glow[id];

  // Most blocks are buried stone, so test for that before doing any work.
  if (selfOpaque && full[grid[i + 1]] && full[grid[i - 1]] && full[grid[i + PAD]] && full[grid[i - PAD]]
    && full[grid[i + PAD * PAD]] && full[grid[i - PAD * PAD]]) return;

  // A swaying cube (leaves) moves by the same amount at every corner: the whole block stirs a little.
  const sw = swayActive ? tables.sway[id] : 0;
  if (sw > 0) {
    swayBuf.fill(sw);
    quadSway = swayBuf;
  }
  if (flickerActive) quadFlicker = tables.flicker[id];

  for (let f = 0; f < 6; f++) {
    const front = i + SIDE_OFFSET[f];
    const nb = grid[front];
    if (occ[nb] & FACING_BIT[f]) continue;
    // See-through cubes of the same kind (leaves, glass) hide their shared faces.
    if (!selfOpaque && (nb & ID_MASK) === id) continue;

    const slot = id * 3 + FACE_KIND[f];
    const layer = layout.faceLayers[slot];
    const overlay = layout.overlayOf[layer];
    faceTint(layout, slot, lx, lz, x0, z0);

    const flip = faceLight(grid, lights, front, f, tables, aoMul, glow);
    emitBoxFace(bucket, f, lx, y, lz, lx + 1, y + 1, lz + 1, lightBuf, flip, layer, overlay, tintOut[0], tintOut[1], tintOut[2]);
  }
  quadSway = null;
  quadFlicker = 0;
};

// Whether the neighbour on the far side of a quad hides it: it covers the whole face, or every quarter the quad
// touches (a slab beside a slab).
const hidden = (q: ModelQuad, nb: number, tables: BlockTables): boolean => {
  const toward = q.cullSide ^ 1;
  if (tables.occ[nb] & (1 << toward)) return true;
  if (q.need === 0 || tables.kind[nb] !== KIND_MODEL || !tables.opaque[nb]) return false;
  const covered = tables.models[nb & ID_MASK].faceCoverage(nb >> STATE_SHIFT, toward);
  return (q.need & ~covered) === 0;
};

const emitModel = (
  bucket: Bucket, grid: Uint16Array, lights: Uint8Array | null, i: number, cell: number, lx: number, y: number, lz: number,
  x0: number, z0: number, tables: BlockTables, layout: TextureLayout, aoMul: Float32Array | null, nbhd: Neighbourhood,
  row: number, rows: number,
): void => {
  const id = cell & ID_MASK;
  const quads = tables.models[id].quads(cell >> STATE_SHIFT, nbhd);
  const glow = tables.glow[id];
  if (flickerActive) quadFlicker = tables.flicker[id];

  // Where this cell sits in a stalk of the same block: how many cells of it are below (`below`), and how tall the stalk
  // is up to STALK_BLOCKS. A weight of (below + height in the cell) / stalkHeight is the same at the top of one cell and
  // the bottom of the next, so a stack of bamboo bends as one piece.
  const sw = swayActive ? tables.sway[id] : 0;
  let below = 0;
  let stalk = 1;
  if (sw > 0) {
    while (below < STALK_SCAN && below < row && (grid[i - (below + 1) * PAD * PAD] & ID_MASK) === id) below++;
    let above = 0;
    while (above < STALK_SCAN && row + above < rows - 1 && (grid[i + (above + 1) * PAD * PAD] & ID_MASK) === id) above++;
    stalk = Math.min(below + above + 1, STALK_BLOCKS);
  }

  for (let n = 0; n < quads.length; n++) {
    const q = quads[n];
    let flip = false;
    if (q.cullSide >= 0) {
      const front = i + SIDE_OFFSET[q.cullSide];
      if (hidden(q, grid[front], tables)) continue;
      if (q.fullFace) {
        // A quad that is a whole cell face is lit and shaded like the face of a cube.
        flip = faceLight(grid, lights, front, q.cullSide, tables, aoMul, glow);
      } else {
        flatLight(grid, lights, i, front, tables.blocksLight, glow);
      }
    } else {
      // Inside the cell: look the way the quad faces when that is along an axis.
      const toward = q.nx * STRIDE[0] + q.ny * STRIDE[1] + q.nz * STRIDE[2];
      const axisAligned = Math.abs(q.nx) + Math.abs(q.ny) + Math.abs(q.nz) === 1;
      flatLight(grid, lights, i, axisAligned ? i + toward : -1, tables.blocksLight, glow);
    }
    const slot = id * 3 + q.face;
    const layer = layout.faceLayers[slot];
    faceTint(layout, slot, lx, lz, x0, z0);
    if (sw > 0) {
      // Rooted at the bottom of the stalk, and moving more the higher the vertex is, a little faster than linearly.
      for (let c = 0; c < 4; c++) {
        const h = q.corners[c * 3 + 1];
        const t = Math.min((below + (h < 0 ? 0 : h > 1 ? 1 : h)) / stalk, 1);
        swayBuf[c] = sw * t * Math.sqrt(t);
      }
      quadSway = swayBuf;
    }
    bucket.quad(q.corners, lx, y, lz, q.uvs, 0, q.nx, q.ny, q.nz, lightBuf, flip, layer, layout.overlayOf[layer],
      tintOut[0], tintOut[1], tintOut[2]);
  }
  quadSway = null;
  quadFlicker = 0;
};
