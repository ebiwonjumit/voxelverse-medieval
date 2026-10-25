import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FX_KINDS } from '../../engine/blockFx';
import {
  EMBER_CAP, EffectsFrame, EffectsSim, FIREFLY_CAP, FIREFLY_RADIUS, HALO_CAP, HALO_RADIUS, PETAL_CAP, PETAL_RADIUS, SMOKE_CAP, SMOKE_RADIUS,
} from '../../render/effects/EffectsSim';
import {
  PARTICLE_EMBER, PARTICLE_FIREFLY, PARTICLE_HALO, PARTICLE_PETAL, PARTICLE_SMOKE, ParticlePool,
} from '../../render/effects/ParticlePool';
import { Rng } from '../../render/effects/rng';
import { NEAR_RADIUS_CHUNKS, SITE_STRIDE, SiteStore, siteBlock, siteDrop } from '../../render/effects/SiteStore';
import {
  FLICKER_DEPTH, fireflyActivity, flameFlicker, haloActivity, lampPhase, particleLight, smokeActivity,
} from '../../render/effects/gating';
import { gustAt, windHeading } from '../../render/effects/wind';

// The pure half of the living-world effects: the emitters' spawn rules, the pools, the time-of-day gating, the sites they read.
// Nothing here has a scene or a clock of its own; a frame is a handful of numbers.

const KIND = Object.fromEntries(FX_KINDS.map((k, i) => [k, i])) as Record<(typeof FX_KINDS)[number], number>;
const NIGHT = -0.8; // sun elevation
const NOON = 0.9;

// Sites for one chunk from a list of [x, y, z, aux], by kind.
const lists = (byKind: Partial<Record<(typeof FX_KINDS)[number], number[][]>>): Int32Array[] =>
  FX_KINDS.map((k) => Int32Array.from((byKind[k] ?? []).flat()));

const frameAt = (x: number, z: number, elevation: number, patch: Partial<EffectsFrame> = {}): EffectsFrame => {
  const f = new EffectsFrame();
  f.x = x;
  f.y = 10;
  f.z = z;
  f.elevation = elevation;
  f.daylight = elevation > 0.2 ? 1 : 0.15;
  f.dt = 0.05;
  return Object.assign(f, patch);
};

const run = (sim: EffectsSim, f: EffectsFrame, seconds: number): void => {
  for (let t = 0; t < seconds; t += f.dt) {
    f.time += f.dt;
    sim.update(f);
  }
};

// A meadow of 200 plants around (10, 10, 10) and a few of everything else.
const MEADOW: number[][] = Array.from({ length: 200 }, (_, i) => [2 + (i % 20), 9, 2 + Math.floor(i / 20), 4]);

describe('Rng', () => {
  it('repeats for a seed and differs between seeds, in [0, 1)', () => {
    const a = new Rng(5);
    const b = new Rng(5);
    const c = new Rng(6);
    const as = Array.from({ length: 50 }, () => a.next());
    expect(Array.from({ length: 50 }, () => b.next())).toEqual(as);
    expect(Array.from({ length: 50 }, () => c.next())).not.toEqual(as);
    for (const x of as) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(new Rng(0).next()).not.toBeNaN();
    const r = new Rng(9);
    for (let i = 0; i < 100; i++) {
      const v = r.range(3, 4);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(4);
    }
  });
});

