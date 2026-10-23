import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../content/blocks';
import { Chunk } from '../engine/Chunk';
import { cellId, packCell } from '../engine/cell';
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y, chunkCoord, localCoord } from '../engine/coords';
import {
  ChunkGrid, LIGHT_MAX, LIGHT_RING, LightData, SKY_FULL, blockOf, computeChunkLight, skyOf,
} from '../meshing/LightEngine';
import { LegacyZoneAdapter } from '../worldgen/LegacyZoneAdapter';
import { BlockType } from '../worldConstants';

const registry = createDefaultRegistry();
// Ids far above every range the game uses, so other branches adding blocks never collide with them.
const GLOWSTONE = 4001;
registry.register({ id: GLOWSTONE, name: 'test:glowstone', color: '#ffee88', solid: true, opaque: true, emits: 12 });
const HEAVY_FOG = 4002;
registry.register({ id: HEAVY_FOG, name: 'test:fog', color: '#cccccc', solid: false, opaque: false, emits: 0, lightDim: 3 });

const STONE = BlockType.STONE;
const GLASS = BlockType.GLASS;
const LANTERN = BlockType.LANTERN;

// A small editable world in block coordinates. Anything not set is air, and chunks appear when first written to.
class World {
  private readonly chunks = new Map<string, Chunk>();

  set(x: number, y: number, z: number, id: number): this {
    const cx = chunkCoord(x);
    const cz = chunkCoord(z);
    const key = `${cx},${cz}`;
    let chunk = this.chunks.get(key);
    if (!chunk) this.chunks.set(key, (chunk = new Chunk(cx, cz)));
    chunk.setCell(localCoord(x), y, localCoord(z), packCell(id));
    return this;
  }

  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number): this {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, y, z, id);
    return this;
  }

  // Ground at y = 0 under the 3x3 chunks around chunk (0, 0), the way a flat world would be.
  ground(): this {
    return this.fill(-CHUNK_SIZE, -1, -CHUNK_SIZE, 2 * CHUNK_SIZE - 1, 0, 2 * CHUNK_SIZE - 1, STONE);
  }

  id(x: number, y: number, z: number): number {
    const chunk = this.chunks.get(`${chunkCoord(x)},${chunkCoord(z)}`);
    return chunk ? cellId(chunk.getCell(localCoord(x), y, localCoord(z))) : 0;
  }

  light(cx = 0, cz = 0): LightData {
    return computeChunkLight(new ChunkGrid(this.chunks.values()), cx, cz, registry);
  }
}

const manhattan = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

