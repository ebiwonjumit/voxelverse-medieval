import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blockRegistry, voxelWorld, worldGenerator } from '../../gameWorld';
import { createDefaultRegistry } from '../../content/blocks';
import { WORLD_MAX_Y, WORLD_MIN_Y } from '../../engine/coords';
import { createDefaultTextureLayout } from '../../content/textures/layout';
import { CellReader } from '../../meshing/CellReader';
import { meshChunk } from '../../meshing/ChunkMesher';
import {
  BIOME_ZONES, DEFAULT_WILD_HEX, LATTICE_STEP, NATURAL_FROM, NATURAL_FULL, WildTint, createLatticeTint, grassTint,
  leavesTint, naturalWeight, naturalness,
} from '../../meshing/biomeTint';
import { hexToLinear } from '../../meshing/color';
import { runMeshJob } from '../../meshing/runMeshJob';
import { Biome, BIOME_COUNT, biomeName } from '../../worldgen/biomes/Biome';
import { BIOME_GRASS_HEX } from '../../worldgen/biomes/BiomeTint';
import { createWorkerGenerator } from '../../worldgen/createWorkerGenerator';
import { BlockType, LodLevel, MILE } from '../../worldConstants';
import { MapReader, registry } from './helpers';

const workerRegistry = createDefaultRegistry();
const workerGenerator = createWorkerGenerator(workerRegistry);
// The tint as the mesh worker builds it, and as a main thread would build it from its own generator.
const workerLayout = createDefaultTextureLayout(workerRegistry);
const mainLayout = createDefaultTextureLayout(blockRegistry);
const workerTint = createLatticeTint((x, z) => workerGenerator.biomeAt(x, z), BIOME_GRASS_HEX);
const mainTint = createLatticeTint((x, z) => worldGenerator.biomeAt(x, z), BIOME_GRASS_HEX);

const rgbOf = (hex: string): number[] => {
  const out = [0, 0, 0];
  hexToLinear(hex, out);
  return out;
};
const grass = (x: number, z: number, wild: WildTint = workerTint): number[] => {
  const out = [0, 0, 0];
  grassTint(x, z, out, 0, wild);
  return out;
};
const dist = (a: number[], b: number[]): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// How green a colour is: how far green is above the stronger of red and blue, relative to green.
const greenness = (c: number[]): number => (c[1] - Math.max(c[0], c[2])) / Math.max(c[1], 1e-6);

// The grass colour as the old blend of the zone centres gave it, with no natural colour: what far from every zone used to look like.
const zoneOnly = (x: number, z: number): number[] => {
  let total = 0;
  const sum = [0, 0, 0];
  for (const zone of BIOME_ZONES) {
    const w = 1 / (Math.hypot(x - zone.x, z - zone.z) + 1);
    const c = rgbOf(zone.hex);
    total += w;
    for (let i = 0; i < 3; i++) sum[i] += c[i] * w;
  }
  return sum.map((v) => v / total);
};

const FAR: Array<[number, number]> = [[-5000, 0], [12000, 12000], [-700, 2500], [-842, 1114], [11150, 0], [3000, 3000], [-3000, -3000], [6000, -2000]];

describe('natural weight', () => {
  it('is 0 inside and just outside every zone, 1 well away, and 0 to 1 between with no corner', () => {
    for (const zone of BIOME_ZONES) {
      expect(naturalWeight(zone.x, zone.z), zone.name).toBe(0);
      expect(naturalWeight(zone.x + zone.radius, zone.z + 0.01), zone.name).toBe(0);
    }
    expect(naturalWeight(0, 200 + NATURAL_FROM)).toBe(0);
    expect(naturalWeight(0, 200 + NATURAL_FROM + 1)).toBeGreaterThan(0);
    for (const [x, z] of FAR) expect(naturalWeight(x, z), `${x},${z}`).toBeGreaterThan(0.95);
    // The shape itself: flat at both ends, rising between, never falling.
    expect(naturalness(-100)).toBe(0);
    expect(naturalness(NATURAL_FROM)).toBe(0);
    expect(naturalness(NATURAL_FULL)).toBe(1);
    expect(naturalness(NATURAL_FULL + 5000)).toBe(1);
    let prev = 0;
    for (let d = NATURAL_FROM; d <= NATURAL_FULL; d += 2) {
      expect(naturalness(d)).toBeGreaterThanOrEqual(prev);
      prev = naturalness(d);
    }
  });

  it('rises with no step: the weight changes by at most 2 percent from one block to the next', () => {
    // A ray from the Town east to Tempest, and one from Amestris out to the west, a block at a time.
    for (const [from, to] of [[0, 1500], [-1500, -4500], [0, -2500]]) {
      let prev = naturalWeight(from, 0);
      const stepDir = Math.sign(to - from);
      for (let x = from; stepDir * (to - x) > 0; x += stepDir) {
        const w = naturalWeight(x, 0);
        expect(Math.abs(w - prev)).toBeLessThan(0.02);
        prev = w;
      }
    }
  });
});

