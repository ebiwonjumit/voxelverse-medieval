import { describe, expect, it } from 'vitest';
import { SeededRng, hashString } from '../../content/textures/Rng';

describe('SeededRng', () => {
  it('gives the same sequence for the same seed', () => {
    const a = new SeededRng(1234);
    const b = new SeededRng(1234);
    expect(Array.from({ length: 50 }, () => a.next())).toEqual(Array.from({ length: 50 }, () => b.next()));
  });

  it('gives different sequences for different seeds', () => {
    const a = new SeededRng(1);
    const b = new SeededRng(2);
    expect(Array.from({ length: 8 }, () => a.next())).not.toEqual(Array.from({ length: 8 }, () => b.next()));
  });

  it('stays in range', () => {
    const r = new SeededRng(99);
    for (let i = 0; i < 2000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(7);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
      const g = r.range(-2, 3);
      expect(g).toBeGreaterThanOrEqual(-2);
      expect(g).toBeLessThan(3);
    }
  });

  it('spreads values roughly evenly', () => {
    const r = new SeededRng(7);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 10000; i++) buckets[r.int(10)]++;
    for (const n of buckets) expect(n).toBeGreaterThan(850);
  });

  it('hashes names to stable, distinct seeds', () => {
    expect(hashString('stone')).toBe(hashString('stone'));
    expect(hashString('stone')).not.toBe(hashString('dirt'));
  });
});
