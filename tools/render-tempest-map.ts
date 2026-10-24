// Top-down maps of the Tempest plan as the district planner and the zone make it, to be laid next to the owner's
// plan (Tempest-6.png) and judged by eye. Two maps are written by default:
//   docs/maps/tempest-plan.png    the town at 3 cells a pixel step: districts, the lots (outlined, with a tick on each front),
//                                 gardens, parks and construction sites, streets, lamps, trees, landmarks, gates, the river
//   docs/maps/tempest-zone.png    the whole footprint at 1 cell a pixel, colour by district, with the terrain's height shading
//   docs/maps/tempest-ground.png  (with --ground) the top block of every column as the zone really builds it, roofs included
//
//   npx vite-node tools/render-tempest-map.ts
//   npx vite-node tools/render-tempest-map.ts -- --ground --scale 2 --out docs/maps
//   npx vite-node tools/render-tempest-map.ts -- --region -120,-120,120,120 --scale 6 --only plan --out /tmp
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDefaultRegistry } from '../content/blocks';
import { Chunk } from '../engine/Chunk';
import { cellId } from '../engine/cell';
import { CHUNK_SIZE, WORLD_MAX_Y } from '../engine/coords';
import { WORLD_SEED } from '../worldConstants';
import { LotKind } from '../worldgen/tempest/DistrictPlanner';
import { TempestCityZone } from '../worldgen/tempest/TempestCityZone';
import { generateZoneChunk } from '../worldgen/tempest/zoneChunk';
import {
  COMPOUND, ROAD_GATES, TEMPEST_CENTER_X, TEMPEST_CENTER_Z, TEMPEST_RADIUS, districtAt, farmField, landmarkAt, riverDistance,
} from '../worldgen/tempest/layout';
import { encodePng } from './png';

type Rgb = [number, number, number];
const DISTRICT: Record<string, Rgb> = {
  civic: [244, 244, 236], guest: [150, 205, 140], government: [90, 170, 160], public: [120, 150, 215], luxury: [175, 130, 200],
  commercial: [240, 160, 70], production: [160, 110, 70], storage: [110, 85, 65], residential: [226, 196, 150], tourism: [240, 150, 175],
  farm: [205, 215, 120], pasture: [165, 215, 130], forest: [38, 96, 52], wild: [120, 160, 105], open: [150, 190, 110],
};
const KIND_TINT: Record<LotKind, Rgb | null> = { building: null, garden: [120, 190, 110], park: [70, 150, 80], meadow: [170, 210, 120], construction: [190, 190, 180] };
const ROAD: Rgb = [150, 150, 156];
const AVENUE: Rgb = [118, 118, 128];
const WATER: Rgb = [70, 140, 215];
const OUTLINE: Rgb = [200, 40, 40];
const EDGE: Rgb = [60, 50, 45];

const args = process.argv.slice(2);
const opt = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const only = opt('only', 'all');
const outDir = resolve(opt('out', 'docs/maps'));
const seed = Number(opt('seed', String(WORLD_SEED)));
const customRegion = opt('region', '');

const zone = new TempestCityZone({ seed });
const planner = zone.planner;

class Image {
  readonly rgb: Uint8Array;
  constructor(readonly width: number, readonly height: number) { this.rgb = new Uint8Array(width * height * 3); }
  set(px: number, py: number, c: Rgb): void {
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;
    const o = (py * this.width + px) * 3;
    this.rgb[o] = c[0]; this.rgb[o + 1] = c[1]; this.rgb[o + 2] = c[2];
  }
  rect(px0: number, py0: number, px1: number, py1: number, c: Rgb): void {
    for (let y = py0; y <= py1; y++) for (let x = px0; x <= px1; x++) this.set(x, y, c);
  }
  save(file: string): void {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(file, encodePng(this.width, this.height, this.rgb));
    console.log(`wrote ${file} (${this.width}x${this.height})`);
  }
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c: Rgb, k: number): Rgb => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];

