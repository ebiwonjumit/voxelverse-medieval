import { describe, expect, it } from 'vitest';
import { Chunk } from '../../engine/Chunk';
import { packCell } from '../../engine/cell';
import { CHUNK_SIZE, chunkCoord, localCoord } from '../../engine/coords';
import { BucketData, MeshData, meshChunk } from '../../meshing/ChunkMesher';
import { ChunkGrid, LightData, computeChunkLight } from '../../meshing/LightEngine';
import { NeighbourReader } from '../../meshing/NeighbourReader';
import { ShapedBlock } from '../../content/blocksShaped';
import { createDefaultTextureLayout } from '../../content/textures/layout';
import { TextureLayout } from '../../engine/TextureLayout';
import { BlockType } from '../../worldConstants';
import { WHITE, quadsOf, registry } from './helpers';

// A small editable world in block coordinates, lit and meshed the way a worker does it: the light from the 3x3 chunks
// around the chunk, the cells and the ring from the same nine. Anything not set is air.
class Room {
  private readonly chunks = new Map<string, Chunk>();

  constructor() {
    for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) this.chunks.set(`${cx},${cz}`, new Chunk(cx, cz));
  }

  set(x: number, y: number, z: number, id: number, state = 0): this {
    this.chunks.get(`${chunkCoord(x)},${chunkCoord(z)}`)!.setCell(localCoord(x), y, localCoord(z), packCell(id, state));
    return this;
  }

  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number): this {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, y, z, id);
    return this;
  }

  // Stone ground with its top at y = 0, under all nine chunks.
  ground(): this {
    return this.fill(-CHUNK_SIZE, -1, -CHUNK_SIZE, 2 * CHUNK_SIZE - 1, 0, 2 * CHUNK_SIZE - 1, BlockType.STONE);
  }

  // A hollow box of stone from (x0, 1, z0) to (x1, top, z1): the cells strictly inside are the room, the floor is the
  // ground. The roof is at y = top.
  room(x0: number, z0: number, x1: number, z1: number, top: number): this {
    this.fill(x0, 1, z0, x1, top, z1, BlockType.STONE);
    return this.fill(x0 + 1, 1, z0 + 1, x1 - 1, top - 1, z1 - 1, 0);
  }

  light(cx = 0, cz = 0): LightData {
    return computeChunkLight(new ChunkGrid(this.chunks.values()), cx, cz, registry);
  }

  mesh(cx = 0, cz = 0, aoStrength?: number, layout?: TextureLayout): MeshData {
    const around: Chunk[] = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) around.push(this.chunks.get(`${cx + dx},${cz + dz}`)!);
    return meshChunk(new NeighbourReader(around), cx, cz, registry, { light: this.light(cx, cz), aoStrength, layout });
  }
}

// The top face of the block at (x, 0, z) is a quad in the plane y = 1; this finds the corner vertex at (vx, 1, vz).
const topVertex = (bucket: BucketData, vx: number, vy: number, vz: number) => {
  for (const q of quadsOf(bucket)) {
    if (q.normal[1] !== 1) continue;
    const c = q.corners.find((k) => k.pos[0] === vx && k.pos[1] === vy && k.pos[2] === vz);
    if (c) return c;
  }
  throw new Error(`no upward face has a vertex at (${vx}, ${vy}, ${vz})`);
};

const LANTERN = BlockType.LANTERN;
const layout = createDefaultTextureLayout(registry);
const levelAt = (lantern: [number, number, number], x: number, y: number, z: number) =>
  15 - (Math.abs(lantern[0] - x) + Math.abs(lantern[1] - y) + Math.abs(lantern[2] - z));