describe('the zone transitions are unchanged', () => {
  it('is the zone colour at every zone centre', () => {
    for (const zone of BIOME_ZONES) {
      const got = grass(zone.x, zone.z);
      const want = rgbOf(zone.hex);
      expect(got[0]).toBeCloseTo(want[0], 2);
      expect(got[1]).toBeCloseTo(want[1], 2);
      expect(got[2]).toBeCloseTo(want[2], 2);
    }
  });

  it('is exactly the old zone blend everywhere the natural colour has no weight, between the Town and grey Amestris too', () => {
    for (let x = -1500; x <= 0; x += 25) {
      if (naturalWeight(x, 0) > 0) continue;
      expect(dist(grass(x, 0), zoneOnly(x, 0)), `x ${x}`).toBeLessThan(1e-9);
    }
    // The middle of the road between the two is still in the old blend, the blue-green turning grey.
    expect(naturalWeight(-750, 0)).toBe(0);
    expect(dist(grass(-750, 0), zoneOnly(-750, 0))).toBeLessThan(1e-9);
  });

  it('moves smoothly from the zones into the wilderness: no step between neighbouring blocks on rays out of every zone', () => {
    let worst = 0;
    for (const zone of BIOME_ZONES) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071]]) {
        let prev = grass(zone.x + dx * zone.radius, zone.z + dz * zone.radius);
        for (let d = zone.radius + 1; d <= zone.radius + 1200; d++) {
          const here = grass(zone.x + dx * d, zone.z + dz * d);
          worst = Math.max(worst, dist(here, prev));
          prev = here;
        }
      }
    }
    // A biome border is a band of LATTICE_STEP blocks (the largest colour gap is about 0.4, so up to 0.05 a block);
    // a hard edge would be the whole gap in one step.
    expect(worst).toBeLessThan(0.08);
  });

  it('crosses chunk borders without a step', () => {
    for (const z of [1100, 2000, 3500]) {
      for (let x = -900; x < 900; x += 32) {
        // x + 31 is the last column of one chunk, x + 32 the first of the next (x is a multiple of 32 only roughly: use real borders).
        const border = Math.round(x / 32) * 32;
        expect(dist(grass(border - 1, z), grass(border, z)), `${border},${z}`).toBeLessThan(0.08);
      }
    }
  });
});

describe('natural colour far from the zones', () => {
  it('is green: green clearly above red and blue, where the old blend was grey-green', () => {
    for (const [x, z] of FAR) {
      const now = grass(x, z);
      const before = zoneOnly(x, z);
      expect(greenness(now), `${x},${z}`).toBeGreaterThan(0.25);
      expect(greenness(now), `${x},${z}`).toBeGreaterThan(greenness(before) + 0.1);
    }
  });

  it('is a meadow green when the mesher is given no generator, so a block is never grey', () => {
    const out = [0, 0, 0];
    grassTint(12000, 12000, out);
    const want = rgbOf(DEFAULT_WILD_HEX);
    expect(out[0]).toBeCloseTo(want[0], 6);
    expect(out[1]).toBeCloseTo(want[1], 6);
    expect(out[2]).toBeCloseTo(want[2], 6);
  });

  it('leaves are the grass colour darkened by 0.7, in the wilderness as before', () => {
    const g = grass(-842, 1114);
    const l = [0, 0, 0];
    leavesTint(-842, 1114, l, 0, workerTint);
    for (let i = 0; i < 3; i++) expect(l[i]).toBeCloseTo(g[i] * 0.7, 6);
  });
});