/** What a cell is at map level: the planner's lots and verge, roads, landmarks, farms, the river. */
const colorAt = (x: number, z: number): Rgb => {
  const lm = landmarkAt(x, z);
  if (riverDistance(x, z) <= 3.5 && !(lm && lm.kind === 'bridge')) return WATER;
  const road = planner.roadOf(x, z);
  if (road) return road.kind === 'avenue' ? AVENUE : lm?.onRoad ? [200, 190, 140] : ROAD;
  if (lm) {
    if (lm.kind === 'pond') return WATER;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => landmarkAt(x + dx, z + dz)?.id !== lm.id);
    if (edge) return OUTLINE;
    return lm.kind === 'hall' ? [255, 255, 255] : lm.kind === 'plaza' ? [225, 215, 200] : DISTRICT[lm.district ?? 'civic'] ?? [220, 220, 220];
  }
  const lot = planner.lotAt(x, z);
  if (lot) {
    const l = lot.lot;
    const base = DISTRICT[l.district];
    const tint = KIND_TINT[lot.kind];
    let c = tint ? mix(base, tint, 0.75) : base;
    // The lot's outline, and a darker tick in the middle of its front edge.
    const left = x - l.x, top = z - l.z, right = l.x + l.w - 1 - x, bottom = l.z + l.d - 1 - z;
    if (left === 0 || top === 0 || right === 0 || bottom === 0) c = EDGE;
    const front = l.facing === 0 ? top : l.facing === 2 ? bottom : l.facing === 1 ? right : left;
    const along = l.facing === 0 || l.facing === 2 ? Math.abs(x - (l.x + l.w / 2)) : Math.abs(z - (l.z + l.d / 2));
    if (front <= 1 && along < 2) c = [200, 60, 50];
    if (lot.kind === 'construction' && (x + z) % 4 === 0) c = shade(c, 0.8);
    return c;
  }
  const block = planner.blockOf(x, z);
  if (block) return shade(DISTRICT[block.district], 0.9);
  if (x >= COMPOUND.x0 && x <= COMPOUND.x1 && z >= COMPOUND.z0 && z <= COMPOUND.z1) return DISTRICT.civic;
  const f = farmField(x, z);
  if (f) return (f.ring + f.sector) % 2 === 0 ? [205, 215, 120] : [190, 205, 105];
  return DISTRICT[districtAt(x, z)] ?? DISTRICT.open;
};

const region = (): { x0: number; z0: number; x1: number; z1: number } => {
  if (customRegion) {
    const [a, b, c, d] = customRegion.split(',').map(Number);
    return { x0: TEMPEST_CENTER_X + a, z0: TEMPEST_CENTER_Z + b, x1: TEMPEST_CENTER_X + c, z1: TEMPEST_CENTER_Z + d };
  }
  return { x0: TEMPEST_CENTER_X - 215, z0: TEMPEST_CENTER_Z - 262, x1: TEMPEST_CENTER_X + 215, z1: TEMPEST_CENTER_Z + 215 };
};

const drawPlan = (): void => {
  const r = region();
  const scale = Number(opt('scale', '3'));
  const img = new Image((r.x1 - r.x0 + 1) * scale, (r.z1 - r.z0 + 1) * scale);
  for (let z = r.z0; z <= r.z1; z++) {
    for (let x = r.x0; x <= r.x1; x++) img.rect((x - r.x0) * scale, (z - r.z0) * scale, (x - r.x0 + 1) * scale - 1, (z - r.z0 + 1) * scale - 1, colorAt(x, z));
  }
  const dot = (x: number, z: number, c: Rgb, s: number): void => {
    if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) return;
    const px = Math.floor((x - r.x0 + 0.5) * scale), pz = Math.floor((z - r.z0 + 0.5) * scale);
    img.rect(px - s, pz - s, px + s, pz + s, c);
  };
  for (const t of planner.trees) dot(t.x, t.z, [20, 90, 40], Math.max(1, Math.floor(scale / 2)));
  for (const l of planner.lamps) dot(l.x, l.z, l.striped ? [255, 255, 255] : [235, 200, 40], Math.max(0, Math.floor(scale / 3)));
  // The gates the RoadNetwork's roads reach.
  for (const g of Object.values(ROAD_GATES)) dot(g.x, g.z, [255, 0, 255], scale * 2);
  img.save(resolve(outDir, 'tempest-plan.png'));
};

