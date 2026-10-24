import { describe, expect, it } from 'vitest';
import { WORLD_SEED } from '../../worldConstants';
import { DistrictPlanner, splitLength } from '../../worldgen/tempest/DistrictPlanner';
import {
  BLOCKS, COMPOUND, GRID_REACH, LANDMARKS, ROADS, ROAD_GATES, TEMPEST_CENTER_X, TEMPEST_CENTER_Z, TEMPEST_RADIUS, blockAt, inBlock, inShape, landmarkById, localX,
  localZ, roadAt, shapeBounds,
} from '../../worldgen/tempest/layout';
import { Rng } from '../../worldgen/noise';

const planner = new DistrictPlanner({ seed: WORLD_SEED });
const lotCells = function* (l: { x: number; z: number; w: number; d: number }): Generator<[number, number]> {
  for (let z = l.z; z < l.z + l.d; z++) for (let x = l.x; x < l.x + l.w; x++) yield [x, z];
};

describe('the district planner: lots', () => {
  it('cuts the town into a few hundred lots, of every kind the plan calls for', () => {
    expect(planner.lots.length).toBeGreaterThan(250);
    const kinds = new Set(planner.lots.map((p) => p.kind));
    for (const k of ['building', 'garden', 'park', 'meadow', 'construction']) expect(kinds.has(k as never), k).toBe(true);
    // Every district of the plan has lots.
    const districts = new Set(planner.lots.map((p) => p.lot.district));
    for (const d of ['guest', 'government', 'public', 'luxury', 'commercial', 'production', 'storage', 'residential', 'tourism']) expect(districts.has(d), d).toBe(true);
  });

  it('never overlaps lots, landmarks, roads or the compound, and keeps every lot inside its block', () => {
    const owner = new Map<number, number>();
    for (const p of planner.lots) {
      const { lot } = p;
      expect(lot.w, lot.id).toBeGreaterThanOrEqual(8);
      expect(lot.d, lot.id).toBeGreaterThanOrEqual(8);
      const block = BLOCKS.find((b) => b.id === p.block)!;
      for (const [x, z] of lotCells(lot)) {
        const key = (x - TEMPEST_CENTER_X + 400) * 1000 + (z - TEMPEST_CENTER_Z + 400);
        expect(owner.has(key), `${lot.id} overlaps lot ${owner.get(key)} at ${x},${z}`).toBe(false);
        owner.set(key, p.index);
        expect(roadAt(x, z), `${lot.id} on a road at ${x},${z}`).toBeNull();
        expect(inBlock(block, x, z), `${lot.id} outside its block at ${x},${z}`).toBe(true);
        expect(x >= COMPOUND.x0 && x <= COMPOUND.x1 && z >= COMPOUND.z0 && z <= COMPOUND.z1).toBe(false);
      }
    }
    for (const l of LANDMARKS) {
      const b = shapeBounds(l.shape);
      for (const p of planner.lots) {
        const lot = p.lot;
        if (lot.x > b.x1 || lot.x + lot.w - 1 < b.x0 || lot.z > b.z1 || lot.z + lot.d - 1 < b.z0) continue;
        for (const [x, z] of lotCells(lot)) expect(inShape(l.shape, x, z), `${lot.id} on ${l.id}`).toBe(false);
      }
    }
  });

  it('lies inside the footprint, and every lot has a street beside it', () => {
    for (const p of planner.lots) {
      const l = p.lot;
      for (const [x, z] of [[l.x, l.z], [l.x + l.w - 1, l.z + l.d - 1]]) expect(Math.hypot(localX(x), localZ(z)), l.id).toBeLessThan(TEMPEST_RADIUS);
      expect(Math.abs(localX(l.x))).toBeLessThanOrEqual(GRID_REACH);
      // A road cell within three cells of the rectangle: the verge is one cell, and a lot stepped down a diagonal street
      // has only a corner towards it, so its nearest road cell can stand a couple of cells further off.
      let touches = false;
      for (let z = l.z - 3; z <= l.z + l.d + 2 && !touches; z++) for (let x = l.x - 3; x <= l.x + l.w + 2; x++) if (roadAt(x, z)) { touches = true; break; }
      expect(touches, `${l.id} has no street`).toBe(true);
    }
  });

  it('faces every lot towards a street', () => {
    const DX = [0, 1, 0, -1], DZ = [-1, 0, 1, 0];
    for (const p of planner.lots) {
      const l = p.lot;
      // The cell in front of the middle of its front edge, a verge and a bit further: a road within a few cells that way, or the diagonal's near corner.
      const cx = l.x + Math.floor(l.w / 2), cz = l.z + Math.floor(l.d / 2);
      const fx = l.facing === 1 ? l.x + l.w - 1 : l.facing === 3 ? l.x : cx;
      const fz = l.facing === 2 ? l.z + l.d - 1 : l.facing === 0 ? l.z : cz;
      let found = false;
      for (let k = 1; k <= 14 && !found; k++) {
        for (let o = -6; o <= 6; o++) {
          const x = fx + DX[l.facing] * k + (l.facing % 2 === 0 ? o : 0), z = fz + DZ[l.facing] * k + (l.facing % 2 === 1 ? o : 0);
          if (roadAt(x, z)) { found = true; break; }
        }
      }
      expect(found, `${l.id} faces away from every street`).toBe(true);
    }
  });

  it('answers lotAt in constant time, in agreement with the list, and lotsIntersecting with the lots that touch a chunk', () => {
    for (const p of planner.lots) {
      const { lot } = p;
      for (const [x, z] of [[lot.x, lot.z], [lot.x + lot.w - 1, lot.z], [lot.x, lot.z + lot.d - 1], [lot.x + lot.w - 1, lot.z + lot.d - 1], [lot.x + (lot.w >> 1), lot.z + (lot.d >> 1)]]) {
        expect(planner.lotAt(x, z)?.index, lot.id).toBe(p.index);
      }
    }
    // Streets, verges and the world outside the raster have no lot.
    expect(planner.lotAt(TEMPEST_CENTER_X, 0)).toBeNull();
    expect(planner.lotAt(TEMPEST_CENTER_X + 600, 600)).toBeNull();
    expect(planner.lotAt(-5, -5)).toBeNull();
    // Random cells against a brute-force scan.
    const rng = new Rng(77);
    for (let i = 0; i < 4000; i++) {
      const x = TEMPEST_CENTER_X + rng.int(400) - 200, z = TEMPEST_CENTER_Z + rng.int(400) - 200;
      const brute = planner.lots.find((p) => x >= p.lot.x && x < p.lot.x + p.lot.w && z >= p.lot.z && z < p.lot.z + p.lot.d);
      expect(planner.lotAt(x, z)?.index).toBe(brute?.index);
    }
    // A chunk: the lots with a cell in it are exactly the ones intersecting.
    for (const [cx, cz] of [[46, 0], [47, -2], [44, 3], [50, 5]]) {
      const x0 = cx * 32, z0 = cz * 32;
      const got = planner.lotsIntersecting(x0, z0, x0 + 31, z0 + 31).map((p) => p.index).sort((a, b) => a - b);
      const brute = planner.lots.filter((p) => p.lot.x <= x0 + 31 && p.lot.x + p.lot.w - 1 >= x0 && p.lot.z <= z0 + 31 && p.lot.z + p.lot.d - 1 >= z0).map((p) => p.index);
      expect(got).toEqual(brute);
    }
  });

  it('rasterises roads and blocks exactly as the layout answers them', () => {
    const rng = new Rng(5);
    for (let i = 0; i < 6000; i++) {
      const x = TEMPEST_CENTER_X + rng.int(440) - 220, z = TEMPEST_CENTER_Z + rng.int(440) - 220;
      expect(planner.roadOf(x, z)?.id ?? null).toBe(roadAt(x, z)?.id ?? null);
      // A block's cells are the ones outside its clipped corners; a diagonal street cuts through them, and the planner's raster says road first.
      if (!roadAt(x, z)) expect(planner.blockOf(x, z)?.id ?? null).toBe(blockAt(x, z)?.id ?? null);
    }
  });

  it('is a pure function of the seed: same seed, same plan; another seed, another plan', () => {
    const again = new DistrictPlanner({ seed: WORLD_SEED });
    expect(again.hash()).toBe(planner.hash());
    expect(again.lots.map((p) => p.lot.id)).toEqual(planner.lots.map((p) => p.lot.id));
    expect(new DistrictPlanner({ seed: WORLD_SEED + 1 }).hash()).not.toBe(planner.hash());
  });

  it('gives the lots their storeys, families and neighbours', () => {
    const buildings = planner.lots.filter((p) => p.kind === 'building');
    const near = buildings.filter((p) => Math.max(Math.abs(localX(p.lot.x)), Math.abs(localZ(p.lot.z))) < 80);
    const far = buildings.filter((p) => Math.max(Math.abs(localX(p.lot.x)), Math.abs(localZ(p.lot.z))) > 140);
    const mean = (a: typeof buildings): number => a.reduce((s, p) => s + p.lot.floors, 0) / a.length;
    expect(near.length).toBeGreaterThan(20);
    expect(far.length).toBeGreaterThan(20);
    // Two to three storeys in the centre, one to two near the edge.
    expect(mean(near)).toBeGreaterThan(mean(far) + 0.4);
    expect(Math.min(...buildings.map((p) => p.lot.floors))).toBe(1);
    expect(Math.max(...buildings.map((p) => p.lot.floors))).toBe(3);
    // The town reads as one terracotta mass: the ordinary house is the commonest family, with a clear lead.
    const count = new Map<string, number>();
    for (const p of buildings) count.set(p.lot.family!, (count.get(p.lot.family!) ?? 0) + 1);
    const terracotta = count.get('timber-terracotta') ?? 0;
    expect(terracotta / buildings.length).toBeGreaterThan(0.45);
    for (const [family, n] of count) if (family !== 'timber-terracotta') expect(n, family).toBeLessThan(terracotta / 2);
    // Neighbours: a lot in a row knows the ones beside it.
    expect(planner.lots.some((p) => p.lot.neighbours.left.kind !== null && p.lot.neighbours.right.kind !== null)).toBe(true);
  });

  it('plans the plan: the zoning of Tempest-6, quadrant by quadrant', () => {
    const lotsOf = (district: string) => planner.lots.filter((p) => p.lot.district === district);
    const mean = (ps: typeof planner.lots, f: (p: (typeof planner.lots)[number]) => number): number => ps.reduce((s, p) => s + f(p), 0) / ps.length;
    const lx = (p: (typeof planner.lots)[number]): number => localX(p.lot.x);
    const lz = (p: (typeof planner.lots)[number]): number => localZ(p.lot.z);
    // Government and guests to the north (above the first street row), commerce along the east-west avenue in the west,
    // storage far west, tourism in the south east, public to the north east.
    expect(mean(lotsOf('guest'), lz)).toBeLessThan(-140);
    expect(mean(lotsOf('guest'), lx)).toBeLessThan(-70);
    expect(mean(lotsOf('government'), lz)).toBeLessThan(-140);
    expect(mean(lotsOf('public'), lx)).toBeGreaterThan(30);
    expect(mean(lotsOf('commercial'), lx)).toBeLessThan(-30);
    expect(Math.abs(mean(lotsOf('commercial'), lz))).toBeLessThan(80);
    expect(mean(lotsOf('production'), lx)).toBeLessThan(-100);
    expect(mean(lotsOf('storage'), lx)).toBeLessThan(-100);
    expect(mean(lotsOf('storage'), lz)).toBeGreaterThan(80);
    const tourism = lotsOf('tourism');
    expect(mean(tourism, lx)).toBeGreaterThan(60);
    expect(mean(tourism, lz)).toBeGreaterThan(60);
    // The tourism sector has fewer, bigger plots than the residences, and some left as parks and meadows.
    const area = (ps: typeof planner.lots): number => mean(ps, (p) => p.lot.w * p.lot.d);
    expect(area(tourism)).toBeGreaterThan(area(lotsOf('residential')) * 1.6);
    expect(tourism.filter((p) => p.kind === 'park' || p.kind === 'meadow').length).toBeGreaterThan(2);
    // Public facilities have scaffolded plots; the luxury quarter has empty gardens.
    expect(lotsOf('public').some((p) => p.kind === 'construction')).toBe(true);
    expect(lotsOf('luxury').some((p) => p.kind === 'garden')).toBe(true);
  });
});

