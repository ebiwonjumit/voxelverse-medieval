import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MILE } from '../../constants';
import {
  CLOCK_SPEEDS, DAY_LENGTH_SECONDS, NIGHT_DAYLIGHT, PRESET_HOURS, SKY_PRESETS, START_HOURS, SkyClock, SkySystem,
  applySkyKey, computeSky, daylightAt, fogRange, formatClock, hoursToTime, luminance, moonDirection, parseAtmosphere,
  parseHex, parseSkyOptions, samplePalette, sunDirection,
} from '../../render/SkySystem';
import { CHUNK_SIZE, RENDER_DISTANCE } from '../../worldConstants';
import { getZone } from '../../zones';

const at = (hours: number) => hoursToTime(hours);
const zoneAt = (x: number, z: number) => parseAtmosphere(getZone(x, z).getAtmosphere());
const SAO = zoneAt(0, 0);
const AMESTRIS = zoneAt(-3 * MILE, 0);
const WILDERNESS = zoneAt(1e7, 1e7);

describe('sun and moon', () => {
  it('rises in the east, is highest at noon and sets in the west', () => {
    expect(sunDirection(at(6))[0]).toBeGreaterThan(0.9);
    expect(sunDirection(at(6))[1]).toBeCloseTo(0, 5);
    expect(sunDirection(at(12))[1]).toBeGreaterThan(0.9);
    expect(sunDirection(at(18))[0]).toBeLessThan(-0.9);
    expect(sunDirection(at(0))[1]).toBeLessThan(-0.9);
  });

  it('is a unit vector, and the moon is exactly opposite', () => {
    for (let h = 0; h < 24; h += 0.7) {
      const s = sunDirection(at(h));
      const m = moonDirection(at(h));
      expect(Math.hypot(...s)).toBeCloseTo(1, 6);
      for (let i = 0; i < 3; i++) expect(m[i]).toBeCloseTo(-s[i], 9);
    }
  });
});

describe('daylight', () => {
  it('is full at noon and the night floor at midnight', () => {
    expect(daylightAt(sunDirection(at(12))[1])).toBeCloseTo(1, 2);
    expect(daylightAt(sunDirection(at(0))[1])).toBeCloseTo(NIGHT_DAYLIGHT, 5);
  });

  it('rises through the morning and falls through the evening, never outside its range', () => {
    let prev = -1;
    for (let h = 0; h <= 12; h += 0.25) {
      const d = daylightAt(sunDirection(at(h))[1]);
      expect(d).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(d).toBeGreaterThanOrEqual(NIGHT_DAYLIGHT);
      expect(d).toBeLessThanOrEqual(1);
      prev = d;
    }
    for (let h = 12; h <= 24; h += 0.25) {
      const d = daylightAt(sunDirection(at(h))[1]);
      expect(d).toBeLessThanOrEqual(prev + 1e-9);
      prev = d;
    }
  });

  it('is the same at the same height of the sun going up and coming down', () => {
    expect(computeSky(at(8), SAO).daylight).toBeCloseTo(computeSky(at(16), SAO).daylight, 6);
  });
});

describe('palette', () => {
  it('is bright blue at noon, dark at night and warm at the horizon at sunset', () => {
    const noon = computeSky(at(12), SAO);
    const night = computeSky(at(0), SAO);
    const sunset = computeSky(at(18), SAO);
    expect(noon.zenith[2]).toBeGreaterThan(noon.zenith[0]);
    expect(luminance(noon.zenith)).toBeGreaterThan(luminance(night.zenith) * 5);
    expect(luminance(night.horizon)).toBeLessThan(0.15);
    expect(sunset.horizon[0]).toBeGreaterThan(sunset.horizon[2] + 0.1);
  });

  it('turns the sky light colour from white by day to blue at night', () => {
    expect(computeSky(at(12), SAO).skyLight).toEqual([1, 1, 1]);
    const night = computeSky(at(0), SAO).skyLight;
    expect(night[2]).toBeGreaterThan(night[0]);
    const dusk = computeSky(at(18), SAO).skyLight;
    expect(dusk[0]).toBeGreaterThan(dusk[2]);
  });

  it('shows stars only when the sun is down, and the sun glow only near the horizon', () => {
    expect(computeSky(at(12), SAO).stars).toBe(0);
    expect(computeSky(at(0), SAO).stars).toBe(1);
    expect(luminance(computeSky(at(12), SAO).sunGlow)).toBeLessThan(0.15);
    expect(luminance(computeSky(at(18), SAO).sunGlow)).toBeGreaterThan(luminance(computeSky(at(12), SAO).sunGlow));
  });

  it('holds its ends and blends between keys', () => {
    expect(samplePalette(-5)).toEqual(samplePalette(-0.3));
    expect(samplePalette(5)).toEqual(samplePalette(1));
    const a = samplePalette(0.05).horizon;
    const lo = samplePalette(0).horizon;
    const hi = samplePalette(0.12).horizon;
    for (let i = 0; i < 3; i++) expect(a[i]).toBeGreaterThanOrEqual(Math.min(lo[i], hi[i]) - 1e-9);
  });
});

