import { FX_KINDS } from '../../engine/blockFx';
import {
  PARTICLE_EMBER, PARTICLE_FIREFLY, PARTICLE_HALO, PARTICLE_PETAL, PARTICLE_SMOKE, ParticlePool,
} from './ParticlePool';
import { FLICKER_DEPTH, fireflyActivity, flameFlicker, haloActivity, lampPhase, particleLight, smokeActivity } from './gating';
import { Rng } from './rng';
import { SITE_STRIDE, SITE_AUX, SITE_X, SITE_Y, SITE_Z, SiteStore, siteBlock, siteDrop } from './SiteStore';
import { gustAt } from './wind';

// The living-world particles, simulated without a scene: fireflies at dusk and night, sakura petals, chimney smoke, hearth
// embers and the halos round lamps. This file knows nothing about three; `EffectsSystem` (render/EffectsSystem.ts) owns the
// Points and the shaders and hands the arrays here to the GPU. Everything is allocated in the constructor: a frame spawns,
// moves and kills particles in fixed pools (ParticlePool) and reads its spawn points from the SiteStore, so the update loops
// create nothing (tests/render/effects-sim.test.ts measures it). Where things come from is in docs/effects.md.

// --- Capacities and rates -----------------------------------------------------------------------------------------
export const FIREFLY_CAP = 200;
export const EMBER_CAP = 96;
export const PETAL_CAP = 400;
export const SMOKE_CAP = 320;
export const HALO_CAP = 96;

/** Fireflies spawn within this many blocks of the player, and are removed beyond the second number. */
export const FIREFLY_RADIUS = 30;
const FIREFLY_KILL_RADIUS = 46;
const FIREFLY_SPAWN_RATE = 12;
export const PETAL_RADIUS = 30;
const PETAL_KILL_RADIUS = 48;
const PETAL_SPAWN_RATE = 36;
/** Petals a sakura leaf site is good for, per second: a lone tree rains softly and a grove harder, up to the rate above. */
const PETAL_PER_SITE = 0.5;
export const SMOKE_RADIUS = 72;
const SMOKE_PER_VENT = 1.2;
const SMOKE_SPAWN_MAX = 30;
export const EMBER_RADIUS = 22;
const EMBER_PER_HEARTH = 3;
const EMBER_SPAWN_MAX = 12;
export const HALO_RADIUS = 44;
const HALO_REBUILD_DISTANCE = 5;
/** How many sites a spawn looks at before giving up. */
const PICK_TRIES = 6;
/** The least light smoke is lit with (the ground's is about 0.02 at night): a plume still reads against a night sky. */
const SMOKE_MIN_LIGHT = 0.1;

/** The simulation never steps further than this in one call (a stalled tab must not throw particles across the map). */
const MAX_DT = 0.1;
/** How long the sites have to stay unchanged before the first update runs the pools up to a steady state, and how long it simulates. */
const WARM_QUIET_SECONDS = 1;
const WARM_SECONDS = 14;
const WARM_STEP = 0.1;

/** What a frame hands the simulation. One instance is reused, so setting it allocates nothing. */
export class EffectsFrame {
  dt = 0;
  /** The game's clock in seconds, the one the foliage shader uses, so a petal and a blade of grass see the same gust. */
  time = 0;
  /** The camera, which is where the player is looking from. */
  x = 0;
  y = 0;
  z = 0;
  /** The wind's unit vector in x and z. */
  windX = 1;
  windZ = 0;
  /** Height of the sun above the horizon, -1 to 1. */
  elevation = 1;
  /** Baked sky light multiplier, 0 to 1, and the colour of that light. */
  daylight = 1;
  skyR = 1;
  skyG = 1;
  skyB = 1;
  // The switches (render/effectSettings.ts).
  fireflies = true;
  petals = true;
  smoke = true;
  embers = true;
  halos = true;
}

