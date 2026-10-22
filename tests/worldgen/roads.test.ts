import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { NatureBlock } from '../../content/blocksNature';
import { Chunk } from '../../engine/Chunk';
import { cellId } from '../../engine/cell';
import { CHUNK_SIZE } from '../../engine/coords';
import { BlockType, WATER_LEVEL, WORLD_SEED } from '../../worldConstants';
import { LegacyZoneAdapter } from '../../worldgen/LegacyZoneAdapter';
import { createVoxelverseGenerator } from '../../worldgen/VoxelverseGenerator';
import { DECK_LEVEL, MAX_GRADE, buildProfile } from '../../worldgen/roads/RoadProfile';
import { RoadEdge, RoadNetwork } from '../../worldgen/roads/RoadNetwork';
import { newRoadHit } from '../../worldgen/roads/RoadField';
import { GATES } from '../../worldgen/roads/layout';
import { insideCore, zoneInfoByName } from '../../worldgen/zones/ZoneInfo';
import { chunkHash } from './chunkHash';

const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const registry = createDefaultRegistry();
const gen = createVoxelverseGenerator(registry);
const legacy = new LegacyZoneAdapter(registry);
const net = gen.roads;

type Pt = [number, number];

const PAVING = new Set<number>([
  BlockType.COBBLESTONE, BlockType.MOSSY_COBBLESTONE, BlockType.PATH, BlockType.DIRT, NatureBlock.GRAVEL,
]);

// Topmost solid block of a column, found through sampleBlock.
const surface = (x: number, z: number, from = 40): { y: number; id: number } => {
  for (let y = from; y > -60; y--) {
    const id = gen.sampleBlock(x, y, z);
    if (id !== BlockType.AIR && id !== BlockType.WATER && registry.isSolid(id)) return { y, id };
  }
  throw new Error(`no ground at ${x},${z}`);
};

// The columns along a road's centreline in whole-block steps, each next to the last.
const centreline = (edge: RoadEdge): Pt[] => {
  const out: Pt[] = [];
  const n = edge.x.length;
  const length = edge.arc[n - 1];
  let v = 0;
  for (let s = 0; s <= length; s += 0.5) {
    while (v < n - 2 && edge.arc[v + 1] < s) v++;
    const f = (s - edge.arc[v]) / (edge.arc[v + 1] - edge.arc[v]);
    const p: Pt = [Math.round(edge.x[v] + (edge.x[v + 1] - edge.x[v]) * f), Math.round(edge.z[v] + (edge.z[v + 1] - edge.z[v]) * f)];
    const prev = out[out.length - 1];
    if (prev && prev[0] === p[0] && prev[1] === p[1]) continue;
    if (prev && prev[0] !== p[0] && prev[1] !== p[1]) out.push([p[0], prev[1]]);
    out.push(p);
  }
  return out;
};

const walkRoad = (name: string): { steps: number; bridgeSteps: number; worstStep: number } => {
  const edge = net.edgeOf(name);
  const hit = newRoadHit();
  let prevY = NaN, bridgeSteps = 0, worst = 0;
  const path = centreline(edge);
  for (const [x, z] of path) {
    const s = surface(x, z);
    net.query(x, z, hit);
    const label = `${name} at ${x},${z}`;
    expect(hit.onRoad, `${label}: on the road`).toBe(true);
    if (hit.bridge) {
      bridgeSteps++;
      expect(s.id, `${label}: deck`).toBe(BlockType.WOOD_PLANK);
    } else {
      expect(PAVING.has(s.id), `${label}: paving, got ${s.id}`).toBe(true);
      // Dry: no water beside the surface or under it.
      expect(gen.sampleBlock(x, s.y - 1, z), `${label}: water under the road`).not.toBe(BlockType.WATER);
    }
    expect(gen.sampleBlock(x, s.y + 1, z), `${label}: water on the road`).not.toBe(BlockType.WATER);
    expect(gen.sampleBlock(x, s.y + 2, z), `${label}: something in the way`).toBe(BlockType.AIR);
    if (!Number.isNaN(prevY)) worst = Math.max(worst, Math.abs(s.y - prevY));
    prevY = s.y;
  }
  return { steps: path.length, bridgeSteps, worstStep: worst };
};

