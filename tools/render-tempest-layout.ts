// Draws the Tempest layout contract (worldgen/tempest/layout.ts) as a top-down map, so it can be laid next to the owner's
// plan and checked by eye: districts by colour, roads in grey, landmarks outlined, the river, the forest and the farms.
//   npx vite-node tools/render-tempest-layout.ts                       docs/screens/p7/tempest-layout.png
//   npx vite-node tools/render-tempest-layout.ts -- --out /tmp/x.png --scale 3
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  COMPOUND, LANDMARKS, ROAD_GATES, TEMPEST_CENTER_X, TEMPEST_CENTER_Z, blockAt, districtAt, farmField, inShape, landmarkAt, riverDistance, roadAt, RIVER,
} from '../worldgen/tempest/layout';
import { encodePng } from './png';

type Rgb = [number, number, number];
const DISTRICT: Record<string, Rgb> = {
  civic: [244, 244, 236], guest: [150, 205, 140], government: [90, 170, 160], public: [120, 150, 215], luxury: [175, 130, 200],
  commercial: [240, 160, 70], production: [160, 110, 70], storage: [110, 85, 65], residential: [226, 196, 150], tourism: [240, 150, 175],
  farm: [205, 215, 120], pasture: [165, 215, 130], forest: [38, 96, 52], wild: [120, 160, 105], open: [150, 190, 110],
};
const ROAD: Rgb = [150, 150, 156];
const AVENUE: Rgb = [118, 118, 128];
const WATER: Rgb = [70, 140, 215];
const OUTLINE: Rgb = [200, 40, 40];

const args = process.argv.slice(2);
const opt = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const scale = Number(opt('scale', '2'));
const out = resolve(opt('out', 'docs/screens/p7/tempest-layout.png'));
const [lx0, lx1, lz0, lz1] = [-300, 360, -280, 260];
const width = (lx1 - lx0) * scale;
const height = (lz1 - lz0) * scale;
const rgb = new Uint8Array(width * height * 3);

const colorAt = (x: number, z: number): Rgb => {
  const lm = landmarkAt(x, z);
  if (riverDistance(x, z) <= RIVER.width / 2 && !(lm && lm.kind === 'bridge')) return WATER;
  const road = roadAt(x, z);
  if (road) return road.kind === 'avenue' ? AVENUE : lm?.onRoad ? [200, 190, 140] : ROAD;
  if (lm) {
    if (lm.kind === 'pond') return WATER;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => landmarkAt(x + dx, z + dz)?.id !== lm.id);
    if (edge) return OUTLINE;
    return lm.kind === 'hall' ? [255, 255, 255] : lm.kind === 'plaza' ? [225, 215, 200] : DISTRICT[lm.district ?? 'civic'] ?? [220, 220, 220];
  }
  const block = blockAt(x, z);
  if (block) {
    const base = DISTRICT[block.district];
    // Bare plots and scaffolded ones are paler and hatched.
    if (block.density === 'empty') return [Math.min(base[0] + 40, 255), Math.min(base[1] + 40, 255), Math.min(base[2] + 40, 255)];
    return base;
  }
  if (x >= COMPOUND.x0 && x <= COMPOUND.x1 && z >= COMPOUND.z0 && z <= COMPOUND.z1) return DISTRICT.civic;
  const f = farmField(x, z);
  if (f) return (f.ring + f.sector) % 2 === 0 ? [205, 215, 120] : [190, 205, 105];
  return DISTRICT[districtAt(x, z)] ?? DISTRICT.open;
};

for (let py = 0; py < height; py++) {
  for (let px = 0; px < width; px++) {
    const x = TEMPEST_CENTER_X + lx0 + Math.floor(px / scale);
    const z = TEMPEST_CENTER_Z + lz0 + Math.floor(py / scale);
    const c = colorAt(x, z);
    const o = (py * width + px) * 3;
    rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2];
  }
}
// The two road gates' directions: a small mark on the edge of the map where each would be, for orientation only.
void ROAD_GATES; void inShape; void LANDMARKS;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, encodePng(width, height, rgb));
console.log(`wrote ${out} (${width}x${height})`);
