import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { Chunk } from '../../engine/Chunk';
import { cellId } from '../../engine/cell';
import { CHUNK_SIZE, TERRAIN_MAX_Y, TERRAIN_MIN_Y, WORLD_MAX_Y, WORLD_MIN_Y } from '../../engine/coords';
import { LegacyZoneAdapter } from '../../worldgen/LegacyZoneAdapter';
import { createVoxelverseGenerator } from '../../worldgen/VoxelverseGenerator';
import { ZONE_INFOS, ZoneInfo, insetFromEdge } from '../../worldgen/zones/ZoneInfo';
import { getTerrainHeight } from '../../utils/terrain';

const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const registry = createDefaultRegistry();
const gen = createVoxelverseGenerator(registry);
const legacy = new LegacyZoneAdapter(registry);

type Pt = [number, number];

// Whole-number columns along a straight line, each one next to the last (no diagonal jumps), so the largest
// difference between consecutive columns is the largest step a player could walk.
const walk = (x0: number, z0: number, x1: number, z1: number): Pt[] => {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.ceil(len * 2));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const p: Pt = [Math.round(x0 + ((x1 - x0) * i) / n), Math.round(z0 + ((z1 - z0) * i) / n)];
    const prev = out[out.length - 1];
    if (prev && prev[0] === p[0] && prev[1] === p[1]) continue;
    if (prev && prev[0] !== p[0] && prev[1] !== p[1]) out.push([p[0], prev[1]]);
    out.push(p);
  }
  return out;
};

const maxStep = (path: Pt[], height: (x: number, z: number) => number): number => {
  let worst = 0;
  let prev = height(path[0][0], path[0][1]);
  for (let i = 1; i < path.length; i++) {
    const h = height(path[i][0], path[i][1]);
    worst = Math.max(worst, Math.abs(h - prev));
    prev = h;
  }
  return worst;
};

// Rays that start outside the zone, cross its edge at many places and angles, and end beyond the falloff band.
const crossingRays = (info: ZoneInfo, count: number, seed: number): Array<[number, number, number, number]> => {
  const rng = mulberry32(seed);
  const s = info.shape;
  const rays: Array<[number, number, number, number]> = [];
  // Inward only as far as the band ends (or, for the two zones without one, through their own 100 block blend).
  // Past that is the zone's interior, which stays exactly as the old zone made it, quirks included.
  const reach = info.band > 0 ? info.band : 100;
  // The Town of Beginnings and Greensom are only 30 blocks apart, so do not start a ray inside the other one.
  const lead = info.name === 'Greensom Village' || info.name === 'Town of Beginnings' ? 20 : 150;
  for (let i = 0; i < count; i++) {
    let px: number, pz: number, inward: number;
    if (s.kind === 'circle') {
      const theta = (i / count) * Math.PI * 2 + rng() * 0.05;
      px = s.cx + Math.cos(theta) * s.radius;
      pz = s.cz + Math.sin(theta) * s.radius;
      inward = theta + Math.PI;
    } else {
      const side = i % 4;
      const along = (rng() * 2 - 1) * s.half;
      [px, pz] = [[s.cx + s.half, s.cz + along], [s.cx - s.half, s.cz + along], [s.cx + along, s.cz + s.half], [s.cx + along, s.cz - s.half]][side];
      inward = [Math.PI, 0, -Math.PI / 2, Math.PI / 2][side];
    }
    const a = inward + (rng() - 0.5) * 2 * (Math.PI * 0.42); // up to 75 degrees off the normal
    const dx = Math.cos(a), dz = Math.sin(a);
    rays.push([px - dx * lead, pz - dz * lead, px + dx * reach, pz + dz * reach]);
  }
  return rays;
};

// The old zones steer their main roads to a fixed height at the edge, so walk along the edge as well,
// across the road strips, which is where the old terrain jumped sideways.
const tangentRays = (info: ZoneInfo): Array<[number, number, number, number]> => {
  const s = info.shape;
  const rays: Array<[number, number, number, number]> = [];
  const r = s.kind === 'circle' ? s.radius : s.half;
  for (let inset = 0; inset <= info.band; inset += 4) {
    const d = r - inset;
    rays.push([s.cx - 40, s.cz + d, s.cx + 40, s.cz + d]);   // across the north-south road
    rays.push([s.cx - 40, s.cz - d, s.cx + 40, s.cz - d]);
    rays.push([s.cx + d, s.cz - 40, s.cx + d, s.cz + 40]);   // across the east-west road
    rays.push([s.cx - d, s.cz - 40, s.cx - d, s.cz + 40]);
  }
  return rays;
};

