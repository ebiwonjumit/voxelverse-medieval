import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { MOVE_SPEED, PLAYER_HEIGHT } from '../constants';
import { getTerrainHeight } from '../utils/terrain';
import { FrameStats, summarizeFrames } from './stats';
import { playerState } from '../playerState';
import { getWorldProbe } from './worldProbe';

type Waypoint = [number, number];

interface LegDef {
  name: string;
  path: Waypoint[];
  speed: number;     // blocks per second along the path, 0 for a stationary leg
  duration?: number; // seconds, for stationary legs
  jump?: boolean;    // bob the camera like repeated jumps
  loop?: boolean;    // the path is closed: keep walking it until the duration runs out
  soak?: boolean;    // sample memory and render counters every SOAK_INTERVAL seconds
}

export type BenchMode = 'full' | 'quick' | 'soak';

export interface SoakSample {
  t: number;             // seconds into the soak leg
  geometries: number;    // gl.info.memory.geometries
  triangles: number;     // gl.info.render.triangles of the last frame
  drawCalls: number;
  heapMB: number | null;
  stats: Record<string, number> | null; // the world renderer's own getStats(), if it registered one
}

export interface LegResult extends FrameStats {
  name: string;
  seconds: number;
  drawCallsMax: number;
  trianglesMax: number;
  geometries: number;
  textures: number;
  heapMB: number | null;
}

export interface BenchResult {
  mode: BenchMode;
  startedAt: string;
  env: { renderer: string; devicePixelRatio: number; viewport: string; userAgent: string };
  legs: LegResult[];
  overall: FrameStats;
  soak?: SoakSample[];
}

const SPAWN: Waypoint = [0, 300];
const PLAZA_EDGE: Waypoint = [0, 45];
const EAST_ROAD: Waypoint = [60, 0];
const TEMPEST_EDGE: Waypoint = [1440, 0];

// Greensom, south road to the plaza, out along the west and east roads and home again.
// Closed on purpose: the second lap revisits chunks that were unloaded on the first.
const SOAK_LOOP: Waypoint[] = [
  SPAWN, PLAZA_EDGE, [-60, 0], [-140, 0], [-60, 0], [0, -60], [60, 0], [140, 0], [60, 0], PLAZA_EDGE, SPAWN,
];
const SOAK_SECONDS = 90;
const SOAK_INTERVAL = 5;

const SPRINT = MOVE_SPEED * 2;
const JUMP_PERIOD = 1.2; // seconds between jumps
const JUMP_AIR_TIME = 0.89; // 2 * JUMP_FORCE / GRAVITY
const JUMP_PEAK = 1.78;     // JUMP_FORCE^2 / (2 * GRAVITY)

// The quick mode only checks that the harness works. Its numbers are not comparable with a full run.
const buildLegs = (mode: BenchMode): LegDef[] => {
  if (mode === 'soak') {
    return [
      { name: 'load', path: [SPAWN], speed: 0, duration: 6 },
      { name: 'soak', path: SOAK_LOOP, speed: SPRINT, duration: SOAK_SECONDS, loop: true, soak: true },
    ];
  }
  const quick = mode === 'quick';
  const idle = quick ? 2 : 6;
  const walk = quick ? SPRINT * 6 : SPRINT;
  return [
    { name: 'load', path: [SPAWN], speed: 0, duration: idle },
    { name: 'idle', path: [SPAWN], speed: 0, duration: idle },
    { name: 'jump', path: [SPAWN], speed: 0, duration: idle, jump: true },
    { name: 'greensom-to-sao', path: [SPAWN, PLAZA_EDGE, EAST_ROAD], speed: walk },
    { name: 'sao-to-tempest', path: [EAST_ROAD, TEMPEST_EDGE], speed: walk },
  ];
};

const heapMB = (): number | null => {
  const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return heap ? Math.round(heap.usedJSHeapSize / 1048576) : null;
};

const pathLength = (path: Waypoint[]): number => {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  }
  return total;
};

const pointAlong = (path: Waypoint[], dist: number, loop = false): { x: number; z: number; dx: number; dz: number } => {
  let remaining = loop ? dist % pathLength(path) : dist;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1];
    const [bx, bz] = path[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (remaining <= len || i === path.length - 1) {
      const t = len === 0 ? 0 : Math.min(1, remaining / len);
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / (len || 1), dz: (bz - az) / (len || 1) };
    }
    remaining -= len;
  }
  return { x: path[0][0], z: path[0][1], dx: 0, dz: -1 };
};