describe('the biome table', () => {
  it('has a colour for every biome, all different and all green-leaning', () => {
    expect(BIOME_GRASS_HEX).toHaveLength(BIOME_COUNT);
    expect(new Set(BIOME_GRASS_HEX).size).toBe(BIOME_COUNT);
    for (const hex of BIOME_GRASS_HEX) expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
    for (let b = 0; b < BIOME_COUNT; b++) expect(greenness(rgbOf(BIOME_GRASS_HEX[b])), biomeName(b)).toBeGreaterThan(0.05);
  });

  it('shows in the tint: at a lattice point the tint is the colour of the biome there', () => {
    // The tint is sampled at x + 0.5, so a lattice point ix * step is hit by x = ix * step - 0.5.
    const seen = new Set<number>();
    for (let x = -4000; x < 14500; x += 104) {
      for (let z = -3000; z < 7000; z += 104) {
        const biome = workerGenerator.biomeAt(x, z);
        if (seen.has(biome)) continue;
        seen.add(biome);
        const got = [0, 0, 0];
        workerTint(x - 0.5, z - 0.5, got, 0);
        const want = rgbOf(BIOME_GRASS_HEX[biome]);
        expect(dist(got, want), biomeName(biome)).toBeLessThan(1e-6);
      }
    }
    expect(seen.size).toBe(BIOME_COUNT);
  });

  it('gives different biomes different grass: meadow, birch, cedar, bamboo, wetland and alpine all apart', () => {
    const picks = [Biome.MEADOW, Biome.BIRCH_WOOD, Biome.CEDAR_FOREST, Biome.BAMBOO_GROVE, Biome.WETLAND, Biome.ALPINE, Biome.SAKURA_GROVE];
    for (let i = 0; i < picks.length; i++) {
      for (let j = i + 1; j < picks.length; j++) {
        expect(dist(rgbOf(BIOME_GRASS_HEX[picks[i]]), rgbOf(BIOME_GRASS_HEX[picks[j]])), `${biomeName(picks[i])} ${biomeName(picks[j])}`).toBeGreaterThan(0.02);
      }
    }
    // The ones the design names: birch is yellower than meadow, cedar bluer and darker, wetland duller, alpine paler.
    const rgb = (b: Biome) => rgbOf(BIOME_GRASS_HEX[b]);
    expect(rgb(Biome.BIRCH_WOOD)[0] / rgb(Biome.BIRCH_WOOD)[1]).toBeGreaterThan(rgb(Biome.MEADOW)[0] / rgb(Biome.MEADOW)[1]);
    expect(rgb(Biome.CEDAR_FOREST)[2] / rgb(Biome.CEDAR_FOREST)[1]).toBeGreaterThan(rgb(Biome.MEADOW)[2] / rgb(Biome.MEADOW)[1]);
    expect(rgb(Biome.CEDAR_FOREST)[1]).toBeLessThan(rgb(Biome.MEADOW)[1]);
    expect(greenness(rgb(Biome.WETLAND))).toBeLessThan(greenness(rgb(Biome.MEADOW)));
    expect(rgb(Biome.ALPINE)[0]).toBeGreaterThan(rgb(Biome.MEADOW)[0]);
  });

  it('is a soft band at a biome border: a cell with two biomes in its corners gets an in-between colour in its middle', () => {
    let found = 0;
    for (let x = 5000; x < 9000 && found < 5; x += LATTICE_STEP * 3) {
      for (let z = 2000; z < 2400 && found < 5; z += LATTICE_STEP * 3) {
        const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([i, j]) => workerGenerator.biomeAt(x + i * LATTICE_STEP, z + j * LATTICE_STEP));
        if (new Set(corners).size !== 2) continue;
        const colours = corners.map((b) => rgbOf(BIOME_GRASS_HEX[b]));
        const mid = [0, 0, 0];
        workerTint(x + LATTICE_STEP / 2 - 0.5, z + LATTICE_STEP / 2 - 0.5, mid, 0);
        for (const c of colours) if (new Set(corners).size === 2 && dist(c, mid) < 1e-6) throw new Error('the middle of a two biome cell is one of the biomes');
        for (let k = 0; k < 3; k++) {
          expect(mid[k]).toBeGreaterThanOrEqual(Math.min(...colours.map((c) => c[k])) - 1e-9);
          expect(mid[k]).toBeLessThanOrEqual(Math.max(...colours.map((c) => c[k])) + 1e-9);
        }
        found++;
      }
    }
    expect(found).toBeGreaterThan(0);
  });
});

