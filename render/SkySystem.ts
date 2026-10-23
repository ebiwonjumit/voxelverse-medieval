import { BackSide, Fog, Group, Mesh, ShaderMaterial, SphereGeometry, SRGBColorSpace, Vector3 } from 'three';
import { AtmosphereSettings } from '../zones/Zone';
import { getZone } from '../zones';
import { CHUNK_SIZE, RENDER_DISTANCE } from '../worldConstants';

// The sky: a clock, the sun and moon it moves, the colours of the sky and the fog at each time of day, and the dome
// that draws them. It replaces the old DayNightCycle component and the Three.js lights: chunks are lit by baked light
// (docs/light.md), so the only thing the time of day has to feed them is the `daylight` number and the colour of the sky
// light, which a chunk's shader multiplies in every frame. Nothing is re-meshed when the sun moves.
//
// The first half of this file is pure maths (no scene, nothing to dispose) so tests can drive it; SkySystem at the end
// owns the Three.js objects.
//
// All colours here are sRGB triples in 0..1, written straight to the screen (fog and sky are unlit and not tone mapped),
// so the horizon of the dome is the same colour as the fog and terrain fades into it without a seam.

export type Rgb = [number, number, number];
export type Vec3 = [number, number, number];

/** A full day, in real seconds, unless ?daylength says otherwise. */
export const DAY_LENGTH_SECONDS = 20 * 60;
/** Where a new game starts: a bright morning. */
export const START_HOURS = 9;

// --- Colour helpers -----------------------------------------------------------------------------------------------

export const parseHex = (value: string): Rgb => {
  const m = /^#?([0-9a-f]{6})/i.exec(value.trim()) ?? /^#?([0-9a-f]{3})$/i.exec(value.trim());
  if (!m) return [0.5, 0.5, 0.5];
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
};

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: Rgb, b: Rgb): Rgb => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const scale = (a: Rgb, k: number): Rgb => [a[0] * k, a[1] * k, a[2] * k];
const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1);
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Relative luminance of an sRGB triple, close enough for comparing how bright two colours look. */
export const luminance = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// --- Sun and moon -------------------------------------------------------------------------------------------------

/** Time of day is a fraction of a day: 0 is midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset. */
export const hoursToTime = (hours: number): number => (((hours % 24) + 24) % 24) / 24;
export const timeToHours = (time: number): number => time * 24;