const drawZone = (): void => {
  const scale = 1;
  const half = TEMPEST_RADIUS + 20;
  const size = half * 2 * scale;
  const img = new Image(size, size);
  for (let pz = 0; pz < size; pz++) {
    for (let px = 0; px < size; px++) {
      const x = TEMPEST_CENTER_X - half + Math.floor(px / scale);
      const z = TEMPEST_CENTER_Z - half + Math.floor(pz / scale);
      const d = Math.hypot(x - TEMPEST_CENTER_X, z - TEMPEST_CENTER_Z);
      if (d > TEMPEST_RADIUS) { img.set(px, pz, [30, 30, 36]); continue; }
      // Terrain relief: a gentle shading from the zone's own height.
      const h = zone.groundAt(x, z);
      const k = 0.78 + Math.max(-6, Math.min(12, h - 8)) * 0.018;
      img.set(px, pz, shade(colorAt(x, z), k));
    }
  }
  img.save(resolve(outDir, 'tempest-zone.png'));
};

/** The top non-air block of every column of the zone, as it is built, in the block's own colour (roofs, trees and all). */
const drawGround = (): void => {
  const registry = createDefaultRegistry();
  const scale = Number(opt('scale', '2'));
  const r = customRegion ? region() : { x0: TEMPEST_CENTER_X - 232, z0: TEMPEST_CENTER_Z - 232, x1: TEMPEST_CENTER_X + 232, z1: TEMPEST_CENTER_Z + 232 };
  const img = new Image((r.x1 - r.x0 + 1) * scale, (r.z1 - r.z0 + 1) * scale);
  const color = (id: number): Rgb => {
    const hex = registry.get(id).color.replace('#', '');
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  };
  const cache = new Map<number, Rgb>();
  const started = performance.now();
  let chunks = 0;
  for (let cz = Math.floor(r.z0 / CHUNK_SIZE); cz <= Math.floor(r.z1 / CHUNK_SIZE); cz++) {
    for (let cx = Math.floor(r.x0 / CHUNK_SIZE); cx <= Math.floor(r.x1 / CHUNK_SIZE); cx++) {
      const chunk = new Chunk(cx, cz);
      generateZoneChunk(zone, chunk);
      chunks++;
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const x = cx * CHUNK_SIZE + lx, z = cz * CHUNK_SIZE + lz;
          if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
          let top = 0, y = WORLD_MAX_Y;
          for (; y >= 0; y--) { top = cellId(chunk.getCell(lx, y, lz)); if (top !== 0) break; }
          let c = cache.get(top);
          if (!c) { c = color(top); cache.set(top, c); }
          // A little relief: higher columns lighter, so roofs and trees read as shapes.
          const k = 0.72 + Math.min(y, 30) * 0.012;
          img.rect((x - r.x0) * scale, (z - r.z0) * scale, (x - r.x0 + 1) * scale - 1, (z - r.z0 + 1) * scale - 1, shade(c, k));
        }
      }
    }
  }
  console.log(`${chunks} chunks in ${((performance.now() - started) / 1000).toFixed(1)} s`);
  img.save(resolve(outDir, 'tempest-ground.png'));
};

if (only === 'all' || only === 'plan') drawPlan();
if (only === 'all' || only === 'zone') drawZone();
if (args.includes('--ground') || only === 'ground') drawGround();