describe('zone atmosphere', () => {
  it('reads skyTint and fogDensity from the zones', () => {
    expect(SAO.density).toBe(0.02);
    expect(AMESTRIS.density).toBe(0.035);
    expect(parseHex('#cfd8dc')[0]).toBeCloseTo(0xcf / 255, 6);
    expect(AMESTRIS.tint).toEqual(parseHex('#cfd8dc'));
  });

  it('gives each zone its own fog colour and sky at noon', () => {
    const sao = computeSky(at(12), SAO);
    const amestris = computeSky(at(12), AMESTRIS);
    const wild = computeSky(at(12), WILDERNESS);
    expect(amestris.horizon).not.toEqual(sao.horizon);
    expect(wild.zenith).not.toEqual(sao.zenith);
    // Amestris is grey smog: less blue than the open SAO sky, whose skyTint is plain white.
    expect(amestris.horizon[2] - amestris.horizon[0]).toBeLessThan(sao.horizon[2] - sao.horizon[0]);
    expect(sao.zenith).toEqual(samplePalette(sunDirection(at(12))[1]).zenith);
    // The wilderness tint is purple: the zenith leans red and blue away from green.
    expect(wild.zenith[1]).toBeLessThan(sao.zenith[1]);
  });

  it('lets the zone colour show less at night, where the time of day takes over', () => {
    const noonGap = Math.abs(luminance(computeSky(at(12), SAO).horizon) - luminance(computeSky(at(12), AMESTRIS).horizon));
    const nightGap = Math.abs(luminance(computeSky(at(0), SAO).horizon) - luminance(computeSky(at(0), AMESTRIS).horizon));
    expect(nightGap).toBeLessThan(noonGap);
    expect(luminance(computeSky(at(0), AMESTRIS).horizon)).toBeLessThan(0.2);
  });

  it('turns fogDensity into the fog distances, never thinner than the world edge needs', () => {
    const far = RENDER_DISTANCE * CHUNK_SIZE;
    expect(fogRange(0.01)).toEqual({ near: (RENDER_DISTANCE - 2) * CHUNK_SIZE, far });
    expect(fogRange(0.02)).toEqual({ near: (RENDER_DISTANCE - 2) * CHUNK_SIZE, far });
    const smog = fogRange(0.035);
    expect(smog.far).toBeCloseTo(far * (0.02 / 0.035), 6);
    expect(smog.near).toBeLessThan(smog.far);
    expect(smog.near).toBeLessThan(fogRange(0.02).near);
    expect(computeSky(at(12), AMESTRIS).fogFar).toBeLessThan(computeSky(at(12), SAO).fogFar);
    // Denser is never farther, and the range never inverts.
    let prev = Infinity;
    for (let d = 0.005; d < 0.5; d *= 1.3) {
      const r = fogRange(d);
      expect(r.far).toBeLessThanOrEqual(prev + 1e-9);
      expect(r.near).toBeLessThanOrEqual(r.far);
      expect(r.near).toBeGreaterThanOrEqual(0);
      prev = r.far;
    }
  });

  it('moves the fog toward a new zone over a few seconds instead of snapping', () => {
    const sky = new SkySystem({ clock: new SkyClock({ preset: 'noon' }) });
    sky.update(1 / 60, 0, 10, 0, 0, 0);
    const home = [...sky.state.horizon];
    const farOut = sky.state.fogFar;
    sky.update(1 / 60, -3 * MILE, 10, 0, -3 * MILE, 0);
    const first = sky.state.horizon;
    const target = computeSky(sky.clock.time, AMESTRIS).horizon;
    // One frame in, it has moved a little way from the old colour and is nowhere near the new one.
    expect(first).not.toEqual(home);
    const goneBy = Math.hypot(first[0] - home[0], first[1] - home[1], first[2] - home[2]);
    const toGo = Math.hypot(first[0] - target[0], first[1] - target[1], first[2] - target[2]);
    expect(goneBy).toBeLessThan(toGo * 0.1);
    for (let i = 0; i < 60 * 10; i++) sky.update(1 / 60, -3 * MILE, 10, 0, -3 * MILE, 0);
    for (let i = 0; i < 3; i++) expect(sky.state.horizon[i]).toBeCloseTo(target[i], 2);
    expect(sky.state.fogFar).toBeLessThan(farOut);
    expect(sky.fog.far).toBeCloseTo(sky.state.fogFar, 6);
    sky.dispose();
  });

  it('puts the fog colour the terrain fades into on the horizon of the dome', () => {
    const sky = new SkySystem({ clock: new SkyClock({ preset: 'dusk' }) });
    sky.update(1 / 60, 0, 10, 0, 0, 0);
    const u = sky.group.children[0] as unknown as { material: { uniforms: { uHorizon: { value: { x: number; y: number; z: number } } } } };
    const h = u.material.uniforms.uHorizon.value;
    expect([h.x, h.y, h.z]).toEqual(sky.state.horizon);
    // Three stores colours in linear space; read back as sRGB it is the colour we asked for.
    const out = { r: 0, g: 0, b: 0 };
    sky.fog.color.getRGB(out, 'srgb');
    expect(out.r).toBeCloseTo(sky.state.horizon[0], 4);
    expect(out.b).toBeCloseTo(sky.state.horizon[2], 4);
    sky.dispose();
  });

  it('follows the camera with the dome', () => {
    const sky = new SkySystem();
    sky.update(1 / 60, 12, 34, 56, 0, 0);
    expect(sky.group.position.toArray()).toEqual([12, 34, 56]);
    sky.dispose();
  });
});