export interface EffectsSimOptions {
  seed?: number;
  /** The block registry the lamps' flicker strength is read from. Without one lamps do not flicker. */
  flickerOf?: (blockId: number) => number;
  /** The halo colour of a lamp by block id, as r, g, b written into `out`. Without it every halo is warm. */
  haloColor?: (blockId: number, out: Float32Array) => void;
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

export class EffectsSim {
  readonly sites = new SiteStore();
  /** Fireflies and embers, drawn additively, with the halos appended after them in the same arrays. */
  readonly glow = new ParticlePool([FIREFLY_CAP, EMBER_CAP], HALO_CAP);
  /** Petals and smoke, drawn with ordinary blending. */
  readonly soft = new ParticlePool([0, 0, PETAL_CAP, SMOKE_CAP]);
  /** How many slots of each pool's render arrays the GPU should draw this frame (the glow pool's includes its halos). */
  glowDraw = 0;
  softDraw = 0;
  /** Seconds the simulation has run, prewarm included. */
  clock = 0;

  private readonly rng: Rng;
  private readonly flickerOf: (blockId: number) => number;
  private readonly haloColor: (blockId: number, out: Float32Array) => void;
  private readonly site = new Int32Array(SITE_STRIDE);
  private readonly site2 = new Int32Array(SITE_STRIDE);
  private readonly rgb = new Float32Array(3);

  private fireflyBudget = 0;
  private petalBudget = 0;
  private smokeBudget = 0;
  private emberBudget = 0;

  // The lamps that get a halo: the nearest HALO_CAP lamp sites within HALO_RADIUS, found again when the sites around the
  // player change or the player has walked a few blocks.
  private haloCount = 0;
  private readonly haloX = new Float32Array(HALO_CAP);
  private readonly haloY = new Float32Array(HALO_CAP);
  private readonly haloZ = new Float32Array(HALO_CAP);
  private readonly haloD2 = new Float32Array(HALO_CAP);
  private readonly haloFlicker = new Float32Array(HALO_CAP);
  private readonly haloPhase = new Float32Array(HALO_CAP);
  private readonly haloRgb = new Float32Array(HALO_CAP * 3);
  private haloGathered = -1;
  private haloAtX = NaN;
  private haloAtZ = NaN;

  private seenVersion = -1;
  private quietFor = 0;
  private warmed = false;

  constructor(options: EffectsSimOptions = {}) {
    this.rng = new Rng(options.seed ?? 20251122);
    this.flickerOf = options.flickerOf ?? (() => 0);
    this.haloColor = options.haloColor ?? ((_id, out) => { out[0] = 1; out[1] = 0.72; out[2] = 0.4; });
  }

  /** True once the first steady state has been reached (see update), for the screenshot tool to wait on. */
  get warm(): boolean {
    return this.warmed;
  }

  /**
   * Moves the world's particles on by `frame.dt` and writes what the GPU should draw. The first time the sites around the player
   * have stayed unchanged for a second it also runs WARM_SECONDS of simulation in small steps, so a screenshot or a player
   * arriving at a grove finds the air already full of petals instead of watching them start one by one.
   */
  update(frame: EffectsFrame): void {
    this.sites.refresh(frame.x, frame.z);
    const real = Math.min(Math.max(frame.dt, 0), MAX_DT);

    if (!this.warmed) {
      if (this.sites.version !== this.seenVersion) {
        this.seenVersion = this.sites.version;
        this.quietFor = 0;
      } else {
        this.quietFor += real;
      }
      if (this.sites.size > 0 && this.quietFor >= WARM_QUIET_SECONDS) {
        this.warmed = true;
        for (let t = 0; t < WARM_SECONDS; t += WARM_STEP) this.step(frame, WARM_STEP);
      }
    }
    this.step(frame, real);
  }

  /** Forgets every particle and the warm state, for a new world. */
  reset(): void {
    this.glow.clear();
    this.soft.clear();
    this.glowDraw = 0;
    this.softDraw = 0;
    this.haloCount = 0;
    this.haloGathered = -1;
    this.warmed = false;
    this.quietFor = 0;
    this.seenVersion = -1;
    this.fireflyBudget = this.petalBudget = this.smokeBudget = this.emberBudget = 0;
  }

