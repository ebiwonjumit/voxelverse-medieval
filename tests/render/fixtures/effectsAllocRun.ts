import { advance, advanceAllocating, busyNight } from './effectsHarness';

// Run by tests/render/effects-alloc.test.ts as a plain node script (bundled, with --expose-gc): measures how much the heap grows
// while the effects run, and prints the numbers as one line of JSON. It is its own process because that is the one place the
// numbers are the game's: inside the test runner's module system the same loop measures the runner (see the test).
const gc = (globalThis as unknown as { gc: () => void }).gc;

const growth = (run: () => void): number => {
  gc();
  const before = process.memoryUsage().heapUsed;
  run();
  return process.memoryUsage().heapUsed - before;
};

const quiet = busyNight();
advance(quiet, 20000); // the run-up and the JIT: their own allocations must be over before the heap is measured
const gathered = quiet.sim.sites.gathered;
const drawn = { glow: quiet.sim.glowDraw, soft: quiet.sim.softDraw };
const frames40k = growth(() => advance(quiet, 40000));
const chunkChanges = quiet.sim.sites.gathered - gathered;
const frames20k = growth(() => advance(quiet, 20000));
const frames200k = growth(() => advance(quiet, 200000));

const control = busyNight();
advance(control, 20000);
let kept: unknown[] = [];
const allocating = growth(() => { kept = advanceAllocating(control, 40000); });
if (kept.length !== 40000) throw new Error('the control did not run');

console.log(JSON.stringify({ drawn, frames40k, frames20k, frames200k, chunkChanges, allocating }));