describe('light engine', () => {
  it('open sky is 15 and there is no block light without a source', () => {
    const light = new World().ground().light();
    for (const [lx, y, lz] of [[0, 1, 0], [16, 1, 16], [31, 60, 31], [-1, 1, -1], [32, 1, 32], [5, WORLD_MAX_Y, 5]]) {
      expect(light.sky(lx, y, lz)).toBe(LIGHT_MAX);
      expect(light.block(lx, y, lz)).toBe(0);
    }
    expect(light.sky(10, 0, 10)).toBe(0); // inside the ground
    expect(light.sky(10, -1, 10)).toBe(0);
  });

  it('answers for the ring around the chunk and nowhere else', () => {
    const light = new World().ground().light();
    expect(light.sky(-LIGHT_RING, 1, -LIGHT_RING)).toBe(LIGHT_MAX);
    expect(light.sky(CHUNK_SIZE, 1, CHUNK_SIZE)).toBe(LIGHT_MAX);
    expect(() => light.get(-2, 1, 0)).toThrow(RangeError);
    expect(() => light.get(0, 1, CHUNK_SIZE + 1)).toThrow(RangeError);
  });

  it('reads above the world as open sky and below it as dark', () => {
    const light = new World().ground().light();
    expect(light.get(3, WORLD_MAX_Y + 5, 3)).toBe(SKY_FULL);
    expect(light.get(3, WORLD_MIN_Y - 1, 3)).toBe(0);
  });

  it('packs sky in the high nibble and block light in the low one', () => {
    const world = new World().ground().set(8, 3, 8, LANTERN);
    const light = world.light();
    const packed = light.get(9, 3, 8);
    expect(skyOf(packed)).toBe(light.sky(9, 3, 8));
    expect(blockOf(packed)).toBe(light.block(9, 3, 8));
    expect(skyOf(packed)).toBe(15);
    expect(blockOf(packed)).toBe(14);
  });

  it('is an empty world of open sky', () => {
    const light = computeChunkLight(new ChunkGrid(), 4, 4, registry);
    expect(light.get(0, 0, 0)).toBe(SKY_FULL);
    expect(light.get(20, 100, 3)).toBe(SKY_FULL);
    expect(light.storedSections()).toBe(0);
  });

  describe('sky light under a roof', () => {
    // A stone roof over everything at y = 6 with one hole at (10, 6, 10). The room under it is y = 1..5.
    const hole = [10, 6, 10];
    const world = new World().ground().fill(-CHUNK_SIZE, 6, -CHUNK_SIZE, 2 * CHUNK_SIZE - 1, 6, 2 * CHUNK_SIZE - 1, STONE);
    world.set(hole[0], hole[1], hole[2], 0);
    const light = world.light();

    it('is full under the opening and above the roof', () => {
      for (let y = 1; y <= 5; y++) expect(light.sky(10, y, 10)).toBe(15);
      expect(light.sky(10, 7, 10)).toBe(15);
      expect(light.sky(25, 7, 25)).toBe(15);
    });

    it('falls off by one per block of distance from the opening', () => {
      for (const y of [1, 3, 5]) {
        for (let dx = -20; dx <= 20; dx++) {
          for (const dz of [0, 4, -9]) {
            const x = 10 + dx;
            const z = 10 + dz;
            if (x < -1 || x > 32 || z < -1 || z > 32) continue;
            expect(light.sky(x, y, z), `at (${x}, ${y}, ${z})`).toBe(Math.max(0, 15 - Math.abs(dx) - Math.abs(dz)));
          }
        }
      }
    });

    it('is dark far from the opening and inside the roof', () => {
      expect(light.sky(31, 3, 31)).toBe(0);
      expect(light.sky(0, 6, 0)).toBe(0);
    });

    it('a sealed room is dark by day', () => {
      const sealed = new World().ground().fill(-CHUNK_SIZE, 6, -CHUNK_SIZE, 2 * CHUNK_SIZE - 1, 6, 2 * CHUNK_SIZE - 1, STONE).light();
      for (const [x, z] of [[0, 0], [16, 16], [31, 5]]) expect(sealed.sky(x, 3, z)).toBe(0);
      expect(sealed.sky(16, 7, 16)).toBe(15);
    });
  });

  describe('block light', () => {
    it('a lantern spreads from 15 down to 0 at radius 15', () => {
      const lantern = [16, 5, 16];
      const light = new World().ground().set(lantern[0], lantern[1], lantern[2], LANTERN).light();
      expect(light.block(16, 5, 16)).toBe(15);
      let lit = 0;
      for (let y = 1; y <= 25; y++) {
        for (let z = 1; z <= 31; z++) {
          for (let x = 1; x <= 31; x++) {
            const d = manhattan([x, y, z], lantern);
            if (d > 0 && y === 0) continue;
            expect(light.block(x, y, z), `at (${x}, ${y}, ${z})`).toBe(Math.max(0, 15 - d));
            if (light.block(x, y, z) > 0) lit++;
          }
        }
      }
      expect(lit).toBeGreaterThan(1000);
      expect(light.block(16 + 14, 5, 16)).toBe(1);
      expect(light.block(16 + 15, 5, 16)).toBe(0);
      expect(light.block(16, 5 + 15, 16)).toBe(0);
    });

    it('does not enter solid ground, and the lantern does not change sky light', () => {
      const light = new World().ground().set(16, 1, 16, LANTERN).light();
      expect(light.block(16, 0, 16)).toBe(0);
      expect(light.block(16, 2, 16)).toBe(14);
      expect(light.sky(16, 2, 16)).toBe(15);
    });

    it('an opaque emitter lights its neighbours and keeps its own level', () => {
      const light = new World().ground().set(8, 1, 8, GLOWSTONE).light();
      expect(light.block(8, 1, 8)).toBe(12);
      expect(light.block(9, 1, 8)).toBe(11);
      expect(light.block(8, 5, 8)).toBe(8);
      expect(light.block(8 + 12, 1, 8)).toBe(0);
    });

    it('two sources take the brighter of the two', () => {
      const light = new World().ground().set(8, 1, 8, LANTERN).set(12, 1, 8, LANTERN).light();
      expect(light.block(10, 1, 8)).toBe(13);
      expect(light.block(9, 1, 8)).toBe(14);
    });

    it('a lantern in a sealed room lights the room and no more', () => {
      const w = new World().ground();
      w.fill(4, 1, 4, 12, 6, 12, STONE).fill(5, 2, 5, 11, 5, 11, 0).set(8, 3, 8, LANTERN);
      w.fill(4, 1, 4, 12, 1, 12, STONE);
      const light = w.light();
      expect(light.block(8, 3, 8)).toBe(15);
      expect(light.block(5, 2, 5)).toBe(15 - 3 - 1 - 3);
      expect(light.sky(8, 3, 9)).toBe(0); // dark by day, lit by the lantern
      expect(light.block(8, 3, 9)).toBe(14);
      expect(light.block(14, 2, 8)).toBe(0); // outside the walls
      expect(light.sky(14, 2, 8)).toBe(15);
    });
  });

  describe('what light passes through', () => {
    // A wall across x = 10, tall enough that going over the top costs more light than there is.
    const wall = (id: number) => new World().ground().set(6, 2, 8, LANTERN).fill(10, 1, -CHUNK_SIZE, 10, 20, 2 * CHUNK_SIZE - 1, id).light();

    it('stone blocks block light', () => {
      const light = wall(STONE);
      expect(light.block(9, 2, 8)).toBe(12);
      expect(light.block(11, 2, 8)).toBe(0);
      expect(light.block(12, 2, 8)).toBe(0);
    });

    it('glass transmits it', () => {
      const light = wall(GLASS);
      expect(light.block(10, 2, 8)).toBe(11);
      expect(light.block(11, 2, 8)).toBe(10);
      expect(light.block(12, 2, 8)).toBe(9);
    });

    it('a glass roof lets the sun straight down, a stone roof does not', () => {
      const room = (id: number) => {
        const w = new World().ground().fill(-CHUNK_SIZE, 6, -CHUNK_SIZE, 2 * CHUNK_SIZE - 1, 6, 2 * CHUNK_SIZE - 1, id);
        return w.light();
      };
      expect(room(GLASS).sky(16, 3, 16)).toBe(15);
      expect(room(GLASS).sky(30, 1, 2)).toBe(15);
      expect(room(STONE).sky(16, 3, 16)).toBe(0);
    });

    it('leaves let light through but shade it by one per layer', () => {
      const canopy = (layers: number) => new World().ground().fill(-CHUNK_SIZE, 6, -CHUNK_SIZE, 2 * CHUNK_SIZE - 1, 5 + layers, 2 * CHUNK_SIZE - 1, BlockType.LEAVES).light();
      expect(canopy(1).sky(16, 7, 16)).toBe(15);
      expect(canopy(1).sky(16, 6, 16)).toBe(14);
      expect(canopy(1).sky(16, 5, 16)).toBe(13);
      expect(canopy(3).sky(16, 5, 16)).toBe(11);
      expect(canopy(3).sky(16, 1, 16)).toBe(7);
    });

    it('leaves also pass block light, at the usual cost', () => {
      const light = new World().ground().set(8, 3, 8, LANTERN).fill(9, 3, 8, 10, 3, 8, BlockType.LEAVES).light();
      expect(light.block(11, 3, 8)).toBe(12);
    });

    it('a block with a bigger lightDim costs that much per block', () => {
      const light = new World().ground().set(8, 3, 8, LANTERN).set(9, 3, 8, HEAVY_FOG).light();
      expect(light.block(9, 3, 8)).toBe(12);
      expect(light.block(10, 3, 8)).toBe(11);
      // the same lantern with nothing beside it
      expect(new World().ground().set(8, 3, 8, LANTERN).light().block(10, 3, 8)).toBe(13);
    });

    it('slabs and stairs are opaque and stop light', () => {
      const slab = registry.byName('voxelverse:stone_brick_slab').id;
      const light = new World().ground().set(8, 2, 8, LANTERN).fill(10, 1, -CHUNK_SIZE, 10, 20, 2 * CHUNK_SIZE - 1, slab).light();
      expect(light.block(9, 2, 8)).toBe(14);
      expect(light.block(11, 2, 8)).toBe(0);
    });

    it('water, plants and fences are see-through', () => {
      const w = new World().ground().set(8, 3, 8, LANTERN);
      w.set(9, 3, 8, BlockType.WATER).set(10, 3, 8, BlockType.TALL_GRASS).set(11, 3, 8, BlockType.WOOD_FENCE);
      const light = w.light();
      expect(light.block(12, 3, 8)).toBe(11);
    });
  });

  describe('chunk borders', () => {
    it('a lantern beside the border lights both chunks the same', () => {
      const world = new World().ground().set(30, 3, 12, LANTERN).fill(20, 1, 16, 25, 5, 16, STONE);
      const left = world.light(0, 0);
      const right = world.light(1, 0);
      expect(left.block(31, 3, 12)).toBe(14);
      expect(left.block(32, 3, 12)).toBe(13); // the ring
      expect(right.block(0, 3, 12)).toBe(13);
      expect(right.block(-1, 3, 12)).toBe(14); // the ring sees the lantern's side
      expect(right.block(5, 3, 12)).toBe(8);
      for (let y = 0; y < 12; y++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          expect(right.get(-1, y, z)).toBe(left.get(CHUNK_SIZE - 1, y, z));
          expect(right.get(0, y, z)).toBe(left.get(CHUNK_SIZE, y, z));
        }
      }
    });

    it('sky light spreading out from under a roof agrees across the border', () => {
      const w = new World().ground().fill(-CHUNK_SIZE, 6, -CHUNK_SIZE, 2 * CHUNK_SIZE - 1, 6, 2 * CHUNK_SIZE - 1, STONE);
      w.set(CHUNK_SIZE + 2, 6, 10, 0); // a hole in the next chunk over
      const left = w.light(0, 0);
      const right = w.light(1, 0);
      expect(left.sky(31, 3, 10)).toBe(15 - 3);
      expect(left.sky(32, 3, 10)).toBe(15 - 2);
      expect(left.sky(20, 3, 10)).toBe(15 - 14);
      for (let y = 0; y < 8; y++) {
        for (let z = -1; z <= CHUNK_SIZE; z++) {
          expect(right.get(-1, y, z)).toBe(left.get(CHUNK_SIZE - 1, y, z));
          expect(right.get(0, y, z)).toBe(left.get(CHUNK_SIZE, y, z));
        }
      }
    });

    it('the north and south borders match too, on a diagonal corner', () => {
      const w = new World().ground().set(31, 2, 31, LANTERN).fill(-CHUNK_SIZE, 8, -CHUNK_SIZE, 2 * CHUNK_SIZE - 1, 8, 2 * CHUNK_SIZE - 1, STONE);
      const a = w.light(0, 0);
      const b = w.light(1, 1);
      const c = w.light(1, 0);
      const d = w.light(0, 1);
      // The corner cell of chunk a's ring is cell (0, 0) of chunk b, and the other way round.
      expect(a.get(CHUNK_SIZE, 2, CHUNK_SIZE)).toBe(b.get(0, 2, 0));
      expect(b.get(-1, 2, -1)).toBe(a.get(CHUNK_SIZE - 1, 2, CHUNK_SIZE - 1));
      expect(a.block(CHUNK_SIZE, 2, CHUNK_SIZE)).toBe(13);
      expect(c.get(0, 2, CHUNK_SIZE - 1)).toBe(a.get(CHUNK_SIZE, 2, CHUNK_SIZE - 1));
      expect(d.get(CHUNK_SIZE - 1, 2, 0)).toBe(a.get(CHUNK_SIZE - 1, 2, CHUNK_SIZE));
    });

    it('real terrain has no seams: every shared cell agrees between neighbours', () => {
      // The Town of Beginnings with the Great Tower, which has rooms, windows, lanterns and a lot of roof.
      const generator = new LegacyZoneAdapter(registry);
      const chunks = new Map<string, Chunk>();
      for (let cz = -2; cz <= 1; cz++) {
        for (let cx = -2; cx <= 2; cx++) {
          const chunk = new Chunk(cx, cz);
          generator.generateChunk(chunk);
          chunks.set(`${cx},${cz}`, chunk);
        }
      }
      const grid = new ChunkGrid(chunks.values());
      const lightOf = (cx: number, cz: number) => computeChunkLight(grid, cx, cz, registry);
      let compared = 0;
      for (const [ax, az, bx, bz] of [[-1, -1, 0, -1], [0, -1, 0, 0], [-1, 0, 0, 0], [0, 0, 1, 0]] as const) {
        const a = lightOf(ax, az);
        const b = lightOf(bx, bz);
        const dx = (bx - ax) * CHUNK_SIZE;
        const dz = (bz - az) * CHUNK_SIZE;
        // Every cell in the 2-block-wide strip both chunks can see, in a's local coordinates.
        for (let y = WORLD_MIN_Y; y <= WORLD_MIN_Y + 140; y++) {
          for (let l = -1; l <= CHUNK_SIZE; l++) {
            for (const s of [CHUNK_SIZE - 1, CHUNK_SIZE]) {
              const lx = dx ? s : l;
              const lz = dz ? s : l;
              expect(b.get(lx - dx, y, lz - dz), `chunk ${ax},${az} vs ${bx},${bz} at ${lx},${y},${lz}`).toBe(a.get(lx, y, lz));
              compared++;
            }
          }
        }
      }
      expect(compared).toBeGreaterThan(30000);
    });
  });

  describe('determinism', () => {
    it('the same cells give identical light, even with other chunks lit in between', () => {
      const world = new World().ground().set(14, 4, 14, LANTERN).fill(-CHUNK_SIZE, 9, -CHUNK_SIZE, 2 * CHUNK_SIZE - 1, 9, 2 * CHUNK_SIZE - 1, BlockType.LEAVES);
      const first = world.light(0, 0);
      world.light(1, 0); // leaves the shared scratch buffers in some other state
      new World().ground().set(3, 3, 3, LANTERN).fill(0, 1, 0, 20, 70, 3, STONE).light();
      const second = world.light(0, 0);
      for (let y = -2; y < 40; y++) {
        for (let z = -1; z <= CHUNK_SIZE; z++) {
          for (let x = -1; x <= CHUNK_SIZE; x++) expect(second.get(x, y, z)).toBe(first.get(x, y, z));
        }
      }
      expect(second.storedSections()).toBe(first.storedSections());
    });

    it('real chunks light the same twice', () => {
      const generator = new LegacyZoneAdapter(registry);
      const grid = new ChunkGrid();
      for (let cz = 8; cz <= 10; cz++) {
        for (let cx = -1; cx <= 1; cx++) {
          const chunk = new Chunk(cx, cz);
          generator.generateChunk(chunk);
          grid.add(chunk);
        }
      }
      const a = computeChunkLight(grid, 0, 9, registry);
      const b = computeChunkLight(grid, 0, 9, registry);
      for (let y = WORLD_MIN_Y; y < 140; y++) {
        for (let z = -1; z <= CHUNK_SIZE; z++) {
          for (let x = -1; x <= CHUNK_SIZE; x++) expect(b.get(x, y, z)).toBe(a.get(x, y, z));
        }
      }
    });
  });

  describe('edges', () => {
    it('a missing neighbour reads as air', () => {
      const chunk = new Chunk(0, 0);
      for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) chunk.setCell(x, 0, z, packCell(STONE));
      const light = computeChunkLight(new ChunkGrid([chunk]), 0, 0, registry);
      expect(light.sky(0, 1, 0)).toBe(15);
      expect(light.sky(-1, 1, -1)).toBe(15);
    });

    it('a lantern in the top layer of the highest section still lights the cells above it', () => {
      const w = new World().ground().set(8, 15, 8, LANTERN).set(8, 16, 8, 0);
      const light = w.light();
      expect(light.block(8, 16, 8)).toBe(14);
      expect(light.block(8, 25, 8)).toBe(5);
      expect(light.block(8, 29, 8)).toBe(1);
      expect(light.block(8, 30, 8)).toBe(0);
    });

    it('works at the top of the world', () => {
      const w = new World().ground().set(8, WORLD_MAX_Y, 8, STONE).set(9, WORLD_MAX_Y - 1, 8, LANTERN);
      const light = w.light();
      expect(light.block(9, WORLD_MAX_Y - 1, 8)).toBe(15);
      expect(light.block(10, WORLD_MAX_Y - 1, 8)).toBe(14);
      expect(light.sky(8, WORLD_MAX_Y, 8)).toBe(0);
      expect(light.sky(8, WORLD_MAX_Y - 1, 8)).toBe(14);
    });

    it('stores uniform sections as one byte', () => {
      const light = new World().ground().light();
      // Only the sections the ground and the first rows of sky touch need cells.
      expect(light.storedSections()).toBeLessThanOrEqual(2);
    });
  });
});