describe('time of day gating', () => {
  it('lets fireflies out at dusk and night and keeps them in by day', () => {
    expect(fireflyActivity(NOON)).toBe(0);
    expect(fireflyActivity(0.3)).toBe(0);
    expect(fireflyActivity(-0.1)).toBe(1);
    expect(fireflyActivity(NIGHT)).toBe(1);
    // At the sunset itself, and at the dusk preset (the sun about 0.06 up), they are mostly out.
    expect(fireflyActivity(0)).toBeGreaterThan(0.9);
    expect(fireflyActivity(0.062)).toBeGreaterThan(0.5);
  });

  it('is monotonic through the evening: the lower the sun the more fireflies', () => {
    let prev = -1;
    for (let e = 0.5; e >= -0.5; e -= 0.01) {
      const a = fireflyActivity(e);
      expect(a).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(a).toBeLessThanOrEqual(1);
      prev = a;
    }
  });

  it('shows halos in the dark and not in daylight', () => {
    expect(haloActivity(1)).toBe(0);
    expect(haloActivity(0.15)).toBe(1);
    expect(haloActivity(0.33)).toBeGreaterThan(0.8); // dusk preset
    expect(haloActivity(0.7)).toBeLessThan(0.1);
  });

  it('lights more chimneys toward the ends of the day than at noon, but always some', () => {
    expect(smokeActivity(NOON)).toBeCloseTo(0.55, 5);
    expect(smokeActivity(NIGHT)).toBeCloseTo(1, 5);
    expect(smokeActivity(0.1)).toBeGreaterThan(smokeActivity(0.4));
  });

  it('lights petals and smoke like the ground they are over: bright by day, near the ambient floor at night', () => {
    expect(particleLight(1, 1)).toBeCloseTo(0.5, 6);
    expect(particleLight(0.15, 0.55)).toBeLessThan(0.06);
    expect(particleLight(0, 0)).toBeGreaterThan(0);
  });

  it('has a flame flicker in -1..1 that is the same for the same inputs, and a phase that spreads neighbouring lamps', () => {
    for (let t = 0; t < 30; t += 0.07) {
      const v = flameFlicker(t, 1.3);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(flameFlicker(3, 2)).toBe(flameFlicker(3, 2));
    expect(FLICKER_DEPTH).toBeLessThan(0.25); // subtle
    expect(lampPhase(1500, 11, 15)).toBeGreaterThanOrEqual(0);
    expect(lampPhase(1500, 11, 15)).toBeLessThan(Math.PI * 2);
    expect(Math.abs(lampPhase(1500, 11, 15) - lampPhase(1504, 11, 15))).toBeGreaterThan(0.1);
  });
});

describe('wind', () => {
  it('swings slowly round its heading', () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let t = 0; t < 600; t += 1) {
      const h = windHeading(t);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    expect(hi - lo).toBeGreaterThan(0.3);
    expect(hi - lo).toBeLessThan(1.2);
    expect(Math.abs(windHeading(10.01) - windHeading(10))).toBeLessThan(0.01);
  });

  it('has gusts between 0 and 1 that vary in place and in time', () => {
    const seen: number[] = [];
    for (let t = 0; t < 120; t += 3) {
      const g = gustAt(100, 50, t, 0.8, 0.6);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
      seen.push(g);
    }
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(0.5);
    expect(gustAt(100, 50, 5, 0.8, 0.6)).not.toBe(gustAt(160, 50, 5, 0.8, 0.6));
  });
});

describe('ParticlePool', () => {
  it('claims slots in order, frees them by moving the last one in, and reuses them', () => {
    const pool = new ParticlePool([0, 0, 4, 0]);
    expect(pool.capacity).toBe(4);
    const a = pool.spawn(PARTICLE_PETAL);
    const b = pool.spawn(PARTICLE_PETAL);
    const c = pool.spawn(PARTICLE_PETAL);
    expect([a, b, c]).toEqual([0, 1, 2]);
    pool.x[0] = 10; pool.x[1] = 11; pool.x[2] = 12;
    pool.kill(0); // the last (12) moves into slot 0
    expect(pool.count).toBe(2);
    expect(pool.x[0]).toBe(12);
    expect(pool.x[1]).toBe(11);
    expect(pool.spawn(PARTICLE_PETAL)).toBe(2); // the freed tail slot is the next one
    expect(pool.kindCount[PARTICLE_PETAL]).toBe(3);
  });

  it('refuses a spawn when the pool or the kind is full, and takes it again after a kill', () => {
    const pool = new ParticlePool([2, 0, 1, 0]);
    expect(pool.spawn(PARTICLE_FIREFLY)).toBe(0);
    expect(pool.spawn(PARTICLE_FIREFLY)).toBe(1);
    expect(pool.spawn(PARTICLE_FIREFLY)).toBe(-1); // the kind is full
    expect(pool.spawn(PARTICLE_PETAL)).toBe(2);
    expect(pool.spawn(PARTICLE_PETAL)).toBe(-1);   // and so is the other
    expect(pool.spawn(PARTICLE_SMOKE)).toBe(-1);   // a kind with no cap never spawns
    pool.kill(0);
    expect(pool.spawn(PARTICLE_FIREFLY)).toBeGreaterThanOrEqual(0);
    expect(pool.count).toBe(3);
  });

  it('starts every particle at age 0 and rest, whatever the slot held before', () => {
    const pool = new ParticlePool([0, 0, 2, 0]);
    const i = pool.spawn(PARTICLE_PETAL);
    pool.age[i] = 5; pool.vx[i] = 3; pool.vy[i] = -2; pool.vz[i] = 1;
    pool.kill(i);
    const j = pool.spawn(PARTICLE_PETAL);
    expect([pool.age[j], pool.vx[j], pool.vy[j], pool.vz[j]]).toEqual([0, 0, 0, 0]);
  });

  it('purges one kind and leaves the rest', () => {
    const pool = new ParticlePool([3, 0, 3, 0]);
    for (let i = 0; i < 3; i++) { pool.spawn(PARTICLE_FIREFLY); pool.spawn(PARTICLE_PETAL); }
    pool.purge(PARTICLE_FIREFLY);
    expect(pool.count).toBe(3);
    expect(pool.kindCount[PARTICLE_FIREFLY]).toBe(0);
    expect(pool.kindCount[PARTICLE_PETAL]).toBe(3);
    for (let i = 0; i < pool.count; i++) expect(pool.kind[i]).toBe(PARTICLE_PETAL);
  });

  it('keeps room after the live particles for sprites of the caller', () => {
    const pool = new ParticlePool([2, 0, 0, 0], 5);
    expect(pool.position.length).toBe((2 + 5) * 3);
    expect(pool.params.length).toBe((2 + 5) * 4);
    expect(pool.color.length).toBe((2 + 5) * 3);
  });
});

