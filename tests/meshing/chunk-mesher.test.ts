import { describe, expect, it } from 'vitest';
import { Chunk } from '../../engine/Chunk';
import { packCell } from '../../engine/cell';
import { WORLD_MIN_Y } from '../../engine/coords';
import { createTextureLayout } from '../../engine/TextureLayout';
import { WorldGenerator } from '../../engine/WorldGenerator';
import { AO_STRENGTH, LEGACY_BOXES, meshChunk, meshTransferables } from '../../meshing/ChunkMesher';
import { PaddedChunkReader } from '../../meshing/PaddedChunkReader';
import { BlockType } from '../../worldConstants';
import { WHITE, MapReader, bounds, faceCount, quadsOf, registry, totalFaces } from './helpers';

const mesh = (reader: MapReader, cx = 0, cz = 0) => meshChunk(reader, cx, cz, registry);

describe('face culling', () => {
  it('draws six faces for a single block', () => {
    const m = mesh(new MapReader([[5, 10, 7, WHITE]]));
    expect(faceCount(m.opaque)).toBe(6);
    expect(m.opaque.positions.length).toBe(24 * 3);
    expect(m.opaque.indices.length).toBe(36);
    expect(totalFaces(m)).toBe(6);
    expect(bounds(m.opaque)).toEqual({ min: [5, 10, 7], max: [6, 11, 8] });
  });

  it('gives each face of a cube its own outward normal', () => {
    const m = mesh(new MapReader([[1, 1, 1, WHITE]]));
    const normals = quadsOf(m.opaque).map((q) => q.normal.join(',')).sort();
    expect(normals).toEqual(['-1,0,0', '0,-1,0', '0,0,-1', '0,0,1', '0,1,0', '1,0,0']);
  });

  it('hides the shared faces of two adjacent opaque cubes, leaving ten', () => {
    for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      const m = mesh(new MapReader([[3, 3, 3, WHITE], [3 + dx, 3 + dy, 3 + dz, WHITE]]));
      expect(totalFaces(m)).toBe(10);
    }
  });

  it('draws blocks on the chunk border against air in the ring', () => {
    const m = mesh(new MapReader([[0, 0, 0, WHITE], [31, 0, 31, WHITE]]));
    expect(totalFaces(m)).toBe(12);
  });

  it('does not draw the bottom of the world', () => {
    const m = mesh(new MapReader([[4, WORLD_MIN_Y, 4, WHITE]]));
    expect(totalFaces(m)).toBe(5);
  });

  it('gives an empty chunk empty buffers', () => {
    const m = mesh(new MapReader());
    expect(totalFaces(m)).toBe(0);
    expect(m.opaque.positions.length).toBe(0);
    expect(m.water.indices.length).toBe(0);
  });

  it('hides a face against an opaque cell in the padding ring, and draws it against air', () => {
    const corner: Array<[number, number, number, number]> = [[31, 5, 31, WHITE]];
    expect(totalFaces(mesh(new MapReader(corner)))).toBe(6);
    expect(totalFaces(mesh(new MapReader([...corner, [32, 5, 31, WHITE]])))).toBe(5);
    expect(totalFaces(mesh(new MapReader([...corner, [31, 5, 32, WHITE]])))).toBe(5);
    expect(totalFaces(mesh(new MapReader([...corner, [32, 5, 32, WHITE]])))).toBe(6); // diagonal ring cell hides no face
    expect(totalFaces(mesh(new MapReader([...corner, [30, 5, 31, WHITE]])))).toBe(10);
  });

  it('only meshes the cells of its own chunk, with ring cells used for culling alone', () => {
    // The neighbour's block at x = 32 is outside chunk (0,0), so it adds no faces to it.
    const m = mesh(new MapReader([[31, 5, 10, WHITE], [32, 5, 10, WHITE]]), 0, 0);
    expect(totalFaces(m)).toBe(5);
    const next = mesh(new MapReader([[31, 5, 10, WHITE], [32, 5, 10, WHITE]]), 1, 0);
    expect(totalFaces(next)).toBe(5);
    // Positions are chunk-local, so chunk (1, 0) puts world x = 32 at 0.
    expect(bounds(next.opaque).min[0]).toBe(0);
  });

  it('handles negative chunk coordinates', () => {
    // Chunk (-1, -1) covers world x and z from -32 to -1, so (-1, -1) is its local (31, 31).
    const block: Array<[number, number, number, number]> = [[-1, 2, -1, WHITE]];
    expect(totalFaces(mesh(new MapReader(block), -1, -1))).toBe(6);
    expect(totalFaces(mesh(new MapReader([...block, [0, 2, -1, WHITE]]), -1, -1))).toBe(5);
    expect(totalFaces(mesh(new MapReader([...block, [-1, 2, 0, WHITE]]), -1, -1))).toBe(5);
    expect(bounds(mesh(new MapReader(block), -1, -1).opaque)).toEqual({ min: [31, 2, 31], max: [32, 3, 32] });
  });
});