  // One step of the whole simulation.
  private step(f: EffectsFrame, dt: number): void {
    this.clock += dt;
    const glow = this.glow;
    const soft = this.soft;

    if (!f.fireflies && glow.kindCount[PARTICLE_FIREFLY] > 0) glow.purge(PARTICLE_FIREFLY);
    if (!f.embers && glow.kindCount[PARTICLE_EMBER] > 0) glow.purge(PARTICLE_EMBER);
    if (!f.petals && soft.kindCount[PARTICLE_PETAL] > 0) soft.purge(PARTICLE_PETAL);
    if (!f.smoke && soft.kindCount[PARTICLE_SMOKE] > 0) soft.purge(PARTICLE_SMOKE);

    const activity = fireflyActivity(f.elevation);
    if (f.fireflies) this.spawnFireflies(f, dt, activity);
    if (f.petals) this.spawnPetals(f, dt);
    if (f.smoke) this.spawnSmoke(f, dt);
    if (f.embers) this.spawnEmbers(f, dt);

    this.updateGlow(f, dt, activity);
    this.updateSoft(f, dt);
    this.glowDraw = glow.count + (f.halos ? this.updateHalos(f) : 0);
    this.softDraw = soft.count;
  }

  // --- Spawning -------------------------------------------------------------------------------------------------

  // Picks a site of `kind` within `radius` of the player (a few tries, then gives up) into this.site.
  private pickSite(kind: number, f: EffectsFrame, radius: number): boolean {
    const r2 = radius * radius;
    // The pick is among the chunks that come within the radius, so most of its tries find a site inside it.
    for (let tries = 0; tries < PICK_TRIES; tries++) {
      if (!this.sites.pickWithin(kind, this.rng.next(), f.x, f.z, radius, this.site)) return false;
      const dx = this.site[SITE_X] - f.x;
      const dz = this.site[SITE_Z] - f.z;
      if (dx * dx + dz * dz <= r2) return true;
    }
    return false;
  }

  // Like pickSite, but draws two and keeps the one nearer the player, so the glow is thicker close by where it can be seen.
  private pickNearer(kind: number, f: EffectsFrame, radius: number): boolean {
    if (!this.pickSite(kind, f, radius)) return false;
    const ax = this.site[SITE_X] - f.x;
    const az = this.site[SITE_Z] - f.z;
    this.site2.set(this.site);
    if (this.pickSite(kind, f, radius)) {
      const bx = this.site[SITE_X] - f.x;
      const bz = this.site[SITE_Z] - f.z;
      if (bx * bx + bz * bz > ax * ax + az * az) this.site.set(this.site2);
    } else {
      this.site.set(this.site2);
    }
    return true;
  }

  private spawnFireflies(f: EffectsFrame, dt: number, activity: number): void {
    const pool = this.glow;
    const target = Math.floor(FIREFLY_CAP * activity);
    this.fireflyBudget = Math.min(this.fireflyBudget + dt * FIREFLY_SPAWN_RATE, 3);
    while (this.fireflyBudget >= 1) {
      this.fireflyBudget -= 1;
      if (pool.kindCount[PARTICLE_FIREFLY] >= target) continue;
      if (!this.pickNearer(1, f, FIREFLY_RADIUS)) continue;
      const i = pool.spawn(PARTICLE_FIREFLY);
      if (i < 0) continue;
      const rng = this.rng;
      // Home is a spot in the air above the plant, up to about two blocks over it; the firefly wanders round it.
      pool.hx[i] = this.site[SITE_X] + rng.range(-0.4, 0.4);
      pool.hy[i] = this.site[SITE_Y] - 0.5 + rng.range(0.5, 2);
      pool.hz[i] = this.site[SITE_Z] + rng.range(-0.4, 0.4);
      pool.x[i] = pool.hx[i];
      pool.y[i] = pool.hy[i];
      pool.z[i] = pool.hz[i];
      pool.seed[i] = rng.next();
      pool.life[i] = rng.range(9, 20);
    }
  }

  private spawnPetals(f: EffectsFrame, dt: number): void {
    const pool = this.soft;
    const sites = this.sites.countWithin(0, f.x, f.z, PETAL_RADIUS);
    if (sites === 0) return;
    this.petalBudget = Math.min(this.petalBudget + dt * Math.min(PETAL_SPAWN_RATE, sites * PETAL_PER_SITE), 4);
    while (this.petalBudget >= 1) {
      this.petalBudget -= 1;
      if (!this.pickNearer(0, f, PETAL_RADIUS)) continue;
      const i = pool.spawn(PARTICLE_PETAL);
      if (i < 0) continue;
      const rng = this.rng;
      const drop = siteDrop(this.site[SITE_AUX]);
      // A block spans y - 0.5 to y + 0.5: the petal leaves the underside of the leaf and lands on the top of what is below the air.
      const top = this.site[SITE_Y] - 0.55;
      const floor = this.site[SITE_Y] - drop - 0.5 + 0.03;
      pool.x[i] = this.site[SITE_X] + rng.range(-0.45, 0.45);
      pool.y[i] = top;
      pool.z[i] = this.site[SITE_Z] + rng.range(-0.45, 0.45);
      pool.hy[i] = floor;
      pool.seed[i] = rng.next();
      pool.vy[i] = -rng.range(0.55, 1.05);
      pool.life[i] = (top - floor) / -pool.vy[i] + 3; // the floor ends a petal's life first; the extra is for the rare one that never lands
    }
  }