describe('baked light in the mesher', () => {
  // A sealed room: stone walls and roof, interior x 3..8, z 3..8 and y 1..3, on the ground.
  const sealed = () => new Room().ground().room(2, 2, 9, 9, 4);

  describe('an unlit room', () => {
    const room = sealed();
    const mesh = room.mesh();

    it('is dark by day: every vertex of the floor has no sky light and no block light', () => {
      for (const [x, z] of [[3, 3], [3, 9], [9, 3], [9, 9], [6, 6], [4, 7]]) {
        const v = topVertex(mesh.opaque, x, 1, z);
        expect([v.sky, v.block]).toEqual([0, 0]);
      }
    });

    it('is lit from the sky outside the walls', () => {
      const v = topVertex(mesh.opaque, 20, 1, 20);
      expect([v.sky, v.block, v.ao]).toEqual([1, 0, 1]);
      const roof = topVertex(mesh.opaque, 5, 5, 5);
      expect([roof.sky, roof.block, roof.ao]).toEqual([1, 0, 1]);
    });

    it('darkens the inside corner of the floor with ambient occlusion, a wall edge less, and the open floor not at all', () => {
      expect(topVertex(mesh.opaque, 3, 1, 3).ao).toBeCloseTo(0.55); // two walls meet
      expect(topVertex(mesh.opaque, 3, 1, 5).ao).toBeCloseTo(0.7);  // along one wall: its cell and the diagonal one
      expect(topVertex(mesh.opaque, 6, 1, 6).ao).toBe(1);
    });
  });

  describe('the same room with a lantern in it', () => {
    const lantern: [number, number, number] = [6, 1, 6];
    const room = sealed().set(...lantern, LANTERN);
    const mesh = room.mesh();

    it('gives the floor block light that falls off by one per block, and still no sky light', () => {
      // The corner vertex of the floor touches one open cell, (3, 1, 3), the other three are wall.
      const corner = topVertex(mesh.opaque, 3, 1, 3);
      expect(corner.sky).toBe(0);
      expect(corner.block).toBeCloseTo(levelAt(lantern, 3, 1, 3) / 15);
      expect(corner.ao).toBeCloseTo(0.55); // the corner is lit and still occluded: both are baked
    });

    it('averages the four cells around a vertex in the open', () => {
      // Vertex (4, 1, 4) touches the cells x 3..4, z 3..4.
      const cells: Array<[number, number]> = [[3, 3], [4, 3], [3, 4], [4, 4]];
      const expected = cells.reduce((sum, [x, z]) => sum + levelAt(lantern, x, 1, z), 0) / 4 / 15;
      const v = topVertex(mesh.opaque, 4, 1, 4);
      expect(v.block).toBeCloseTo(expected);
      expect(v.block).toBeCloseTo(10 / 15);
    });

    it('is brightest next to the lantern and darker toward the walls', () => {
      const near = topVertex(mesh.opaque, 6, 1, 6).block;
      const mid = topVertex(mesh.opaque, 4, 1, 4).block;
      const far = topVertex(mesh.opaque, 3, 1, 3).block;
      expect(near).toBeGreaterThan(mid);
      expect(mid).toBeGreaterThan(far);
      expect(far).toBeGreaterThan(0);
    });

    it('lights the ceiling and the walls too, and leaves the outside of the room unchanged', () => {
      const ceiling = quadsOf(mesh.opaque).find((q) => q.normal[1] === -1 && q.corners.every((c) => c.pos[1] === 4))!;
      expect(Math.max(...ceiling.corners.map((c) => c.block))).toBeGreaterThan(0);
      const wall = quadsOf(mesh.opaque).find((q) => q.normal[0] === 1 && q.corners.every((c) => c.pos[0] === 3 && c.pos[2] >= 3 && c.pos[2] <= 9))!;
      expect(wall).toBeDefined();
      expect(Math.max(...wall.corners.map((c) => c.block))).toBeGreaterThan(0);
      const outside = topVertex(mesh.opaque, 20, 1, 20);
      expect([outside.sky, outside.block]).toEqual([1, 0]);
    });

    it('makes the lantern glow, and marks no other block as a light', () => {
      const lanternQuads = quadsOf(mesh.cutout);
      expect(lanternQuads.length).toBe(6);
      for (const q of lanternQuads) for (const c of q.corners) expect(c.glow).toBe(1);
      for (const q of quadsOf(mesh.opaque)) for (const c of q.corners) expect(c.glow).toBe(0);
      // The lantern's own faces are bright whatever is around them.
      for (const q of lanternQuads) for (const c of q.corners) expect(c.block).toBeGreaterThanOrEqual(14 / 15);
    });

    it('is the same chunk with a different light: only the light attributes change', () => {
      const dark = sealed().mesh().opaque;
      const lit = sealed().set(...lantern, LANTERN).mesh().opaque;
      expect(Array.from(lit.positions)).toEqual(Array.from(dark.positions));
      expect(Array.from(lit.tints)).toEqual(Array.from(dark.tints));
      expect(Array.from(lit.layers)).toEqual(Array.from(dark.layers));
      expect(Array.from(lit.light)).not.toEqual(Array.from(dark.light));
    });
  });

  describe('smooth lighting', () => {
    // Ground with a stone roof at y = 6 over x 0..9, z 0..31, resting on a wall of columns only at x = 0 (so light comes in
    // from the east, where the sky is open). The cells under it fall off by one per block from the open edge.
    const roof = new Room().ground().fill(0, 6, 0, 9, 6, 31, BlockType.STONE);
    const light = roof.light();
    const mesh = roof.mesh();

    it('writes the average of the light of the four cells around each vertex', () => {
      let checked = 0;
      for (let x = 6; x <= 14; x++) {
        const v = topVertex(mesh.opaque, x, 1, 12);
        const sky = [[x - 1, 11], [x, 11], [x - 1, 12], [x, 12]].reduce((s, [cx, cz]) => s + light.sky(cx, 1, cz), 0) / 4 / 15;
        expect(v.sky).toBeCloseTo(sky);
        checked++;
      }
      expect(checked).toBe(9);
    });

    it('is not a step at the edge of the roof: neighbouring vertices differ by less than one level', () => {
      const values = [];
      for (let x = 6; x <= 14; x++) values.push(topVertex(mesh.opaque, x, 1, 12).sky);
      expect(values[0]).toBeLessThan(values[values.length - 1]);
      for (let i = 1; i < values.length; i++) expect(Math.abs(values[i] - values[i - 1])).toBeLessThanOrEqual(1 / 15 + 1e-6);
    });
  });

  describe('where light cannot go', () => {
    it('leaves out a wall cell, whose stored light is 0, instead of darkening the average with it', () => {
      // One block of stone beside a lantern's open floor: the vertex touching it averages only the open cells.
      const room = new Room().ground().set(10, 1, 10, BlockType.STONE).set(8, 1, 10, LANTERN);
      const mesh = room.mesh();
      const light = room.light();
      // Vertex (10, 1, 11) touches cells x 9..10, z 10..11; (10, 1, 10) is stone, so the other three are averaged.
      const v = topVertex(mesh.opaque, 10, 1, 11);
      const open: Array<[number, number]> = [[9, 10], [9, 11], [10, 11]];
      const expected = open.reduce((s, [x, z]) => s + light.block(x, 1, z), 0) / 3 / 15;
      expect(v.block).toBeCloseTo(expected);
    });

    it('does not read light round a corner of two touching walls', () => {
      // A sealed one-cell cave at (6, 1, 5) with stone at (5, 1, 5) and (6, 1, 6) on two sides, and a lantern in the
      // diagonal cell (5, 1, 6). The floor vertex at (6, 1, 6) has both of its side cells walled, so the lantern's cell
      // must not count: the vertex stays as dark as the cave.
      const room = new Room().ground()
        .fill(5, 1, 4, 7, 2, 6, BlockType.STONE).set(6, 1, 5, 0).set(6, 2, 5, BlockType.STONE) // a block of stone with a hole
        .set(5, 1, 6, LANTERN);
      const mesh = room.mesh();
      const v = topVertex(mesh.opaque, 6, 1, 6);
      expect([v.sky, v.block]).toEqual([0, 0]);
    });

    it('does not hold a lit stair or slab in the dark: their faces take the light of the air in front of them', () => {
      const lantern: [number, number, number] = [6, 1, 6];
      const room = sealed().set(...lantern, LANTERN)
        .set(4, 1, 4, ShapedBlock.STONE_BRICK_STAIRS, 0).set(8, 1, 8, ShapedBlock.STONE_BRICK_SLAB, 0);
      const mesh = room.mesh();
      for (const q of quadsOf(mesh.opaque)) {
        if (q.corners.some((c) => c.pos[0] > 3 && c.pos[0] < 9 && c.pos[2] > 3 && c.pos[2] < 9 && c.pos[1] >= 1 && c.pos[1] <= 2)) {
          const brightest = Math.max(...q.corners.map((c) => Math.max(c.sky, c.block)));
          expect(brightest).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('windows', () => {
    it('lights the room by day near the opening and less far from it', () => {
      const room = sealed().set(2, 2, 5, 0); // a hole in the west wall at head height... one block, at y = 2
      const mesh = room.mesh();
      const near = quadsOf(mesh.opaque).filter((q) => q.normal[1] === 1 && q.corners.every((c) => c.pos[1] === 1 && c.pos[0] > 2 && c.pos[0] < 9 && c.pos[2] > 2 && c.pos[2] < 9));
      const skyOf = (x: number) => Math.max(...near.flatMap((q) => q.corners.filter((c) => c.pos[0] === x).map((c) => c.sky)));
      expect(skyOf(3)).toBeGreaterThan(skyOf(8));
      expect(skyOf(8)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('water and plain tests', () => {
    it('lights water like anything else and does not darken it at a shore', () => {
      const room = new Room().ground().fill(0, 1, 0, 3, 1, 3, BlockType.WATER).fill(2, 2, 2, 2, 2, 2, BlockType.STONE);
      const mesh = room.mesh();
      expect(mesh.water.light.length).toBe((mesh.water.positions.length / 3) * 4);
      const top = quadsOf(mesh.water).filter((q) => q.normal[1] === 1);
      expect(top.length).toBeGreaterThan(0);
      for (const q of top) for (const c of q.corners) expect([c.sky, c.block, c.ao]).toEqual([1, 0, 1]);
    });

    it('keeps the biome tint out of the light', () => {
      const withLight = new Room().ground().set(5, 1, 5, BlockType.GRASS).mesh(0, 0, undefined, layout);
      const grass = quadsOf(withLight.opaque).find((q) => q.normal[1] === 1 && q.corners[0].pos[1] === 2)!;
      const bare = meshChunk(new NeighbourReader(new Array(9).fill(null).map((_, i) => {
        const c = new Chunk((i % 3) - 1, Math.floor(i / 3) - 1);
        if (i === 4) c.setCell(5, 1, 5, packCell(BlockType.GRASS));
        return c;
      })), 0, 0, registry, { layout });
      const grassBare = quadsOf(bare.opaque).find((q) => q.normal[1] === 1)!;
      expect(grass.corners.map((c) => c.tint)).toEqual(grassBare.corners.map((c) => c.tint));
      // The top of a grass block in the open is tinted green and fully lit: the tint is a colour, the light is a level.
      expect(grass.corners[0].tint).not.toEqual([1, 1, 1]);
      expect(grass.corners[0].sky).toBe(1);
    });

    it('lights a block as open sky when the mesher is given no light', () => {
      const m = meshChunk(new NeighbourReader(new Array(9).fill(null).map((_, i) => {
        const c = new Chunk((i % 3) - 1, Math.floor(i / 3) - 1);
        if (i === 4) c.setCell(5, 1, 5, packCell(WHITE));
        return c;
      })), 0, 0, registry);
      for (const q of quadsOf(m.opaque)) for (const c of q.corners) expect([c.sky, c.block, c.glow]).toEqual([1, 0, 0]);
    });

    it('marks the magic crystal as a glowing block at its own strength', () => {
      const m = new Room().ground().set(5, 1, 5, BlockType.MAGIC_CRYSTAL).mesh();
      for (const q of quadsOf(m.cutout)) for (const c of q.corners) expect(c.glow).toBeCloseTo(10 / 15);
    });
  });
});

describe('light attribute shape on real terrain', () => {
  it('has four floats per vertex in every bucket, all between 0 and 1', async () => {
    const { createWorkerGenerator } = await import('../../worldgen/createWorkerGenerator');
    const { runMeshJob } = await import('../../meshing/runMeshJob');
    const { LodLevel } = await import('../../worldConstants');
    const mesh = runMeshJob(0, 0, LodLevel.HIGH, createWorkerGenerator(registry), registry);
    let vertices = 0;
    for (const name of ['opaque', 'cutout', 'water'] as const) {
      const b = mesh[name];
      expect(b.light.length).toBe((b.positions.length / 3) * 4);
      expect(b.light.every((v) => v >= 0 && v <= 1)).toBe(true);
      vertices += b.positions.length / 3;
    }
    expect(vertices).toBeGreaterThan(1000);
    // The town has open sky, walls, interiors and lanterns, so the light is not one value.
    expect(new Set(Array.from(mesh.opaque.light)).size).toBeGreaterThan(8);
  });
});