describe('PaddedChunkReader', () => {
  // Stone ring at x = 32 only, everything else air.
  class RingGenerator implements WorldGenerator {
    samples: Array<[number, number, number]> = [];
    generateChunk(): void {}
    sampleBlock(x: number, y: number, z: number): number {
      this.samples.push([x, y, z]);
      return x === 32 ? WHITE : 0;
    }
    terrainHeight(): number { return 0; }
    zoneNameAt(): string { return 'test'; }
  }

  it('reads its own cells from the chunk and the ring from the generator', () => {
    const chunk = new Chunk(0, 0);
    chunk.setCell(31, 5, 10, packCell(WHITE));
    chunk.setCell(30, 5, 10, packCell(BlockType.STONE));
    const gen = new RingGenerator();
    const reader = new PaddedChunkReader(chunk, gen);

    expect(reader.getCell(31, 5, 10)).toBe(packCell(WHITE));
    expect(gen.samples).toHaveLength(0);
    expect(reader.getCell(32, 5, 10)).toBe(packCell(WHITE));
    expect(reader.getCell(33, 5, 10)).toBe(0);
    expect(gen.samples).toHaveLength(2);
  });

  it('culls a face against the ring through meshChunk', () => {
    const chunk = new Chunk(0, 0);
    chunk.setCell(31, 5, 10, packCell(WHITE));
    chunk.setCell(0, 5, 10, packCell(WHITE));
    const m = meshChunk(new PaddedChunkReader(chunk, new RingGenerator()), 0, 0, registry);
    expect(totalFaces(m)).toBe(5 + 6); // +x face of the first is hidden by the ring, the second has none
  });

  it('works for negative chunks and never asks the generator about its own cells', () => {
    const chunk = new Chunk(-1, -1);
    chunk.setCell(0, 5, 0, packCell(WHITE));
    const gen = new RingGenerator();
    meshChunk(new PaddedChunkReader(chunk, gen), -1, -1, registry);
    for (const [x, , z] of gen.samples) {
      const inside = x >= -32 && x < 0 && z >= -32 && z < 0;
      expect(inside).toBe(false);
    }
    expect(gen.samples.length).toBeGreaterThan(0);
  });

  it('reports the y range of the allocated sections', () => {
    const chunk = new Chunk(0, 0);
    expect(new PaddedChunkReader(chunk, new RingGenerator()).yRange()).toBeNull();
    chunk.setCell(0, 20, 0, packCell(WHITE));
    chunk.setCell(0, -50, 0, packCell(WHITE));
    expect(new PaddedChunkReader(chunk, new RingGenerator()).yRange()).toEqual({ minY: -64, maxY: 31 });
  });

  it('meshes the same through the bulk copy as through getCell alone', () => {
    const chunk = new Chunk(2, -3);
    for (let i = 0; i < 400; i++) {
      const id = i % 7 === 0 ? BlockType.WATER : i % 5 === 0 ? BlockType.GLASS : i % 3 === 0 ? BlockType.FLOWER_RED : WHITE;
      chunk.setCell((i * 7) % 32, -40 + ((i * 13) % 90), (i * 11) % 32, packCell(id, i % 16));
    }
    const gen = new RingGenerator();
    const fast = new PaddedChunkReader(chunk, gen);
    const slow = { getCell: (x: number, y: number, z: number) => fast.getCell(x, y, z), yRange: () => fast.yRange() };
    const a = meshChunk(fast, 2, -3, registry);
    const b = meshChunk(slow, 2, -3, registry);
    for (const name of ['opaque', 'cutout', 'water'] as const) {
      expect(Array.from(a[name].positions)).toEqual(Array.from(b[name].positions));
      expect(Array.from(a[name].indices)).toEqual(Array.from(b[name].indices));
      expect(Array.from(a[name].colors)).toEqual(Array.from(b[name].colors));
    }
  });
});