  private spawnSmoke(f: EffectsFrame, dt: number): void {
    const pool = this.soft;
    const vents = this.sites.countWithin(2, f.x, f.z, SMOKE_RADIUS);
    if (vents === 0) return;
    this.smokeBudget = Math.min(this.smokeBudget + dt * Math.min(SMOKE_SPAWN_MAX, vents * SMOKE_PER_VENT), 4);
    const lit = smokeActivity(f.elevation);
    while (this.smokeBudget >= 1) {
      this.smokeBudget -= 1;
      if (!this.pickSite(2, f, SMOKE_RADIUS)) continue;
      // Which vents are smoking is fixed by where they are (a chimney does not flicker in and out), and more of them are lit when the day is ending.
      const frac = (this.site[SITE_X] * 0.6180339 + this.site[SITE_Z] * 0.7548777) % 1;
      if ((frac < 0 ? frac + 1 : frac) >= lit) continue;
      const i = pool.spawn(PARTICLE_SMOKE);
      if (i < 0) continue;
      const rng = this.rng;
      // The pot is 12 sixteenths tall: the smoke leaves its mouth.
      pool.x[i] = this.site[SITE_X] + rng.range(-0.12, 0.12);
      pool.y[i] = this.site[SITE_Y] - 0.5 + 0.8;
      pool.z[i] = this.site[SITE_Z] + rng.range(-0.12, 0.12);
      pool.seed[i] = rng.next();
      pool.vy[i] = rng.range(0.9, 1.5);
      pool.life[i] = rng.range(5.5, 9);
    }
  }

  private spawnEmbers(f: EffectsFrame, dt: number): void {
    const pool = this.glow;
    const hearths = this.sites.countWithin(4, f.x, f.z, EMBER_RADIUS);
    if (hearths === 0) return;
    this.emberBudget = Math.min(this.emberBudget + dt * Math.min(EMBER_SPAWN_MAX, hearths * EMBER_PER_HEARTH), 3);
    while (this.emberBudget >= 1) {
      this.emberBudget -= 1;
      if (!this.pickSite(4, f, EMBER_RADIUS)) continue;
      const i = pool.spawn(PARTICLE_EMBER);
      if (i < 0) continue;
      const rng = this.rng;
      pool.x[i] = this.site[SITE_X] + rng.range(-0.3, 0.3);
      pool.y[i] = this.site[SITE_Y] - 0.5 + 0.65; // a hearth is ten sixteenths tall
      pool.z[i] = this.site[SITE_Z] + rng.range(-0.3, 0.3);
      pool.seed[i] = rng.next();
      pool.vy[i] = rng.range(0.6, 1.3);
      pool.vx[i] = rng.range(-0.15, 0.15);
      pool.vz[i] = rng.range(-0.15, 0.15);
      pool.life[i] = rng.range(1.1, 2.3);
    }
  }

  // --- Updating -------------------------------------------------------------------------------------------------