// A slow, plain version of the same rules to check the engine against: relax every cell from its neighbours until
// nothing changes, over a box of the world. It shares no code with the engine.
const referenceLight = (world: World, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) => {
  const w = x1 - x0 + 1;
  const d = z1 - z0 + 1;
  const h = y1 - y0 + 1;
  const at = (x: number, y: number, z: number) => ((y - y0) * d + (z - z0)) * w + (x - x0);
  const ids = new Uint16Array(w * d * h);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) ids[at(x, y, z)] = world.id(x, y, z);
  const opaque = (id: number) => registry.has(id) && registry.get(id).opaque;
  const cost = (id: number) => Math.max(1, registry.lightDim(id));
  const sky = new Uint8Array(ids.length);
  const block = new Uint8Array(ids.length);
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      let blocked = false;
      for (let y = y1; y >= y0; y--) {
        const id = ids[at(x, y, z)];
        if (opaque(id) || registry.lightDim(id) > 0) blocked = true;
        if (!blocked) sky[at(x, y, z)] = 15;
        block[at(x, y, z)] = registry.emission(id);
      }
    }
  }
  const relax = (light: Uint8Array) => {
    for (let changed = true; changed;) {
      changed = false;
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          for (let x = x0; x <= x1; x++) {
            const id = ids[at(x, y, z)];
            if (opaque(id)) continue;
            let best = light[at(x, y, z)];
            for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
              const nx = x + dx;
              const ny = y + dy;
              const nz = z + dz;
              if (nx < x0 || nx > x1 || nz < z0 || nz > z1 || ny < y0 || ny > y1) continue;
              best = Math.max(best, light[at(nx, ny, nz)] - cost(id));
            }
            if (best > light[at(x, y, z)]) { light[at(x, y, z)] = best; changed = true; }
          }
        }
      }
    }
  };
  relax(sky);
  relax(block);
  return (x: number, y: number, z: number) => (sky[at(x, y, z)] << 4) | block[at(x, y, z)];
};

