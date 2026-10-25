import { describe, expect, it } from 'vitest';
import { TempestBlock as T } from '../../content/blocksTempest';
import { NatureBlock } from '../../content/blocksNature';
import { Chunk } from '../../engine/Chunk';
import { cellId } from '../../engine/cell';
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from '../../engine/coords';
import { BlockType, WATER_LEVEL, WORLD_SEED } from '../../worldConstants';
import { TempestZone } from '../../zones/TempestZone';
import { Zone, LodLevel } from '../../zones/Zone';
import { Rng } from '../../worldgen/noise';
import { Blueprint } from '../../worldgen/structures/Blueprint';
import { BlueprintBuilder } from '../../worldgen/structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../worldgen/structures/BuildingKit';
import { KitRegistry } from '../../worldgen/structures/KitRegistry';
import { Lot } from '../../worldgen/structures/Lot';
import { StylePack } from '../../worldgen/structures/StylePack';
import { TempestCityZone, growMarkedTrees } from '../../worldgen/tempest/TempestCityZone';
import { POND_WATER_Y } from '../../worldgen/tempest/terrain';
import { generateZoneChunk, zoneGround } from '../../worldgen/tempest/zoneChunk';
import { createTempestKits } from '../../worldgen/tempest/kits';
import { RING_RADIUS, ringZone } from '../../worldgen/tempest/roundabout';
import { ROAD_GATES, TEMPEST_CENTER_X, farmField, isWooded, landmarkById, roadAt, worldX } from '../../worldgen/tempest/layout';
import { timeoutMs, tolerant } from '../perf';

// The zone with the placeholder box house on every lot and no hand-built landmarks: these tests are about the zone's own machinery
// (lookups, caches, the countryside); tests/tempest/city.test.ts is about the town as it is in the game.
const isolated = (options: ConstructorParameters<typeof TempestCityZone>[0] = {}): TempestCityZone =>
  new TempestCityZone({ seed: WORLD_SEED, kits: createTempestKits(), landmarks: null, ...options });
const zone = isolated();

const hashChunk = (z: TempestCityZone, cx: number, cz: number): number => {
  const chunk = new Chunk(cx, cz);
  generateZoneChunk(z, chunk);
  let h = 2166136261;
  for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) for (let y = WORLD_MIN_Y; y <= WORLD_MAX_Y; y++) h = Math.imul(h ^ chunk.getCell(lx, y, lz), 16777619);
  return h >>> 0;
};
const chunkAt = (x: number, z: number): [number, number] => [Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)];
const SAMPLE_CHUNKS: Array<[string, number, number]> = [
  ['the Central Square', ...chunkAt(TEMPEST_CENTER_X, 0)],
  ['commercial blocks', ...chunkAt(worldX(-80), -20)],
  ['a diagonal street', ...chunkAt(worldX(-100), -80)],
  ['the tourism sector', ...chunkAt(worldX(80), 90)],
  ['the compound', ...chunkAt(worldX(0), -165)],
  ['farms and a pond', ...chunkAt(worldX(210), -30)],
  ['the river', ...chunkAt(worldX(335), 0)],
  ['the forest', ...chunkAt(worldX(-330), 250)],
  ['the pasture', ...chunkAt(worldX(-228), 64)],
];