  // Fireflies and embers (the additive pool).
  private updateGlow(f: EffectsFrame, dt: number, activity: number): void {
    const p = this.glow;
    const t = this.clock;
    const killR2 = FIREFLY_KILL_RADIUS * FIREFLY_KILL_RADIUS;
    const fadeA = (FIREFLY_RADIUS - 8) * (FIREFLY_RADIUS - 8);
    const fadeB = FIREFLY_RADIUS * FIREFLY_RADIUS;
    for (let i = 0; i < p.count;) {
      p.age[i] += dt;
      const age = p.age[i];
      const life = p.life[i];
      if (age >= life) {
        p.kill(i);
        continue;
      }
      const seed = p.seed[i];
      const o3 = i * 3;
      const o4 = i * 4;
      if (p.kind[i] === PARTICLE_FIREFLY) {
        const dx = p.x[i] - f.x;
        const dz = p.z[i] - f.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > killR2) {
          p.kill(i);
          continue;
        }
        // A slow wander round the home point: two sines of unrelated rates on each axis, so the path never repeats.
        p.x[i] = p.hx[i] + 0.9 * Math.sin(t * (0.31 + 0.37 * seed) + seed * 43.7) + 0.45 * Math.sin(t * (0.83 + 0.5 * seed) + seed * 17.1);
        p.y[i] = p.hy[i] + 0.35 * Math.sin(t * (0.43 + 0.3 * seed) + seed * 29.3) + 0.12 * Math.sin(t * 1.9 + seed * 5.7);
        p.z[i] = p.hz[i] + 0.9 * Math.cos(t * (0.27 + 0.41 * seed) + seed * 31.9) + 0.45 * Math.sin(t * (0.71 + 0.45 * seed) + seed * 11.3);
        // It glows in pulses that are mostly dark, fades in and out over a life, and goes with the dusk as the day returns.
        const wave = 0.5 + 0.5 * Math.sin(t * (1.3 + 1.1 * seed) + seed * 40);
        const pulse = 0.12 + 0.88 * wave * wave * wave;
        const envelope = smoothstep(0, 1.2, age) * (1 - smoothstep(life - 1.6, life, age));
        const far = 1 - smoothstep(fadeA, fadeB, d2);
        p.position[o3] = p.x[i];
        p.position[o3 + 1] = p.y[i];
        p.position[o3 + 2] = p.z[i];
        p.params[o4] = 0.42;
        p.params[o4 + 1] = envelope * pulse * far * Math.min(activity * 1.6, 1);
        p.params[o4 + 2] = PARTICLE_FIREFLY;
        p.params[o4 + 3] = 0;
        p.color[o3] = 0.72;
        p.color[o3 + 1] = 1;
        p.color[o3 + 2] = 0.28;
      } else {
        // An ember: rises, wobbles, cools from yellow to red and shrinks.
        const u = age / life;
        p.vy[i] *= 1 - 0.4 * dt;
        p.vx[i] += Math.sin(t * 9 + seed * 50) * 0.7 * dt;
        p.vz[i] += Math.cos(t * 8 + seed * 37) * 0.7 * dt;
        p.x[i] += p.vx[i] * dt;
        p.y[i] += p.vy[i] * dt;
        p.z[i] += p.vz[i] * dt;
        p.position[o3] = p.x[i];
        p.position[o3 + 1] = p.y[i];
        p.position[o3 + 2] = p.z[i];
        p.params[o4] = 0.085 * (1 - 0.55 * u);
        p.params[o4 + 1] = (1 - u) * (0.65 + 0.35 * Math.sin(t * 30 + seed * 90));
        p.params[o4 + 2] = PARTICLE_EMBER;
        p.params[o4 + 3] = 0;
        p.color[o3] = 1;
        p.color[o3 + 1] = 0.78 - 0.5 * u;
        p.color[o3 + 2] = 0.3 - 0.22 * u;
      }
      i++;
    }
  }

