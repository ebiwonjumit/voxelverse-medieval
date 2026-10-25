import { describe, expect, it } from 'vitest';
import { voxelWorld } from '../../gameWorld';
import { ShapedBlock } from '../../content/blocksShaped';
import { cellId } from '../../engine/cell';
import { getZone } from '../../zones';
import { TempestCityZone } from '../../worldgen/tempest/TempestCityZone';
import { TEMPEST_GROUND, landmarkById, worldX } from '../../worldgen/tempest/layout';
import { Standing, columnsOf, walk } from '../landmarks/helpers';
import { timeoutMs } from '../perf';

// A player in the town the game builds: the main thread's own world (gameWorld.ts) with the game's collision, pushed one
// block at a time as in play, from the street. Everything here is found by walking.

const zone = getZone(worldX(0), 0) as TempestCityZone;
const FEET = TEMPEST_GROUND + 0.5; // standing on the paving of the town: its top face is at 8.5

const around = (x: number, z: number, feet = FEET): Standing => ({ x, z, feet });
const DIR_DX = [0, 1, 0, -1], DIR_DZ = [-1, 0, 1, 0];

describe('walking the town with the real collision', () => {
  it('lets a player walk from the west gate along the avenue to the Central Square and up the north avenue to the Town Hall steps', () => {
    const west = walk(voxelWorld, around(worldX(-215), 0), { minX: worldX(-216), maxX: worldX(8), minZ: -7, maxZ: 7 });
    const cols = columnsOf(west);
    expect(cols.has(`${worldX(-2)},0`)).toBe(true);
    expect(cols.size).toBeGreaterThan(2000);
    // The whole avenue is walkable from the gate to the square: every column of its middle.
    for (let lx = -190; lx <= -8; lx += 6) expect(cols.has(`${worldX(lx)},0`), `x ${lx}`).toBe(true);

    const north = walk(voxelWorld, around(worldX(0), -10), { minX: worldX(-7), maxX: worldX(7), minZ: -170, maxZ: -9 });
    expect(columnsOf(north).has(`${worldX(0)},-140`)).toBe(true);
  }, timeoutMs(60000));

  it('lets a player cross the river by the arched east bridge, and by nothing else', () => {
    const bridge = landmarkById('east-bridge')!.shape as { x0: number; z0: number; x1: number; z1: number };
    const from = around(bridge.x0 - 6, 0);
    const reach = walk(voxelWorld, from, { minX: bridge.x0 - 8, maxX: bridge.x1 + 8, minZ: -8, maxZ: 8 });
    const cols = columnsOf(reach);
    // The far bank, and the crown of the arch is higher than either end.
    expect(cols.has(`${bridge.x1 + 6},0`)).toBe(true);
    const crown = Math.max(...[...reach.values()].filter((p) => p.x >= bridge.x0 && p.x <= bridge.x1).map((p) => p.feet));
    expect(crown).toBeGreaterThan(FEET + 1.5);
  }, timeoutMs(60000));

  // From the street through the door, and up the stairs to the top floor, for every second house of the town (about 100 of them,
  // of every kit and every facing): found by walking with the game's collision, no jumping.
  it('lets a player enter houses through their doors and climb to the top floor', () => {
    let entered = 0, climbed = 0;
    const kinds = new Set<string>();
    const HOUSES = new Set(['townhouse', 'shop', 'inn', 'storehouse', 'garden-house', 'watchtower', 'workshop', 'public-hall']);
    const lots = zone.planner.lots.filter((p) => p.kind === 'building' && !p.piece && HOUSES.has(zone.choiceOf(p)?.kit.name ?? ''));
    lots.forEach((p, n) => {
      if (n % 2 !== 0) return;
      const kit = zone.choiceOf(p)!.kit;
      const pl = zone.lotPlacement(p);
      const door = pl?.markers().find((m) => m.kind === 'door');
      if (!pl || !door || door.facing === undefined) return;
      // Out from the door to the street (the first cell the planner calls a road, no more than 14 cells away): a street's own
      // edge may hold a lamp post, so the walker starts on the first of the next cells it can stand on.
      let k = 1;
      while (k < 14 && !zone.planner.roadOf(door.x + DIR_DX[door.facing] * k, door.z + DIR_DZ[door.facing] * k)) k++;
      const sx = door.x + DIR_DX[door.facing] * k, sz = door.z + DIR_DZ[door.facing] * k;
      if (!zone.planner.roadOf(sx, sz)) return; // a lot whose front looks at a wall (the compound's annexes)
      const l = p.lot;
      const box = { minX: Math.min(l.x - 6, sx - 1), maxX: Math.max(l.x + l.w + 6, sx + 1), minZ: Math.min(l.z - 6, sz - 1), maxZ: Math.max(l.z + l.d + 6, sz + 1), max: 40000 };
      let reach = new Map<string, Standing>();
      for (let e = 0; e < 4 && reach.size === 0; e++) reach = walk(voxelWorld, around(sx + DIR_DX[door.facing] * e, sz + DIR_DZ[door.facing] * e), box);
      // Two cells in through the door: the room is open to the street.
      const ix = door.x - DIR_DX[door.facing] * 2, iz = door.z - DIR_DZ[door.facing] * 2;
      const inRoom = [...reach.values()].some((s) => s.x === ix && s.z === iz && Math.abs(s.feet - FEET) < 2.5);
      expect(inRoom, `${kit.name} ${l.id}: the door at ${door.x},${door.z} leads in`).toBe(true);
      entered++;
      kinds.add(kit.name);
      // A house with an upper floor has a wooden stair inside, and a way up to it.
      let stairs = 0;
      pl.stamp((_x, _y, _z, c) => { if (cellId(c) === ShapedBlock.DARK_PLANK_STAIRS) stairs++; });
      if (stairs === 0) return;
      const top = Math.max(...[...reach.values()].filter((s) => s.x >= l.x && s.x < l.x + l.w && s.z >= l.z && s.z < l.z + l.d).map((s) => s.feet));
      expect(top, `${kit.name} ${l.id}: a way up`).toBeGreaterThan(FEET + 3.5);
      climbed++;
    });
    console.info(`walked into ${entered} houses of ${[...kinds].join(', ')}, up to the top floor of ${climbed}`);
    expect(entered).toBeGreaterThanOrEqual(80);
    expect(climbed).toBeGreaterThanOrEqual(30);
    expect(kinds.size).toBeGreaterThanOrEqual(6);
  }, timeoutMs(180000));
});
