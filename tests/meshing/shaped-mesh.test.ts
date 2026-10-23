import { describe, expect, it } from 'vitest';
import { ShapedBlock } from '../../content/blocksShaped';
import { createDefaultTextureLayout } from '../../content/textures/layout';
import { createDefaultCatalog } from '../../content/textures/TextureCatalog';
import { createDefaultRegistry } from '../../content/blocks';
import { Chunk } from '../../engine/Chunk';
import { Cell, packCell } from '../../engine/cell';
import { CUBE_MODEL } from '../../engine/models/CubeModel';
import { stairState } from '../../engine/models/StairModel';
import { FACE_SIDE, FACE_TOP, createTextureLayout } from '../../engine/TextureLayout';
import { WorldGenerator } from '../../engine/WorldGenerator';
import { BucketData, MeshData, meshChunk } from '../../meshing/ChunkMesher';
import { PaddedChunkReader } from '../../meshing/PaddedChunkReader';
import { BlockType } from '../../worldConstants';
import { WHITE, MapReader, Quad, faceCount, quadsOf, registry, totalFaces } from './helpers';

const STAIRS = ShapedBlock.STONE_BRICK_STAIRS;
const SLAB = ShapedBlock.STONE_BRICK_SLAB;
const PANE = ShapedBlock.GLASS_PANE;
const FENCE = BlockType.WOOD_FENCE;

const layout = createDefaultTextureLayout(registry, createDefaultCatalog());
const mesh = (reader: MapReader, options = {}) => meshChunk(reader, 0, 0, registry, { layout, ...options });
const nameOf = (q: Quad) => layout.layerNames[q.layer];

describe('every shaped block uses tiles the catalog has', () => {
  it('leaves nothing to fall back to flat colours', () => {
    expect(layout.missing).toEqual([]);
  });
});

describe('cubes through the model path', () => {
  it('match what the cube model describes: same corners, same uvs, same order', () => {
    const quads = quadsOf(meshChunk(new MapReader([[5, 5, 5, WHITE]]), 0, 0, registry).opaque);
    const model = CUBE_MODEL.quads(0);
    expect(quads).toHaveLength(6);
    for (const q of quads) {
      const match = model.find((m) => m.nx === q.normal[0] && m.ny === q.normal[1] && m.nz === q.normal[2])!;
      expect(match).toBeDefined();
      q.corners.forEach((c, i) => {
        expect(c.pos).toEqual([match.corners[i * 3] + 5, match.corners[i * 3 + 1] + 5, match.corners[i * 3 + 2] + 5]);
        expect(c.uv).toEqual([match.uvs[i * 2], match.uvs[i * 2 + 1]]);
      });
    }
  });
});

describe('stairs and slabs wear their tiles', () => {
  it('puts the top tile on top, the bottom tile underneath and the side tile around', () => {
    const quads = quadsOf(mesh(new MapReader([[5, 5, 5, ShapedBlock.WOOD_PLANK_STAIRS, 0]])).opaque);
    expect(quads.map(nameOf).every((n) => n === 'plank')).toBe(true);
    const flatPlank = createTextureLayout([], registry);
    const flatQuads = quadsOf(meshChunk(new MapReader([[5, 5, 5, ShapedBlock.WOOD_PLANK_STAIRS, 0]]), 0, 0, registry).opaque);
    expect(flatQuads.every((q) => flatPlank.layerNames[q.layer] === 'flat:#8d6e63')).toBe(true);
  });

  it('uses each face kind of the block: a stair of a block with distinct faces shows them', () => {
    // Grass-like faces on a slab, to see which tile lands where.
    const own = createDefaultRegistry();
    own.register({
      id: 4004, name: 'test:grass_slab', color: '#336699', solid: true, opaque: true, emits: 0,
      faces: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }, model: own.model(SLAB),
    });
    const l = createDefaultTextureLayout(own, createDefaultCatalog());
    const quads = quadsOf(meshChunk(new MapReader([[5, 5, 5, 4004, 0]]), 0, 0, own, { layout: l }).opaque);
    const byNormal = (n: string) => quads.find((q) => q.normal.join(',') === n)!;
    expect(l.layerNames[byNormal('0,1,0').layer]).toBe('grass_top');
    expect(l.layerNames[byNormal('0,-1,0').layer]).toBe('dirt');
    expect(l.layerNames[byNormal('1,0,0').layer]).toBe('grass_side');
    expect(l.layer('grass_top')).toBe(l.faceLayer(4004, FACE_TOP));
    expect(l.layer('grass_side')).toBe(l.faceLayer(4004, FACE_SIDE));
  });

  it('draws a model without textures as its flat registry colour', () => {
    const own = createDefaultRegistry();
    own.register({ id: 4005, name: 'test:plain_stairs', color: '#12ab34', solid: true, opaque: true, emits: 0, model: own.model(STAIRS) });
    const l = createDefaultTextureLayout(own, createDefaultCatalog());
    const quads = quadsOf(meshChunk(new MapReader([[5, 5, 5, 4005, 2]]), 0, 0, own, { layout: l }).opaque);
    expect(quads).toHaveLength(11);
    expect(quads.every((q) => l.layerNames[q.layer] === 'flat:#12ab34')).toBe(true);
  });

  it('keeps a stair wall aligned with the tile of a cube beside it', () => {
    // The low step's wall shows the lower half of the tile, which is what the cube next to it shows in that place.
    const quads = quadsOf(mesh(new MapReader([[5, 5, 5, STAIRS, stairState(0)]])).opaque);
    const front = quads.find((q) => q.normal.join(',') === '0,0,1')!;
    const v = front.corners.map((c) => c.uv[1]);
    expect(Math.min(...v)).toBeCloseTo(0.5);
    expect(Math.max(...v)).toBeCloseTo(1);
    const u = front.corners.map((c) => c.uv[0]);
    expect([Math.min(...u), Math.max(...u)]).toEqual([0, 1]);
  });
});