  // Petals and smoke (the alpha-blended pool). They are lit like an open-sky surface of the chunk shader, so they dim at dusk and are nearly black at night.
  private updateSoft(f: EffectsFrame, dt: number): void {
    const p = this.soft;
    const t = this.clock;
    const lightR = particleLight(f.daylight, f.skyR);
    const lightG = particleLight(f.daylight, f.skyG);
    const lightB = particleLight(f.daylight, f.skyB);
    const petalKill2 = PETAL_KILL_RADIUS * PETAL_KILL_RADIUS;
    const smokeFadeA = (SMOKE_RADIUS - 24) * (SMOKE_RADIUS - 24);
    const smokeFadeB = SMOKE_RADIUS * SMOKE_RADIUS;
    for (let i = 0; i < p.count;) {
      p.age[i] += dt;
      const age = p.age[i];
      const life = p.life[i];
      const seed = p.seed[i];
      const o3 = i * 3;
      const o4 = i * 4;
      if (p.kind[i] === PARTICLE_PETAL) {
        const dx = p.x[i] - f.x;
        const dz = p.z[i] - f.z;
        if (age >= life || p.y[i] <= p.hy[i] || dx * dx + dz * dz > petalKill2) {
          p.kill(i);
          continue;
        }
        // It drifts downwind with the gust and flutters side to side as it falls.
        const gust = gustAt(p.x[i], p.z[i], f.time, f.windX, f.windZ);
        const push = 0.45 + 1.3 * gust;
        const flutter = Math.sin(age * (2.1 + seed) + seed * 30) * 0.55;
        p.x[i] += (f.windX * push - f.windZ * flutter) * dt;
        p.z[i] += (f.windZ * push + f.windX * flutter) * dt;
        p.y[i] += (p.vy[i] + 0.12 * Math.sin(age * 3.1 + seed * 12)) * dt;
        p.position[o3] = p.x[i];
        p.position[o3 + 1] = p.y[i];
        p.position[o3 + 2] = p.z[i];
        p.params[o4] = 0.27 + 0.13 * seed;
        // In at the start, out as it reaches the ground.
        p.params[o4 + 1] = 0.92 * smoothstep(0, 0.35, age) * smoothstep(p.hy[i], p.hy[i] + 0.35, p.y[i]);
        p.params[o4 + 2] = PARTICLE_PETAL;
        p.params[o4 + 3] = age * (1.2 + 1.5 * seed) + seed * 6.2831853;
        p.color[o3] = lightR;
        p.color[o3 + 1] = lightG * (0.4 + 0.1 * seed);
        p.color[o3 + 2] = lightB * (0.55 + 0.1 * seed);
      } else {
        if (age >= life) {
          p.kill(i);
          continue;
        }
        const dx = p.x[i] - f.x;
        const dz = p.z[i] - f.z;
        const d2 = dx * dx + dz * dz;
        const u = age / life;
        // Rises and slows, and turns downwind as it climbs: the wind takes hold of it.
        const gust = gustAt(p.x[i], p.z[i], f.time, f.windX, f.windZ);
        const drift = 0.35 + (0.5 + 1.4 * gust) * u;
        const settle = Math.min(1.5 * dt, 1);
        p.vx[i] += (f.windX * drift - p.vx[i]) * settle;
        p.vz[i] += (f.windZ * drift - p.vz[i]) * settle;
        p.vy[i] += (0.3 - p.vy[i]) * 0.35 * dt;
        p.x[i] += p.vx[i] * dt + Math.sin(age * 1.7 + seed * 20) * 0.12 * dt;
        p.y[i] += p.vy[i] * dt;
        p.z[i] += p.vz[i] * dt + Math.cos(age * 1.5 + seed * 17) * 0.12 * dt;
        p.position[o3] = p.x[i];
        p.position[o3 + 1] = p.y[i];
        p.position[o3 + 2] = p.z[i];
        p.params[o4] = 0.9 + 3.2 * Math.pow(u, 0.7);
        p.params[o4 + 1] = 0.72 * smoothstep(0, 0.6, age) * Math.pow(1 - u, 1.1) * (1 - smoothstep(smokeFadeA, smokeFadeB, d2));
        p.params[o4 + 2] = PARTICLE_SMOKE;
        p.params[o4 + 3] = 0;
        // Smoke is lit by the whole sky, not just the ground's share of it: it never goes as dark as the ground does at night.
        const grey = 0.78 - 0.18 * u;
        p.color[o3] = Math.max(lightR, SMOKE_MIN_LIGHT) * grey * 1.02;
        p.color[o3 + 1] = Math.max(lightG, SMOKE_MIN_LIGHT) * grey;
        p.color[o3 + 2] = Math.max(lightB, SMOKE_MIN_LIGHT * 1.15) * grey * 0.97;
      }
      i++;
    }
  }

  // --- Halos ----------------------------------------------------------------------------------------------------

