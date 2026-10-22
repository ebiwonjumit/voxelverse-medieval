import { describe, expect, it } from 'vitest';
import { percentile, summarizeFrames } from '../bench/stats';

describe('percentile', () => {
  it('uses nearest rank', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(sorted, 50)).toBe(5);
    expect(percentile(sorted, 95)).toBe(10);
    expect(percentile(sorted, 10)).toBe(1);
  });

  it('handles empty and single-element input', () => {
    expect(percentile([], 50)).toBe(0);
    expect(percentile([7], 99)).toBe(7);
  });
});

describe('summarizeFrames', () => {
  it('reports fps, percentiles, max and hitches', () => {
    const frames = [...Array(98).fill(10), 20, 100];
    const s = summarizeFrames(frames);
    expect(s.frames).toBe(100);
    expect(s.p50).toBe(10);
    expect(s.p99).toBe(20);
    expect(s.max).toBe(100);
    expect(s.hitches).toBe(1);
    expect(s.avgFps).toBeCloseTo(1000 / 11, 1);
  });

  it('returns zeros for no frames', () => {
    expect(summarizeFrames([]).frames).toBe(0);
  });
});