describe('water', () => {
  const W = BlockType.WATER;

  it('puts water in its own bucket', () => {
    const m = mesh(new MapReader([[2, 2, 2, W]]));
    expect(faceCount(m.water)).toBe(6);
    expect(totalFaces(m)).toBe(6);
  });

  it('does not draw water faces against water', () => {
    const m = mesh(new MapReader([[2, 2, 2, W], [3, 2, 2, W], [2, 3, 2, W]]));
    expect(faceCount(m.water)).toBe(6 * 3 - 4);
  });

  it('draws the solid faces that touch water, and hides water faces against solids', () => {
    // Stone block with water on top and beside it.
    const m = mesh(new MapReader([[5, 5, 5, WHITE], [5, 6, 5, W], [6, 5, 5, W]]));
    expect(faceCount(m.opaque)).toBe(6);
    // Each water cube loses the one face it shares with the stone. The two only touch along an edge.
    expect(faceCount(m.water)).toBe(5 + 5);
  });

  it('draws water faces against see-through blocks', () => {
    const m = mesh(new MapReader([[5, 5, 5, BlockType.GLASS], [6, 5, 5, W]]));
    expect(faceCount(m.water)).toBe(6);
    expect(faceCount(m.cutout)).toBe(6);
  });

  it('hides water faces across the chunk border when the ring holds water', () => {
    const m = mesh(new MapReader([[31, 4, 4, W], [32, 4, 4, W]]));
    expect(faceCount(m.water)).toBe(5);
  });

  it('keeps a lily pad in a cell of water', () => {
    const m = mesh(new MapReader([[8, 6, 8, BlockType.LILY_PAD], [9, 6, 8, W]]));
    // The pad's water cube draws five faces (none toward the water beside it); the pad itself is a cutout box.
    expect(faceCount(m.water)).toBe(5 + 5);
    expect(faceCount(m.cutout)).toBe(6);
  });
});

describe('see-through blocks', () => {
  it('cull faces against the same id only', () => {
    const glass = BlockType.GLASS;
    expect(totalFaces(mesh(new MapReader([[1, 1, 1, glass], [2, 1, 1, glass]])))).toBe(10);
    expect(totalFaces(mesh(new MapReader([[1, 1, 1, glass], [2, 1, 1, BlockType.LEAVES]])))).toBe(12);
    expect(totalFaces(mesh(new MapReader([[1, 1, 1, BlockType.LEAVES], [2, 1, 1, BlockType.LEAVES]])))).toBe(10);
  });

  it('are drawn against opaque neighbours, and do not hide them', () => {
    const m = mesh(new MapReader([[1, 1, 1, BlockType.GLASS], [2, 1, 1, WHITE]]));
    expect(faceCount(m.cutout)).toBe(5);
    expect(faceCount(m.opaque)).toBe(6);
  });
});