  // Finds the HALO_CAP lamp sites nearest to the player, keeping them sorted by distance as they come.
  private gatherHalos(f: EffectsFrame): void {
    const sites = this.sites;
    const r2 = HALO_RADIUS * HALO_RADIUS;
    const lampKind = FX_KINDS.indexOf('lamp');
    let n = 0;
    for (let c = 0; c < sites.nearCount; c++) {
      const list = sites.near[c].lists[lampKind];
      if (!list) continue;
      for (let o = 0; o < list.length; o += SITE_STRIDE) {
        const dx = list[o + SITE_X] - f.x;
        const dy = list[o + SITE_Y] - f.y;
        const dz = list[o + SITE_Z] - f.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2) continue;
        if (n === HALO_CAP && d2 >= this.haloD2[n - 1]) continue;
        // Insert in order, dropping the farthest if full.
        let at = n < HALO_CAP ? n : n - 1;
        while (at > 0 && this.haloD2[at - 1] > d2) {
          this.copyHalo(at - 1, at);
          at--;
        }
        const id = siteBlock(list[o + SITE_AUX]);
        this.haloX[at] = list[o + SITE_X];
        this.haloY[at] = list[o + SITE_Y];
        this.haloZ[at] = list[o + SITE_Z];
        this.haloD2[at] = d2;
        this.haloFlicker[at] = this.flickerOf(id);
        this.haloPhase[at] = lampPhase(list[o + SITE_X], list[o + SITE_Y], list[o + SITE_Z]);
        this.haloColor(id, this.rgb);
        this.haloRgb[at * 3] = this.rgb[0];
        this.haloRgb[at * 3 + 1] = this.rgb[1];
        this.haloRgb[at * 3 + 2] = this.rgb[2];
        if (n < HALO_CAP) n++;
      }
    }
    this.haloCount = n;
    this.haloGathered = sites.gathered;
    this.haloAtX = f.x;
    this.haloAtZ = f.z;
  }

  private copyHalo(from: number, to: number): void {
    this.haloX[to] = this.haloX[from];
    this.haloY[to] = this.haloY[from];
    this.haloZ[to] = this.haloZ[from];
    this.haloD2[to] = this.haloD2[from];
    this.haloFlicker[to] = this.haloFlicker[from];
    this.haloPhase[to] = this.haloPhase[from];
    this.haloRgb[to * 3] = this.haloRgb[from * 3];
    this.haloRgb[to * 3 + 1] = this.haloRgb[from * 3 + 1];
    this.haloRgb[to * 3 + 2] = this.haloRgb[from * 3 + 2];
  }

  // Appends a soft glow round each of the nearest lamps after the live particles of the glow pool, in the same arrays, and
  // returns how many it wrote. A lamp's halo breathes with its flame (the same flicker the shader gives its surface).
  private updateHalos(f: EffectsFrame): number {
    const activity = haloActivity(f.daylight);
    if (activity <= 0.002) return 0;
    if (this.haloGathered !== this.sites.gathered || Math.hypot(f.x - this.haloAtX, f.z - this.haloAtZ) > HALO_REBUILD_DISTANCE || !(this.haloAtX === this.haloAtX)) {
      this.gatherHalos(f);
    }
    const p = this.glow;
    let n = p.count;
    const t = f.time;
    for (let h = 0; h < this.haloCount; h++) {
      const dx = this.haloX[h] - f.x;
      const dy = this.haloY[h] - f.y;
      const dz = this.haloZ[h] - f.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // A halo is a sprite, so right up against it it would cover the screen: it fades inside a few blocks, and far away.
      const fade = smoothstep(1.5, 4.5, d) * (1 - smoothstep(HALO_RADIUS * 0.65, HALO_RADIUS, d));
      const flick = 1 + this.haloFlicker[h] * FLICKER_DEPTH * flameFlicker(t, this.haloPhase[h]);
      const alpha = 0.95 * activity * fade * flick;
      if (alpha < 0.004) continue;
      const o3 = n * 3;
      const o4 = n * 4;
      p.position[o3] = this.haloX[h];
      p.position[o3 + 1] = this.haloY[h];
      p.position[o3 + 2] = this.haloZ[h];
      p.params[o4] = 3.4 * (0.97 + 0.03 * flick);
      p.params[o4 + 1] = alpha;
      p.params[o4 + 2] = PARTICLE_HALO;
      p.params[o4 + 3] = 0;
      p.color[o3] = this.haloRgb[h * 3];
      p.color[o3 + 1] = this.haloRgb[h * 3 + 1];
      p.color[o3 + 2] = this.haloRgb[h * 3 + 2];
      n++;
    }
    return n - p.count;
  }
}