describe('the district planner: landmarks, trees, lamps, props', () => {
  it('makes a lot of every landmark, with its id, facing and a ground height', () => {
    expect(planner.landmarkLots).toHaveLength(LANDMARKS.length);
    for (const { landmark, lot } of planner.landmarkLots) {
      expect(lot.id).toBe(landmark.id);
      expect(lot.facing).toBe(landmark.facing ?? 2);
      const b = shapeBounds(landmark.shape);
      expect([lot.x, lot.z, lot.x + lot.w - 1, lot.z + lot.d - 1]).toEqual([b.x0, b.z0, b.x1, b.z1]);
      expect(lot.groundY).toBe(8);
    }
    expect(planner.landmarksIntersecting(TEMPEST_CENTER_X - 3, -3, TEMPEST_CENTER_X + 3, 3).map((l) => l.landmark.id)).toContain('central-square');
    const hall = landmarkById('town-hall')!;
    expect(planner.landmarkLots.find((l) => l.landmark.id === hall.id)!.lot.facing).toBe(2);
  });

  it('plants street trees in the verge, one at each seam of a side, and lamp posts on the edge of every road', () => {
    expect(planner.trees.length).toBeGreaterThan(200);
    for (const t of planner.trees) {
      expect(planner.lotAt(t.x, t.z), `tree at ${t.x},${t.z} in a lot`).toBeNull();
      expect(roadAt(t.x, t.z), `tree at ${t.x},${t.z} on a road`).toBeNull();
    }
    expect(planner.lamps.length).toBeGreaterThan(400);
    for (const l of planner.lamps) {
      const road = roadAt(l.x, l.z);
      expect(road, `lamp ${l.x},${l.z}`).not.toBeNull();
      const out = [[0, -1], [1, 0], [0, 1], [-1, 0]][l.toward];
      // The arm reaches over the road: the cell it points at is road too, and the cell behind the post is not.
      expect(roadAt(l.x + out[0], l.z + out[1])).not.toBeNull();
      expect(roadAt(l.x - out[0], l.z - out[1])).toBeNull();
    }
    expect(planner.lamps.some((l) => l.striped) && planner.lamps.some((l) => !l.striped)).toBe(true);
    expect(planner.lampAt(planner.lamps[0].x, planner.lamps[0].z)).toBeDefined();
  });

  it('lines the boundary road with stalls whose fronts face it', () => {
    expect(planner.props.length).toBeGreaterThan(8);
    const boundary = ROADS.find((r) => r.id === 'boundary-east')!;
    for (const p of planner.props.filter((o) => o.kit === 'street-stall')) {
      expect(p.lot.facing).toBe(3);
      expect(p.lot.x).toBeGreaterThanOrEqual(boundary.rect!.x0);
      expect(p.lot.x + p.lot.w - 1).toBeLessThanOrEqual(boundary.rect!.x1);
      expect(roadAt(p.lot.x - 1, p.lot.z)).not.toBeNull(); // the road is in front of it
    }
  });

  it('leaves the roads out of the town where the RoadNetwork expects them', () => {
    // The roads out run from the grid to the gates, 9 wide and centred on them.
    const probes: Array<[string, (d: number) => [number, number]]> = [
      ['west', (d) => [ROAD_GATES.west.x + d, 0]],
      ['north', (d) => [TEMPEST_CENTER_X, ROAD_GATES.north.z + d]],
    ];
    for (const [name, probe] of probes) {
      for (const d of [1, 40, 120]) {
        const [x, z] = probe(d);
        expect(roadAt(x, z)?.kind, `${d} cells in from the ${name} gate`).toBe('road');
      }
    }
  });
});

describe('splitLength', () => {
  it('cuts a length into pieces within the limits that add up to it', () => {
    const rng = new Rng(3);
    for (let len = 8; len <= 90; len++) {
      for (const [avg, min, max] of [[12, 9, 16], [18, 13, 26], [22, 15, 36]] as const) {
        if (len < min) continue;
        const parts = splitLength(len, avg, min, max, rng);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(len);
        // Only a length too long for one piece and too short for two stays whole, a little over the limit.
        const whole = len > max && len < 2 * min;
        for (const p of parts) { expect(p).toBeGreaterThanOrEqual(whole ? len : min); expect(p).toBeLessThanOrEqual(whole ? len : max); }
      }
    }
  });
});
