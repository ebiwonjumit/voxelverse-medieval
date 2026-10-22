import { describe, expect, it } from 'vitest';
import { TERRAIN_MAX_Y, TERRAIN_MIN_Y } from '../../engine/coords';
import { TerrainField, softLimit } from '../../worldgen/terrain/TerrainField';
import { WORLD_SEED } from '../../worldConstants';

describe('softLimit', () => {
  it('leaves everyday heights alone', () => {
    for (let h = -16; h <= 64; h += 4) expect(softLimit(h)).toBe(h);
  });

  it('is smooth, strictly increasing, and stays inside the bounds', () => {
    let prev = softLimit(-400);
    for (let h = -399; h <= 400; h += 0.5) {
      const v = softLimit(h);
      expect(v).toBeGreaterThan(prev);
      // A step of 0.5 in, at most 0.5 out: the limiter only ever compresses.
      expect(v - prev).toBeLessThanOrEqual(0.5 + 1e-9);
      expect(v).toBeGreaterThanOrEqual(TERRAIN_MIN_Y);
      expect(v).toBeLessThanOrEqual(TERRAIN_MAX_Y);
      prev = v;
    }
  });

  it('has no kink where the knees start', () => {
    const slope = (h: number) => (softLimit(h + 0.01) - softLimit(h - 0.01)) / 0.02;
    expect(Math.abs(slope(64) - 1)).toBeLessThan(0.02);
    expect(Math.abs(slope(-16) - 1)).toBeLessThan(0.02);
  });
});

describe('TerrainField', () => {
  const field = new TerrainField(WORLD_SEED);

  it('is repeatable for a seed and different for another', () => {
    const same = new TerrainField(WORLD_SEED);
    const other = new TerrainField(WORLD_SEED + 1);
    let differ = 0;
    for (let i = 0; i < 200; i++) {
      const x = i * 97 - 5000, z = i * 53 - 3000;
      expect(same.height(x, z)).toBe(field.height(x, z));
      if (Math.abs(other.height(x, z) - field.height(x, z)) > 0.5) differ++;
    }
    expect(differ).toBeGreaterThan(100);
  });

  it('keeps the old geography: low hills near the zones, a sea far west, mountains far east', () => {
    let nearSum = 0, nearMax = -Infinity;
    for (let i = 0; i < 400; i++) {
      const h = field.height((i % 20) * 100 - 1000, Math.floor(i / 20) * 100 - 1000);
      nearSum += h;
      nearMax = Math.max(nearMax, h);
    }
    expect(nearSum / 400).toBeGreaterThan(4);
    expect(nearSum / 400).toBeLessThan(18);
    expect(nearMax).toBeLessThan(35);
    expect(field.height(-6000, 0)).toBeLessThan(-25);
    let east = -Infinity;
    for (let z = -3000; z <= 3000; z += 50) east = Math.max(east, field.height(13000, z));
    expect(east).toBeGreaterThan(70);
  });

  it('is rougher in the forest south of z = 4000', () => {
    const roughness = (z0: number) => {
      let sum = 0, n = 0;
      for (let x = 0; x < 3000; x += 7) for (let z = z0; z < z0 + 200; z += 7) {
        sum += Math.abs(field.height(x + 1, z) - field.height(x, z)) + Math.abs(field.height(x, z + 1) - field.height(x, z));
        n += 2;
      }
      return sum / n;
    };
    expect(roughness(5000)).toBeGreaterThan(roughness(1500) * 1.3);
  });
});