interface BenchProps {
  mode: BenchMode;
  onProgress: (legName: string) => void;
  onDone: (result: BenchResult) => void;
}

// Drives the camera along a fixed route in place of the Player component and records frame times.
// The position goes into playerState every frame, exactly as Player does it.
const Benchmark: React.FC<BenchProps> = ({ mode, onProgress, onDone }) => {
  const { camera, gl } = useThree();
  const legs = useRef(buildLegs(mode));
  const run = useRef({
    leg: 0,
    legTime: 0,
    dist: 0,
    frames: [] as number[],
    all: [] as number[],
    results: [] as LegResult[],
    soak: [] as SoakSample[],
    nextSample: SOAK_INTERVAL,
    calls: 0,
    tris: 0,
    started: new Date().toISOString(),
    first: true,
    done: false,
  });
  const look = useRef(new Vector3());

  const finishLeg = () => {
    const r = run.current;
    const def = legs.current[r.leg];
    const info = gl.info;
    r.results.push({
      name: def.name,
      seconds: Math.round(r.legTime * 10) / 10,
      ...summarizeFrames(r.frames),
      drawCallsMax: r.calls,
      trianglesMax: r.tris,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      heapMB: heapMB(),
    });
    r.all.push(...r.frames);
    r.frames = [];
    r.legTime = 0;
    r.dist = 0;
    r.calls = 0;
    r.tris = 0;
    r.nextSample = SOAK_INTERVAL;
    r.leg++;
    if (r.leg < legs.current.length) {
      onProgress(legs.current[r.leg].name);
    } else {
      r.done = true;
      const ctx = gl.getContext();
      const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
      const result: BenchResult = {
        mode,
        startedAt: r.started,
        env: {
          renderer: dbg ? String(ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown',
          devicePixelRatio: window.devicePixelRatio,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          userAgent: navigator.userAgent,
        },
        legs: r.results,
        overall: summarizeFrames(r.all),
        ...(mode === 'soak' ? { soak: r.soak } : {}),
      };
      (window as unknown as { __BENCH_RESULT__: BenchResult }).__BENCH_RESULT__ = result;
      console.log('BENCH_RESULT ' + JSON.stringify(result));
      onDone(result);
    }
  };

  useFrame((_state, delta) => {
    const r = run.current;
    if (r.done) return;
    if (r.first) {
      r.first = false;
      onProgress(legs.current[0].name);
      return;
    }

    const def = legs.current[r.leg];
    r.legTime += delta;
    r.frames.push(delta * 1000);
    r.calls = Math.max(r.calls, gl.info.render.calls);
    r.tris = Math.max(r.tris, gl.info.render.triangles);

    let x: number, z: number, dx: number, dz: number;
    if (def.speed > 0) {
      r.dist += def.speed * delta;
      ({ x, z, dx, dz } = pointAlong(def.path, r.dist, def.loop));
    } else {
      [x, z] = def.path[0];
      dx = 0;
      dz = -1;
    }

    let jumpOffset = 0;
    if (def.jump) {
      const phase = r.legTime % JUMP_PERIOD;
      if (phase < JUMP_AIR_TIME) {
        const u = phase / JUMP_AIR_TIME;
        jumpOffset = JUMP_PEAK * 4 * u * (1 - u);
      }
    }

    const y = getTerrainHeight(Math.round(x), Math.round(z)) + 0.5 + PLAYER_HEIGHT + jumpOffset;
    camera.position.set(x, y, z);
    look.current.set(x + dx * 10, y - 0.5, z + dz * 10);
    camera.lookAt(look.current);
    playerState.x = x;
    playerState.y = y;
    playerState.z = z;

    if (def.soak && r.legTime >= r.nextSample) {
      const info = gl.info;
      r.soak.push({
        t: r.nextSample,
        geometries: info.memory.geometries,
        triangles: info.render.triangles,
        drawCalls: info.render.calls,
        heapMB: heapMB(),
        stats: getWorldProbe()?.getStats?.() ?? null,
      });
      r.nextSample += SOAK_INTERVAL;
    }

    const finished = def.duration !== undefined
      ? r.legTime >= def.duration
      : r.dist >= pathLength(def.path);
    if (finished) finishLeg();
  });

  return null;
};

export default Benchmark;
