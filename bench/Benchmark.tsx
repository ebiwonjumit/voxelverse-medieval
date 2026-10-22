import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { MOVE_SPEED, PLAYER_HEIGHT } from '../constants';
import { getTerrainHeight } from '../utils/terrain';
import { FrameStats, summarizeFrames } from './stats';

type Waypoint = [number, number];

interface LegDef {
  name: string;
  path: Waypoint[];
  speed: number;     // blocks per second along the path, 0 for a stationary leg
  duration?: number; // seconds, for stationary legs
  jump?: boolean;    // bob the camera like repeated jumps
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
  mode: 'full' | 'quick';
  startedAt: string;
  env: { renderer: string; devicePixelRatio: number; viewport: string; userAgent: string };
  legs: LegResult[];
  overall: FrameStats;
}

const SPAWN: Waypoint = [0, 300];
const PLAZA_EDGE: Waypoint = [0, 45];
const EAST_ROAD: Waypoint = [60, 0];
const TEMPEST_EDGE: Waypoint = [1440, 0];

const SPRINT = MOVE_SPEED * 2;
const JUMP_PERIOD = 1.2; // seconds between jumps
const JUMP_AIR_TIME = 0.89; // 2 * JUMP_FORCE / GRAVITY
const JUMP_PEAK = 1.78;     // JUMP_FORCE^2 / (2 * GRAVITY)

// The quick mode only checks that the harness works. Its numbers are not comparable with a full run.
const buildLegs = (quick: boolean): LegDef[] => {
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

const pathLength = (path: Waypoint[]): number => {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  }
  return total;
};

const pointAlong = (path: Waypoint[], dist: number): { x: number; z: number; dx: number; dz: number } => {
  let remaining = dist;
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
  quick: boolean;
  setPlayerPos: (pos: Vector3) => void;
  onProgress: (legName: string) => void;
  onDone: (result: BenchResult) => void;
}

// Drives the camera along a fixed route in place of the Player component and records frame times.
// Position updates go through setPlayerPos every frame, exactly as Player does, so the React cost is included.
const Benchmark: React.FC<BenchProps> = ({ quick, setPlayerPos, onProgress, onDone }) => {
  const { camera, gl } = useThree();
  const legs = useRef(buildLegs(quick));
  const run = useRef({
    leg: 0,
    legTime: 0,
    dist: 0,
    frames: [] as number[],
    all: [] as number[],
    results: [] as LegResult[],
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
    const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    r.results.push({
      name: def.name,
      seconds: Math.round(r.legTime * 10) / 10,
      ...summarizeFrames(r.frames),
      drawCallsMax: r.calls,
      trianglesMax: r.tris,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      heapMB: heap ? Math.round(heap.usedJSHeapSize / 1048576) : null,
    });
    r.all.push(...r.frames);
    r.frames = [];
    r.legTime = 0;
    r.dist = 0;
    r.calls = 0;
    r.tris = 0;
    r.leg++;
    if (r.leg < legs.current.length) {
      onProgress(legs.current[r.leg].name);
    } else {
      r.done = true;
      const ctx = gl.getContext();
      const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
      const result: BenchResult = {
        mode: quick ? 'quick' : 'full',
        startedAt: r.started,
        env: {
          renderer: dbg ? String(ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown',
          devicePixelRatio: window.devicePixelRatio,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          userAgent: navigator.userAgent,
        },
        legs: r.results,
        overall: summarizeFrames(r.all),
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
      ({ x, z, dx, dz } = pointAlong(def.path, r.dist));
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
    setPlayerPos(new Vector3(x, y, z));

    const finished = def.speed > 0
      ? r.dist >= pathLength(def.path)
      : r.legTime >= (def.duration ?? 0);
    if (finished) finishLeg();
  });

  return null;
};

export default Benchmark;