describe('buckets', () => {
  const cases: Array<[string, number, 'opaque' | 'cutout']> = [
    ['stone', BlockType.STONE, 'opaque'],
    ['grass', BlockType.GRASS, 'opaque'],
    ['glass', BlockType.GLASS, 'cutout'],
    ['leaves', BlockType.LEAVES, 'cutout'],
    ['flower', BlockType.FLOWER_RED, 'cutout'],
    ['fence', BlockType.WOOD_FENCE, 'cutout'],
  ];
  for (const [name, id, bucket] of cases) {
    it(`sends ${name} to ${bucket} only`, () => {
      const m = mesh(new MapReader([[3, 3, 3, id]]));
      const counts = { opaque: faceCount(m.opaque), cutout: faceCount(m.cutout), water: faceCount(m.water) };
      expect(counts[bucket]).toBe(6);
      expect(totalFaces(m)).toBe(6);
    });
  }

  it('keeps the three buckets apart when mixed', () => {
    const m = mesh(new MapReader([[1, 1, 1, BlockType.STONE], [5, 1, 1, BlockType.GLASS], [9, 1, 1, BlockType.WATER]]));
    expect([faceCount(m.opaque), faceCount(m.cutout), faceCount(m.water)]).toEqual([6, 6, 6]);
  });

  it('draws an id the registry does not know as a magenta cube', () => {
    const m = mesh(new MapReader([[3, 3, 3, 3000]]));
    expect(faceCount(m.cutout)).toBe(6);
    // Magenta now comes from the texture: the layout's unknown tile, a flat #ff00ff.
    const layout = createTextureLayout([], registry);
    expect(layout.layerNames[m.cutout.layers[0]]).toBe('flat:#ff00ff');
    expect(layout.layerNames[layout.unknownLayer]).toBe('flat:#ff00ff');
  });
});

describe('ambient occlusion off by default', () => {
  it('ships with AO off so the colours stay flat', () => {
    expect(AO_STRENGTH).toBe(0);
  });

  it('leaves every vertex at the registry colour even in a deep corner', () => {
    const m = mesh(new MapReader([[0, 0, 0, WHITE], [1, 1, 0, WHITE], [0, 1, 1, WHITE], [1, 1, 1, WHITE]]));
    for (const c of m.opaque.colors) expect(c).toBeCloseTo(1);
  });

  it('keeps the default quad split on every face', () => {
    const m = mesh(new MapReader([[0, 0, 0, WHITE], [1, 1, 1, WHITE]]));
    for (const q of quadsOf(m.opaque)) {
      const tri = [q.indices.slice(0, 3), q.indices.slice(3, 6)];
      expect(tri[0].filter((i) => tri[1].includes(i)).sort()).toEqual([0, 2]);
    }
  });
});