describe('light engine against a plain reference', () => {
  const random = (seed: number) => () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const slab = registry.byName('voxelverse:stone_brick_slab').id;

  for (const seed of [1, 2, 3]) {
    it(`agrees on a random world with caves, canopies, glass and lanterns (seed ${seed})`, () => {
      const rnd = random(seed);
      const world = new World().ground();
      for (let z = -24; z <= 55; z++) {
        for (let x = -24; x <= 55; x++) {
          const top = 2 + Math.floor(rnd() * 12);
          for (let y = 1; y <= top; y++) if (rnd() > 0.2) world.set(x, y, z, STONE);
          for (let y = top + 1; y <= 22; y++) {
            const r = rnd();
            if (r < 0.04) world.set(x, y, z, STONE);
            else if (r < 0.07) world.set(x, y, z, BlockType.LEAVES);
            else if (r < 0.09) world.set(x, y, z, GLASS);
            else if (r < 0.10) world.set(x, y, z, HEAVY_FOG);
            else if (r < 0.105) world.set(x, y, z, slab);
            else if (r < 0.1075) world.set(x, y, z, LANTERN);
            else if (r < 0.108) world.set(x, y, z, GLOWSTONE);
          }
        }
      }
      const expected = referenceLight(world, -24, 55, -24, 55, -3, 40);
      for (const [cx, cz] of [[0, 0]]) {
        const light = world.light(cx, cz);
        let lit = 0;
        for (let y = -3; y <= 40; y++) {
          for (let z = -1; z <= CHUNK_SIZE; z++) {
            for (let x = -1; x <= CHUNK_SIZE; x++) {
              const got = light.get(x, y, z);
              if (got !== expected(x, y, z)) {
                expect.fail(`at (${x}, ${y}, ${z}): sky ${skyOf(got)} block ${blockOf(got)}, reference sky ${skyOf(expected(x, y, z))} block ${blockOf(expected(x, y, z))}`);
              }
              if (blockOf(got) > 0 && skyOf(got) < 15) lit++;
            }
          }
        }
        expect(lit).toBeGreaterThan(200); // the world is busy enough for the comparison to mean something
      }
    });
  }
});