describe('SiteStore', () => {
  it('stores chunks, counts the sites of the chunks round a position, and forgets a chunk', () => {
    const store = new SiteStore();
    store.set(0, 0, lists({ lamp: [[5, 5, 5, 8], [6, 5, 5, 8]], smoke: [[7, 9, 7, 200]] }));
    store.set(1, 0, lists({ lamp: [[40, 5, 5, 8]] }));
    store.set(20, 20, lists({ lamp: [[640, 5, 640, 8]] })); // far away
    store.refresh(10, 10);
    expect(store.nearTotals[KIND.lamp]).toBe(3);
    expect(store.nearTotals[KIND.smoke]).toBe(1);
    expect(store.nearCount).toBe(2);
    store.delete(1, 0);
    store.refresh(10, 10);
    expect(store.nearTotals[KIND.lamp]).toBe(2);
    expect(store.size).toBe(2);
  });

  it('gathers again only when the player changes chunk or the store changes', () => {
    const store = new SiteStore();
    store.set(0, 0, lists({ lamp: [[5, 5, 5, 8]] }));
    store.refresh(5, 5);
    const g = store.gathered;
    store.refresh(6, 7);
    expect(store.gathered).toBe(g);
    store.refresh(40, 5);
    expect(store.gathered).toBe(g + 1);
    store.set(5, 5, lists({}));
    store.refresh(40, 5);
    expect(store.gathered).toBe(g + 2);
  });

  it('sees only chunks within NEAR_RADIUS_CHUNKS', () => {
    const store = new SiteStore();
    store.set(NEAR_RADIUS_CHUNKS, 0, lists({ lamp: [[1, 1, 1, 8]] }));
    store.set(NEAR_RADIUS_CHUNKS + 1, 0, lists({ lamp: [[1, 1, 1, 8]] }));
    store.refresh(0, 0);
    expect(store.nearTotals[KIND.lamp]).toBe(1);
  });

  it('numbers the sites in order and picks one by a number in [0, 1)', () => {
    const store = new SiteStore();
    store.set(0, 0, lists({ habitat: [[1, 2, 3, 4], [5, 6, 7, 8]] }));
    store.set(1, 0, lists({ habitat: [[40, 41, 42, 43]] }));
    store.refresh(0, 0);
    const out = new Int32Array(SITE_STRIDE);
    const seen = new Set<number>();
    for (const r of [0, 0.2, 0.4, 0.6, 0.8, 0.999999]) {
      expect(store.pick(KIND.habitat, r, out)).toBe(true);
      seen.add(out[0]);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([1, 5, 40]);
    expect(store.pick(KIND.smoke, 0.5, out)).toBe(false);
    expect(store.site(KIND.habitat, 3, out)).toBe(false);
  });

  it('picks and counts only among the chunks that come within a radius, and a site can still be farther than it', () => {
    const store = new SiteStore();
    store.set(0, 0, lists({ petals: [[5, 5, 5, 0], [30, 5, 30, 0]] }));
    store.set(2, 0, lists({ petals: [[70, 5, 5, 0]] }));   // a chunk 64 blocks east
    store.set(0, -3, lists({ petals: [[5, 5, -90, 0]] })); // and one 96 north
    store.refresh(10, 10);
    expect(store.nearTotals[KIND.petals]).toBe(4);
    expect(store.countWithin(KIND.petals, 10, 10, 20)).toBe(2);
    expect(store.countWithin(KIND.petals, 10, 10, 50)).toBe(2); // the chunk at cx 2 starts at 63.5, 53.5 from x 10
    expect(store.countWithin(KIND.petals, 10, 10, 54)).toBe(3);
    expect(store.countWithin(KIND.petals, 10, 10, 120)).toBe(4);
    expect(store.countWithin(KIND.smoke, 10, 10, 120)).toBe(0);
    const out = new Int32Array(SITE_STRIDE);
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      expect(store.pickWithin(KIND.petals, i / 40, 10, 10, 20, out)).toBe(true);
      seen.add(out[0]);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([5, 30]); // never the far ones
    expect(store.pickWithin(KIND.smoke, 0.5, 10, 10, 120, out)).toBe(false);
    expect(store.pickWithin(KIND.petals, 0.5, 1000, 1000, 20, out)).toBe(false);
  });

  it('decodes a site: the block in the low 12 bits and the fall above', () => {
    expect(siteBlock(51 | (9 << 12))).toBe(51);
    expect(siteDrop(51 | (9 << 12))).toBe(9);
  });
});

describe('fireflies', () => {
  it('stay away by day and come out as the sun sets', () => {
    const sim = new EffectsSim();
    sim.sites.set(0, 0, lists({ habitat: MEADOW }));
    const day = frameAt(10, 10, NOON);
    run(sim, day, 6);
    expect(sim.glow.kindCount[PARTICLE_FIREFLY]).toBe(0);
    const dusk = frameAt(10, 10, NIGHT, { time: day.time });
    run(sim, dusk, 20);
    expect(sim.glow.kindCount[PARTICLE_FIREFLY]).toBeGreaterThan(FIREFLY_CAP * 0.5);
    expect(sim.glow.kindCount[PARTICLE_FIREFLY]).toBeLessThanOrEqual(FIREFLY_CAP);
  });

  it('follow the time of day: fewer at the edge of dusk than at night, and they go with the dawn', () => {
    const count = (elevation: number): number => {
      const sim = new EffectsSim();
      sim.sites.set(0, 0, lists({ habitat: MEADOW }));
      run(sim, frameAt(10, 10, elevation), 40);
      return sim.glow.kindCount[PARTICLE_FIREFLY];
    };
    expect(count(0.15)).toBeLessThan(count(NIGHT));
    expect(count(0.15)).toBeGreaterThan(0);
    expect(count(0.5)).toBe(0);
    // Sunrise after a night: they fade (alpha 0) and are gone within their life.
    const sim = new EffectsSim();
    sim.sites.set(0, 0, lists({ habitat: MEADOW }));
    const f = frameAt(10, 10, NIGHT);
    run(sim, f, 25);
    f.elevation = NOON;
    f.daylight = 1;
    run(sim, f, 25);
    expect(sim.glow.kindCount[PARTICLE_FIREFLY]).toBe(0);
  });

  it('appear only round habitat sites near the player, hover above them, and never beyond the radius', () => {
    const sim = new EffectsSim();
    const near = [[10, 9, 10, 4]];
    const far = [[500, 9, 500, 4]];
    sim.sites.set(0, 0, lists({ habitat: near }));
    sim.sites.set(15, 15, lists({ habitat: far }));
    const f = frameAt(10, 10, NIGHT);
    run(sim, f, 20);
    const p = sim.glow;
    expect(p.kindCount[PARTICLE_FIREFLY]).toBeGreaterThan(10);
    for (let i = 0; i < p.count; i++) {
      if (p.kind[i] !== PARTICLE_FIREFLY) continue;
      expect(Math.hypot(p.x[i] - 10, p.z[i] - 10)).toBeLessThan(3);
      expect(p.y[i]).toBeGreaterThan(8.5); // over the plant at 9 (a block spans 8.5 to 9.5)
      expect(p.y[i]).toBeLessThan(13);
    }
    // Radius: a site beyond FIREFLY_RADIUS never spawns one.
    const sim2 = new EffectsSim();
    sim2.sites.set(0, 0, lists({ habitat: [[10 + FIREFLY_RADIUS + 3, 9, 10, 4]] }));
    sim2.sites.set(1, 0, lists({}));
    run(sim2, frameAt(10, 10, NIGHT), 20);
    expect(sim2.glow.kindCount[PARTICLE_FIREFLY]).toBe(0);
  });

  it('spawn nothing without sites, or with the switch off, and the switch removes the ones that are out', () => {
    const none = new EffectsSim();
    run(none, frameAt(10, 10, NIGHT), 10);
    expect(none.glow.count).toBe(0);

    const sim = new EffectsSim();
    sim.sites.set(0, 0, lists({ habitat: MEADOW }));
    const f = frameAt(10, 10, NIGHT);
    f.fireflies = false;
    run(sim, f, 10);
    expect(sim.glow.kindCount[PARTICLE_FIREFLY]).toBe(0);
    f.fireflies = true;
    run(sim, f, 10);
    expect(sim.glow.kindCount[PARTICLE_FIREFLY]).toBeGreaterThan(0);
    f.fireflies = false;
    run(sim, f, 0.1);
    expect(sim.glow.kindCount[PARTICLE_FIREFLY]).toBe(0);
  });

  it('glow in pulses with a fade in and out, and drift gently: no jump between frames', () => {
    const sim = new EffectsSim({ seed: 3 });
    sim.sites.set(0, 0, lists({ habitat: MEADOW }));
    const f = frameAt(10, 10, NIGHT, { dt: 1 / 60 });
    run(sim, f, 10);
    const p = sim.glow;
    const before = new Map<number, [number, number, number]>();
    const seeds = Array.from(p.seed.slice(0, p.count));
    for (let i = 0; i < p.count; i++) before.set(p.seed[i], [p.x[i], p.y[i], p.z[i]]);
    run(sim, f, 1 / 60);
    let compared = 0;
    for (let i = 0; i < p.count; i++) {
      const was = before.get(p.seed[i]);
      if (!was) continue;
      compared++;
      expect(Math.hypot(p.x[i] - was[0], p.y[i] - was[1], p.z[i] - was[2])).toBeLessThan(0.05);
    }
    expect(compared).toBeGreaterThan(seeds.length / 2);
    let lo = 1;
    let hi = 0;
    for (let i = 0; i < p.count; i++) {
      const a = p.params[i * 4 + 1];
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
      lo = Math.min(lo, a);
      hi = Math.max(hi, a);
    }
    expect(hi).toBeGreaterThan(lo + 0.2);
  });
});

describe('sakura petals', () => {
  // A canopy of leaf sites with eight cells of air to the ground.
  const LEAVES = Array.from({ length: 60 }, (_, i) => [2 + (i % 10) * 2, 14, 2 + Math.floor(i / 10) * 2, 51 | (8 << 12)]);

  it('fall from the underside of leaves and land on the ground below them, fading out there', () => {
    const sim = new EffectsSim();
    sim.sites.set(0, 0, lists({ petals: LEAVES }));
    const f = frameAt(12, 6, NOON);
    run(sim, f, 4);
    const p = sim.soft;
    expect(p.kindCount[PARTICLE_PETAL]).toBeGreaterThan(20);
    const floor = 14 - 8 - 0.5 + 0.03;
    for (let i = 0; i < p.count; i++) {
      expect(p.kind[i]).toBe(PARTICLE_PETAL);
      expect(p.y[i]).toBeLessThanOrEqual(14 - 0.55 + 1e-4);
      expect(p.y[i]).toBeGreaterThan(floor - 0.2);
      expect(p.hy[i]).toBeCloseTo(floor, 4);
      expect(p.vy[i]).toBeLessThan(0);
    }
    // Over a long run none is ever below the ground, and they do not pile up past the cap.
    for (let t = 0; t < 60; t += f.dt) {
      f.time += f.dt;
      sim.update(f);
      for (let i = 0; i < p.count; i++) expect(p.y[i]).toBeGreaterThan(floor - 0.15);
      expect(p.count).toBeLessThanOrEqual(PETAL_CAP);
    }
  });

  it('fall only near the player, from petal sites and no other, and not with the switch off', () => {
    const sim = new EffectsSim();
    sim.sites.set(0, 0, lists({ petals: [[2, 14, 2, 51 | (8 << 12)]], habitat: MEADOW, lamp: [[20, 5, 20, 163]] }));
    const far = new EffectsSim();
    far.sites.set(0, 0, lists({ petals: [[2, 14, 2, 51 | (8 << 12)]] }));
    run(far, frameAt(2 + PETAL_RADIUS + 12, 2, NOON), 8);
    expect(far.soft.kindCount[PARTICLE_PETAL]).toBe(0);
    const f = frameAt(4, 4, NOON);
    run(sim, f, 6);
    expect(sim.soft.kindCount[PARTICLE_PETAL]).toBeGreaterThan(0);
    expect(sim.soft.kindCount[PARTICLE_SMOKE]).toBe(0);
    const off = new EffectsSim();
    off.sites.set(0, 0, lists({ petals: LEAVES }));
    const g = frameAt(12, 6, NOON);
    g.petals = false;
    run(off, g, 6);
    expect(off.soft.count).toBe(0);
  });

  it('rain harder from a grove than from a lone tree, up to a limit', () => {
    const rate = (sites: number): number => {
      const sim = new EffectsSim();
      sim.sites.set(0, 0, lists({ petals: LEAVES.slice(0, sites) }));
      const f = frameAt(12, 6, NOON);
      run(sim, f, 3);
      return sim.soft.kindCount[PARTICLE_PETAL];
    };
    expect(rate(3)).toBeLessThan(rate(30));
  });

  it('drift downwind, more in a gust', () => {
    const sim = new EffectsSim({ seed: 4 });
    sim.sites.set(0, 0, lists({ petals: [[10, 40, 10, 51 | (60 << 12)]] }));
    const f = frameAt(10, 10, NOON, { windX: 1, windZ: 0 });
    run(sim, f, 5);
    const p = sim.soft;
    let sum = 0;
    for (let i = 0; i < p.count; i++) sum += p.x[i] - 10;
    expect(p.count).toBeGreaterThan(0);
    expect(sum / p.count).toBeGreaterThan(0.3);
  });
});

describe('chimney smoke', () => {
  const VENTS = [[10, 20, 10, 200], [14, 20, 12, 200], [30, 22, 14, 200], [6, 18, 20, 200]];

  it('rises from the vents near the player and widens and thins as it goes', () => {
    const sim = new EffectsSim();
    sim.sites.set(0, 0, lists({ smoke: VENTS }));
    const f = frameAt(12, 12, NIGHT);
    run(sim, f, 12);
    const p = sim.soft;
    expect(p.kindCount[PARTICLE_SMOKE]).toBeGreaterThan(5);
    let low = Infinity;
    let high = -Infinity;
    for (let i = 0; i < p.count; i++) {
      low = Math.min(low, p.y[i]);
      high = Math.max(high, p.y[i]);
      expect(p.y[i]).toBeGreaterThan(17.5); // nothing starts below the lowest vent's mouth
    }
    expect(high).toBeGreaterThan(low + 2);
    // Older smoke is bigger.
    let youngSize = 0;
    let oldSize = 0;
    let youngAge = Infinity;
    let oldAge = 0;
    for (let i = 0; i < p.count; i++) {
      if (p.age[i] < youngAge) { youngAge = p.age[i]; youngSize = p.params[i * 4]; }
      if (p.age[i] > oldAge) { oldAge = p.age[i]; oldSize = p.params[i * 4]; }
    }
    expect(oldSize).toBeGreaterThan(youngSize);
  });

  it('does not smoke from vents far away, or with the switch off', () => {
    const sim = new EffectsSim();
    sim.sites.set(0, 0, lists({ smoke: [[10, 20, 10, 200]] }));
    run(sim, frameAt(10 + SMOKE_RADIUS + 5, 10, NIGHT), 10);
    expect(sim.soft.kindCount[PARTICLE_SMOKE]).toBe(0);
    const off = new EffectsSim();
    off.sites.set(0, 0, lists({ smoke: VENTS }));
    const f = frameAt(12, 12, NIGHT);
    f.smoke = false;
    run(off, f, 10);
    expect(off.soft.kindCount[PARTICLE_SMOKE]).toBe(0);
  });

  it('smokes from the same vents every time: which chimneys are lit does not flicker, and more are lit at night', () => {
    const many = Array.from({ length: 60 }, (_, i) => [3 + (i % 10) * 3, 20, 3 + Math.floor(i / 10) * 3, 200]);
    const lit = (elevation: number): Set<string> => {
      const sim = new EffectsSim({ seed: 11 });
      sim.sites.set(0, 0, lists({ smoke: many }));
      const f = frameAt(15, 15, elevation);
      const seen = new Set<string>();
      for (let t = 0; t < 40; t += f.dt) {
        f.time += f.dt;
        sim.update(f);
        const p = sim.soft;
        for (let i = 0; i < p.count; i++) {
          if (p.age[i] < f.dt * 1.5) seen.add(`${Math.round(p.x[i])},${Math.round(p.z[i])}`);
        }
      }
      return seen;
    };
    const noon = lit(NOON);
    const night = lit(NIGHT);
    expect(night.size).toBeGreaterThan(noon.size);
    for (const key of noon) expect(night.has(key)).toBe(true); // a vent lit at noon is lit at night too
  });
});

describe('hearth embers', () => {
  it('rise from hearths nearby, short-lived, and cool as they go', () => {
    const sim = new EffectsSim();
    sim.sites.set(0, 0, lists({ embers: [[10, 5, 10, 187]] }));
    const f = frameAt(12, 12, NIGHT);
    run(sim, f, 6);
    const p = sim.glow;
    expect(p.kindCount[PARTICLE_EMBER]).toBeGreaterThan(0);
    expect(p.kindCount[PARTICLE_EMBER]).toBeLessThanOrEqual(EMBER_CAP);
    for (let i = 0; i < p.count; i++) {
      if (p.kind[i] !== PARTICLE_EMBER) continue;
      expect(p.life[i]).toBeLessThan(2.5);
      expect(p.y[i]).toBeGreaterThan(5);
      expect(p.y[i]).toBeLessThan(9);
    }
    const off = new EffectsSim();
    off.sites.set(0, 0, lists({ embers: [[10, 5, 10, 187]] }));
    const g = frameAt(12, 12, NIGHT);
    g.embers = false;
    run(off, g, 5);
    expect(off.glow.kindCount[PARTICLE_EMBER]).toBe(0);
  });
});

describe('lamp halos', () => {
  const LAMPS = Array.from({ length: 200 }, (_, i) => [2 + (i % 20) * 1.4 | 0, 5, 2 + Math.floor(i / 20) * 3, 163]);

  it('show at night, one for each of the nearest lamps up to the cap, and none by day', () => {
    const sim = new EffectsSim();
    sim.sites.set(0, 0, lists({ lamp: LAMPS }));
    const f = frameAt(15, 15, NIGHT);
    run(sim, f, 0.2);
    const halos = sim.glowDraw - sim.glow.count;
    expect(halos).toBeGreaterThan(0);
    expect(halos).toBeLessThanOrEqual(HALO_CAP);
    for (let i = sim.glow.count; i < sim.glowDraw; i++) {
      expect(sim.glow.params[i * 4 + 2]).toBe(PARTICLE_HALO);
      expect(sim.glow.params[i * 4 + 1]).toBeGreaterThan(0);
      expect(Math.hypot(sim.glow.position[i * 3] - 15, sim.glow.position[i * 3 + 2] - 15)).toBeLessThanOrEqual(HALO_RADIUS);
    }
    const day = new EffectsSim();
    day.sites.set(0, 0, lists({ lamp: LAMPS }));
    run(day, frameAt(15, 15, NOON), 0.2);
    expect(day.glowDraw - day.glow.count).toBe(0);
  });

  it('go to the nearest lamps when there are more than the cap', () => {
    const sim = new EffectsSim();
    sim.sites.set(0, 0, lists({ lamp: LAMPS }));
    const f = frameAt(15, 15, NIGHT);
    run(sim, f, 0.2);
    const used: number[] = [];
    for (let i = sim.glow.count; i < sim.glowDraw; i++) used.push(Math.hypot(sim.glow.position[i * 3] - 15, sim.glow.position[i * 3 + 1] - 10, sim.glow.position[i * 3 + 2] - 15));
    const all = LAMPS.map(([x, y, z]) => Math.hypot(x - 15, y - 10, z - 15)).filter((d) => d <= HALO_RADIUS).sort((a, b) => a - b);
    // Every lamp closer than the farthest one used (and far enough not to have faded out) is in the set.
    const farthest = Math.max(...used);
    const closer = all.filter((d) => d < farthest - 1e-6 && d > 4.6).length;
    expect(used.length).toBeGreaterThanOrEqual(Math.min(closer, HALO_CAP) - 2);
    expect(used.length).toBeLessThanOrEqual(HALO_CAP);
  });

  it('colour a lamp by its block, breathe with its flame, and fade right up against the camera', () => {
    const colours = new Map([[168, [0.25, 0.62, 1]]]);
    const sim = new EffectsSim({
      flickerOf: (id) => (id === 163 ? 1 : 0),
      haloColor: (id, out) => { const c = colours.get(id) ?? [1, 0.7, 0.4]; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; },
    });
    sim.sites.set(0, 0, lists({ lamp: [[10, 5, 10, 163], [14, 5, 10, 168], [10, 5, 16, 168]] }));
    const f = frameAt(10, 10, NIGHT);
    const alphas: number[] = [];
    for (let t = 0; t < 4; t += f.dt) {
      f.time += f.dt;
      sim.update(f);
      for (let i = sim.glow.count; i < sim.glowDraw; i++) {
        if (Math.abs(sim.glow.position[i * 3] - 10) < 0.1 && Math.abs(sim.glow.position[i * 3 + 2] - 10) < 0.1) alphas.push(sim.glow.params[i * 4 + 1]);
      }
    }
    // The lamp at the camera (5 below it, fully faded in) breathes; the ore lamp does not and is blue.
    expect(Math.max(...alphas) - Math.min(...alphas)).toBeGreaterThan(0.03);
    expect(Math.max(...alphas) / Math.min(...alphas)).toBeLessThan(1.5);
    const blue: number[] = [];
    for (let i = sim.glow.count; i < sim.glowDraw; i++) if (sim.glow.color[i * 3 + 2] > 0.9 && sim.glow.color[i * 3] < 0.3) blue.push(i);
    expect(blue.length).toBeGreaterThan(0);
    const close = new EffectsSim();
    close.sites.set(0, 0, lists({ lamp: [[10, 5, 10, 163]] }));
    const g = frameAt(10, 10, NIGHT, { y: 5.5 });
    run(close, g, 0.2);
    expect(close.glowDraw - close.glow.count).toBe(0); // inside the fade distance
  });

  it('are not drawn with the switch off', () => {
    const sim = new EffectsSim();
    sim.sites.set(0, 0, lists({ lamp: LAMPS }));
    const f = frameAt(15, 15, NIGHT);
    f.halos = false;
    run(sim, f, 0.3);
    expect(sim.glowDraw - sim.glow.count).toBe(0);
  });
});

describe('the pools over a long run', () => {
  it('never exceed their caps, and reuse the same arrays', () => {
    const sim = new EffectsSim({ seed: 8 });
    sim.sites.set(0, 0, lists({
      habitat: MEADOW,
      petals: Array.from({ length: 80 }, (_, i) => [2 + (i % 10) * 2, 12, 2 + Math.floor(i / 10) * 3, 51 | (6 << 12)]),
      smoke: Array.from({ length: 30 }, (_, i) => [3 + i, 14, 5 + (i % 4), 200]),
      embers: Array.from({ length: 10 }, (_, i) => [3 + i, 4, 6, 187]),
      lamp: Array.from({ length: 150 }, (_, i) => [2 + (i % 30), 5, 2 + Math.floor(i / 30) * 3, 163]),
    }));
    const identities = [sim.glow.position, sim.glow.params, sim.glow.color, sim.soft.position, sim.soft.params, sim.soft.color, sim.glow.x, sim.soft.x];
    const f = frameAt(15, 10, NIGHT);
    let peakGlow = 0;
    let peakSoft = 0;
    for (let t = 0; t < 120; t += f.dt) {
      f.time += f.dt;
      sim.update(f);
      expect(sim.glow.kindCount[PARTICLE_FIREFLY]).toBeLessThanOrEqual(FIREFLY_CAP);
      expect(sim.glow.kindCount[PARTICLE_EMBER]).toBeLessThanOrEqual(EMBER_CAP);
      expect(sim.soft.kindCount[PARTICLE_PETAL]).toBeLessThanOrEqual(PETAL_CAP);
      expect(sim.soft.kindCount[PARTICLE_SMOKE]).toBeLessThanOrEqual(SMOKE_CAP);
      expect(sim.glowDraw).toBeLessThanOrEqual(sim.glow.capacity + HALO_CAP);
      peakGlow = Math.max(peakGlow, sim.glowDraw);
      peakSoft = Math.max(peakSoft, sim.softDraw);
    }
    expect(peakGlow).toBeGreaterThan(100);
    expect(peakSoft).toBeGreaterThan(100);
    for (let i = 0; i < identities.length; i++) expect([sim.glow.position, sim.glow.params, sim.glow.color, sim.soft.position, sim.soft.params, sim.soft.color, sim.glow.x, sim.soft.x][i]).toBe(identities[i]);
    // Every live particle is made of finite numbers.
    for (const pool of [sim.glow, sim.soft]) {
      for (let i = 0; i < pool.count; i++) {
        for (let k = 0; k < 3; k++) expect(Number.isFinite(pool.position[i * 3 + k])).toBe(true);
        for (let k = 0; k < 4; k++) expect(Number.isFinite(pool.params[i * 4 + k])).toBe(true);
      }
    }
  });

  it('repeats exactly for a seed', () => {
    const make = (seed: number): number[] => {
      const sim = new EffectsSim({ seed });
      sim.sites.set(0, 0, lists({ habitat: MEADOW, petals: [[10, 14, 10, 51 | (8 << 12)]] }));
      const f = frameAt(10, 10, NIGHT);
      run(sim, f, 10);
      return [sim.glow.count, sim.soft.count, ...Array.from(sim.glow.position.slice(0, 30)), ...Array.from(sim.soft.position.slice(0, 30))];
    };
    expect(make(5)).toEqual(make(5));
    expect(make(5)).not.toEqual(make(6));
  });

  it('ignores a stalled frame: one long dt does not throw particles about', () => {
    const sim = new EffectsSim();
    sim.sites.set(0, 0, lists({ smoke: [[10, 20, 10, 200]] }));
    const f = frameAt(10, 10, NIGHT);
    run(sim, f, 8);
    const before = Array.from(sim.soft.y.slice(0, sim.soft.count));
    f.dt = 60;
    sim.update(f);
    f.dt = 0.05;
    const p = sim.soft;
    for (let i = 0; i < Math.min(before.length, p.count); i++) expect(Math.abs(p.y[i] - before[i])).toBeLessThan(3);
  });
});

describe('the first steady state', () => {
  it('runs the pools up once the sites have been still for a second, and says so', () => {
    const sim = new EffectsSim();
    const f = frameAt(10, 10, NIGHT);
    expect(sim.warm).toBe(false);
    sim.update(f);
    expect(sim.warm).toBe(false); // no sites yet
    sim.sites.set(0, 0, lists({ habitat: MEADOW, smoke: [[10, 20, 10, 200]] }));
    run(sim, f, 0.5);
    expect(sim.warm).toBe(false); // the sites have only just arrived
    run(sim, f, 1);
    expect(sim.warm).toBe(true);
    // The run-up filled the air at once: nearly the whole target of fireflies, and a column of smoke rising from the vent.
    expect(sim.glow.kindCount[PARTICLE_FIREFLY]).toBeGreaterThan(FIREFLY_CAP * 0.6);
    expect(sim.soft.kindCount[PARTICLE_SMOKE]).toBeGreaterThan(4); // one vent: a puff every 0.8 s, each lasting 5 to 9
  });

  it('starts over when a chunk arrives before it has settled, and does not run up twice', () => {
    const sim = new EffectsSim();
    const f = frameAt(10, 10, NIGHT);
    sim.sites.set(0, 0, lists({ habitat: MEADOW }));
    run(sim, f, 0.8);
    sim.sites.set(1, 0, lists({}));
    run(sim, f, 0.8);
    expect(sim.warm).toBe(false);
    run(sim, f, 0.5);
    expect(sim.warm).toBe(true);
    const clock = sim.clock;
    sim.sites.set(2, 0, lists({}));
    run(sim, f, 2);
    expect(sim.clock - clock).toBeLessThan(2.5); // no second run-up of 14 seconds
  });

  it('can be reset for a new world', () => {
    const sim = new EffectsSim();
    sim.sites.set(0, 0, lists({ habitat: MEADOW }));
    run(sim, frameAt(10, 10, NIGHT), 3);
    expect(sim.glow.count).toBeGreaterThan(0);
    sim.reset();
    expect(sim.warm).toBe(false);
    expect(sim.glow.count).toBe(0);
    expect(sim.glowDraw).toBe(0);
  });
});

describe('the effects layer', () => {
  it('imports nothing from three, react or the DOM', () => {
    const dir = join(__dirname, '..', '..', 'render', 'effects');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    expect(files).toContain('EffectsSim.ts');
    for (const file of files) {
      const source = readFileSync(join(dir, file), 'utf8');
      for (const m of source.matchAll(/from\s+'([^']+)'/g)) {
        expect(m[1], file).not.toMatch(/^(three|react|@react-three)/);
        expect(m[1], file).not.toMatch(/(^|\/)(components|bench|worldgen|content)(\/|$)/);
      }
      expect(source, file).not.toMatch(/\b(document|window|HTMLCanvasElement)\b/);
    }
  });
});