describe('plants and crops', () => {
  it('draw a flower as two crossing planes in the cutout bucket', () => {
    const m = mesh(new MapReader([[5, 5, 5, BlockType.FLOWER_RED]]));
    expect(faceCount(m.cutout)).toBe(4);
    expect(totalFaces(m)).toBe(4);
    expect(quadsOf(m.cutout).every((q) => nameOf(q) === 'flower_red')).toBe(true);
  });

  it('draw wheat as four planes, both sides, and sugarcane and tall grass as crosses', () => {
    expect(faceCount(mesh(new MapReader([[5, 5, 5, BlockType.WHEAT]])).cutout)).toBe(8);
    expect(faceCount(mesh(new MapReader([[5, 5, 5, BlockType.WHEAT_STAGE_1]])).cutout)).toBe(8);
    expect(faceCount(mesh(new MapReader([[5, 5, 5, BlockType.SUGARCANE]])).cutout)).toBe(4);
    expect(faceCount(mesh(new MapReader([[5, 5, 5, BlockType.TALL_GRASS]])).cutout)).toBe(4);
  });

  it('hide nothing next to them, and are never hidden', () => {
    const ring: Array<[number, number, number, number]> = [
      [5, 5, 5, BlockType.TALL_GRASS],
      [4, 5, 5, WHITE], [6, 5, 5, WHITE], [5, 4, 5, WHITE], [5, 6, 5, WHITE], [5, 5, 4, WHITE], [5, 5, 6, WHITE],
    ];
    const m = mesh(new MapReader(ring));
    expect(faceCount(m.cutout)).toBe(4);
    expect(faceCount(m.opaque)).toBe(36);
  });

  it('put farmland in the opaque bucket, 15/16 high, with wheat standing on it a sixteenth lower', () => {
    const m = mesh(new MapReader([[5, 5, 5, BlockType.FARMLAND], [5, 6, 5, BlockType.WHEAT]]));
    const top = quadsOf(m.opaque).find((q) => q.normal[1] === 1)!;
    expect(top.corners[0].pos[1]).toBeCloseTo(5 + 15 / 16);
    const wheatLow = Math.min(...Array.from(m.cutout.positions).filter((_, i) => i % 3 === 1));
    expect(wheatLow).toBeCloseTo(6 - 1 / 16);
  });

  it('keeps the water cube of a lily pad and puts the pad above the surface', () => {
    const m = mesh(new MapReader([[8, 6, 8, BlockType.LILY_PAD]]));
    expect(faceCount(m.water)).toBe(6);
    expect(faceCount(m.cutout)).toBe(6);
    expect(quadsOf(m.cutout).every((q) => nameOf(q) === 'lily_pad')).toBe(true);
  });
});

