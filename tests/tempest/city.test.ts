import { describe, expect, it } from 'vitest';
import { TempestBlock as T, TempestFxBlock } from '../../content/blocksTempest';
import { Chunk } from '../../engine/Chunk';
import { cellId } from '../../engine/cell';
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from '../../engine/coords';
import { BlockType, WORLD_SEED } from '../../worldConstants';
import { NatureBlock } from '../../content/blocksNature';
import { TempestCityZone } from '../../worldgen/tempest/TempestCityZone';
import { SET_PIECE_BLOCKS } from '../../worldgen/tempest/DistrictPlanner';
import { createTempestLandmarks } from '../../worldgen/tempest/landmarks';
import { LANDMARKS, ROAD_GATES, landmarkById, worldX } from '../../worldgen/tempest/layout';
import { generateZoneChunk, zoneGround } from '../../worldgen/tempest/zoneChunk';
import { tolerant } from '../perf';

// The town as it is in the game: the district kits, the hand-built landmarks and the free set pieces on the planner's lots.

const zone = new TempestCityZone({ seed: WORLD_SEED });

const hashChunk = (z: TempestCityZone, cx: number, cz: number): number => {
  const chunk = new Chunk(cx, cz);
  generateZoneChunk(z, chunk);
  let h = 2166136261;
  for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) for (let y = WORLD_MIN_Y; y <= WORLD_MAX_Y; y++) h = Math.imul(h ^ chunk.getCell(lx, y, lz), 16777619);
  return h >>> 0;
};
const chunkAt = (x: number, z: number): [number, number] => [Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)];

/** Counts the blocks of one id in a box of the zone, by the zone's own answers. */
const count = (z: TempestCityZone, ids: number[], x0: number, z0: number, x1: number, z1: number, y0 = 8, y1 = 50): number => {
  let n = 0;
  for (let x = x0; x <= x1; x++) for (let zz = z0; zz <= z1; zz++) for (let y = y0; y <= y1; y++) if (ids.includes(cellId(z.sample(x, y, zz)))) n++;
  return n;
};

describe('the lots', () => {
  it('are all built by a real kit: no placeholder box house anywhere in the town', () => {
    let boxes = 0, fitted = 0, buildings = 0;
    for (const p of zone.planner.lots) {
      if (p.kind !== 'building' || p.piece) continue;
      buildings++;
      const choice = zone.choiceOf(p);
      if (!choice) boxes++;
      else if (choice.fitted) fitted++;
    }
    expect(buildings).toBeGreaterThan(200);
    expect(boxes).toBe(0);
    // Plots bigger than any kit takes are built on a part of them, with lawn round: a handful.
    expect(fitted).toBeLessThan(15);
  });

  it('give every district its kinds of house: shops on the avenue, storehouses at the far west, inns in the tourism sector', () => {
    const names = (district: string): Set<string> => new Set(zone.planner.lots.filter((p) => p.kind === 'building' && p.lot.district === district).map((p) => zone.choiceOf(p)!.kit.name));
    expect(names('commercial').has('shop')).toBe(true);
    expect(names('storage').has('storehouse')).toBe(true);
    expect(names('tourism').has('inn') || names('tourism').has('garden-house')).toBe(true);
    expect(names('residential').has('townhouse')).toBe(true);
  });

  it('put the three free set pieces on their lots: the bell tower by the square, the market hall and the bath house in the tourism sector', () => {
    for (const [blockId, piece] of Object.entries(SET_PIECE_BLOCKS)) {
      const lots = zone.planner.lots.filter((p) => p.block === blockId);
      expect(lots.length, blockId).toBe(1);
      expect(lots[0].piece, blockId).toBe(piece);
      expect(lots[0].kind).toBe('building');
      const l = lots[0].lot;
      // Something tall stands in the middle of the lot.
      const cx = l.x + (l.w >> 1), cz = l.z + (l.d >> 1);
      let top = 0;
      for (let y = 8; y < 60; y++) if (zone.sample(cx, y, cz) !== 0) top = y;
      expect(top, `${piece} at ${cx},${cz}`).toBeGreaterThan(12);
    }
  });
});