describe('the road network', () => {
  it('has the six roads the phase asks for, each running from gate to gate', () => {
    expect(net.edges.map((e) => e.name)).toEqual([
      'Town of Beginnings - Greensom', 'Town of Beginnings - Tempest', 'Town of Beginnings - Amestris',
      'Town of Beginnings - Bosse', 'Tempest - Fremmevilla', 'Greensom - Magnolia',
    ]);
    const ends: Array<[string, Pt, Pt]> = [
      ['Town of Beginnings - Greensom', [GATES.townSouth.x, GATES.townSouth.z], [GATES.greensomNorth.x, GATES.greensomNorth.z]],
      ['Town of Beginnings - Tempest', [GATES.townEast.x, GATES.townEast.z], [GATES.tempestWest.x, GATES.tempestWest.z]],
      ['Town of Beginnings - Amestris', [GATES.townWest.x, GATES.townWest.z], [GATES.amestrisEast.x, GATES.amestrisEast.z]],
      ['Town of Beginnings - Bosse', [GATES.townNorth.x, GATES.townNorth.z], [GATES.bosseSouth.x, GATES.bosseSouth.z]],
      ['Tempest - Fremmevilla', [GATES.tempestNorth.x, GATES.tempestNorth.z], [GATES.fremmevillaSouth.x, GATES.fremmevillaSouth.z]],
      ['Greensom - Magnolia', [GATES.greensomSouth.x, GATES.greensomSouth.z], [GATES.magnoliaEast.x, GATES.magnoliaEast.z]],
    ];
    for (const [name, a, b] of ends) {
      const e = net.edgeOf(name);
      const n = e.x.length;
      expect([e.x[0], e.z[0]]).toEqual(a);
      expect([e.x[n - 1], e.z[n - 1]]).toEqual(b);
    }
  });

  it('keeps the Town to Greensom road on the old straight line north to south', () => {
    const e = net.edgeOf('Town of Beginnings - Greensom');
    for (let i = 0; i < e.x.length; i++) expect(e.x[i]).toBe(0);
  });

  it('bends gently: the tightest turn has a radius of at least 40 blocks', () => {
    let tightest = Infinity;
    for (const e of net.edges) {
      for (let i = 2; i < e.x.length - 2; i++) {
        const ax = e.x[i] - e.x[i - 2], az = e.z[i] - e.z[i - 2];
        const bx = e.x[i + 2] - e.x[i], bz = e.z[i + 2] - e.z[i];
        const turn = Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz));
        if (turn > 1e-6) tightest = Math.min(tightest, Math.hypot(bx, bz) / turn);
      }
    }
    console.info(`tightest bend: radius ${tightest.toFixed(0)} blocks`);
    expect(tightest).toBeGreaterThan(40);
  });

  it('answers a query from one bucket: no bucket holds more than a few dozen segments', () => {
    const cells = (net as unknown as { cells: Map<number, Int32Array> }).cells;
    let most = 0;
    for (const list of cells.values()) most = Math.max(most, list.length);
    console.info(`${cells.size} buckets, the fullest holds ${most} segments`);
    expect(most).toBeLessThan(80);
    const hit = newRoadHit();
    const t0 = performance.now();
    for (let i = 0; i < 200000; i++) net.query((i * 37) % 4000 - 1500, (i * 91) % 3000 - 1500, hit);
    const per = ((performance.now() - t0) * 1000) / 200000;
    console.info(`query: ${per.toFixed(2)} microseconds`);
    expect(per).toBeLessThan(20);
  });

  it('is the same every time it is built from the same seed, and different for another seed', () => {
    const natural = (x: number, z: number) => 11 + Math.sin(x * 0.01) * 3 + Math.cos(z * 0.013) * 3;
    const a = new RoadNetwork(WORLD_SEED, natural);
    const b = new RoadNetwork(WORLD_SEED, natural);
    const c = new RoadNetwork(WORLD_SEED + 1, natural);
    for (let i = 0; i < a.edges.length; i++) {
      expect(Array.from(b.edges[i].x)).toEqual(Array.from(a.edges[i].x));
      expect(Array.from(b.edges[i].level)).toEqual(Array.from(a.edges[i].level));
    }
    expect(a.waypoints).toEqual(b.waypoints);
    expect(Array.from(c.edges[1].z)).not.toEqual(Array.from(a.edges[1].z));
  });
});