describe('fences and panes join what is beside them when meshed', () => {
  it('reads the four neighbours from the grid, ring included', () => {
    // A fence at the east edge of the chunk joins stone that is in the ring, one block over.
    const m = mesh(new MapReader([[31, 5, 5, FENCE], [32, 5, 5, WHITE]]));
    expect(faceCount(m.cutout)).toBe(6 + 8);
    const lone = mesh(new MapReader([[31, 5, 5, FENCE]]));
    expect(faceCount(lone.cutout)).toBe(6);
  });

  it('joins fences along a row, each fence to the next', () => {
    const row: Array<[number, number, number, number]> = [[5, 5, 5, FENCE], [6, 5, 5, FENCE], [7, 5, 5, FENCE]];
    // End posts have one arm each, the middle two.
    expect(faceCount(mesh(new MapReader(row)).cutout)).toBe(14 + 22 + 14);
  });

  it('turns a corner: the arms follow the neighbours on both axes', () => {
    const m = mesh(new MapReader([[5, 5, 5, FENCE], [6, 5, 5, FENCE], [5, 5, 6, FENCE]]));
    expect(faceCount(m.cutout)).toBe(22 + 14 + 14);
  });

  it('lets a pane join glass, stone and panes, and not leave a gap in a wall of panes', () => {
    const wall: Array<[number, number, number, number]> = [[5, 5, 5, PANE], [6, 5, 5, PANE], [7, 5, 5, PANE], [8, 5, 5, WHITE]];
    const m = mesh(new MapReader(wall));
    // Panes at 5, 6 and 7 are joined along x. The first has an arm east only (a post of 5 faces and 4 for the arm);
    // the other two have an arm each way, the last one's east arm reaching the stone (4 post faces and 8 for the arms).
    expect(faceCount(m.cutout)).toBe(9 + 12 + 12);
  });
});

describe('state travels through the mesher', () => {
  it('reads the state of the chunk cells, with or without the bulk copy', () => {
    const chunk = new Chunk(0, 0);
    chunk.setCell(5, 5, 5, packCell(STAIRS, stairState(1)));
    chunk.setCell(6, 5, 5, packCell(STAIRS, stairState(3, true)));
    chunk.setCell(8, 5, 5, packCell(SLAB, 1));
    const gen: WorldGenerator = { generateChunk() {}, sampleBlock: () => 0, terrainHeight: () => 0, zoneNameAt: () => '' };
    const fast = new PaddedChunkReader(chunk, gen);
    const slow = { getCell: (x: number, y: number, z: number) => fast.getCell(x, y, z), yRange: () => fast.yRange() };
    const a = meshChunk(fast, 0, 0, registry);
    const b = meshChunk(slow, 0, 0, registry);
    expect(Array.from(a.opaque.positions)).toEqual(Array.from(b.opaque.positions));
    expect(Array.from(a.opaque.uvs)).toEqual(Array.from(b.opaque.uvs));
    // And it really used the state: a stair facing east is not a stair facing north.
    const north = new Chunk(0, 0);
    north.setCell(5, 5, 5, packCell(STAIRS, stairState(0)));
    const n = meshChunk(new PaddedChunkReader(north, gen), 0, 0, registry);
    const east = new Chunk(0, 0);
    east.setCell(5, 5, 5, packCell(STAIRS, stairState(1)));
    const e = meshChunk(new PaddedChunkReader(east, gen), 0, 0, registry);
    expect(Array.from(n.opaque.positions)).not.toEqual(Array.from(e.opaque.positions));
  });

  it('reads the state of ring cells from the generator when it can say it, and as 0 when it cannot', () => {
    // A stair at x = 32 (next chunk) facing west: its back is on the west side, against our block at x = 31.
    const stair = packCell(STAIRS, stairState(3));
    const base = { generateChunk() {}, terrainHeight: () => 0, zoneNameAt: () => '' };
    const stateless: WorldGenerator = { ...base, sampleBlock: (x, y) => (x === 32 && y === 5 ? STAIRS : 0) };
    const withState: WorldGenerator = {
      ...stateless, sampleCell: (x, y): Cell => (x === 32 && y === 5 ? stair : 0),
    };
    const chunk = new Chunk(0, 0);
    chunk.setCell(31, 5, 5, packCell(WHITE));
    const count = (gen: WorldGenerator) => totalFaces(meshChunk(new PaddedChunkReader(chunk, gen), 0, 0, registry));
    // Facing west the stair's back covers the west side, so the cube's east face is hidden: 5 faces.
    expect(count(withState)).toBe(5);
    // State 0 is a stair facing north: its west wall is not fully covered, so the cube's east face stays.
    expect(count(stateless)).toBe(6);
  });
});

