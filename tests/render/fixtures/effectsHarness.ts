import { EffectsFrame, EffectsSim } from '../../../render/effects/EffectsSim';

// The scene the allocation test (tests/render/effects-alloc.test.ts) runs, written as a module of its own so the test can bundle it
// together with the effects the way the game's build does: the loop that drives the effects is then optimised like the game's
// frame loop, and what the heap sees is the effects and not the test runner.

export interface Busy {
  sim: EffectsSim;
  frame: EffectsFrame;
}

/** Six chunks in a row with every kind of site, a night sky, a player at the start of the row. */
export const busyNight = (): Busy => {
  const sim = new EffectsSim({ seed: 21, flickerOf: (id) => (id === 163 ? 0.5 : 0) });
  for (let cx = -1; cx <= 4; cx++) {
    const x0 = cx * 32;
    const grid = (n: number, f: (i: number) => number[]) => Array.from({ length: n }, (_, i) => f(i)).flat();
    sim.sites.set(cx, 0, [
      Int32Array.from(grid(50, (i) => [x0 + 2 + (i % 10) * 3, 14, 2 + Math.floor(i / 10) * 4, 51 | (8 << 12)])),
      Int32Array.from(grid(80, (i) => [x0 + 1 + (i % 16) * 2, 9, 2 + Math.floor(i / 16) * 5, 4])),
      Int32Array.from(grid(8, (i) => [x0 + 4 + i * 3, 16, 10 + (i % 3) * 4, 200])),
      Int32Array.from(grid(40, (i) => [x0 + 2 + ((i % 20) * 1.5 | 0), 5, 3 + Math.floor(i / 20) * 6, 163])),
      Int32Array.from(grid(4, (i) => [x0 + 6 + i * 5, 4, 8, 187])),
    ]);
  }
  const frame = new EffectsFrame();
  frame.dt = 1 / 60;
  frame.x = 60.5;
  frame.y = 10.5;
  frame.z = 10.5;
  frame.elevation = -0.8;
  frame.daylight = 0.15;
  return { sim, frame };
};

/** The game's frame object changes every frame (the camera moves, the clock runs), so the loop does the same. */
export const advance = ({ sim, frame }: Busy, frames: number): void => {
  for (let n = 0; n < frames; n++) {
    frame.time += frame.dt;
    frame.x = 60.5 + 50 * Math.sin(frame.time * 0.05); // walks along the row of chunks and back: crosses their borders
    sim.update(frame);
  }
};

/**
 * The same loop with one small array a frame, kept alive (a dead one would be collected before the heap was read): what an
 * allocation costs, to show the test would see one.
 */
export const advanceAllocating = (busy: Busy, frames: number): unknown[] => {
  const kept: unknown[] = new Array(frames);
  for (let n = 0; n < frames; n++) {
    advance(busy, 1);
    kept[n] = [n, n + 1, n + 2, n + 3, n + 4, n + 5, n + 6, n + 7]; // an array of eight numbers: about 100 bytes on the heap
  }
  return kept;
};

/** The objects the GPU's attributes are made of, to check the loop never replaces them. */
export const watched = ({ sim }: Busy): unknown[] => [
  sim.glow, sim.soft, sim.glow.position, sim.glow.params, sim.glow.color, sim.soft.position, sim.soft.params, sim.soft.color,
  sim.glow.x, sim.glow.age, sim.soft.life, sim.sites.near, sim.sites.nearTotals,
];
