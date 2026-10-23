import { describe, expect, it } from 'vitest';
import { Biome, BIOME_COUNT, biomeName } from '../../worldgen/biomes/Biome';
import { BiomeMap } from '../../worldgen/biomes/BiomeMap';
import { WORLD_SEED } from '../../worldConstants';

const map = new BiomeMap(WORLD_SEED);

// Share of each biome over a grid inside a box.
const shares = (m: BiomeMap, x0: number, x1: number, z0: number, z1: number, step: number): number[] => {
  const counts = new Array(BIOME_COUNT).fill(0);
  let n = 0;
  for (let x = x0; x < x1; x += step) {
    for (let z = z0; z < z1; z += step) {
      counts[m.biomeAt(x, z)]++;
      n++;
    }
  }
  return counts.map((c) => c / n);
};

const describeShares = (s: number[]): string => s.map((v, i) => `${biomeName(i)} ${(v * 100).toFixed(0)}%`).join(', ');
const sum = (s: number[], ...biomes: Biome[]): number => biomes.reduce((t, b) => t + s[b], 0);

describe('biome map', () => {
  it('samples every biome over a wide area, none of them as a speck', () => {
    const s = shares(map, -4000, 14500, -3000, 7000, 100);
    console.info(`wide area: ${describeShares(s)}`);
    for (let b = 0; b < BIOME_COUNT; b++) expect(s[b], biomeName(b)).toBeGreaterThan(0.01);
  });

  it('makes the belt around Tempest cedar forest with bamboo and sakura groves (x 1000-1500, z 100-600)', () => {
    const s = shares(map, 1000, 1500, 100, 600, 8);
    console.info(`Tempest belt: ${describeShares(s)}`);
    expect(sum(s, Biome.CEDAR_FOREST, Biome.BAMBOO_GROVE, Biome.SAKURA_GROVE)).toBeGreaterThan(0.95);
    expect(s[Biome.CEDAR_FOREST]).toBeGreaterThan(s[Biome.BAMBOO_GROVE]);
    expect(s[Biome.CEDAR_FOREST]).toBeGreaterThan(s[Biome.SAKURA_GROVE]);
    expect(s[Biome.BAMBOO_GROVE]).toBeGreaterThan(0.1);
    expect(s[Biome.SAKURA_GROVE]).toBeGreaterThan(0.05);
  });

  it('keeps the Town of Beginnings and Greensom in gentle meadow and oak country', () => {
    const s = shares(map, -400, 400, -300, 600, 10);
    console.info(`home country: ${describeShares(s)}`);
    expect(s[Biome.MEADOW]).toBeGreaterThan(0.5);
    expect(sum(s, Biome.MEADOW, Biome.OAK_WOOD, Biome.BIRCH_WOOD)).toBeGreaterThan(0.8);
    expect(sum(s, Biome.CEDAR_FOREST, Biome.BAMBOO_GROVE, Biome.SAKURA_GROVE, Biome.ROCKY_HILLS, Biome.ALPINE, Biome.BEACH)).toBeLessThan(0.1);
  });

  it('turns to denser forest south of z = 4000', () => {
    const woods = (s: number[]) => sum(s, Biome.BIRCH_WOOD, Biome.OAK_WOOD, Biome.CEDAR_FOREST, Biome.PINE_FOREST, Biome.BAMBOO_GROVE, Biome.SAKURA_GROVE);
    // The land around the Town and Greensom, west of the Tempest belt, against the land south of the forest line.
    const home = shares(map, -600, 600, -300, 700, 20);
    const south = shares(map, -1000, 2500, 4400, 6500, 20);
    console.info(`woodland: home ${(woods(home) * 100).toFixed(0)}%, south ${(woods(south) * 100).toFixed(0)}%`);
    expect(woods(south)).toBeGreaterThan(0.6);
    expect(woods(south)).toBeGreaterThan(woods(home) * 1.6);
    // And the trees stand thicker: the density multiplier the features use.
    const climate = { temperature: 0, moisture: 0, woodiness: 0, wetness: 0, belt: 0, home: 0, density: 1 };
    let southDensity = 0, homeDensity = 0, n = 0;
    for (let x = -600; x <= 600; x += 100) {
      for (let z = 0; z <= 600; z += 100) {
        homeDensity += map.climate(x, z, 10, climate).density;
        southDensity += map.climate(x, z + 4800, 10, climate).density;
        n++;
      }
    }
    expect(southDensity / n).toBeGreaterThan(1.4 * (homeDensity / n));
  });

  it('is rocky hills and alpine snow in the far east mountains', () => {
    const s = shares(map, 11000, 14000, -2000, 2000, 25);
    console.info(`far east: ${describeShares(s)}`);
    expect(sum(s, Biome.ROCKY_HILLS, Biome.ALPINE)).toBeGreaterThan(0.8);
    expect(s[Biome.ALPINE]).toBeGreaterThan(0.1);
    expect(s[Biome.ROCKY_HILLS]).toBeGreaterThan(s[Biome.ALPINE]);
  });

  it('has beaches along the western coast', () => {
    const s = shares(map, -3600, -2600, -1500, 1500, 20);
    console.info(`west coast: ${describeShares(s)}`);
    expect(s[Biome.BEACH]).toBeGreaterThan(0.3);
    // The beach hugs the water: the sea floor far out is beach too, but inland of x = -2000 there is none.
    expect(shares(map, -2000, 2000, -500, 500, 25)[Biome.BEACH]).toBe(0);
  });

  it('has wetland pockets, rare and away from the home country', () => {
    const wide = shares(map, -3000, 3000, -3000, 6000, 40);
    expect(wide[Biome.WETLAND]).toBeGreaterThan(0.02);
    expect(wide[Biome.WETLAND]).toBeLessThan(0.2);
    expect(shares(map, -350, 350, -200, 500, 10)[Biome.WETLAND]).toBe(0);
  });

  it('changes visibly on the way from the Town to Tempest', () => {
    // Walk the road line from the Town's edge to Tempest's and look at what is under it.
    const seen = new Set<Biome>();
    const firstAt = new Map<Biome, number>();
    for (let x = 200; x <= 800; x += 4) {
      const b = map.biomeAt(x, 0);
      seen.add(b);
      if (!firstAt.has(b)) firstAt.set(b, x);
    }
    console.info(`Town to Tempest: ${[...seen].map((b) => `${biomeName(b)}@${firstAt.get(b)}`).join(', ')}`);
    expect(seen.size).toBeGreaterThanOrEqual(3);
    expect(map.biomeAt(210, 0)).not.toBe(map.biomeAt(790, 0));
    // Meadow or oak country comes first and the belt biomes only start further out.
    const beltStart = Math.min(...[Biome.CEDAR_FOREST, Biome.BAMBOO_GROVE, Biome.SAKURA_GROVE].map((b) => firstAt.get(b) ?? Infinity));
    expect(beltStart).toBeGreaterThan(300);
  });

  it('has ragged biome borders, not straight lines', () => {
    // Where the belt starts, going east along rows 20 blocks apart: a straight border would give the same x every row
    // and a circle a smooth drift. Neighbouring rows differ by tens of blocks.
    const starts: number[] = [];
    for (let z = -1200; z <= 1200; z += 20) {
      for (let x = 0; x < 1100; x += 5) {
        const b = map.biomeAt(x, z);
        if (b === Biome.CEDAR_FOREST || b === Biome.BAMBOO_GROVE || b === Biome.SAKURA_GROVE) {
          starts.push(x);
          break;
        }
      }
    }
    let jag = 0;
    for (let i = 1; i < starts.length; i++) jag += Math.abs(starts[i] - starts[i - 1]);
    const meanStep = jag / (starts.length - 1);
    console.info(`belt border: mean step between rows ${meanStep.toFixed(1)} blocks over ${starts.length} rows`);
    expect(starts.length).toBeGreaterThan(40);
    expect(meanStep).toBeGreaterThan(15);

    // The same goes for the meadow/wood border along a single row: several short runs, not one cut.
    let changes = 0;
    let prev = map.biomeAt(-300, 600);
    for (let x = -299; x <= 700; x++) {
      const b = map.biomeAt(x, 600);
      if (b !== prev) changes++;
      prev = b;
    }
    expect(changes).toBeGreaterThan(2);
  });

  it('is repeatable for a seed and different for another', () => {
    const same = new BiomeMap(WORLD_SEED);
    const other = new BiomeMap(WORLD_SEED + 1);
    let differ = 0;
    for (let i = 0; i < 400; i++) {
      const x = i * 97 - 3000, z = (i * 53) % 4000 - 1500;
      expect(same.biomeAt(x, z)).toBe(map.biomeAt(x, z));
      if (other.biomeAt(x, z) !== map.biomeAt(x, z)) differ++;
    }
    expect(differ).toBeGreaterThan(100);
  });

  it('exposes temperature, moisture and elevation as smooth fields in range', () => {
    let prevT = map.temperature(0, 100), prevM = map.moisture(0, 100);
    let maxT = 0, maxM = 0;
    for (let x = 1; x < 2000; x++) {
      const t = map.temperature(x, 100), m = map.moisture(x, 100);
      maxT = Math.max(maxT, Math.abs(t - prevT));
      maxM = Math.max(maxM, Math.abs(m - prevM));
      expect(Math.abs(t)).toBeLessThanOrEqual(2);
      expect(Math.abs(m)).toBeLessThanOrEqual(2);
      prevT = t; prevM = m;
    }
    // No jumps between neighbouring blocks.
    expect(maxT).toBeLessThan(0.1);
    expect(maxM).toBeLessThan(0.1);
    expect(map.temperature(-500, -2800)).toBeLessThan(map.temperature(-500, 2800)); // colder in the north
    expect(map.elevation(13000, 0)).toBeGreaterThan(map.elevation(500, 0) + 30);
  });
});