describe('the worker and the main thread agree', () => {
  it('give one tint from two generators built the same way, at the same places', () => {
    let n = 0;
    for (let x = -3000; x < 13000; x += 397) {
      for (let z = -2500; z < 6500; z += 389) {
        expect(grass(x, z, workerTint)).toEqual(grass(x, z, mainTint));
        n++;
      }
    }
    expect(n).toBeGreaterThan(500);
  });

  it('mesh to the same tints: a worker job and a main thread reader over a far chunk', () => {
    const mainThread: CellReader = {
      getCell: (x, y, z) => voxelWorld.getCell(x, y, z),
      yRange: () => ({ minY: WORLD_MIN_Y, maxY: 140 }),
    };
    let checked = 0;
    for (const [cx, cz] of [[-27, 35], [350, 40], [-100, -50]]) {
      const fromWorker = runMeshJob(cx, cz, LodLevel.HIGH, workerGenerator, workerRegistry, workerLayout, undefined, workerTint);
      const fromMain = meshChunk(mainThread, cx, cz, blockRegistry, { layout: mainLayout, wildTint: mainTint });
      for (const bucket of ['opaque', 'cutout'] as const) {
        expect(Array.from(fromWorker[bucket].positions)).toEqual(Array.from(fromMain[bucket].positions));
        expect(Array.from(fromWorker[bucket].tints), `${cx},${cz} ${bucket}`).toEqual(Array.from(fromMain[bucket].tints));
        checked += fromWorker[bucket].tints.length;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('puts a different colour on grass over different biomes in a real chunk, none of it grey', () => {
    const mesh = runMeshJob(-27, 35, LodLevel.HIGH, workerGenerator, workerRegistry, workerLayout, undefined, workerTint);
    const seen = new Set<string>();
    const t = mesh.opaque.tints;
    for (let i = 0; i < t.length; i += 3) {
      if (t[i] === 1 && t[i + 1] === 1 && t[i + 2] === 1) continue;
      seen.add(`${t[i].toFixed(3)},${t[i + 1].toFixed(3)},${t[i + 2].toFixed(3)}`);
      expect(t[i + 1], 'green is the strongest channel of every tint').toBeGreaterThanOrEqual(t[i]);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('the mesher stays pure and cheap', () => {
  const meshing = join(__dirname, '..', '..', 'meshing');
  const importsOf = (file: string): string[] =>
    [...readFileSync(join(meshing, file), 'utf8').matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);

  it('does not import worldgen, content, three or react in the files that use the tint', () => {
    for (const file of ['biomeTint.ts', 'ChunkMesher.ts', 'runMeshJob.ts']) {
      for (const spec of importsOf(file)) {
        expect(spec, file).not.toMatch(/(^|\/)(worldgen|content|zones)(\/|$)/);
        expect(spec, file).not.toMatch(/^(three|react|@react-three)/);
      }
    }
  });

  it('gets its biome from the worker, the one file that may import worldgen', () => {
    const worker = readFileSync(join(meshing, 'mesh.worker.ts'), 'utf8');
    expect(worker).toMatch(/createLatticeTint\(\(x, z\) => generator\.biomeAt\(x, z\), BIOME_GRASS_HEX\)/);
    expect(worker).toMatch(/runMeshJob\([^)]*wildTint\)/);
  });

  it('asks the injected tint once per column of the chunk, however many faces are tinted', () => {
    const layout = createDefaultTextureLayout(registry);
    const asked: string[] = [];
    const wild: WildTint = (x, z, out, offset) => {
      asked.push(`${x},${z}`);
      out[offset] = 0.1;
      out[offset + 1] = 0.5;
      out[offset + 2] = 0.2;
    };
    // Three stacked blocks in each of 4 columns, far from every zone: many tinted faces, 4 columns.
    const blocks: Array<[number, number, number, number]> = [];
    for (const [x, z] of [[10, 10], [11, 10], [10, 11], [11, 11]]) for (let y = 5; y < 8; y++) blocks.push([x - 12000, y, z + 12000, BlockType.GRASS]);
    const mesh = meshChunk(new MapReader(blocks), -375, 375, registry, { layout, wildTint: wild });
    expect(mesh.opaque.indices.length).toBeGreaterThan(0);
    expect(asked.length).toBeLessThanOrEqual(4);
    expect(new Set(asked).size).toBe(asked.length);
  });

  it('reads about 25 lattice biomes for a chunk, not one per column', () => {
    let calls = 0;
    const tint = createLatticeTint(() => { calls++; return Biome.MEADOW; }, BIOME_GRASS_HEX);
    const out = [0, 0, 0];
    for (let x = 320; x < 352; x++) for (let z = -640; z < -608; z++) tint(x, z, out, 0);
    expect(calls).toBeLessThanOrEqual(25);
    // And the next chunk over shares its edge with this one.
    for (let x = 352; x < 384; x++) for (let z = -640; z < -608; z++) tint(x, z, out, 0);
    expect(calls).toBeLessThanOrEqual(25 + 20);
  });

  it('keeps the zone radius in step with the zone shapes the generator uses', () => {
    expect(BIOME_ZONES.find((z) => z.name === 'Tempest')!.radius).toBe(700);
    expect(BIOME_ZONES.find((z) => z.name === 'Town of Beginnings')!.radius).toBe(200);
    expect(BIOME_ZONES.find((z) => z.name === 'Magnolia')!.x).toBe(-1600);
    expect(3 * MILE).toBe(1500);
    expect(WORLD_MAX_Y).toBeGreaterThan(WORLD_MIN_Y);
  });
});