describe('the height of a road', () => {
  it('climbs at most one block in four, keeps its ends, and lifts to the deck over water', () => {
    const n = 400;
    const natural = new Float64Array(n);
    const len = new Float64Array(n - 1).fill(2);
    for (let i = 0; i < n; i++) natural[i] = 12 + 9 * Math.sin(i / 25) + 3 * Math.sin(i / 4);
    for (let i = 150; i < 170; i++) natural[i] = 2; // a river
    const p = buildProfile(natural, len);
    expect(p.level[0]).toBe(natural[0]);
    expect(p.level[n - 1]).toBe(natural[n - 1]);
    for (let i = 1; i < n; i++) expect(Math.abs(p.level[i] - p.level[i - 1]) / 2).toBeLessThanOrEqual(MAX_GRADE + 0.001);
    for (let i = 150; i < 170; i++) { expect(p.bridge[i]).toBe(1); }
    expect(p.bridge[100]).toBe(0);
    for (let i = 1; i < n - 1; i++) expect(p.level[i]).toBeGreaterThanOrEqual(DECK_LEVEL);
    // The deck over the river is level and one block above the water.
    expect(Math.floor(p.level[160])).toBeGreaterThanOrEqual(WATER_LEVEL + 1);
  });

  it('puts the surface exactly at the road level on the centreline, and gives walkable slopes either side', () => {
    const rng = mulberry32(31);
    let worst = 0, rays = 0;
    for (let k = 0; k < 400; k++) {
      const e = net.edges[Math.floor(rng() * net.edges.length)];
      const v = e.wildFrom + 2 + Math.floor(rng() * (e.wildTo - e.wildFrom - 4));
      const tx = e.x[v + 1] - e.x[v - 1], tz = e.z[v + 1] - e.z[v - 1];
      const tl = Math.hypot(tx, tz);
      const nx = -tz / tl, nz = tx / tl;
      let prev = NaN;
      for (let d = -16; d <= 16; d++) {
        const h = gen.terrainHeight(Math.round(e.x[v] + nx * d), Math.round(e.z[v] + nz * d));
        if (!Number.isNaN(prev)) worst = Math.max(worst, Math.abs(h - prev));
        prev = h;
      }
      rays++;
    }
    console.info(`${rays} cross sections: steepest step ${worst}`);
    expect(worst).toBeLessThanOrEqual(2);
  });
});

describe('the ground beside the roads', () => {
  // Every column within 24 blocks of any vertex of the road, bridges and their approaches included, against its
  // 4-neighbours. The random cross sections above cannot be relied on to land on a bridge abutment.
  for (const e of net.edges) {
    it(`${e.name}: no height step above 2 in a 24 block corridor round every vertex`, () => {
      const R = 24;
      const seen = new Set<number>();
      const bad: string[] = [];
      let worst = 0, columns = 0;
      for (let i = 0; i < e.x.length; i++) {
        const cx = Math.round(e.x[i]), cz = Math.round(e.z[i]);
        for (let x = cx - R; x <= cx + R; x++) {
          for (let z = cz - R; z <= cz + R; z++) {
            const key = x * 65536 + z;
            if (seen.has(key)) continue;
            seen.add(key);
            columns++;
            const h = gen.terrainHeight(x, z);
            for (const d of [gen.terrainHeight(x + 1, z), gen.terrainHeight(x, z + 1)]) {
              const step = Math.abs(h - d);
              worst = Math.max(worst, step);
              if (step > 2 && bad.length < 5) bad.push(`${x},${z} step ${step} near vertex ${i}`);
            }
          }
        }
      }
      console.info(`${e.name}: ${columns} corridor columns, ${e.bridge.reduce((a, b) => a + b, 0)} bridge vertices, steepest step ${worst}`);
      expect(bad).toEqual([]);
    }, 60000);
  }
});

