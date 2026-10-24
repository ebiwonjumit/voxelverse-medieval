import { describe, expect, it } from 'vitest';
import { WORLD_SEED } from '../../worldConstants';
import { Rng } from '../../worldgen/noise';
import { TerrainField } from '../../worldgen/terrain/TerrainField';
import { TempestCityZone } from '../../worldgen/tempest/TempestCityZone';
import { BLEND_START, POND_BED_Y, RIVER_WATER_HALF, TempestTerrain, riverProfile } from '../../worldgen/tempest/terrain';
import { zoneGround } from '../../worldgen/tempest/zoneChunk';
import {
  GRID_REACH, RIVER, ROAD_GATES, TEMPEST_CENTER_X, TEMPEST_CENTER_Z, TEMPEST_GROUND, TEMPEST_RADIUS, landmarkById, localX, localZ, riverDistance, worldX,
} from '../../worldgen/tempest/layout';
import { timeoutMs } from '../perf';

const zone = new TempestCityZone({ seed: WORLD_SEED });
const terrain = new TempestTerrain(WORLD_SEED);
const field = new TerrainField(WORLD_SEED);
const ground = (lx: number, lz: number): number => zoneGround(zone, worldX(lx), TEMPEST_CENTER_Z + lz);

describe('the ground of Tempest', () => {
  it('is flat at y = 8 across the grid, the farms and the open land out to where the wilderness starts', () => {
    const rng = new Rng(4);
    let off = 0;
    for (let i = 0; i < 6000; i++) {
      const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * (BLEND_START - 1);
      const lx = Math.cos(a) * d, lz = Math.sin(a) * d;
      const x = Math.round(worldX(lx)), z = Math.round(lz);
      // Not in the river's valley, a pond, or the cairn's hill.
      if (riverDistance(x, z) < 25 || Math.hypot(x - landmarkCx('pond-east'), z - landmarkCz('pond-east')) < 9 || Math.hypot(x - landmarkCx('pond-southeast'), z - landmarkCz('pond-southeast')) < 12
        || Math.hypot(x - landmarkCx('south-cairn'), z - landmarkCz('south-cairn')) < 19) continue;
      if (zoneGround(zone, x, z) !== TEMPEST_GROUND) off++;
    }
    expect(off).toBe(0);
    for (let lx = -GRID_REACH; lx <= GRID_REACH; lx += 9) for (let lz = -GRID_REACH; lz <= GRID_REACH; lz += 9) expect(ground(lx, lz)).toBe(TEMPEST_GROUND);
  });

  it('changes by at most one block between neighbouring columns over the whole footprint, in x and in z', () => {
    let worst = 0;
    const R = TEMPEST_RADIUS;
    // Every column along rows and columns every 5 cells: about 600,000 pairs in each direction.
    for (let a = -R; a <= R; a += 5) {
      let prevX = zoneGround(zone, worldX(-R), TEMPEST_CENTER_Z + a);
      let prevZ = zoneGround(zone, worldX(a), TEMPEST_CENTER_Z - R);
      for (let b = -R + 1; b <= R; b++) {
        const gx = zoneGround(zone, worldX(b), TEMPEST_CENTER_Z + a);
        const gz = zoneGround(zone, worldX(a), TEMPEST_CENTER_Z + b);
        if (Math.hypot(b, a) < R) worst = Math.max(worst, Math.abs(gx - prevX));
        if (Math.hypot(a, b) < R) worst = Math.max(worst, Math.abs(gz - prevZ));
        prevX = gx; prevZ = gz;
      }
    }
    expect(worst).toBeLessThanOrEqual(1);
  }, timeoutMs(60000));

  it('ends exactly on the wilderness height at the footprint’s edge and is the zone’s own height inside', () => {
    for (let i = 0; i < 400; i++) {
      const a = (i / 400) * Math.PI * 2;
      const x = TEMPEST_CENTER_X + Math.cos(a) * 699.9, z = Math.sin(a) * 699.9;
      expect(Math.abs(terrain.height(x, z, field.height(x, z)) - field.height(x, z))).toBeLessThan(0.01);
      // Beyond the edge the zone has nothing to say.
      expect(terrain.height(x * 1.01 - TEMPEST_CENTER_X * 0.01, z * 1.01, 33.5)).toBe(33.5);
    }
  });

  it('levels the roads out across their width and lets them climb gently along it', () => {
    for (const road of ['west', 'north', 'south', 'east'] as const) {
      let prev = -999;
      let worstAlong = 0;
      for (let d = 190; d < 520; d += 1) {
        const at = (o: number): [number, number] => road === 'west' ? [worldX(-d), o] : road === 'east' ? [worldX(d), o] : road === 'north' ? [worldX(o), -d] : [worldX(o), d];
        const hs = new Set<number>();
        for (let o = -4; o <= 4; o++) { const [x, z] = at(o); hs.add(zoneGround(zone, x, z)); }
        // The river crosses the road east at the bridge, where the ground is the valley's.
        if (road === 'east' && d > 320 && d < 360) { prev = -999; continue; }
        expect(hs.size, `${road} road, ${d} out`).toBe(1);
        const h = [...hs][0];
        if (prev !== -999) worstAlong = Math.max(worstAlong, Math.abs(h - prev));
        prev = h;
      }
      expect(worstAlong, `${road} road`).toBeLessThanOrEqual(1);
    }
    // The north road climbs towards the cave, never falling back by more than a block over 100 cells.
    const profile = Array.from({ length: 12 }, (_, i) => zoneGround(zone, worldX(0), -250 - i * 30));
    expect(Math.max(...profile) - Math.min(...profile)).toBeLessThan(14);
  });

  it('cuts the river’s channel under the water level, with banks that rise no faster than 0.75 a cell, and clear of the town', () => {
    expect(riverProfile(0)).toBeCloseTo(0);
    expect(riverProfile(RIVER_WATER_HALF)).toBeLessThan(3);
    for (let d = 0; d < 20; d += 0.25) expect(riverProfile(d + 0.25) - riverProfile(d)).toBeLessThanOrEqual(0.75 * 0.25 + 1e-9 + (d < RIVER_WATER_HALF ? 0.5 : 0));
    // Every point of the centre-line is at least 40 cells from the grid and its ground is water.
    for (let i = 0; i + 1 < RIVER.path.length; i++) {
      for (let t = 0; t <= 1; t += 0.1) {
        const x = Math.round(RIVER.path[i].x + (RIVER.path[i + 1].x - RIVER.path[i].x) * t), z = Math.round(RIVER.path[i].z + (RIVER.path[i + 1].z - RIVER.path[i].z) * t);
        expect(Math.max(Math.abs(localX(x)), Math.abs(localZ(z)))).toBeGreaterThan(GRID_REACH + 40);
        expect(zoneGround(zone, x, z)).toBeLessThanOrEqual(2);
      }
    }
  });

  it('digs the ponds a block or two under the street and puts a hill under the cairn, and gives landmarks the ground they stand on', () => {
    const pond = landmarkById('pond-east')!.shape as { cx: number; cz: number };
    expect(zoneGround(zone, Math.round(pond.cx), Math.round(pond.cz))).toBe(POND_BED_Y);
    const cairn = landmarkById('south-cairn')!.shape as { cx: number; cz: number };
    expect(zoneGround(zone, Math.round(cairn.cx), Math.round(cairn.cz))).toBeGreaterThanOrEqual(12);
    const lots = zone.planner.landmarkLots;
    expect(lots.find((l) => l.landmark.id === 'south-cairn')!.lot.groundY).toBe(zoneGround(zone, Math.round(cairn.cx), Math.round(cairn.cz)));
    expect(lots.find((l) => l.landmark.id === 'town-hall')!.lot.groundY).toBe(TEMPEST_GROUND);
    expect(lots.find((l) => l.landmark.id === 'east-bridge')!.lot.groundY).toBe(TEMPEST_GROUND);
    const cave = lots.find((l) => l.landmark.id === 'north-cave')!;
    expect(cave.lot.groundY).toBe(zoneGround(zone, cave.lot.x + (cave.lot.w >> 1), cave.lot.z + (cave.lot.d >> 1)));
  });

  it('meets the RoadNetwork’s gates on level ground', () => {
    // The gate is where the network's road takes over; the zone's own road reaches it at a height the network can join.
    for (const g of Object.values(ROAD_GATES)) {
      const here = zoneGround(zone, g.x - Math.round(g.dx) * 3, g.z - Math.round(g.dz) * 3);
      const there = zoneGround(zone, g.x - Math.round(g.dx) * 30, g.z - Math.round(g.dz) * 30);
      expect(Math.abs(here - there)).toBeLessThanOrEqual(3);
    }
  });
});

const landmarkCx = (id: string): number => (landmarkById(id)!.shape as { cx: number }).cx;
const landmarkCz = (id: string): number => (landmarkById(id)!.shape as { cz: number }).cz;
