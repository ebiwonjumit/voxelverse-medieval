export interface FrameStats {
  frames: number;
  avgFps: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  hitches: number; // frames slower than HITCH_MS
}

export const HITCH_MS = 50;

// Nearest-rank percentile on an ascending-sorted array.
export const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
};

export const summarizeFrames = (frameMs: number[]): FrameStats => {
  if (frameMs.length === 0) {
    return { frames: 0, avgFps: 0, p50: 0, p95: 0, p99: 0, max: 0, hitches: 0 };
  }
  const sorted = [...frameMs].sort((a, b) => a - b);
  const total = frameMs.reduce((sum, ms) => sum + ms, 0);
  return {
    frames: frameMs.length,
    avgFps: round(1000 / (total / frameMs.length)),
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
    max: round(sorted[sorted.length - 1]),
    hitches: frameMs.filter((ms) => ms > HITCH_MS).length,
  };
};

const round = (n: number): number => Math.round(n * 100) / 100;
