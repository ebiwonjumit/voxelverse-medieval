import { describe, expect, it } from 'vitest';
import { Rng, hash2, hash3, hash2f, hash3f } from '../../worldgen/noise/Rng';
import { SimplexNoise } from '../../worldgen/noise/SimplexNoise';
import { billow, domainWarp, fbm, fbm3, ridged } from '../../worldgen/noise/fractal';
import { WORLD_SEED } from '../../worldConstants';

const grid = (n: number, fn: (x: number, z: number) => void, scale = 0.37, off = 0.11) => {
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) fn(i * scale + off, j * scale - off);
};

describe('Rng', () => {
  it('gives the same sequence for the same seed and a different one for another', () => {
    const a = new Rng(7), b = new Rng(7), c = new Rng(8);
    const sa = Array.from({ length: 20 }, () => a.next());
    expect(Array.from({ length: 20 }, () => b.next())).toEqual(sa);
    expect(Array.from({ length: 20 }, () => c.next())).not.toEqual(sa);
  });

  it('stays in [0, 1) with a mean near 0.5', () => {
    const r = new Rng(1);
    let sum = 0, lo = 1, hi = 0;
    for (let i = 0; i < 100000; i++) {
      const v = r.next();
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
      sum += v;
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThan(1);
    expect(Math.abs(sum / 100000 - 0.5)).toBeLessThan(0.01);
  });

  it('int and range respect their bounds', () => {
    const r = new Rng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const k = r.int(6);
      seen.add(k);
      const f = r.range(-2, 5);
      expect(f).toBeGreaterThanOrEqual(-2);
      expect(f).toBeLessThan(5);
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('forks are repeatable and independent of the parent stream', () => {
    const a = new Rng(5), b = new Rng(5);
    expect(a.fork(1).next()).toBe(b.fork(1).next());
    expect(new Rng(5).fork(1).next()).not.toBe(new Rng(5).fork(2).next());
  });
});

describe('integer hashes', () => {
  it('are deterministic and depend on every input', () => {
    expect(hash2(5, 9, 1)).toBe(hash2(5, 9, 1));
    expect(hash2(5, 9, 1)).not.toBe(hash2(5, 9, 2));
    expect(hash2(5, 9, 1)).not.toBe(hash2(9, 5, 1));
    expect(hash2(5, 9, 1)).not.toBe(hash2(6, 9, 1));
    expect(hash3(1, 2, 3, 4)).toBe(hash3(1, 2, 3, 4));
    expect(hash3(1, 2, 3, 4)).not.toBe(hash3(1, 3, 2, 4));
    expect(hash3(1, 2, 3, 4)).not.toBe(hash3(1, 2, 3, 5));
  });

  it('return unsigned 32-bit integers, and floats in [0, 1)', () => {
    for (let i = -50; i < 50; i++) {
      const h = hash2(i, i * 3, 9);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(4294967296);
      const f = hash3f(i, 2, -i, 9);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  // Chi-square against a flat distribution. With 63 degrees of freedom the mean is 63 and the spread about 11,
  // so 130 is a loose bound that still catches a hash with visible structure.
  const chiSquare = (counts: number[], total: number) => {
    const expected = total / counts.length;
    return counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
  };

  it('hash2 is roughly uniform in the high bits, the low bits and over negative coordinates', () => {
    for (const [x0, z0] of [[0, 0], [-300, -300], [-128, 40]]) {
      const hi = new Array(64).fill(0), lo = new Array(64).fill(0);
      for (let x = 0; x < 256; x++) {
        for (let z = 0; z < 256; z++) {
          const h = hash2(x0 + x, z0 + z, WORLD_SEED);
          hi[h >>> 26]++;
          lo[h & 63]++;
        }
      }
      expect(chiSquare(hi, 65536)).toBeLessThan(130);
      expect(chiSquare(lo, 65536)).toBeLessThan(130);
    }
  });

  it('hash2 has no strong link between neighbouring cells', () => {
    // Correlation of a cell with its east neighbour should be about zero (sd ~ 1/sqrt(n)).
    let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
    const n = 40000;
    for (let i = 0; i < n; i++) {
      const a = hash2f(i, 17, 3), b = hash2f(i + 1, 17, 3);
      sx += a; sy += b; sxy += a * b; sxx += a * a; syy += b * b;
    }
    const cov = sxy / n - (sx / n) * (sy / n);
    const corr = cov / Math.sqrt((sxx / n - (sx / n) ** 2) * (syy / n - (sy / n) ** 2));
    expect(Math.abs(corr)).toBeLessThan(0.03);
  });

  it('hash3 is roughly uniform too', () => {
    const buckets = new Array(64).fill(0);
    for (let x = -20; x < 20; x++) for (let y = -20; y < 20; y++) for (let z = -20; z < 20; z++) {
      buckets[hash3(x, y, z, 5) >>> 26]++;
    }
    expect(chiSquare(buckets, 64000)).toBeLessThan(130);
  });
});

describe('SimplexNoise', () => {
  const a = new SimplexNoise(WORLD_SEED);

  it('is deterministic per seed', () => {
    const b = new SimplexNoise(WORLD_SEED);
    for (let i = 0; i < 500; i++) {
      const x = i * 1.37 - 300, y = i * 0.61, z = 200 - i * 0.83;
      expect(b.noise2(x, z)).toBe(a.noise2(x, z));
      expect(b.noise3(x, y, z)).toBe(a.noise3(x, y, z));
    }
  });

  it('differs between seeds: the two fields are uncorrelated', () => {
    // Exact equality is not a good test: near a lattice corner only one or two gradients reach the point,
    // so two seeds can agree by chance. Correlation over many points is.
    const b = new SimplexNoise(WORLD_SEED + 1);
    const corr = (f: (x: number, y: number, z: number) => number, g: (x: number, y: number, z: number) => number) => {
      const r = new Rng(21);
      let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
      const n = 20000;
      for (let i = 0; i < n; i++) {
        const x = r.range(-200, 200), y = r.range(-200, 200), z = r.range(-200, 200);
        const u = f(x, y, z), v = g(x, y, z);
        sx += u; sy += v; sxy += u * v; sxx += u * u; syy += v * v;
      }
      return (sxy / n - (sx / n) * (sy / n)) / Math.sqrt((sxx / n - (sx / n) ** 2) * (syy / n - (sy / n) ** 2));
    };
    expect(Math.abs(corr((x, _y, z) => a.noise2(x, z), (x, _y, z) => b.noise2(x, z)))).toBeLessThan(0.05);
    expect(Math.abs(corr((x, y, z) => a.noise3(x, y, z), (x, y, z) => b.noise3(x, y, z)))).toBeLessThan(0.05);
    // And it is the same field with itself.
    expect(corr((x, _y, z) => a.noise2(x, z), (x, _y, z) => a.noise2(x, z))).toBeCloseTo(1, 10);
  });

  it('stays within [-1, 1], and reaches most of that range', () => {
    let lo2 = 0, hi2 = 0, lo3 = 0, hi3 = 0;
    const r = new Rng(11);
    for (let i = 0; i < 300000; i++) {
      const x = r.range(-500, 500), y = r.range(-500, 500), z = r.range(-500, 500);
      const v2 = a.noise2(x, z), v3 = a.noise3(x, y, z);
      lo2 = Math.min(lo2, v2); hi2 = Math.max(hi2, v2);
      lo3 = Math.min(lo3, v3); hi3 = Math.max(hi3, v3);
    }
    expect(lo2).toBeGreaterThanOrEqual(-1);
    expect(hi2).toBeLessThanOrEqual(1);
    expect(lo3).toBeGreaterThanOrEqual(-1);
    expect(hi3).toBeLessThanOrEqual(1);
    expect(hi2).toBeGreaterThan(0.9);
    expect(lo2).toBeLessThan(-0.9);
    expect(hi3).toBeGreaterThan(0.85);
    expect(lo3).toBeLessThan(-0.85);
  });

  it('has a mean near zero and a sensible spread over a large sample', () => {
    let s2 = 0, q2 = 0, s3 = 0, n = 0;
    const r = new Rng(12);
    for (let i = 0; i < 200000; i++) {
      const x = r.range(-800, 800), z = r.range(-800, 800);
      const v = a.noise2(x, z);
      s2 += v; q2 += v * v;
      s3 += a.noise3(x, r.range(-800, 800), z);
      n++;
    }
    expect(Math.abs(s2 / n)).toBeLessThan(0.01);
    expect(Math.abs(s3 / n)).toBeLessThan(0.01);
    const sd = Math.sqrt(q2 / n - (s2 / n) ** 2);
    expect(sd).toBeGreaterThan(0.25);
    expect(sd).toBeLessThan(0.6);
  });

  it('is smooth: a small step changes the value by a small amount', () => {
    let worst = 0;
    grid(200, (x, z) => {
      worst = Math.max(worst, Math.abs(a.noise2(x + 0.01, z) - a.noise2(x, z)));
    });
    expect(worst).toBeLessThan(0.1);
  });

  it('shows no lattice artefacts: steps from integer and half-integer points change the value alike', () => {
    const d = 0.1;
    let sumInt = 0, sumHalf = 0, sumInt3 = 0, sumHalf3 = 0, n = 0;
    for (let i = -150; i < 150; i++) {
      for (let j = -150; j < 150; j++) {
        sumInt += Math.abs(a.noise2(i + d, j) - a.noise2(i, j)) + Math.abs(a.noise2(i, j + d) - a.noise2(i, j));
        sumHalf += Math.abs(a.noise2(i + 0.5 + d, j + 0.5) - a.noise2(i + 0.5, j + 0.5))
          + Math.abs(a.noise2(i + 0.5, j + 0.5 + d) - a.noise2(i + 0.5, j + 0.5));
        n++;
      }
    }
    for (let i = -30; i < 30; i++) for (let j = -30; j < 30; j++) for (let k = -10; k < 10; k++) {
      sumInt3 += Math.abs(a.noise3(i + d, j, k) - a.noise3(i, j, k));
      sumHalf3 += Math.abs(a.noise3(i + 0.5 + d, j + 0.5, k + 0.5) - a.noise3(i + 0.5, j + 0.5, k + 0.5));
    }
    expect(sumInt).toBeGreaterThan(0);
    expect(Math.abs(sumInt - sumHalf) / sumInt).toBeLessThan(0.05);
    expect(Math.abs(sumInt3 - sumHalf3) / sumInt3).toBeLessThan(0.05);
  });

  it('has no steps at simplex cell edges, in 2D or 3D', () => {
    // A 3D kernel wider than sqrt(0.5) leaves a step of about 0.0035 here; slope-only change is under 1e-4.
    const e = 1e-6;
    let w2 = 0, w3 = 0;
    for (let i = 0; i < 100000; i++) {
      const x = (i * 0.0137) % 50 - 25, y = (i * 0.0071) % 20, z = (i * 0.0191) % 40 - 20;
      w2 = Math.max(w2, Math.abs(a.noise2(x + e, z) - a.noise2(x, z)));
      w3 = Math.max(w3, Math.abs(a.noise3(x + e, y, z) - a.noise3(x, y, z)));
    }
    expect(w2).toBeLessThan(1e-4);
    expect(w3).toBeLessThan(1e-4);
  });

  it('behaves across negative coordinates: continuous over zero and not a mirror image', () => {
    for (let k = 0; k < 50; k++) {
      const z = k * 0.73 - 12;
      expect(Math.abs(a.noise2(-1e-6, z) - a.noise2(1e-6, z))).toBeLessThan(1e-4);
      expect(Math.abs(a.noise2(z, -1e-6) - a.noise2(z, 1e-6))).toBeLessThan(1e-4);
      expect(Math.abs(a.noise3(-1e-6, 3, z) - a.noise3(1e-6, 3, z))).toBeLessThan(1e-4);
    }
    let mirrored = 0;
    for (let k = 1; k <= 200; k++) {
      if (Math.abs(a.noise2(-k * 0.77, k * 0.31) - a.noise2(k * 0.77, k * 0.31)) < 1e-9) mirrored++;
    }
    expect(mirrored).toBeLessThan(3);
    // The statistics on the negative side match the positive side.
    let neg = 0, pos = 0;
    grid(150, (x, z) => { neg += Math.abs(a.noise2(-x - 100, -z - 100)); pos += Math.abs(a.noise2(x + 100, z + 100)); });
    expect(Math.abs(neg - pos) / pos).toBeLessThan(0.05);
  });
});

describe('fractal helpers', () => {
  const n = new SimplexNoise(99);
  const sample = (fn: (x: number, z: number) => number) => {
    let lo = Infinity, hi = -Infinity, sum = 0, count = 0;
    grid(200, (x, z) => {
      const v = fn(x * 3 - 80, z * 3 - 80);
      lo = Math.min(lo, v); hi = Math.max(hi, v); sum += v; count++;
    });
    return { lo, hi, mean: sum / count };
  };

  it('fbm stays in [-1, 1] with a mean near zero, whatever the octave count', () => {
    for (const octaves of [1, 3, 6]) {
      const s = sample((x, z) => fbm(n, x * 0.02, z * 0.02, { octaves }));
      expect(s.lo).toBeGreaterThanOrEqual(-1);
      expect(s.hi).toBeLessThanOrEqual(1);
      expect(Math.abs(s.mean)).toBeLessThan(0.05);
    }
  });

  it('fbm3 stays in [-1, 1]', () => {
    let lo = 0, hi = 0;
    for (let i = 0; i < 20000; i++) {
      const v = fbm3(n, i * 0.013, (i % 97) * 0.07, (i % 31) * 0.19 - 3, { octaves: 3 });
      lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    expect(lo).toBeGreaterThanOrEqual(-1);
    expect(hi).toBeLessThanOrEqual(1);
  });

  it('ridged and billow stay in [0, 1], and ridged peaks where the base noise is zero', () => {
    for (const fn of [ridged, billow]) {
      const s = sample((x, z) => fn(n, x * 0.02, z * 0.02));
      expect(s.lo).toBeGreaterThanOrEqual(0);
      expect(s.hi).toBeLessThanOrEqual(1);
      expect(s.hi - s.lo).toBeGreaterThan(0.3);
    }
    // With one octave, ridged is (1 - |n|)^2: 1 on the zero crossing, 0 at the extremes.
    for (let i = 0; i < 200; i++) {
      const x = i * 0.31, z = i * 0.17;
      const v = n.noise2(x, z);
      expect(ridged(n, x, z, { octaves: 1 })).toBeCloseTo((1 - Math.abs(v)) ** 2, 12);
      expect(billow(n, x, z, { octaves: 1 })).toBeCloseTo(Math.abs(v), 12);
    }
  });

  it('domainWarp is deterministic, bounded by its amount, and reuses the out object', () => {
    const out = { x: 0, z: 0 };
    for (let i = 0; i < 300; i++) {
      const x = i * 3.1 - 400, z = 250 - i * 1.7;
      const w = domainWarp(n, x, z, 40, 0.01, out);
      expect(w).toBe(out);
      expect(Math.abs(w.x - x)).toBeLessThanOrEqual(40);
      expect(Math.abs(w.z - z)).toBeLessThanOrEqual(40);
      const again = domainWarp(n, x, z, 40, 0.01);
      expect(again).toEqual({ x: w.x, z: w.z });
    }
    // The two axes are different fields, so the warp is not a plain diagonal shift.
    let diagonal = 0;
    for (let i = 0; i < 200; i++) {
      const w = domainWarp(n, i * 5.3, i * 2.9, 40, 0.01);
      if (Math.abs((w.x - i * 5.3) - (w.z - i * 2.9)) < 1e-9) diagonal++;
    }
    expect(diagonal).toBeLessThan(3);
  });
});