describe('the fixed twilight preset', () => {
  it('keeps the old purple dusk whatever the clock says', () => {
    const a = computeSky(at(3), WILDERNESS, 'twilight');
    const b = computeSky(at(15), WILDERNESS, 'twilight');
    expect(a.zenith).toEqual(b.zenith);
    expect(a.horizon).toEqual(b.horizon);
    expect(a.daylight).toBe(b.daylight);
    expect(a.daylight).toBeGreaterThan(0.4);
    expect(a.zenith[2]).toBeGreaterThan(a.zenith[1]);
    expect(a.zenith[0]).toBeGreaterThan(a.zenith[1]);
  });

  it('still takes the zone fog colour and density', () => {
    const sao = computeSky(at(18), SAO, 'twilight');
    const amestris = computeSky(at(18), AMESTRIS, 'twilight');
    expect(sao.horizon).not.toEqual(amestris.horizon);
    expect(amestris.fogFar).toBeLessThan(sao.fogFar);
  });
});

describe('the clock', () => {
  it('runs a day in 20 minutes by default, starting in the morning', () => {
    expect(DAY_LENGTH_SECONDS).toBe(1200);
    const clock = new SkyClock();
    expect(clock.time).toBeCloseTo(START_HOURS / 24, 9);
    expect(clock.running).toBe(true);
    clock.update(600);
    expect(clock.time).toBeCloseTo((START_HOURS / 24 + 0.5) % 1, 9);
  });

  it('wraps at midnight and ignores zero or negative steps', () => {
    const clock = new SkyClock({ startHours: 23.9 });
    clock.update(1200 * 0.01);
    expect(clock.time).toBeGreaterThanOrEqual(0);
    expect(clock.time).toBeLessThan(0.01);
    const before = clock.time;
    clock.update(0);
    clock.update(-5);
    expect(clock.time).toBe(before);
  });

  it('honours a different day length and the speed steps', () => {
    const clock = new SkyClock({ dayLengthSeconds: 60, startHours: 0 });
    clock.update(15);
    expect(clock.time).toBeCloseTo(0.25, 9);
    clock.faster();
    expect(clock.speed).toBe(CLOCK_SPEEDS[1]);
    const t = clock.time;
    clock.update(1);
    expect(clock.time).toBeCloseTo(t + CLOCK_SPEEDS[1] / 60, 9);
  });

  it('F4 steps through the presets and wraps, each fixed one stopping at its hour', () => {
    const clock = new SkyClock({ startHours: 9 });
    const seen: string[] = [clock.preset];
    for (let i = 0; i < SKY_PRESETS.length; i++) {
      clock.cyclePreset();
      seen.push(clock.preset);
      if (clock.preset !== 'cycle') {
        expect(clock.time).toBeCloseTo(PRESET_HOURS[clock.preset] / 24, 9);
        const t = clock.time;
        clock.update(100);
        expect(clock.time).toBe(t);
      }
    }
    expect(seen).toEqual(['cycle', 'dawn', 'noon', 'dusk', 'night', 'twilight', 'cycle']);
    expect(clock.running).toBe(true);
  });

  it('stepping the hour sets the time, wraps, and leaves a fixed preset stopped', () => {
    const clock = new SkyClock({ startHours: 23 });
    clock.stepHours(2);
    expect(clock.time).toBeCloseTo(1 / 24, 9);
    clock.stepHours(-2);
    expect(clock.time).toBeCloseTo(23 / 24, 9);
    expect(clock.running).toBe(true);
    clock.setPreset('noon');
    clock.stepHours(1);
    expect(clock.time).toBeCloseTo(13 / 24, 9);
    expect(clock.preset).toBe('cycle');
    expect(clock.running).toBe(false);
  });

  it('- stops a 1x clock, = starts it again and then speeds it up', () => {
    const clock = new SkyClock();
    clock.slower();
    expect(clock.running).toBe(false);
    clock.faster();
    expect(clock.running).toBe(true);
    expect(clock.speed).toBe(1);
    clock.faster();
    clock.faster();
    clock.faster();
    clock.faster();
    expect(clock.speed).toBe(CLOCK_SPEEDS[CLOCK_SPEEDS.length - 1]);
    clock.slower();
    expect(clock.speed).toBe(CLOCK_SPEEDS[CLOCK_SPEEDS.length - 2]);
  });

  it('maps keys to the clock and ignores the others', () => {
    const clock = new SkyClock({ startHours: 9 });
    expect(applySkyKey(clock, 'F4')).toBe(true);
    expect(clock.preset).toBe('dawn');
    expect(applySkyKey(clock, 'BracketRight')).toBe(true);
    expect(clock.time).toBeCloseTo(7.25 / 24, 9);
    expect(applySkyKey(clock, 'BracketLeft')).toBe(true);
    expect(applySkyKey(clock, 'Equal')).toBe(true);
    expect(applySkyKey(clock, 'Minus')).toBe(true);
    expect(applySkyKey(clock, 'KeyW')).toBe(false);
    expect(applySkyKey(clock, 'F3')).toBe(false);
  });

  it('describes itself for the debug panel', () => {
    expect(new SkyClock({ startHours: 9.5 }).describe()).toBe('09:30 (1x)');
    expect(new SkyClock({ preset: 'dusk' }).describe()).toBe('17:45 (dusk)');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(at(6.25))).toBe('06:15');
  });
});