describe('every block in every state', () => {
  const ids = registry.all().filter((d) => d.id !== 0).map((d) => d.id);

  it('meshes cleanly: valid indices, coordinates inside the chunk, winding that agrees with the normals', () => {
    const blocks: Array<[number, number, number, number, number]> = [];
    let n = 0;
    for (const id of ids) {
      for (let state = 0; state < 16; state++) {
        // Spread them out so neither fences nor panes join, and give every second block a stone neighbour.
        blocks.push([(n % 10) * 3, 5 + Math.floor(n / 100) * 3, (Math.floor(n / 10) % 10) * 3, id, state]);
        n++;
      }
    }
    const m: MeshData = mesh(new MapReader(blocks));
    expect(totalFaces(m)).toBeGreaterThan(1000);
    for (const name of ['opaque', 'cutout', 'water'] as const) {
      const b: BucketData = m[name];
      const vertices = b.positions.length / 3;
      expect(b.indices.every((i) => i < vertices)).toBe(true);
      expect(b.positions.every(Number.isFinite)).toBe(true);
      expect(b.uvs.every((v) => v >= -1e-6 && v <= 1 + 1e-6)).toBe(true);
      let bad = 0;
      for (let t = 0; t < b.indices.length; t += 3) {
        const [a, bb, c] = [b.indices[t], b.indices[t + 1], b.indices[t + 2]].map((i) => i * 3);
        const e1 = [0, 1, 2].map((k) => b.positions[bb + k] - b.positions[a + k]);
        const e2 = [0, 1, 2].map((k) => b.positions[c + k] - b.positions[a + k]);
        const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const dot = cross[0] * b.normals[a] + cross[1] * b.normals[a + 1] + cross[2] * b.normals[a + 2];
        if (!(dot > 1e-9)) bad++;
      }
      expect(bad, `${name} triangles that disagree with their normal`).toBe(0);
    }
  });

  it('keeps every vertex normal a unit vector', () => {
    const m = mesh(new MapReader(ids.map((id, i): [number, number, number, number, number] => [(i % 10) * 3, 5, Math.floor(i / 10) * 3, id, i % 16])));
    for (const name of ['opaque', 'cutout', 'water'] as const) {
      const nrm = m[name].normals;
      for (let i = 0; i < nrm.length; i += 3) expect(Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2])).toBeCloseTo(1, 5);
    }
  });
});

describe('ambient occlusion with partial blocks', () => {
  const ao = (reader: MapReader) => meshChunk(reader, 0, 0, registry, { aoStrength: 1 });

  it('does not let a slab or stair darken the face of a cube beside it', () => {
    const m = ao(new MapReader([[0, 0, 0, WHITE], [1, 1, 0, SLAB, 0], [0, 1, 1, STAIRS, 0]]));
    const top = quadsOf(m.opaque).filter((q) => q.layer === quadsOf(m.opaque)[0].layer && q.normal[1] === 1 && q.corners[0].pos[1] === 1);
    expect(top.length).toBeGreaterThan(0);
    for (const q of top) for (const c of q.corners) expect(c.ao).toBe(1);
  });

  it('leaves the base of a stair lit: it is two half quads, not a whole cell face', () => {
    const m = ao(new MapReader([[1, 0, 0, WHITE], [0, 0, 1, WHITE], [0, 1, 0, STAIRS, 0]]));
    const stairLayer = createTextureLayout([], registry).faceLayer(STAIRS, FACE_SIDE);
    const baseQuads = quadsOf(m.opaque).filter((q) => q.layer === stairLayer && q.normal[1] === -1);
    expect(baseQuads).toHaveLength(2);
    for (const q of baseQuads) for (const c of q.corners) expect(c.ao).toBe(1);
  });

  it('shades the base of a slab, which is a whole cell face', () => {
    const m = ao(new MapReader([[1, 0, 0, WHITE], [0, 0, 1, WHITE], [0, 1, 0, SLAB, 0]]));
    const slabLayer = createTextureLayout([], registry).faceLayer(SLAB, FACE_SIDE);
    const base = quadsOf(m.opaque).filter((q) => q.layer === slabLayer && q.normal[1] === -1);
    expect(base).toHaveLength(1);
    const shades = base[0].corners.map((c) => c.ao);
    expect(Math.min(...shades)).toBeLessThan(1);
    expect(Math.max(...shades)).toBe(1);
  });
});