/** "06:15" for a time of day. */
export const formatClock = (time: number): string => {
  // The epsilon keeps 9.5 hours from reading 09:29 when the division lands a hair under.
  const minutes = Math.floor(((time % 1) + 1) % 1 * 24 * 60 + 1e-6);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

// The sun rises in the east (+x), climbs, and sets in the west (-x), with a lean toward -z (north) so that at noon it
// is up and a little north, which keeps it in view of a camera looking along -z. Unit length.
const SUN_LEAN_Z = -0.3;

export const sunDirection = (time: number): Vec3 => {
  const angle = (time - 0.25) * Math.PI * 2;
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  const len = Math.hypot(x, y, SUN_LEAN_Z);
  return [x / len, y / len, SUN_LEAN_Z / len];
};

/** The moon is always opposite the sun. */
export const moonDirection = (time: number): Vec3 => {
  const [x, y, z] = sunDirection(time);
  return [-x, -y, -z];
};

// --- Palette ------------------------------------------------------------------------------------------------------

// The sky by the height of the sun above the horizon (its direction's y, -1 to 1), the same going up and coming down.
// Between keys everything is interpolated; outside the first and last it is held.
interface PaletteKey { e: number; zenith: Rgb; horizon: Rgb; skyLight: Rgb; }

const PALETTE: PaletteKey[] = [
  { e: -0.3, zenith: parseHex('#03051a'), horizon: parseHex('#0a1230'), skyLight: [0.55, 0.72, 1.15] },
  { e: -0.1, zenith: parseHex('#0f1a42'), horizon: parseHex('#3a2f5c'), skyLight: [0.62, 0.7, 1.05] },
  { e: 0.0, zenith: parseHex('#2b3f7a'), horizon: parseHex('#ef9a5e'), skyLight: [1.0, 0.78, 0.62] },
  { e: 0.12, zenith: parseHex('#4778c4'), horizon: parseHex('#f2c48c'), skyLight: [1.0, 0.92, 0.82] },
  { e: 0.35, zenith: parseHex('#3d7fe0'), horizon: parseHex('#a9cdf0'), skyLight: [1, 1, 1] },
  { e: 1.0, zenith: parseHex('#2f6fdc'), horizon: parseHex('#9cc8f5'), skyLight: [1, 1, 1] },
];

export interface PaletteSample { zenith: Rgb; horizon: Rgb; skyLight: Rgb; }

export const samplePalette = (elevation: number): PaletteSample => {
  if (elevation <= PALETTE[0].e) return { zenith: PALETTE[0].zenith, horizon: PALETTE[0].horizon, skyLight: PALETTE[0].skyLight };
  const last = PALETTE[PALETTE.length - 1];
  if (elevation >= last.e) return { zenith: last.zenith, horizon: last.horizon, skyLight: last.skyLight };
  let i = 0;
  while (PALETTE[i + 1].e < elevation) i++;
  const a = PALETTE[i];
  const b = PALETTE[i + 1];
  const t = (elevation - a.e) / (b.e - a.e);
  return { zenith: mix(a.zenith, b.zenith, t), horizon: mix(a.horizon, b.horizon, t), skyLight: mix(a.skyLight, b.skyLight, t) };
};

/** The least sky light a night has: moonlit, never black. */
export const NIGHT_DAYLIGHT = 0.15;

/** How much of the baked sky light shows, from the height of the sun: NIGHT_DAYLIGHT in the dark, 1 in full day. */
export const daylightAt = (elevation: number): number =>
  NIGHT_DAYLIGHT + (1 - NIGHT_DAYLIGHT) * smoothstep(-0.12, 0.35, elevation);

// --- Zone atmosphere ----------------------------------------------------------------------------------------------

/** A zone's `AtmosphereSettings` as numbers, so it can be blended. `tint` is the zone's `skyTint`. */
export interface ZoneAtmosphere { fog: Rgb; tint: Rgb; density: number; }

export const parseAtmosphere = (a: AtmosphereSettings): ZoneAtmosphere => ({
  fog: parseHex(a.fogColor), tint: parseHex(a.skyTint), density: a.fogDensity,
});

export const lerpAtmosphere = (from: ZoneAtmosphere, to: ZoneAtmosphere, t: number): ZoneAtmosphere => ({
  fog: mix(from.fog, to.fog, t), tint: mix(from.tint, to.tint, t), density: from.density + (to.density - from.density) * t,
});

/** The fogDensity at which the fog still starts and ends at the old fixed distances; denser zones pull both in. */
export const REFERENCE_FOG_DENSITY = 0.02;
const MIN_FOG_FAR = 48;

/**
 * Where the fog starts and ends for a zone's `fogDensity`. The fog has to hide the edge of the loaded world, so it
 * is never thinner than the old fixed range (clear for the nearer chunks, solid at the render distance): a density at or
 * under the reference leaves it alone, and a denser one scales both distances down in proportion (Amestris, 0.035,
 * ends at 57 percent of the render distance).
 */
export const fogRange = (density: number, renderDistance: number = RENDER_DISTANCE): { near: number; far: number } => {
  const baseFar = renderDistance * CHUNK_SIZE;
  const baseNear = Math.max(renderDistance - 2, 0) * CHUNK_SIZE;
  const k = density > REFERENCE_FOG_DENSITY ? REFERENCE_FOG_DENSITY / density : 1;
  const far = Math.max(baseFar * k, Math.min(MIN_FOG_FAR, baseFar));
  return { far, near: Math.max(far - (baseFar - baseNear) * k, 0) };
};

// --- The sky at one moment ----------------------------------------------------------------------------------------

export interface SkyState {
  /** Fraction of a day, 0 midnight, 0.5 noon. */
  time: number;
  sunDir: Vec3;
  moonDir: Vec3;
  /** Height of the sun above the horizon, -1 to 1. */
  elevation: number;
  /** Multiplier for baked sky light (`uDaylight`), NIGHT_DAYLIGHT to 1. */
  daylight: number;
  /** Colour of that light as multipliers (`uSkyLight`): white by day, warm at dusk, blue at night. */
  skyLight: Rgb;
  /** Top of the dome. The zone's skyTint is in it. */
  zenith: Rgb;
  /** The dome at the horizon, which is also the fog colour. The zone's fog colour is in it. */
  horizon: Rgb;
  fogNear: number;
  fogFar: number;
  /** 0 by day, 1 on a clear night. */
  stars: number;
  /** How visible the moon disc is (faint by day). */
  moon: number;
  /** Light added around the sun (colour already scaled by strength), strongest at sunrise and sunset. */
  sunGlow: Rgb;
}

/** The zone's atmosphere with nothing else, the "zone fog colour" the fog is blended from. */
export type SkyLook = 'cycle' | 'twilight';

// How strongly the zone's fog colour and sky tint show through the time of day.
const ZONE_FOG_NIGHT = 0.35;     // weight of the (darkened) zone fog colour at night
const ZONE_FOG_DAY = 0.75;       // and at noon
const ZONE_TINT_NIGHT = 0.25;    // how far the sky tint pulls the zenith at night
const ZONE_TINT_DAY = 0.65;      // and at noon
const NIGHT_FOG: Rgb = [0.05, 0.07, 0.13]; // what the zone fog colour is multiplied by in the dark

// The old fixed look, kept as a preset: a purple dusk with the sun below the horizon, bright enough to see by.
const TWILIGHT_ZENITH = parseHex('#2f2350');
const TWILIGHT_HORIZON = parseHex('#6b4b7a');
const TWILIGHT_DAYLIGHT = 0.6;
const TWILIGHT_SKY_LIGHT: Rgb = [1.0, 0.88, 1.0];

/** A tint normalised so its strongest channel is 1, so a grey tint desaturates without also darkening. */
const tintMultiplier = (tint: Rgb): Rgb => {
  const m = Math.max(tint[0], tint[1], tint[2], 1e-3);
  return [tint[0] / m, tint[1] / m, tint[2] / m];
};

/**
 * The sky for a time of day inside a zone's atmosphere. `look` 'twilight' ignores the time for the colours (the fixed
 * preset) but still takes the zone's fog colour and density. Pure: same inputs, same output.
 */
export const computeSky = (
  time: number, zone: ZoneAtmosphere, look: SkyLook = 'cycle', renderDistance: number = RENDER_DISTANCE,
): SkyState => {
  const sunDir = sunDirection(time);
  const moonDir = moonDirection(time);
  const elevation = sunDir[1];
  const range = fogRange(zone.density, renderDistance);
  const base = { time, sunDir, moonDir, elevation, fogNear: range.near, fogFar: range.far };

  if (look === 'twilight') {
    return {
      ...base,
      daylight: TWILIGHT_DAYLIGHT,
      skyLight: TWILIGHT_SKY_LIGHT,
      zenith: mix(TWILIGHT_ZENITH, mul(TWILIGHT_ZENITH, tintMultiplier(zone.tint)), 0.5),
      horizon: mix(TWILIGHT_HORIZON, zone.fog, 0.5),
      stars: 0.45,
      moon: 0.8,
      sunGlow: [0, 0, 0],
    };
  }

  const day = smoothstep(-0.12, 0.25, elevation); // 0 in the dark, 1 in daylight
  const palette = samplePalette(elevation);
  const zoneFog = mul(zone.fog, mix(NIGHT_FOG, [1, 1, 1], day));
  const horizon = mix(palette.horizon, zoneFog, ZONE_FOG_NIGHT + (ZONE_FOG_DAY - ZONE_FOG_NIGHT) * day);
  const tintWeight = ZONE_TINT_NIGHT + (ZONE_TINT_DAY - ZONE_TINT_NIGHT) * day;
  const zenith = mix(palette.zenith, mul(palette.zenith, tintMultiplier(zone.tint)), tintWeight);

  // A warm halo round the sun while it is near the horizon, and a faint white one in full day.
  const warm = smoothstep(-0.25, 0.0, elevation) * (1 - smoothstep(0.05, 0.5, elevation));
  const sunGlow = mix(scale([1, 1, 1], 0.12 * day), scale([1.0, 0.5, 0.2], 0.55), warm);

  return {
    ...base,
    daylight: daylightAt(elevation),
    skyLight: palette.skyLight,
    zenith,
    horizon,
    stars: 1 - smoothstep(-0.2, 0.0, elevation),
    moon: 1 - 0.7 * day,
    sunGlow,
  };
};

// --- The clock ----------------------------------------------------------------------------------------------------

/** F4 steps through these: the live cycle, four fixed times of day, and the old fixed twilight. */
export const SKY_PRESETS = ['cycle', 'dawn', 'noon', 'dusk', 'night', 'twilight'] as const;
export type SkyPresetName = (typeof SKY_PRESETS)[number];

/** The hour each fixed preset stops the clock at. The twilight look ignores it. */
export const PRESET_HOURS: Record<Exclude<SkyPresetName, 'cycle'>, number> = {
  dawn: 6.25, noon: 12, dusk: 17.75, night: 0, twilight: 18,
};

/** The speeds `=` and `-` step through: 1 is the real 20 minute day, 200 is a day in 6 seconds. */
export const CLOCK_SPEEDS = [1, 8, 40, 200] as const;

export interface SkyClockOptions {
  dayLengthSeconds?: number;
  startHours?: number;
  preset?: SkyPresetName;
  /** Index into CLOCK_SPEEDS. */
  speedIndex?: number;
  paused?: boolean;
}

export class SkyClock {
  /** Fraction of a day. */
  time: number;
  preset: SkyPresetName;
  speedIndex: number;
  paused: boolean;
  readonly dayLengthSeconds: number;

  constructor(options: SkyClockOptions = {}) {
    this.dayLengthSeconds = options.dayLengthSeconds && options.dayLengthSeconds > 0 ? options.dayLengthSeconds : DAY_LENGTH_SECONDS;
    this.time = hoursToTime(options.startHours ?? START_HOURS);
    this.speedIndex = Math.min(Math.max(options.speedIndex ?? 0, 0), CLOCK_SPEEDS.length - 1);
    this.paused = options.paused ?? false;
    this.preset = options.preset ?? 'cycle';
    if (this.preset !== 'cycle') this.time = hoursToTime(PRESET_HOURS[this.preset]);
  }

  get speed(): number {
    return CLOCK_SPEEDS[this.speedIndex];
  }

  /** True while the time moves by itself. */
  get running(): boolean {
    return this.preset === 'cycle' && !this.paused;
  }

  /** Which colours the sky wears: only the twilight preset changes them without the time. */
  get look(): SkyLook {
    return this.preset === 'twilight' ? 'twilight' : 'cycle';
  }

  update(dt: number): void {
    if (!this.running || !(dt > 0)) return;
    this.time = (this.time + (dt * this.speed) / this.dayLengthSeconds) % 1;
  }

  /** Switch preset. A fixed one stops the clock at its hour; 'cycle' starts it again, from where it is. */
  setPreset(preset: SkyPresetName): void {
    this.preset = preset;
    if (preset === 'cycle') {
      this.paused = false;
      return;
    }
    this.time = hoursToTime(PRESET_HOURS[preset]);
  }

  /** F4: the next preset. */
  cyclePreset(): SkyPresetName {
    const next = SKY_PRESETS[(SKY_PRESETS.indexOf(this.preset) + 1) % SKY_PRESETS.length];
    this.setPreset(next);
    return next;
  }

  /** Jump to an hour. The clock stays as it was (running or stopped), except that a fixed preset becomes a stopped cycle. */
  setHours(hours: number): void {
    if (this.preset !== 'cycle') {
      this.preset = 'cycle';
      this.paused = true;
    }
    this.time = hoursToTime(hours);
  }

  stepHours(delta: number): void {
    this.setHours(timeToHours(this.time) + delta);
  }

  /** `=`: faster. From a stopped clock it starts at 1x. */
  faster(): void {
    if (!this.running) {
      this.preset = 'cycle';
      this.paused = false;
      return;
    }
    this.speedIndex = Math.min(this.speedIndex + 1, CLOCK_SPEEDS.length - 1);
  }

  /** `-`: slower, and from 1x it stops the clock. */
  slower(): void {
    if (!this.running) return;
    if (this.speedIndex === 0) this.paused = true;
    else this.speedIndex--;
  }

  /** A line for the debug panel. */
  describe(): string {
    const mode = this.running ? `${this.speed}x` : this.preset === 'cycle' ? 'stopped' : this.preset;
    return `${formatClock(this.time)} (${mode})`;
  }
}

/** Reacts to the keys the sky owns. Returns true if the key was one of them. */
export const applySkyKey = (clock: SkyClock, code: string): boolean => {
  switch (code) {
    case 'F4': clock.cyclePreset(); return true;
    case 'BracketRight': clock.stepHours(1); return true;
    case 'BracketLeft': clock.stepHours(-1); return true;
    case 'Equal': clock.faster(); return true;
    case 'Minus': clock.slower(); return true;
    default: return false;
  }
};

// --- Page address -------------------------------------------------------------------------------------------------

export interface SkyOptions extends SkyClockOptions {}

const parseHours = (value: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Reads ?sky=cycle|dawn|noon|dusk|night|twilight, ?time=hours (7.5 or 07:30), ?daylength=seconds and ?speed=index
 * (0 to 3, into CLOCK_SPEEDS). `?time` alone starts the cycle at that hour and stops it there; add `?sky=cycle` to let it
 * run. A page that needs a stable picture (a screenshot) passes `pinned`, which makes noon the default.
 */
export const parseSkyOptions = (search: string, pinned = false): SkyOptions => {
  const params = new URLSearchParams(search);
  const options: SkyOptions = {};
  const sky = params.get('sky');
  const preset = (SKY_PRESETS as readonly string[]).includes(sky ?? '') ? (sky as SkyPresetName) : null;
  const hours = parseHours(params.get('time') ?? '');
  const length = Number(params.get('daylength'));
  if (Number.isFinite(length) && length > 0) options.dayLengthSeconds = length;
  const speed = params.get('speed');
  if (speed !== null && Number.isInteger(Number(speed))) options.speedIndex = Number(speed);

  if (hours !== null) {
    options.startHours = hours;
    options.preset = preset ?? 'cycle';
    options.paused = preset === null || preset === 'cycle' ? speed === null && sky !== 'cycle' : false;
  } else if (preset !== null) {
    options.preset = preset;
  } else if (pinned) {
    options.preset = 'noon';
  }
  return options;
};

// --- The Three.js side --------------------------------------------------------------------------------------------

const DOME_RADIUS = 450;

const DOME_VERTEX = `
varying vec3 vDir;
void main() {
  vDir = normalize( position );
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

// A gradient from the horizon colour to the zenith, a halo, discs for the sun and the moon, and stars from a hash of the
// direction (a star is a dot in a cell of a fine grid, so there is no texture). Everything is in output colour space.
const DOME_FRAGMENT = `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uSunGlow;
uniform float uStars;
uniform float uMoon;
varying vec3 vDir;

float hash13( vec3 p ) {
  p = fract( p * 0.1031 );
  p += dot( p, p.zyx + 31.32 );
  return fract( ( p.x + p.y ) * p.z );
}

void main() {
  vec3 dir = normalize( vDir );
  float h = dir.y;
  vec3 col = mix( uHorizon, uZenith, smoothstep( 0.0, 0.55, h ) );

  float sd = max( dot( dir, uSunDir ), 0.0 );
  col += uSunGlow * ( pow( sd, 6.0 ) * 0.5 + pow( sd, 40.0 ) * 0.9 );

  float above = smoothstep( -0.02, 0.04, h );
  vec3 stars = vec3( 0.0 );
  vec3 cell = dir * 260.0;
  vec3 id = floor( cell );
  float n = hash13( id );
  if ( n > 0.992 ) {
    float d = length( fract( cell ) - 0.5 );
    float b = smoothstep( 0.42, 0.0, d ) * ( 0.45 + 0.55 * hash13( id + 7.7 ) );
    stars = vec3( 0.85, 0.9, 1.0 ) * b;
  }
  col += stars * uStars * above * smoothstep( 0.0, 0.25, h );

  float md = dot( dir, uMoonDir );
  float moon = smoothstep( 0.99935, 0.99965, md );
  col = mix( col, vec3( 0.86, 0.9, 1.0 ), moon * uMoon * above );
  col += vec3( 0.55, 0.62, 0.8 ) * pow( max( md, 0.0 ), 120.0 ) * 0.22 * uMoon * above;

  float sun = smoothstep( 0.9992, 0.99955, dot( dir, uSunDir ) );
  col = mix( col, vec3( 1.0, 0.96, 0.82 ), sun * above );

  gl_FragColor = vec4( col, 1.0 );
}
`;

export interface SkySystemOptions {
  clock?: SkyClock;
  renderDistance?: number;
  /** How fast the fog and sky tint follow a change of zone, per second (an exponential approach). */
  zoneBlendRate?: number;
}

/**
 * Owns the clock, the sky dome and the scene's fog. Call `update` once a frame; read `state.daylight` and
 * `state.skyLight` for the chunk materials. The dome follows the camera, is drawn first with no depth, and the terrain
 * is drawn over it.
 */
export class SkySystem {
  readonly group = new Group();
  readonly clock: SkyClock;
  readonly fog = new Fog('#87ceeb', 1, 100);
  state: SkyState;

  private readonly renderDistance: number;
  private readonly blendRate: number;
  private readonly dome: Mesh;
  private readonly material: ShaderMaterial;
  private target: ZoneAtmosphere | null = null;
  private current: ZoneAtmosphere | null = null;
  private lastZone: unknown = null;

  constructor(options: SkySystemOptions = {}) {
    this.clock = options.clock ?? new SkyClock();
    this.renderDistance = options.renderDistance ?? RENDER_DISTANCE;
    this.blendRate = options.zoneBlendRate ?? 1.2;
    this.group.name = 'sky';

    this.material = new ShaderMaterial({
      vertexShader: DOME_VERTEX,
      fragmentShader: DOME_FRAGMENT,
      uniforms: {
        uZenith: { value: new Vector3() },
        uHorizon: { value: new Vector3() },
        uSunDir: { value: new Vector3(0, 1, 0) },
        uMoonDir: { value: new Vector3(0, -1, 0) },
        uSunGlow: { value: new Vector3() },
        uStars: { value: 0 },
        uMoon: { value: 1 },
      },
      side: BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    this.dome = new Mesh(new SphereGeometry(1, 32, 16), this.material);
    this.dome.scale.setScalar(DOME_RADIUS);
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    this.dome.name = 'sky-dome';
    this.group.add(this.dome);

    // Until the first update there is no zone; the wilderness colours hold the place so state is never empty.
    this.state = computeSky(this.clock.time, parseAtmosphere(getZone(1e7, 1e7).getAtmosphere()), this.clock.look, this.renderDistance);
    this.apply();
  }

  /** The zone atmosphere the fog is heading for, after smoothing (for tests and the debug panel). */
  get zoneAtmosphere(): ZoneAtmosphere | null {
    return this.current;
  }

  /** `dt` in seconds, the camera's position (the dome follows it), and the player's block position for the zone. */
  update(dt: number, camX: number, camY: number, camZ: number, playerX: number, playerZ: number): void {
    const zone = getZone(playerX, playerZ);
    if (zone !== this.lastZone) {
      this.lastZone = zone;
      this.target = parseAtmosphere(zone.getAtmosphere());
      if (!this.current) this.current = this.target;
    }
    if (this.current && this.target && this.current !== this.target) {
      const t = 1 - Math.exp(-Math.max(dt, 0) * this.blendRate);
      this.current = lerpAtmosphere(this.current, this.target, t);
    }
    this.clock.update(dt);
    this.state = computeSky(this.clock.time, this.current!, this.clock.look, this.renderDistance);
    this.group.position.set(camX, camY, camZ);
    this.apply();
  }

  /** Handles F4, [ ], - and =. Returns true if the key belonged to the sky. */
  handleKey(code: string): boolean {
    return applySkyKey(this.clock, code);
  }

  dispose(): void {
    this.dome.geometry.dispose();
    this.material.dispose();
  }

  private apply(): void {
    const s = this.state;
    const u = this.material.uniforms;
    (u.uZenith.value as Vector3).set(...s.zenith);
    (u.uHorizon.value as Vector3).set(...s.horizon);
    (u.uSunDir.value as Vector3).set(...s.sunDir);
    (u.uMoonDir.value as Vector3).set(...s.moonDir);
    (u.uSunGlow.value as Vector3).set(...s.sunGlow);
    u.uStars.value = s.stars;
    u.uMoon.value = s.moon;
    this.fog.color.setRGB(s.horizon[0], s.horizon[1], s.horizon[2], SRGBColorSpace);
    this.fog.near = s.fogNear;
    this.fog.far = s.fogFar;
  }
}