describe('height continuity across zone borders', () => {
  const report: string[] = [];

  for (const info of ZONE_INFOS) {
    it(`${info.name}: no step above 2 blocks along rays that cross the border`, () => {
      const rays = [...crossingRays(info, 120, 11 + info.name.length), ...tangentRays(info)];
      let steps = 0;
      let newMax = 0, oldMax = 0;
      let worst = '';
      for (const [x0, z0, x1, z1] of rays) {
        const path = walk(x0, z0, x1, z1);
        steps += path.length;
        const n = maxStep(path, (x, z) => gen.terrainHeight(x, z));
        if (n > newMax) { newMax = n; worst = `${x0.toFixed(0)},${z0.toFixed(0)} -> ${x1.toFixed(0)},${z1.toFixed(0)}`; }
        oldMax = Math.max(oldMax, maxStep(path, getTerrainHeight));
      }
      report.push(`${info.name}: new max step ${newMax}, old max step ${oldMax} (${rays.length} rays, ${steps} columns)`);
      console.info(report[report.length - 1]);
      expect(steps).toBeGreaterThan(5000);
      expect(newMax, `worst ray ${worst}`).toBeLessThanOrEqual(2);
      // The three flat kingdoms are the reason the blender exists: they really did end in cliffs.
      if (info.name.includes('Bosse') || info.name.includes('Fremmevilla') || info.name.includes('Magnolia')) {
        expect(oldMax).toBeGreaterThan(2);
      }
    });
  }

  it('the open wilderness between the zones is walkable too', () => {
    // Long runs well away from every zone, west of the mountains and east of the sea.
    const rng = mulberry32(5);
    let worst = 0;
    for (let i = 0; i < 40; i++) {
      const x = -2500 + rng() * 11000;
      const z = rng() * 9000 - 2500;
      const a = rng() * Math.PI * 2;
      worst = Math.max(worst, maxStep(walk(x, z, x + Math.cos(a) * 800, z + Math.sin(a) * 800), (px, pz) => gen.terrainHeight(px, pz)));
    }
    console.info(`open wilderness max step ${worst}`);
    expect(worst).toBeLessThanOrEqual(2);
  });
});

describe('zone cores', () => {
  const randomIn = (rng: () => number, cx: number, cz: number, r: number, square = false): Pt => {
    if (square) return [Math.round(cx + (rng() * 2 - 1) * (r - 1)), Math.round(cz + (rng() * 2 - 1) * (r - 1))];
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * (r - 1);
    return [Math.round(cx + Math.cos(a) * d), Math.round(cz + Math.sin(a) * d)];
  };

  it('match LegacyZoneAdapter at 3,000 random points', () => {
    const rng = mulberry32(2024);
    const cores = ZONE_INFOS.filter((i) => ['Town of Beginnings', 'Greensom Village', 'Federation of Tempest', 'Amestris District'].includes(i.name));
    expect(cores.map((c) => c.core)).toEqual([140, 45, 550, 550]);
    let compared = 0;
    for (let i = 0; i < 3000; i++) {
      const info = cores[i % cores.length];
      const [x, z] = randomIn(rng, info.shape.cx, info.shape.cz, info.core, info.shape.kind === 'square');
      const h = legacy.terrainHeight(x, z);
      expect(gen.terrainHeight(x, z), `height at ${x},${z}`).toBe(h);
      expect(gen.zoneNameAt(x, z)).toBe(info.name);
      const pick = rng();
      const y = pick < 0.75 ? h - 2 + Math.floor(rng() * 72) : WORLD_MIN_Y + Math.floor(rng() * (h - WORLD_MIN_Y + 1));
      expect(gen.sampleBlock(x, y, z), `block at ${x},${y},${z}`).toBe(legacy.sampleBlock(x, y, z));
      compared++;
    }
    expect(compared).toBe(3000);
  });

  it('match LegacyZoneAdapter cell for cell in whole chunks with landmarks', () => {
    const chunks: Pt[] = [[0, 0], [-1, -1], [46, -4], [53, 0], [-47, 2], [0, 8], [-1, 9]];
    let structure = 0;
    for (const [cx, cz] of chunks) {
      const a = new Chunk(cx, cz);
      const b = new Chunk(cx, cz);
      legacy.generateChunk(a);
      gen.generateChunk(b);
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const h = legacy.terrainHeight(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz);
          for (let y = WORLD_MIN_Y; y <= WORLD_MAX_Y; y++) {
            const expected = a.getCell(lx, y, lz);
            if (b.getCell(lx, y, lz) !== expected) throw new Error(`chunk ${cx},${cz} differs at ${lx},${y},${lz}`);
            if (y > h && expected !== 0 && expected !== 5) structure++;
          }
        }
      }
    }
    expect(structure).toBeGreaterThan(10000);
  });
});