describe('ambient occlusion (strength 1)', () => {
  // Top face of the block at the origin, as the four vertices with their colour multiplier.
  const topOf = (reader: MapReader) => {
    const quad = quadsOf(meshChunk(reader, 0, 0, registry, { aoStrength: 1 }).opaque).find((q) =>
      q.normal[1] === 1 && q.corners.every((c) => c.pos[1] === 1 && c.pos[0] <= 1 && c.pos[2] <= 1))!;
    expect(quad).toBeDefined();
    return quad;
  };
  const at = (quad: ReturnType<typeof topOf>, x: number, z: number) =>
    quad.corners.findIndex((c) => c.pos[0] === x && c.pos[2] === z);
  const shade = (quad: ReturnType<typeof topOf>, x: number, z: number) => quad.corners[at(quad, x, z)].rgb[0];

  it('leaves an open face fully lit', () => {
    const quad = topOf(new MapReader([[0, 0, 0, WHITE]]));
    for (const c of quad.corners) expect(c.rgb).toEqual([1, 1, 1]);
  });

  it('darkens the corners beside a wall in an L-shaped layout', () => {
    // Floor block at the origin, a floor block beside it with a second block stacked on that.
    const quad = topOf(new MapReader([[0, 0, 0, WHITE], [1, 0, 0, WHITE], [1, 1, 0, WHITE]]));
    expect(shade(quad, 0, 0)).toBeCloseTo(1.0);
    expect(shade(quad, 0, 1)).toBeCloseTo(1.0);
    expect(shade(quad, 1, 0)).toBeCloseTo(0.85); // one side block
    expect(shade(quad, 1, 1)).toBeCloseTo(0.85);
  });

  it('uses the darkest level when both sides of a corner are solid', () => {
    const quad = topOf(new MapReader([[0, 0, 0, WHITE], [1, 1, 0, WHITE], [0, 1, 1, WHITE]]));
    expect(shade(quad, 1, 1)).toBeCloseTo(0.55);
    expect(shade(quad, 0, 0)).toBeCloseTo(1.0);
    // The two side blocks each shade the corner they touch by one step.
    expect(shade(quad, 1, 0)).toBeCloseTo(0.85);
    expect(shade(quad, 0, 1)).toBeCloseTo(0.85);
  });

  it('counts a block touching only at the corner as one step', () => {
    const quad = topOf(new MapReader([[0, 0, 0, WHITE], [1, 1, 1, WHITE]]));
    expect(shade(quad, 1, 1)).toBeCloseTo(0.85);
    expect(shade(quad, 0, 0)).toBeCloseTo(1.0);
  });

  it('gives 0.7 for a side block plus the diagonal one', () => {
    const quad = topOf(new MapReader([[0, 0, 0, WHITE], [1, 1, 0, WHITE], [1, 1, 1, WHITE]]));
    expect(shade(quad, 1, 1)).toBeCloseTo(0.7);   // side at +x and the diagonal
    expect(shade(quad, 1, 0)).toBeCloseTo(0.85);
  });

  it('does not count see-through blocks as occluders', () => {
    const quad = topOf(new MapReader([[0, 0, 0, WHITE], [1, 1, 0, BlockType.GLASS], [1, 1, 1, BlockType.LEAVES]]));
    for (const c of quad.corners) expect(c.rgb).toEqual([1, 1, 1]);
  });

  // The shared diagonal of a quad is the pair of vertex indices that appear in both triangles.
  const diagonalOf = (quad: ReturnType<typeof topOf>) => {
    const tri = [quad.indices.slice(0, 3), quad.indices.slice(3, 6)];
    return tri[0].filter((i) => tri[1].includes(i)).sort();
  };

  it('splits the quad along the diagonal that avoids the shaded corner', () => {
    // A block touching one corner shades it. The default diagonal runs 0-2, so a shaded corner 0 or 2 flips it.
    for (const [bx, bz] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const quad = topOf(new MapReader([[0, 0, 0, WHITE], [bx, 1, bz, WHITE]]));
      const shaded = at(quad, bx === 1 ? 1 : 0, bz === 1 ? 1 : 0);
      expect(quad.corners[shaded].rgb[0]).toBeCloseTo(0.85);
      expect(diagonalOf(quad)).not.toContain(shaded);
    }
  });

  it('flips for the corner-only layout and keeps the default split on an open face', () => {
    expect(diagonalOf(topOf(new MapReader([[0, 0, 0, WHITE], [1, 1, 1, WHITE]])))).toEqual([1, 3]);
    expect(diagonalOf(topOf(new MapReader([[0, 0, 0, WHITE]])))).toEqual([0, 2]);
  });

  it('scales the darkening with the strength', () => {
    const half = quadsOf(meshChunk(new MapReader([[0, 0, 0, WHITE], [1, 1, 0, WHITE], [0, 1, 1, WHITE]]), 0, 0, registry, { aoStrength: 0.5 }).opaque)
      .find((q) => q.normal[1] === 1 && q.corners.every((c) => c.pos[1] === 1 && c.pos[0] <= 1 && c.pos[2] <= 1))!;
    const corner = half.corners.find((c) => c.pos[0] === 1 && c.pos[2] === 1)!;
    expect(corner.rgb[0]).toBeCloseTo(0.775); // halfway between 1 and 0.55
  });

  it('does not bake face shading into the colours', () => {
    const m = meshChunk(new MapReader([[0, 0, 0, WHITE]]), 0, 0, registry, { aoStrength: 1 });
    for (const c of m.opaque.colors) expect(c).toBeCloseTo(1);
  });
});

