import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';

// The effects promise to allocate nothing per frame: every pool and buffer is made in the constructor, and the update loops only
// write into them (docs/effects.md). A JavaScript test cannot count allocations directly, so this one measures what they cost: it
// runs tens of thousands of frames of a busy night (every effect on, the player walking across chunks so the gathering of nearby
// sites and the rebuild of the halos run too) and checks the heap does not grow, and it runs the same loop with a deliberate small
// allocation per frame to show the measurement would see one. It also checks that nothing is replaced: the arrays the GPU reads
// are the same objects before and after.

interface Measured {
  drawn: { glow: number; soft: number };
  frames40k: number;
  frames20k: number;
  frames200k: number;
  chunkChanges: number;
  allocating: number;
}

let measured: Measured;

// The loops are measured in a plain node process, bundled the way the game bundles them (vite, one ES module, no minification).
// Inside the test runner's own module system every call between modules goes through a getter, V8 cannot inline the small
// helpers (smoothstep, the gust, the light) and each call boxes its numbers, and even a bare `object.field += x` loop allocates
// 55 bytes an iteration: the runner measures itself, 60 to 100 bytes a frame that the game does not pay.
beforeAll(async () => {
  const output = await build({
    configFile: false,
    logLevel: 'silent',
    root: join(__dirname, '..', '..'),
    build: { write: false, minify: false, lib: { entry: 'tests/render/fixtures/effectsAllocRun.ts', formats: ['es'], fileName: 'run' } },
  });
  const chunks = Array.isArray(output) ? output : [output];
  const code = (chunks[0] as { output: Array<{ code: string }> }).output[0].code;
  const dir = mkdtempSync(join(tmpdir(), 'voxelverse-alloc-'));
  try {
    const file = join(dir, 'run.mjs');
    writeFileSync(file, code);
    const result = spawnSync(process.execPath, ['--expose-gc', file], { encoding: 'utf8', timeout: 120000 });
    if (result.status !== 0) throw new Error(`the measuring script failed: ${result.stderr || result.error}`);
    measured = JSON.parse(result.stdout.trim().split('\n').pop() as string) as Measured;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 150000);

describe('the effects update loops', () => {
  it('run a busy night: every effect on, particles of every kind, the player crossing chunk borders', () => {
    expect(measured.drawn.glow).toBeGreaterThan(150);
    expect(measured.drawn.soft).toBeGreaterThan(100);
    expect(measured.chunkChanges).toBeGreaterThan(2);
  });

  it('allocate nothing: the heap does not grow over 40,000 frames', () => {
    // A frame that allocated even 40 bytes would grow the heap by 1.6 MB; a quiet run measures 0.2 to 0.8 MB, which is the JIT's and the
    // collector's own bookkeeping and does not grow with the number of frames (next test).
    expect(measured.frames40k).toBeLessThan(1_500_000);
    expect(measured.frames20k).toBeLessThan(1_500_000);
  });

  it('do not grow with the number of frames: ten times as many frames cost no more', () => {
    // 180,000 more frames; 8 bytes a frame would be 1.4 MB.
    expect(measured.frames200k).toBeLessThan(measured.frames20k + 1_400_000);
  });

  it('would be caught if they did: the same loop with one small array a frame grows the heap many times over', () => {
    expect(measured.allocating).toBeGreaterThan(3_000_000);
  });
});

describe('the effects arrays', () => {
  it('are never replaced: the pools and the arrays the GPU reads are the same objects after a long run', async () => {
    const h = await import('./fixtures/effectsHarness');
    const busy = h.busyNight();
    const before = h.watched(busy);
    h.advance(busy, 6000);
    const after = h.watched(busy);
    before.forEach((object, i) => expect(after[i]).toBe(object));
    expect(busy.sim.glow.position.length).toBe((busy.sim.glow.capacity + busy.sim.glow.extra) * 3);
  });
});