describe('walking the roads', () => {
  for (const name of [
    'Town of Beginnings - Tempest', 'Tempest - Fremmevilla', 'Town of Beginnings - Greensom',
    'Town of Beginnings - Amestris', 'Town of Beginnings - Bosse', 'Greensom - Magnolia',
  ]) {
    it(`${name}: every step is road, no step above 1, no water except under a deck`, () => {
      const r = walkRoad(name);
      console.info(`${name}: ${r.steps} steps, ${r.bridgeSteps} on bridges, largest step ${r.worstStep}`);
      expect(r.worstStep).toBeLessThanOrEqual(1);
    }, 30000);
  }
});

describe('where roads meet zone roads', () => {
  const ground = (x: number, z: number) => surface(x, z).y;

  // Legacy road cell just inside the zone, our first cell just outside, across the whole road.
  const joins: Array<{ name: string; along: Pt; across: Pt; legacyAt: Pt; ours: Pt; half: number; legacyId: number }> = [
    { name: 'Town east', along: [1, 0], across: [0, 1], legacyAt: [149, 0], ours: [150, 0], half: 11, legacyId: BlockType.COBBLESTONE },
    { name: 'Town west', along: [-1, 0], across: [0, 1], legacyAt: [-149, 0], ours: [-150, 0], half: 11, legacyId: BlockType.COBBLESTONE },
    { name: 'Town north', along: [0, -1], across: [1, 0], legacyAt: [0, -149], ours: [0, -150], half: 11, legacyId: BlockType.COBBLESTONE },
    { name: 'Town south', along: [0, 1], across: [1, 0], legacyAt: [0, 199], ours: [0, 200], half: 11, legacyId: BlockType.COBBLESTONE },
    { name: 'Greensom north', along: [0, -1], across: [1, 0], legacyAt: [0, 231], ours: [0, 230], half: 2, legacyId: BlockType.COBBLESTONE },
    { name: 'Greensom south', along: [0, 1], across: [1, 0], legacyAt: [0, 369], ours: [0, 370], half: 2, legacyId: BlockType.PATH },
    { name: 'Tempest west avenue', along: [-1, 0], across: [0, 1], legacyAt: [901, 0], ours: [900, 0], half: 4, legacyId: BlockType.STONE_BRICK },
    { name: 'Tempest north avenue', along: [0, -1], across: [1, 0], legacyAt: [1500, -599], ours: [1500, -600], half: 4, legacyId: BlockType.STONE_BRICK },
  ];

  for (const j of joins) {
    it(`${j.name}: the legacy road and ours are the same width and at the same height, side by side`, () => {
      for (let k = -j.half - 2; k <= j.half + 2; k++) {
        const lx = j.legacyAt[0] + j.across[0] * k, lz = j.legacyAt[1] + j.across[1] * k;
        const ox = j.ours[0] + j.across[0] * k, oz = j.ours[1] + j.across[1] * k;
        const inside = Math.abs(k) <= j.half;
        const l = surface(lx, lz), o = surface(ox, oz);
        if (inside) {
          expect(l.id, `legacy ${lx},${lz}`).toBe(j.legacyId);
          expect(PAVING.has(o.id), `ours ${ox},${oz} is ${o.id}`).toBe(true);
          expect(Math.abs(l.y - o.y), `step at ${ox},${oz}`).toBeLessThanOrEqual(1);
        } else {
          expect(PAVING.has(o.id) && net.query(ox, oz).onRoad, `${ox},${oz} is beside the road`).toBe(false);
        }
      }
    });
  }

  it('the roads that end at a zone with no road of its own end square at the core rim, level with its ground', () => {
    for (const [name, g] of [['Amestris District', GATES.amestrisEast], ['Kingdom of Bosse', GATES.bosseSouth],
      ['Kingdom of Fremmevilla', GATES.fremmevillaSouth], ['Magnolia Town', GATES.magnoliaEast]] as const) {
      const info = zoneInfoByName(name)!;
      expect(insideCore(info, g.x, g.z), `${name} gate is outside the core`).toBe(false);
      expect(PAVING.has(surface(g.x, g.z).id)).toBe(true);
      // One block back along the road is the zone's own core, untouched.
      const bx = Math.round(g.x - g.dx * 2), bz = Math.round(g.z - g.dz * 2);
      if (insideCore(info, bx, bz)) {
        expect(gen.sampleBlock(bx, gen.terrainHeight(bx, bz), bz)).toBe(legacy.sampleBlock(bx, legacy.terrainHeight(bx, bz), bz));
        expect(Math.abs(ground(bx, bz) - ground(g.x, g.z)), `${name} step at the gate`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('paints the road onto the zone between the core and the edge, clearing what stood there', () => {
    // Every vertex of a road that lies inside a footprint: paving at the zone's own ground height, air above it
    // (the factories and houses that stand either side are cut by the road, never on it).
    let painted = 0;
    for (const e of net.edges) {
      for (let v = 0; v < e.x.length; v++) {
        if (v >= e.wildFrom && v <= e.wildTo) continue;
        const x = Math.round(e.x[v]), z = Math.round(e.z[v]);
        const info = zoneInfoByName(gen.zoneNameAt(x, z))!;
        expect(insideCore(info, x, z), `${x},${z} is in a core`).toBe(false);
        const s = surface(x, z);
        expect(PAVING.has(s.id), `${e.name} at ${x},${z}: ${s.id}`).toBe(true);
        expect(s.y).toBe(gen.terrainHeight(x, z));
        for (let y = s.y + 1; y < s.y + 40; y++) expect(gen.sampleBlock(x, y, z)).toBe(BlockType.AIR);
        painted++;
      }
    }
    expect(painted).toBeGreaterThan(150);
  });

  it('leaves every zone core exactly as the legacy zone has it, roads or not', () => {
    const rng = mulberry32(77);
    let compared = 0;
    // Points around every gate, which is where a road comes closest to a core.
    for (const g of Object.values(GATES)) {
      for (let k = 0; k < 400; k++) {
        const x = Math.round(g.x + (rng() - 0.5) * 120), z = Math.round(g.z + (rng() - 0.5) * 120);
        const info = zoneInfoByName(gen.zoneNameAt(x, z));
        if (!info || !insideCore(info, x, z)) continue;
        const h = legacy.terrainHeight(x, z);
        expect(gen.terrainHeight(x, z)).toBe(h);
        for (const y of [h - 1, h, h + 1, h + 4]) expect(gen.sampleBlock(x, y, z), `${x},${y},${z}`).toBe(legacy.sampleBlock(x, y, z));
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(1000);
  });
});

describe('paving by distance from the zones', () => {
  it('is cobblestone near a town, packed path between, dirt far out', () => {
    const count = (name: string, from: number, to: number): Map<number, number> => {
      const e = net.edgeOf(name);
      const m = new Map<number, number>();
      for (let i = 0; i < e.x.length; i += 2) {
        if (e.arc[i] < from || e.arc[i] > to || e.bridge[i]) continue;
        const id = surface(Math.round(e.x[i]), Math.round(e.z[i])).id;
        m.set(id, (m.get(id) ?? 0) + 1);
      }
      return m;
    };
    const share = (m: Map<number, number>, ids: number[]): number => {
      let all = 0, some = 0;
      for (const [id, n] of m) { all += n; if (ids.includes(id)) some += n; }
      return some / all;
    };
    const e = net.edgeOf('Greensom - Magnolia');
    const total = e.arc[e.arc.length - 1];
    const near = count('Town of Beginnings - Tempest', 0, 120);
    const mid = count('Town of Beginnings - Tempest', 300, 450);
    const far = count('Greensom - Magnolia', total * 0.4, total * 0.6);
    console.info('near a town', [...near], 'between', [...mid], 'far out', [...far]);
    expect(share(near, [BlockType.COBBLESTONE, BlockType.MOSSY_COBBLESTONE, BlockType.PATH])).toBeGreaterThan(0.9);
    expect(share(near, [BlockType.COBBLESTONE, BlockType.MOSSY_COBBLESTONE])).toBeGreaterThan(0.5);
    expect(share(mid, [BlockType.PATH, NatureBlock.GRAVEL, BlockType.DIRT])).toBeGreaterThan(0.9);
    expect(share(far, [BlockType.DIRT, NatureBlock.GRAVEL])).toBeGreaterThan(0.8);
  });
});

describe('bridges', () => {
  const bridgeVertices = (): Array<{ e: RoadEdge; v: number }> => {
    const out: Array<{ e: RoadEdge; v: number }> = [];
    for (const e of net.edges) for (let v = 0; v < e.x.length; v++) if (e.bridge[v]) out.push({ e, v });
    return out;
  };

  it('has bridges where a road crosses water, with the deck one block above it', () => {
    const list = bridgeVertices();
    expect(list.length).toBeGreaterThan(5);
    let withWater = 0, decks = 0;
    for (const { e, v } of list) {
      const x = Math.round(e.x[v]), z = Math.round(e.z[v]);
      const deck = Math.floor(e.level[v]);
      expect(deck).toBeGreaterThanOrEqual(WATER_LEVEL + 1);
      expect(gen.sampleBlock(x, deck, z)).toBe(BlockType.WOOD_PLANK);
      decks++;
      for (let y = deck - 1; y >= deck - 8; y--) if (gen.sampleBlock(x, y, z) === BlockType.WATER) { withWater++; break; }
    }
    console.info(`${decks} bridge vertices, ${withWater} with water below`);
    expect(withWater).toBeGreaterThan(decks * 0.3);
  });

  it('has rails on both edges, logs under the deck and ramps at both ends', () => {
    const list = bridgeVertices();
    let rails = 0, logs = 0, deckCols = 0;
    for (const { e, v } of list) {
      const x = Math.round(e.x[v]), z = Math.round(e.z[v]);
      const deck = Math.floor(e.level[v]);
      const tx = e.x[v + 1] - e.x[v - 1], tz = e.z[v + 1] - e.z[v - 1];
      const tl = Math.hypot(tx, tz);
      for (const side of [-1, 1]) {
        const sx = Math.round(e.x[v] - (tz / tl) * 2 * side), sz = Math.round(e.z[v] + (tx / tl) * 2 * side);
        if (gen.sampleBlock(sx, deck, sz) === BlockType.WOOD_PLANK) {
          deckCols++;
          if (gen.sampleBlock(sx, deck + 1, sz) === BlockType.WOOD_FENCE) rails++;
          if (gen.sampleBlock(sx, deck - 1, sz) === BlockType.WOOD_LOG) logs++;
        }
      }
      expect(gen.sampleBlock(x, deck + 1, z)).toBe(BlockType.AIR);
    }
    console.info(`${deckCols} edge deck columns: ${rails} with rails, ${logs} with a log beam`);
    expect(rails).toBeGreaterThan(deckCols * 0.7);
    expect(logs).toBeGreaterThan(deckCols * 0.5);
    // The approaches are ramps: the level changes by at most the grade, and a bridge is not at either end of a road.
    for (const e of net.edges) {
      for (let v = 1; v < e.x.length; v++) {
        expect(Math.abs(e.level[v] - e.level[v - 1]) / (e.arc[v] - e.arc[v - 1])).toBeLessThanOrEqual(MAX_GRADE + 0.001);
      }
      expect(e.bridge[0]).toBe(0);
      expect(e.bridge[e.x.length - 1]).toBe(0);
    }
  });
});

describe('waypoints', () => {
  it('stand about every 64 blocks of road and at each end: a fence post with a lantern', () => {
    let length = 0;
    for (const e of net.edges) length += e.arc[e.arc.length - 1];
    console.info(`${net.waypoints.length} waypoints along ${length.toFixed(0)} blocks of road`);
    expect(net.waypoints.length).toBeGreaterThan(length / 64 * 0.7);
    expect(net.waypoints.length).toBeLessThan(length / 64 * 1.6);
    let stood = 0;
    for (const p of net.waypoints) {
      const g = gen.terrainHeight(p.x, p.z);
      if (g <= WATER_LEVEL) continue;
      expect(gen.sampleBlock(p.x, g + 1, p.z)).toBe(BlockType.WOOD_FENCE);
      expect(gen.sampleBlock(p.x, g + 3, p.z)).toBe(BlockType.WOOD_FENCE);
      expect(gen.sampleBlock(p.x, g + 4, p.z)).toBe(BlockType.LANTERN);
      expect(net.query(p.x, p.z).onRoad).toBe(false);
      stood++;
    }
    expect(stood).toBeGreaterThan(net.waypoints.length * 0.9);
  });

  it('keeps every tree, rock and bush off the road itself', () => {
    const rng = mulberry32(5);
    let road = 0;
    for (let i = 0; i < 1500; i++) {
      const e = net.edges[i % net.edges.length];
      const v = e.wildFrom + Math.floor(rng() * (e.wildTo - e.wildFrom));
      const x = Math.round(e.x[v] + (rng() - 0.5) * 3), z = Math.round(e.z[v] + (rng() - 0.5) * 3);
      if (!net.query(x, z).onRoad) continue;
      road++;
      const g = surface(x, z).y;
      for (let y = g + 1; y < g + 12; y++) if (gen.sampleBlock(x, y, z) !== BlockType.AIR) throw new Error(`${x},${y},${z} is in the road`);
    }
    expect(road).toBeGreaterThan(500);
  });
});

describe('determinism and agreement', () => {
  // The chunks the roads touch: both ends of every road, every bridge, every waypoint.
  const roadChunks = (): Pt[] => {
    const seen = new Set<string>();
    const out: Pt[] = [];
    const add = (x: number, z: number) => {
      const c: Pt = [Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)];
      const key = c.join(',');
      if (!seen.has(key)) { seen.add(key); out.push(c); }
    };
    for (const e of net.edges) {
      for (let v = 0; v < e.x.length; v += 20) add(e.x[v], e.z[v]);
      for (let v = 0; v < e.x.length; v++) if (e.bridge[v]) add(e.x[v], e.z[v]);
    }
    for (const p of net.waypoints) add(p.x, p.z);
    return out;
  };

  it('gives the same chunk hash twice from the same seed, whatever the order, and another for another seed', () => {
    const chunks = roadChunks().filter((_, i) => i % 6 === 0).slice(0, 14);
    const a = createVoxelverseGenerator(createDefaultRegistry());
    const b = createVoxelverseGenerator(createDefaultRegistry());
    const forward = chunks.map(([cx, cz]) => chunkHash(a, cx, cz));
    const backward = [...chunks].reverse().map(([cx, cz]) => chunkHash(b, cx, cz)).reverse();
    expect(backward).toEqual(forward);
    expect(chunks.map(([cx, cz]) => chunkHash(a, cx, cz))).toEqual(forward);
    const other = createVoxelverseGenerator(createDefaultRegistry(), 4242);
    const different = chunks.filter(([cx, cz]) => chunkHash(other, cx, cz) !== chunkHash(a, cx, cz)).length;
    expect(different).toBeGreaterThan(chunks.length / 2);
  });

  it('sampleBlock equals generateChunk at 3,000 random points on and around roads, bridges and waypoints', () => {
    const rng = mulberry32(2718);
    const bridges: Array<{ e: RoadEdge; v: number }> = [];
    for (const e of net.edges) for (let v = 0; v < e.x.length; v++) if (e.bridge[v]) bridges.push({ e, v });
    const chunks = new Map<string, Chunk>();
    const chunkAt = (cx: number, cz: number): Chunk => {
      const key = `${cx},${cz}`;
      let c = chunks.get(key);
      if (!c) { c = new Chunk(cx, cz); gen.generateChunk(c); chunks.set(key, c); }
      return c;
    };
    let onRoad = 0, onBridge = 0, nearPost = 0;
    const hit = newRoadHit();
    for (let i = 0; i < 3000; i++) {
      let x: number, z: number, level: number;
      const pick = i % 6;
      if (pick < 2 && bridges.length) {
        const { e, v } = bridges[Math.floor(rng() * bridges.length)];
        x = Math.round(e.x[v] + (rng() - 0.5) * 8); z = Math.round(e.z[v] + (rng() - 0.5) * 8); level = e.level[v];
      } else if (pick === 2) {
        const p = net.waypoints[Math.floor(rng() * net.waypoints.length)];
        x = p.x + Math.floor(rng() * 5) - 2; z = p.z + Math.floor(rng() * 5) - 2; level = gen.terrainHeight(p.x, p.z);
      } else {
        const e = net.edges[Math.floor(rng() * net.edges.length)];
        const v = Math.floor(rng() * e.x.length);
        x = Math.round(e.x[v] + (rng() - 0.5) * 30); z = Math.round(e.z[v] + (rng() - 0.5) * 30); level = e.level[v];
      }
      const y = Math.floor(level) - 7 + Math.floor(rng() * 16);
      net.query(x, z, hit);
      if (hit.onRoad) onRoad++;
      if (hit.onRoad && hit.bridge) onBridge++;
      if (net.hasPost(x, z)) nearPost++;
      const chunk = chunkAt(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
      const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      expect(cellId(chunk.getCell(lx, y, lz)), `at ${x},${y},${z}`).toBe(gen.sampleBlock(x, y, z));
    }
    console.info(`${onRoad} road columns, ${onBridge} of them on bridges; ${nearPost} on posts`);
    expect(onRoad).toBeGreaterThan(300);
    expect(onBridge).toBeGreaterThan(100);
  }, 60000);

  it('agrees column by column, bottom to top, in the chunks of a bridge and of a gate', () => {
    const picks: Pt[] = [];
    for (const e of net.edges) {
      const b = e.bridge.indexOf(1);
      if (b >= 0 && picks.length < 2) picks.push([Math.floor(e.x[b] / CHUNK_SIZE), Math.floor(e.z[b] / CHUNK_SIZE)]);
    }
    picks.push([Math.floor(GATES.tempestWest.x / CHUNK_SIZE), 0], [Math.floor(GATES.townEast.x / CHUNK_SIZE), 0]);
    for (const [cx, cz] of picks) {
      const chunk = new Chunk(cx, cz);
      gen.generateChunk(chunk);
      for (let lz = 0; lz < CHUNK_SIZE; lz += 3) for (let lx = 0; lx < CHUNK_SIZE; lx += 3) {
        for (let y = -20; y < 40; y++) expect(cellId(chunk.getCell(lx, y, lz)), `${cx * CHUNK_SIZE + lx},${y},${cz * CHUNK_SIZE + lz}`).toBe(gen.sampleBlock(cx * CHUNK_SIZE + lx, y, cz * CHUNK_SIZE + lz));
      }
    }
  });
});

describe('speed', () => {
  it('generates chunks that carry a road in well under 40 ms on average', () => {
    const e = net.edgeOf('Greensom - Magnolia');
    const chunks: Pt[] = [];
    for (let v = 60; v < e.x.length - 60 && chunks.length < 20; v += 40) chunks.push([Math.floor(e.x[v] / CHUNK_SIZE), Math.floor(e.z[v] / CHUNK_SIZE)]);
    for (let i = 0; i < 3; i++) gen.generateChunk(new Chunk(chunks[i][0] + 40, chunks[i][1]));
    const t0 = performance.now();
    for (const [cx, cz] of chunks) gen.generateChunk(new Chunk(cx, cz));
    const ms = (performance.now() - t0) / chunks.length;
    console.info(`chunks with a road: ${ms.toFixed(1)} ms average over ${chunks.length}`);
    expect(ms).toBeLessThan(40);
  });
});