describe('index validity', () => {
  it('keeps indices in range and triangles facing outward, on a real chunk with every kind of block', () => {
    const chunk = new Chunk(0, 0);
    // A noisy patch holding every legacy block, so water, cutouts, boxes and cubes all meet.
    const ids = Object.values(BlockType).filter((v): v is number => typeof v === 'number' && v !== 0);
    for (let x = 0; x < 32; x++) {
      for (let z = 0; z < 32; z++) {
        for (let y = 0; y < 6; y++) {
          const h = (x * 31 + z * 17 + y * 7) % 11;
          if (h < 3) continue;
          chunk.setCell(x, y, z, packCell(ids[(x * 5 + z * 3 + y) % ids.length]));
        }
      }
    }
    const gen: WorldGenerator = {
      generateChunk() {}, sampleBlock: () => 0, terrainHeight: () => 0, zoneNameAt: () => '',
    };
    const m = meshChunk(new PaddedChunkReader(chunk, gen), 0, 0, registry);
    expect(totalFaces(m)).toBeGreaterThan(1000);

    for (const name of ['opaque', 'cutout', 'water'] as const) {
      const b = m[name];
      const vertices = b.positions.length / 3;
      expect(b.normals.length).toBe(b.positions.length);
      expect(b.colors.length).toBe(b.positions.length);
      expect(b.indices.length % 6).toBe(0);
      expect(b.indices.every((i) => i < vertices)).toBe(true);
      expect(b.positions.every(Number.isFinite)).toBe(true);
      expect(b.colors.every((c) => c >= 0 && c <= 1)).toBe(true);
      let inside = true;
      for (let i = 0; i < b.positions.length; i += 3) {
        inside &&= b.positions[i] >= 0 && b.positions[i] <= 32 && b.positions[i + 2] >= 0 && b.positions[i + 2] <= 32;
      }
      expect(inside).toBe(true);

      let badTriangles = 0;
      // Every triangle has area and its winding agrees with the vertex normal.
      for (let t = 0; t < b.indices.length; t += 3) {
        const [a, bb, c] = [b.indices[t], b.indices[t + 1], b.indices[t + 2]].map((i) => i * 3);
        const e1 = [0, 1, 2].map((k) => b.positions[bb + k] - b.positions[a + k]);
        const e2 = [0, 1, 2].map((k) => b.positions[c + k] - b.positions[a + k]);
        const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const dot = cross[0] * b.normals[a] + cross[1] * b.normals[a + 1] + cross[2] * b.normals[a + 2];
        if (!(dot > 1e-9)) badTriangles++;
      }
      expect(badTriangles).toBe(0);
    }
  });

  it('lists every buffer for transfer, and the mesh survives a transfer', () => {
    const m = mesh(new MapReader([[1, 1, 1, WHITE], [4, 1, 1, BlockType.WATER], [6, 1, 1, BlockType.GLASS]]));
    const buffers = meshTransferables(m);
    expect(buffers).toHaveLength(21); // seven attributes in each of three buckets
    expect(new Set(buffers).size).toBe(21);
    const bytes = m.opaque.positions.byteLength;
    const clone = structuredClone(m, { transfer: buffers });
    expect(clone.opaque.positions.byteLength).toBe(bytes);
    expect(m.opaque.positions.byteLength).toBe(0); // moved, not copied
  });
});