describe('sampleBlock and generateChunk agree', () => {
  it('at 3,000 random points', () => {
    const rng = mulberry32(99);
    // Edges of every zone, the bands, the open country, the coast and the mountains.
    const spots: Array<{ x: number; z: number; r: number }> = [
      ...ZONE_INFOS.map((i) => ({ x: i.shape.cx, z: i.shape.cz, r: (i.shape.kind === 'circle' ? i.shape.radius : i.shape.half) * 1.1 })),
      { x: 500, z: 500, r: 300 }, { x: 0, z: 2500, r: 600 }, { x: -3000, z: 0, r: 900 }, { x: 11000, z: 0, r: 900 },
      { x: 0, z: 5500, r: 500 },
    ];
    const chunks = new Map<string, Chunk>();
    const chunkAt = (cx: number, cz: number): Chunk => {
      const key = `${cx},${cz}`;
      let c = chunks.get(key);
      if (!c) { c = new Chunk(cx, cz); gen.generateChunk(c); chunks.set(key, c); }
      return c;
    };
    // 60 chunks with 50 points each: generating a chunk is the expensive part, so share it between points.
    let centre: Pt = [0, 0];
    for (let i = 0; i < 3000; i++) {
      if (i % 50 === 0) {
        const spot = spots[(i / 50) % spots.length];
        const a = rng() * Math.PI * 2;
        const d = Math.sqrt(rng()) * spot.r;
        centre = [Math.floor((spot.x + Math.cos(a) * d) / CHUNK_SIZE), Math.floor((spot.z + Math.sin(a) * d) / CHUNK_SIZE)];
      }
      const x = centre[0] * CHUNK_SIZE + Math.floor(rng() * CHUNK_SIZE);
      const z = centre[1] * CHUNK_SIZE + Math.floor(rng() * CHUNK_SIZE);
      const h = gen.terrainHeight(x, z);
      const pick = rng();
      const y = pick < 0.6 ? h - 4 + Math.floor(rng() * 70)
        : pick < 0.8 ? WORLD_MIN_Y + Math.floor(rng() * (h - WORLD_MIN_Y + 1))
        : WORLD_MIN_Y + Math.floor(rng() * (WORLD_MAX_Y - WORLD_MIN_Y + 1));
      const yy = Math.min(WORLD_MAX_Y, Math.max(WORLD_MIN_Y, y));
      const chunk = chunkAt(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
      const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      expect(cellId(chunk.getCell(lx, yy, lz)), `at ${x},${yy},${z}`).toBe(gen.sampleBlock(x, yy, z));
    }
  }, 60000);

  it('every column of a chunk matches, from the bottom of the world to the top', () => {
    for (const [cx, cz] of [[10, 10], [-47, 47], [0, -20], [48, -50]] as Pt[]) {
      const chunk = new Chunk(cx, cz);
      gen.generateChunk(chunk);
      for (let lz = 0; lz < CHUNK_SIZE; lz += 5) {
        for (let lx = 0; lx < CHUNK_SIZE; lx += 5) {
          for (let y = WORLD_MIN_Y; y <= WORLD_MAX_Y; y++) {
            expect(cellId(chunk.getCell(lx, y, lz))).toBe(gen.sampleBlock(cx * CHUNK_SIZE + lx, y, cz * CHUNK_SIZE + lz));
          }
        }
      }
    }
  });
});

describe('terrain bounds', () => {
  it('heights stay inside TERRAIN_MIN_Y..TERRAIN_MAX_Y across the world, with no flat limit plateaus', () => {
    const rng = mulberry32(4);
    let lo = Infinity, hi = -Infinity, atMin = 0, atMax = 0, total = 0;
    const sample = (x: number, z: number) => {
      const h = gen.terrainHeight(x, z);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
      if (h === TERRAIN_MIN_Y) atMin++;
      if (h === TERRAIN_MAX_Y) atMax++;
      total++;
    };
    for (let i = 0; i < 20000; i++) sample(Math.round((rng() * 2 - 1) * 20000), Math.round((rng() * 2 - 1) * 20000));
    // Far east and far west, well beyond anything a player is likely to reach.
    for (let i = 0; i < 5000; i++) {
      sample(Math.round(10000 + rng() * 90000), Math.round((rng() * 2 - 1) * 20000));
      sample(Math.round(-3000 - rng() * 90000), Math.round((rng() * 2 - 1) * 20000));
    }
    console.info(`heights ${lo}..${hi}, at min ${atMin}, at max ${atMax} of ${total}`);
    expect(lo).toBeGreaterThanOrEqual(TERRAIN_MIN_Y);
    expect(hi).toBeLessThanOrEqual(TERRAIN_MAX_Y);
    // The mountains and the sea really do reach towards the bounds...
    expect(hi).toBeGreaterThan(90);
    expect(lo).toBeLessThan(-35);
    // ...without piling up on them.
    expect(atMin / total).toBeLessThan(0.002);
    expect(atMax / total).toBeLessThan(0.002);
  });
});

describe('seeds', () => {
  const hashChunk = (g: ReturnType<typeof createVoxelverseGenerator>, cx: number, cz: number): number => {
    const chunk = new Chunk(cx, cz);
    g.generateChunk(chunk);
    let h = 2166136261;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let y = WORLD_MIN_Y; y <= WORLD_MAX_Y; y++) h = Math.imul(h ^ chunk.getCell(lx, y, lz), 16777619);
    }
    return h >>> 0;
  };

  it('the same seed gives the same chunk hash twice, another seed a different one', () => {
    const again = createVoxelverseGenerator(createDefaultRegistry());
    const other = createVoxelverseGenerator(createDefaultRegistry(), 12345);
    for (const [cx, cz] of [[20, 20], [-5, 60], [3, -3]] as Pt[]) {
      expect(hashChunk(again, cx, cz)).toBe(hashChunk(gen, cx, cz));
      expect(hashChunk(other, cx, cz)).not.toBe(hashChunk(gen, cx, cz));
    }
  });
});