describe('TempestCityZone as a zone', () => {
  it('is a legacy Zone with the old Tempest’s name, footprint and a warmer green atmosphere', () => {
    expect(zone).toBeInstanceOf(Zone);
    const old = new TempestZone();
    expect(zone.name).toBe(old.name);
    const rng = new Rng(9);
    for (let i = 0; i < 3000; i++) {
      const x = TEMPEST_CENTER_X + rng.range(-760, 760), z = rng.range(-760, 760);
      expect(zone.isInside(x, z)).toBe(old.isInside(x, z));
    }
    const a = zone.getAtmosphere();
    expect(a.fogColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(a.skyTint).toMatch(/^#[0-9a-f]{6}$/);
    expect(a.fogDensity).toBeGreaterThan(0);
    // Warmer than the old fog (#a5d6a7): more red, less blue.
    const rgb = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    expect(rgb(a.fogColor)[0]).toBeGreaterThan(rgb(old.getAtmosphere().fogColor)[0]);
    expect(rgb(a.fogColor)[2]).toBeLessThan(rgb(old.getAtmosphere().fogColor)[2] + 1);
  });

  it('answers getBlock with the id of getCell, and keeps the height the zone is given at the footprint’s edge', () => {
    for (const [x, z] of [[TEMPEST_CENTER_X + 3, 4], [worldX(-60), -20], [worldX(120), 90]]) {
      const g = zone.groundAt(x, z);
      for (let y = g; y < g + 14; y++) {
        expect(zone.getBlock(x, y, z, g, LodLevel.HIGH)).toBe(cellId(zone.getCell(x, y, z, g)));
      }
    }
    // The blender gives a zone with no band the footprint's edge: there the height is exactly the wilderness's.
    for (const a of [0.3, 1.7, 3.1, 5]) {
      const x = TEMPEST_CENTER_X + Math.cos(a) * 699.5, z = Math.sin(a) * 699.5;
      expect(Math.abs(zone.getHeight(x, z, 17.25) - 17.25)).toBeLessThan(0.05);
    }
  });
});

describe('the Central Square, a roundabout', () => {
  const surface = (x: number, z: number): number => cellId(zone.sample(x, zone.groundAt(x, z), z));
  const above = (x: number, z: number, k = 1): number => cellId(zone.sample(x, zone.groundAt(x, z) + k, z));
  const at = (dx: number, dz: number): { zone: string; surface: number; above: number } => ({
    zone: ringZone(dx, dz), surface: surface(worldX(dx), dz), above: above(worldX(dx), dz),
  });

  it('is a circle of rings: basin, island of fan cobbles, a raised kerb, a ring road in a darker stone, an outer kerb a block high', () => {
    expect(RING_RADIUS).toBe(7);
    expect(landmarkById('central-square')!.shape).toMatchObject({ kind: 'circle', r: RING_RADIUS });
    // Every ring is there, and going out from the middle they come in order (the entries and the splitters are part of the outer kerb's ring).
    const order = ['water', 'rim', 'island', 'kerbIn', 'road', 'kerbOut', 'entry', 'splitter'];
    const cells: Array<[number, string]> = [];
    for (let dz = -9; dz <= 9; dz++) for (let dx = -9; dx <= 9; dx++) if (ringZone(dx, dz) !== 'outside') cells.push([Math.hypot(dx, dz), ringZone(dx, dz)]);
    cells.sort((a, b) => a[0] - b[0]);
    let last = 0;
    for (const [, r] of cells) {
      const i = Math.min(order.indexOf(r), 5);
      expect(i, r).toBeGreaterThanOrEqual(last);
      last = i;
    }
    expect(new Set(cells.map((c) => c[1])).size).toBe(order.length);
    // The ring road is cobble, darker than the avenues' stone and fan paving round it; the kerbs are raised slabs.
    expect(at(0, 5)).toMatchObject({ zone: 'road', surface: BlockType.STONE_BRICK });
    // The kerb carries on across the avenue's edge lanes (the splitters), so the ring is closed but for the four mouths.
    expect(at(4, 6)).toMatchObject({ zone: 'splitter', above: BlockType.COBBLESTONE });
    expect(at(3, 7)).toMatchObject({ zone: 'splitter', above: BlockType.COBBLESTONE });
    expect(at(3, 3)).toMatchObject({ zone: 'kerbIn', above: T.STONE_CURB });
    expect(at(5, 4)).toMatchObject({ zone: 'kerbOut', above: BlockType.COBBLESTONE });
    // The outer kerb is open where an avenue enters, in fan cobbles: the avenue's paving stops at the ring.
    for (const [dx, dz] of [[0, 7], [0, -7], [7, 0], [-7, 0]]) expect(at(dx, dz), `${dx},${dz}`).toMatchObject({ zone: 'entry', surface: T.FAN_PAVING, above: 0 });
    // Past the ring the avenues' own paving begins at once, flush.
    expect([T.STONE_PAVING, T.FAN_PAVING]).toContain(surface(worldX(0), 8));
    expect([T.STONE_PAVING, T.FAN_PAVING]).toContain(surface(worldX(8), 0));
  });

  it('has a ring of bollards on the island and posts on the outer kerb between the avenues', () => {
    let island = 0, kerb = 0;
    for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) {
      if (ringZone(dx, dz) === 'island' && above(worldX(dx), dz) === T.STONE_BOLLARD) island++;
      else if (ringZone(dx, dz) === 'kerbOut' && above(worldX(dx), dz, 2) === T.STONE_BOLLARD) kerb++;
    }
    expect(island).toBe(12);
    expect(kerb).toBeGreaterThanOrEqual(6);
  });

  it('does not run an avenue through the ring: the cells just outside it, on an avenue, are not kerb or slate', () => {
    for (const [dx, dz] of [[9, 0], [-9, 0], [0, 9], [0, -9], [9, 3], [-3, 9]]) {
      expect(ringZone(dx, dz)).toBe('outside');
      expect(surface(worldX(dx), dz)).not.toBe(BlockType.STONE_BRICK);
      expect(above(worldX(dx), dz)).not.toBe(BlockType.COBBLESTONE);
    }
  });
});

describe('the streets and what stands in them', () => {
  const surface = (x: number, z: number): number => cellId(zone.sample(x, zone.groundAt(x, z), z));

  it('paves the avenues with stone and fan cobbles, the Central Square with a fountain, and lets the outskirts go to earth', () => {
    const pavings = new Set<number>([T.STONE_PAVING, T.FAN_PAVING]);
    for (let lx = -150; lx <= 150; lx += 7) {
      if (Math.abs(lx) < 8) continue;
      expect(pavings.has(surface(worldX(lx), 0)), `avenue at ${lx}`).toBe(true);
      expect(pavings.has(surface(TEMPEST_CENTER_X, lx)), `avenue at z ${lx}`).toBe(true);
    }
    // A fan strip runs down the middle of an avenue near the centre.
    let fan = 0;
    for (let lx = 10; lx < 100; lx++) if (surface(worldX(lx), 0) === T.FAN_PAVING) fan++;
    expect(fan).toBeGreaterThan(50);
    // The square: fan paving on the island round a fountain of basins with a water jet at its middle, a ring of bollards, the kerbs and the ring
    // road in dark cobbles (the whole of it is in the Central Square test below).
    expect(surface(worldX(4), 0)).toBe(T.FAN_PAVING);
    expect(cellId(zone.sample(worldX(0), 9, 0))).toBe(T.STONE_BASIN);
    expect(cellId(zone.sample(worldX(0), 10, 0))).toBe(T.WATER_JET);
    expect(cellId(zone.sample(worldX(4), 9, 0))).toBe(T.STONE_BOLLARD);
    expect(surface(worldX(5), 0)).toBe(BlockType.STONE_BRICK);
    // Outskirts: the boundary road's middle and a street at the grid's edge are earth, not paving.
    const earth = [BlockType.PATH, NatureBlock.GRAVEL, BlockType.DIRT];
    expect(earth).toContain(surface(worldX(186), -90));
    expect(earth).toContain(surface(worldX(-100), 178));
    let pale = 0;
    for (let lz = -170; lz < 170; lz++) if (surface(worldX(186), lz) === BlockType.PATH) pale++;
    expect(pale).toBeGreaterThan(150); // mostly the pale path block, with gravel and soil in patches
  });

  it('puts a lamp post on a street edge: four rails, an arm over the street and a paper lantern hanging from it', () => {
    const lamp = zone.planner.lamps.find((l) => l.toward === 1)!;
    const g = zone.groundAt(lamp.x, lamp.z);
    for (let dy = 1; dy <= 4; dy++) expect(cellId(zone.sample(lamp.x, g + dy, lamp.z)), `post at +${dy}`).toBe(T.VERMILION_RAIL);
    expect(cellId(zone.sample(lamp.x, g + 5, lamp.z))).toBe(BlockType.AIR);
    expect(cellId(zone.sample(lamp.x + 1, g + 4, lamp.z))).toBe(T.VERMILION_RAIL);
    expect([T.PAPER_LANTERN_RED, T.PAPER_LANTERN_STRIPED]).toContain(cellId(zone.sample(lamp.x + 1, g + 3, lamp.z)));
  });

  it('builds the roads out to the RoadNetwork’s gates, 9 wide and level across', () => {
    for (const [name, at] of [['west', (d: number, o: number) => [ROAD_GATES.west.x + d, o]], ['north', (d: number, o: number) => [TEMPEST_CENTER_X + o, ROAD_GATES.north.z + d]]] as const) {
      for (const d of [2, 30, 90]) {
        const heights = new Set<number>();
        for (let o = -4; o <= 4; o++) {
          const [x, z] = at(d, o);
          const id = surface(x, z);
          expect([T.STONE_PAVING, BlockType.COBBLESTONE, BlockType.PATH, NatureBlock.GRAVEL, BlockType.DIRT], `${name} gate road, ${d} in, offset ${o}`).toContain(id);
          heights.add(zone.groundAt(x, z));
        }
        expect(heights.size, `${name} road level across at ${d}`).toBe(1);
        for (const o of [-8, 8]) {
          const [x, z] = at(d, o);
          expect(roadAt(x, z)).toBeNull();
        }
      }
    }
  });

  it('plants street trees whose crowns hang over the street but never in a lot', () => {
    let leavesOverStreet = 0;
    for (const t of zone.planner.trees.slice(0, 80)) {
      const g = zone.groundAt(t.x, t.z);
      expect(cellId(zone.sample(t.x, g + 1, t.z)), `trunk of the tree at ${t.x},${t.z}`).not.toBe(BlockType.AIR);
    }
    // Leaves above the street in front of a tree.
    const t = zone.planner.trees.find((tr) => tr.kind === 'sakura' && tr.lean === 0)!;
    for (let dz = 1; dz <= 4; dz++) for (let dy = 3; dy <= 8; dy++) if (cellId(zone.sample(t.x, zone.groundAt(t.x, t.z - dz) + dy, t.z - dz)) === 51) leavesOverStreet++;
    expect(leavesOverStreet).toBeGreaterThan(0);
    // No tree blocks inside a lot except what its own blueprint puts there: a lot cell's sample matches its placement.
    for (const p of zone.planner.lots.slice(0, 40)) {
      const pl = zone.lotPlacement(p)!;
      const { lot } = p;
      for (let k = 0; k < 20; k++) {
        const x = lot.x + ((k * 7) % lot.w), z = lot.z + ((k * 5) % lot.d);
        for (let y = lot.groundY; y < lot.groundY + 12; y++) {
          const expected = pl.cellAt(x, y, z);
          if (expected !== -1) expect(zone.sample(x, y, z), `${lot.id} ${x},${y},${z}`).toBe(expected);
        }
      }
    }
  });
});

describe('the lots and their kits', () => {
  it('builds every planned lot with a kit, standing on its rectangle, the same building every time', () => {
    const fresh = isolated();
    for (const p of zone.planner.lots.filter((_, i) => i % 3 === 0)) {
      const pl = zone.lotPlacement(p);
      expect(pl, p.lot.id).not.toBeNull();
      const b = pl!.bounds()!;
      expect(b.minX, p.lot.id).toBeGreaterThanOrEqual(p.lot.x);
      expect(b.maxX).toBeLessThanOrEqual(p.lot.x + p.lot.w - 1);
      expect(b.minZ).toBeGreaterThanOrEqual(p.lot.z);
      expect(b.maxZ).toBeLessThanOrEqual(p.lot.z + p.lot.d - 1);
      expect(fresh.lotPlacement(p)!.blueprint.hash(), p.lot.id).toBe(pl!.blueprint.hash());
    }
  });

  it('picks the filler kits for gardens, parks, meadows and building sites', () => {
    const names = new Map<string, string>();
    for (const p of zone.planner.lots) if (p.kind !== 'building') names.set(p.kind, zone.kitFor(p).name);
    expect(Object.fromEntries(names)).toEqual({ garden: 'garden-lot', park: 'park-lot', meadow: 'meadow-lot', construction: 'construction-site' });
  });

  it('survives a kit that throws: the box house stands in', () => {
    class Bad extends BuildingKit {
      readonly name = 'bad';
      readonly frontage: KitSize = { min: 5, max: 80 };
      readonly depth: KitSize = { min: 5, max: 80 };
      build(): Blueprint { throw new Error('a kit with a bug'); }
    }
    const z = isolated({ kits: new KitRegistry().register(new Bad(), {}, 1) });
    const p = z.planner.lots.find((l) => l.kind === 'building')!;
    expect(() => z.lotPlacement(p)).not.toThrow();
    expect(z.lotPlacement(p)!.blueprint.size).toBeGreaterThan(50);
  });

  it('builds a landmark with the kit registered under its layout id, drawn over the ground, and the east bridge with a placeholder', () => {
    class Hall extends BuildingKit {
      readonly name = 'town-hall';
      readonly frontage: KitSize = { min: 5, max: 80 };
      readonly depth: KitSize = { min: 5, max: 80 };
      build(lot: Lot, style: StylePack, rng: Rng): Blueprint {
        const b = new BlueprintBuilder(style, rng, 'hall');
        b.box(2, 1, 2, lot.frontage - 3, 6, lot.depth - 3, T.WHITE_COLUMN);
        return b.build();
      }
    }
    const z = isolated({ kits: createTempestKits().register(new Hall(), {}, 0) });
    const hall = landmarkById('town-hall')!;
    const l = z.planner.landmarkLots.find((p) => p.landmark.id === 'town-hall')!.lot;
    const cx = l.x + (l.w >> 1), cz = l.z + (l.d >> 1);
    expect(cellId(z.sample(cx, 8 + 3, cz))).toBe(T.WHITE_COLUMN);
    expect(cellId(zone.sample(cx, 8 + 3, cz))).toBe(BlockType.AIR);
    expect(hall.facing).toBe(2);
    // The bridge: planks over the river at the road's height, with piers under it where the river took the ground.
    const bridge = zone.planner.landmarkLots.find((p) => p.landmark.id === 'east-bridge')!.lot;
    const bx = bridge.x + (bridge.w >> 1), bz = bridge.z + (bridge.d >> 1);
    expect(bridge.groundY).toBe(8);
    expect(cellId(zone.sample(bx, 8, bz))).not.toBe(BlockType.AIR);
    expect(cellId(zone.sample(bx, 8, bz))).not.toBe(BlockType.WATER);
    expect(zone.groundAt(bx, bz)).toBeLessThan(WATER_LEVEL);
  });

  it('grows a marked tree only where its crown fits inside the lot', () => {
    const lot = new Lot({ id: 't', x: 0, z: 0, w: 15, d: 15, facing: 2, district: 'residential', seed: 4 });
    const bp = new Blueprint('t');
    bp.addMarker({ kind: 'tree', x: 7, y: 1, z: 7, tag: 'sakura' });
    bp.addMarker({ kind: 'tree', x: 1, y: 1, z: 7, tag: 'sakura' });
    bp.addMarker({ kind: 'tree', x: 3, y: 1, z: 12, tag: 'cedar' });
    growMarkedTrees(bp, lot);
    const bounds = bp.bounds()!;
    expect(bounds.minX).toBeGreaterThanOrEqual(0);
    expect(bounds.maxX).toBeLessThanOrEqual(14);
    expect(bounds.minZ).toBeGreaterThanOrEqual(0);
    expect(bounds.maxZ).toBeLessThanOrEqual(14);
    expect(bp.get(7, 1, 7)).not.toBe(-1);   // the middle one grew
    expect(bp.get(1, 1, 7)).toBe(-1);       // the one with no room did not
    expect(bp.get(3, 1, 12)).not.toBe(-1);
  });
});

describe('determinism and consistency', () => {
  it('builds the same chunks from the same seed, whichever order they are made in and however small the blueprint cache is', () => {
    const a = isolated();
    const b = isolated({ lotCache: 1 });
    const forward = SAMPLE_CHUNKS.map(([, cx, cz]) => hashChunk(a, cx, cz));
    const backward = [...SAMPLE_CHUNKS].reverse().map(([, cx, cz]) => hashChunk(b, cx, cz)).reverse();
    expect(backward).toEqual(forward);
    expect(new Set(forward).size).toBeGreaterThan(6);
    // Another seed is another town.
    const other = isolated({ seed: WORLD_SEED + 1 });
    expect(hashChunk(other, SAMPLE_CHUNKS[1][1], SAMPLE_CHUNKS[1][2])).not.toBe(forward[1]);
  }, timeoutMs(60000));

  it('answers a single cell, asked cold, exactly as chunk generation has it', () => {
    const fresh = isolated();
    const rng = new Rng(31);
    for (const [name, cx, cz] of SAMPLE_CHUNKS) {
      const chunk = new Chunk(cx, cz);
      generateZoneChunk(zone, chunk);
      for (let i = 0; i < 700; i++) {
        const lx = rng.int(CHUNK_SIZE), lz = rng.int(CHUNK_SIZE);
        const x = cx * CHUNK_SIZE + lx, z = cz * CHUNK_SIZE + lz;
        const g = zoneGround(fresh, x, z);
        const y = g + rng.int(20) - 1;
        const cell = y < g ? 0 : fresh.getCell(x, y, z, g, LodLevel.HIGH);
        const stored = chunk.getCell(lx, y, lz);
        // Below the ground the chunk has stone or water, which the zone leaves to the generator; above water level only the zone speaks.
        if (y >= g && !(y > g && y <= WATER_LEVEL)) expect(stored, `${name} ${x},${y},${z}`).toBe(cell);
      }
    }
  }, timeoutMs(60000));

  it('has buildings that cross chunk borders drawn whole on both sides', () => {
    // Find a lot that straddles a chunk border, and compare its blueprint against the two chunks.
    const straddling = zone.planner.lots.find((p) => Math.floor(p.lot.x / CHUNK_SIZE) !== Math.floor((p.lot.x + p.lot.w - 1) / CHUNK_SIZE) && p.kind === 'building')!;
    const pl = zone.lotPlacement(straddling)!;
    const chunks = new Map<string, Chunk>();
    const get = (x: number, z: number): { c: Chunk; lx: number; lz: number } => {
      const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
      const key = `${cx},${cz}`;
      if (!chunks.has(key)) { const c = new Chunk(cx, cz); generateZoneChunk(zone, c); chunks.set(key, c); }
      return { c: chunks.get(key)!, lx: x - cx * CHUNK_SIZE, lz: z - cz * CHUNK_SIZE };
    };
    let checked = 0;
    pl.stamp((x, y, z, cell) => {
      if (checked > 4000 || y < 8) return;
      const { c, lx, lz } = get(x, z);
      // The lot's own blueprint wins over everything but nothing is drawn over it: the chunk holds exactly its cell.
      expect(c.getCell(lx, y, lz), `${x},${y},${z}`).toBe(cell);
      checked++;
    });
    expect(checked).toBeGreaterThan(100);
    expect(chunks.size).toBeGreaterThanOrEqual(2);
  });
});

describe('what the countryside builds', () => {
  const top = (x: number, z: number): { y: number; id: number } => {
    const g = zone.groundAt(x, z);
    for (let y = g + 40; y >= g; y--) { const id = cellId(zone.sample(x, y, z)); if (id !== 0) return { y, id }; }
    return { y: g, id: 0 };
  };

  it('lays the farms out in fields with paths between them, wheat in rows, and keeps the river and ponds clear', () => {
    let farmland = 0, wheat = 0, paths = 0, cells = 0;
    for (let lx = 195; lx < 300; lx += 2) {
      for (let lz = -170; lz < 170; lz += 2) {
        const x = worldX(lx), z = lz;
        if (!farmField(x, z) || zone.groundAt(x, z) !== 8) continue;
        cells++;
        const g = 8;
        const s = cellId(zone.sample(x, g, z));
        if (s === BlockType.FARMLAND) farmland++;
        if (s === BlockType.PATH) paths++;
        if ([BlockType.WHEAT, BlockType.WHEAT_STAGE_1, BlockType.WHEAT_STAGE_2].includes(cellId(zone.sample(x, g + 1, z)))) wheat++;
      }
    }
    expect(cells).toBeGreaterThan(5000);
    expect(farmland / cells).toBeGreaterThan(0.15);
    expect(paths / cells).toBeGreaterThan(0.05);
    expect(wheat / cells).toBeGreaterThan(0.1);
  });

  it('fills the ponds with water one block under the street, and carves the river down to the water level', () => {
    for (const id of ['pond-east', 'pond-southeast']) {
      const c = (landmarkById(id)!.shape as { cx: number; cz: number });
      const x = Math.round(c.cx), z = Math.round(c.cz);
      expect(zone.groundAt(x, z)).toBe(POND_WATER_Y - 1);
      expect([BlockType.WATER, T.KOI_POND]).toContain(cellId(zone.sample(x, POND_WATER_Y, z)));
      expect(cellId(zone.sample(x, POND_WATER_Y + 2, z))).toBe(BlockType.AIR);
    }
    // The river's centre-line is under the world's water level, and its banks come up to the land.
    const mid = { x: worldX(340), z: 0 };
    expect(zone.groundAt(mid.x, mid.z)).toBeLessThan(WATER_LEVEL);
    expect(zone.groundAt(mid.x - 25, mid.z)).toBeGreaterThanOrEqual(7);
  });

  it('plants the forest beyond the open land, thick and clear of the roads', () => {
    let wooded = 0, trees = 0;
    for (let lx = -420; lx < -300; lx += 3) {
      for (let lz = 100; lz < 400; lz += 3) {
        const x = worldX(lx), z = lz;
        if (!isWooded(x, z)) continue;
        wooded++;
        if (top(x, z).y > zone.groundAt(x, z) + 2) trees++;
      }
    }
    expect(wooded).toBeGreaterThan(2000);
    expect(trees / wooded).toBeGreaterThan(0.45);
    // Not on the road west (and its continuation, where the network paints it), nor over it at head height.
    for (let lx = -330; lx > -695; lx -= 5) for (let lz = -4; lz <= 4; lz++) {
      const x = worldX(lx), z = lz, g = zone.groundAt(x, z);
      // (Flowers and ferns stand on the ground; beyond the layout's own road, from 600, the RoadNetwork paves over the column anyway.)
      for (let dy = 2; dy <= 4; dy++) expect(cellId(zone.sample(x, g + dy, z)), `${lx},${lz}`).toBe(BlockType.AIR);
    }
  });

  it('fences the pastures, with a gap on the road side', () => {
    const c = landmarkById('horse-pasture')!.shape as { cx: number; cz: number; r: number };
    let fence = 0;
    for (let a = 0; a < 360; a += 2) {
      const x = Math.round(c.cx + Math.cos((a * Math.PI) / 180) * c.r), z = Math.round(c.cz + Math.sin((a * Math.PI) / 180) * c.r);
      if (cellId(zone.sample(x, zone.groundAt(x, z) + 1, z)) === BlockType.WOOD_FENCE) fence++;
    }
    expect(fence).toBeGreaterThan(120);
    expect(cellId(zone.sample(Math.round(c.cx), 9, Math.round(c.cz - c.r)))).not.toBe(BlockType.WOOD_FENCE);
  });
});

describe('what a chunk costs', () => {
  it('generates a chunk of the town in well under a frame budget, in node', () => {
    const z = isolated();
    // Warm the planner and the shape caches, then time chunks over the town, the farms and the forest.
    hashChunk(z, ...chunkAt(TEMPEST_CENTER_X, 0));
    const t0 = performance.now();
    let n = 0;
    for (let cx = 42; cx < 52; cx += 2) for (let cz = -6; cz < 6; cz += 2) { hashChunk(z, cx, cz); n++; }
    const ms = (performance.now() - t0) / n;
    // Includes hashing the chunk (an order of magnitude more work than the zone's own cells would need); measured at about 25 ms.
    expect(ms).toBeLessThan(tolerant(250));
  }, timeoutMs(60000));
});

