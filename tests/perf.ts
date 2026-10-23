// Shared helper for the wall-clock assertions in the suite. CI machines are slower and noisier than a laptop, so every
// timing limit and slow-test timeout goes through here. PERF_TOLERANCE (default 1) multiplies the limit; the CI
// workflow sets it to 4. The limits themselves stay as written in each test, only the allowance scales.

const raw = Number(process.env.PERF_TOLERANCE);

/** The multiplier from the PERF_TOLERANCE environment variable; 1 when unset or not a number >= 1. */
export const PERF_TOLERANCE = Number.isFinite(raw) && raw >= 1 ? raw : 1;

/** A timing limit (ms, microseconds, anything) scaled by the tolerance. */
export const tolerant = (limit: number): number => limit * PERF_TOLERANCE;

/** A vitest per-test timeout in ms, scaled by the tolerance. */
export const timeoutMs = (ms: number): number => ms * PERF_TOLERANCE;