describe('speed', () => {
  it('generates wilderness chunks in well under 40 ms on average', () => {
    for (let i = 0; i < 4; i++) gen.generateChunk(new Chunk(30 + i, 30)); // warm up
    const t0 = performance.now();
    const n = 24;
    for (let i = 0; i < n; i++) gen.generateChunk(new Chunk(20 + (i % 6), 20 + Math.floor(i / 6)));
    const ms = (performance.now() - t0) / n;
    console.info(`wilderness chunk: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(40);
  });
});

describe('level of detail', () => {
  it('LOD 0 leaves the ground alone and only simplifies details above it', () => {
    for (const [cx, cz] of [[20, 20], [46, -4], [0, 8]] as Pt[]) {
      const full = new Chunk(cx, cz);
      const far = new Chunk(cx, cz);
      gen.generateChunk(full);
      gen.generateChunk(far, { lod: 0 });
      let opaque = 0, opaqueChanged = 0, fullBlocks = 0, farBlocks = 0, changed = 0;
      for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const h = gen.terrainHeight(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz);
        for (let y = WORLD_MIN_Y; y <= h; y++) expect(far.getCell(lx, y, lz)).toBe(full.getCell(lx, y, lz));
        for (let y = h + 1; y <= WORLD_MAX_Y; y++) {
          const a = full.getCell(lx, y, lz);
          const b = far.getCell(lx, y, lz);
          if (a !== 0) fullBlocks++;
          if (b !== 0) farBlocks++;
          if (a !== b) changed++;
          if (a !== 0 && registry.isOpaque(a)) {
            opaque++;
            if (a !== b) opaqueChanged++;
          }
        }
      }
      // The wilderness has nothing to simplify yet; the zones drop grass, flowers, fences and lanterns.
      if (cx === 20) expect(changed).toBe(0);
      expect(farBlocks).toBeLessThanOrEqual(fullBlocks);
      expect(opaqueChanged).toBeLessThanOrEqual(opaque * 0.05);
    }
  });
});

describe('zone shapes', () => {
  it('ZoneInfo agrees with the legacy zones about who owns a point', () => {
    const rng = mulberry32(8);
    for (const info of ZONE_INFOS) {
      const s = info.shape;
      const r = s.kind === 'circle' ? s.radius : s.half;
      for (let i = 0; i < 400; i++) {
        const x = Math.round(s.cx + (rng() * 2 - 1) * r * 1.2);
        const z = Math.round(s.cz + (rng() * 2 - 1) * r * 1.2);
        const owner = gen.zoneNameAt(x, z);
        const inside = insetFromEdge(s, x, z) > 0;
        expect(owner === info.name, `${info.name} at ${x},${z}`).toBe(inside);
      }
    }
  });

  it('keeps cores inside the zone and bands inside the core', () => {
    for (const info of ZONE_INFOS) {
      const r = info.shape.kind === 'circle' ? info.shape.radius : info.shape.half;
      expect(info.core).toBeLessThan(r);
      expect(info.core).toBeLessThanOrEqual(r - info.band);
    }
  });
});