describe('the landmarks', () => {
  const landmarks = createTempestLandmarks();

  it('are all there: every layout landmark with a spec has blocks of its own where the layout puts it', () => {
    let checked = 0;
    for (const l of LANDMARKS) {
      const spec = landmarks.covering(l.id) ?? landmarks.get(l.id);
      if (!spec || spec.free || spec.partOf) continue;
      const f = spec.footprint;
      let solid = 0;
      for (let x = f.x0; x <= f.x1; x++) for (let zz = f.z0; zz <= f.z1; zz++) {
        const ground = zone.groundAt(x, zz);
        for (let y = ground + 1; y <= ground + 30; y++) if (zone.sample(x, y, zz) !== 0) { solid++; break; }
      }
      expect(solid, `${l.id} (${spec.id})`).toBeGreaterThan(8);
      checked++;
    }
    expect(checked).toBeGreaterThan(15);
  });

  it('stand where the plan says: the Town Hall at the head of the north avenue behind teal roofs, the gate roads open, the cave sealed', () => {
    // The hall's hip roof is teal.
    const hall = landmarkById('town-hall')!.shape as { x0: number; z0: number; x1: number; z1: number };
    expect(count(zone, [T.TEAL_ROOF, T.TEAL_ROOF_STAIRS, T.TEAL_ROOF_SLAB], hall.x0, hall.z0, hall.x1, hall.z1, 10, 40)).toBeGreaterThan(100);
    // Every gate has its passage open at the road's height (a person fits under the lintel).
    for (const g of Object.values(ROAD_GATES)) {
      const y = zone.groundAt(g.x, g.z);
      expect(zone.sample(g.x, y + 1, g.z), `${g.x},${g.z}`).toBe(0);
      expect(zone.sample(g.x, y + 2, g.z), `${g.x},${g.z}`).toBe(0);
    }
  });

  it('keep trees out of their ground: no crown inside the arena ring', () => {
    const arena = landmarkById('arena')!.shape as { cx: number; cz: number; r: number };
    const leaves = [NatureBlock.SAKURA_LEAVES, NatureBlock.CEDAR_LEAVES, BlockType.LEAVES, BlockType.BIRCH_LEAVES];
    expect(count(zone, leaves, arena.cx - 16, arena.cz - 16, arena.cx + 16, arena.cz + 16, 9, 20)).toBe(0);
  });
});

describe('the town in chunks', () => {
  const SAMPLE: Array<[string, number, number]> = [
    ['the Central Square', ...chunkAt(worldX(0), 0)],
    ['the compound', ...chunkAt(worldX(0), -165)],
    ['the arena', ...chunkAt(worldX(176), -250)],
    ['the west gate', ...chunkAt(worldX(-187), 0)],
    ['the bridge', ...chunkAt(worldX(337), 0)],
    ['the market hall', ...chunkAt(worldX(70), 70)],
    ['a diagonal street', ...chunkAt(worldX(-100), -80)],
  ];

  it('come out the same from any order and with a cache of one lot', () => {
    const a = new TempestCityZone({ seed: WORLD_SEED });
    const b = new TempestCityZone({ seed: WORLD_SEED, lotCache: 1 });
    const forward = SAMPLE.map(([, cx, cz]) => hashChunk(a, cx, cz));
    const backward = [...SAMPLE].reverse().map(([, cx, cz]) => hashChunk(b, cx, cz)).reverse();
    expect(backward).toEqual(forward);
    expect(new Set(forward).size).toBe(SAMPLE.length);
  });

  it('agree with single cells asked cold, in any order, where buildings, landmarks and pieces stand', () => {
    for (const [name, cx, cz] of SAMPLE) {
      const chunk = new Chunk(cx, cz);
      generateZoneChunk(zone, chunk);
      const cold = new TempestCityZone({ seed: WORLD_SEED, lotCache: 2 });
      let n = 0;
      for (let k = 0; k < 400; k++) {
        const lx = (k * 7) % CHUNK_SIZE, lz = (k * 13) % CHUNK_SIZE;
        const x = cx * CHUNK_SIZE + lx, zz = cz * CHUNK_SIZE + lz;
        const ground = zoneGround(zone, x, zz);
        const y = ground + (k % 27);
        if (y <= 3) continue;
        expect(cold.getCell(x, y, zz, ground), `${name} ${x},${y},${zz}`).toBe(chunk.getCell(lx, y, lz));
        n++;
      }
      expect(n).toBeGreaterThan(300);
    }
  });

  it('build quickly: 9 ms a chunk on average on the development machine, under 40 with a lot of slack for a busy one', () => {
    const z = new TempestCityZone({ seed: WORLD_SEED });
    const times: number[] = [];
    for (const [, cx, cz] of SAMPLE) {
      const t = performance.now();
      generateZoneChunk(z, new Chunk(cx, cz));
      times.push(performance.now() - t);
    }
    const mean = times.reduce((s, v) => s + v, 0) / times.length;
    expect(mean).toBeLessThan(tolerant(40));
  });
});

describe('the smoke vents', () => {
  it('crown the chimneys of the houses: clay pots on a slab cap, standing on something, with open air above', () => {
    const vents: Array<[number, number, number]> = [];
    for (let x = 1240; x <= 1760; x++) {
      for (let zz = -260; zz <= 260; zz++) {
        for (let y = 10; y <= 40; y++) if (cellId(zone.sample(x, y, zz)) === TempestFxBlock.SMOKE_VENT) vents.push([x, y, zz]);
      }
    }
    // About one house in three has a chimney, and there are 269 houses.
    expect(vents.length).toBeGreaterThan(20);
    for (const [x, y, zz] of vents) {
      const below = cellId(zone.sample(x, y - 1, zz));
      expect(below, `${x},${y},${zz}`).not.toBe(0);
      expect(cellId(zone.sample(x, y + 1, zz)), `${x},${y},${zz}`).toBe(0);
    }
  });
});