describe('page address', () => {
  it('has no overrides by default, and noon for a screenshot', () => {
    expect(parseSkyOptions('')).toEqual({});
    expect(parseSkyOptions('?shot=0,0,0,0,0', true)).toEqual({ preset: 'noon' });
  });

  it('reads a preset, an hour in either form, the day length and the speed', () => {
    expect(parseSkyOptions('?sky=night')).toEqual({ preset: 'night' });
    expect(parseSkyOptions('?sky=bogus')).toEqual({});
    expect(parseSkyOptions('?time=7.5')).toMatchObject({ startHours: 7.5, preset: 'cycle', paused: true });
    expect(parseSkyOptions('?time=18:30')).toMatchObject({ startHours: 18.5, paused: true });
    expect(parseSkyOptions('?time=18:30&sky=cycle')).toMatchObject({ startHours: 18.5, preset: 'cycle', paused: false });
    expect(parseSkyOptions('?time=6&speed=2')).toMatchObject({ startHours: 6, paused: false, speedIndex: 2 });
    expect(parseSkyOptions('?daylength=60')).toEqual({ dayLengthSeconds: 60 });
    expect(parseSkyOptions('?daylength=-5')).toEqual({});
  });

  it('builds a clock that starts where the address says', () => {
    const clock = new SkyClock(parseSkyOptions('?time=18:30'));
    expect(clock.time).toBeCloseTo(18.5 / 24, 9);
    expect(clock.running).toBe(false);
    const live = new SkyClock(parseSkyOptions('?time=18:30&sky=cycle'));
    live.update(12);
    expect(live.time).toBeGreaterThan(18.5 / 24);
  });
});

describe('what is gone', () => {
  const game = readFileSync(join(__dirname, '../../components/Game.tsx'), 'utf8');

  it('leaves no DayNightCycle, Three.js lights, drei Sky or shadow map in the game component', () => {
    expect(game).not.toMatch(/DayNightCycle/);
    expect(game).not.toMatch(/ambientLight|hemisphereLight|directionalLight|pointLight|spotLight/);
    expect(game).not.toMatch(/castShadow|shadow-map|shadow-bias|shadow-camera|<Canvas shadows/);
    expect(game).not.toMatch(/\bSky\b.*drei|<Sky\b/);
  });

  it('draws the sky from the sky system', () => {
    expect(game).toMatch(/SkyRig/);
    expect(game).toMatch(/SkySystem/);
  });
});