describe('light timing (LegacyZoneAdapter chunks, node)', () => {
  const TARGET_MS = 15;
  const generator = new LegacyZoneAdapter(registry);
  const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const SPOTS: Array<[string, number, number]> = [
    ['spawn (Greensom)', 0, 9],
    ['Town of Beginnings', 0, 0],
    ['Great Tower corner', -1, -1],
    ['Tempest Coliseum', 53, 0],
  ];

  for (const [name, cx, cz] of SPOTS) {
    it(`lights ${name} in under ${TARGET_MS} ms`, () => {
      const grid = new ChunkGrid();
      const genTimes: number[] = [];
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const chunk = new Chunk(cx + dx, cz + dz);
          const t = performance.now();
          generator.generateChunk(chunk);
          genTimes.push(performance.now() - t);
          grid.add(chunk);
        }
      }
      for (let i = 0; i < 3; i++) computeChunkLight(grid, cx, cz, registry); // warm up the JIT
      const times: number[] = [];
      let light = computeChunkLight(grid, cx, cz, registry);
      for (let i = 0; i < 9; i++) {
        const t = performance.now();
        light = computeChunkLight(grid, cx, cz, registry);
        times.push(performance.now() - t);
      }
      const med = median(times);
      console.log(`[light] ${name} chunk (${cx}, ${cz}): median ${med.toFixed(1)} ms, min ${Math.min(...times).toFixed(1)} ms, `
        + `max ${Math.max(...times).toFixed(1)} ms, ${light.storedSections()} stored sections, `
        + `generating the 9 chunks took ${genTimes.reduce((a, b) => a + b, 0).toFixed(0)} ms`);
      expect(med).toBeLessThan(TARGET_MS);
    });
  }
});
