// How long the Tempest zone takes to build a chunk, in node, for each kind of ground it has: the dense town, the tourism
// sector, the compound, the farms, the river, the pastures and the forest. Each chunk is built cold (a zone with empty
// caches), then again warm, and the planner and zone constructors are timed. Run it on a quiet machine.
//   npx vite-node tools/bench-tempest-zone.ts
import { Chunk } from '../engine/Chunk';
import { CHUNK_SIZE } from '../engine/coords';
import { WORLD_SEED } from '../worldConstants';
import { DistrictPlanner } from '../worldgen/tempest/DistrictPlanner';
import { TempestCityZone } from '../worldgen/tempest/TempestCityZone';
import { generateZoneChunk } from '../worldgen/tempest/zoneChunk';
import { TEMPEST_CENTER_X, TEMPEST_CENTER_Z, worldX } from '../worldgen/tempest/layout';

const ms = (since: number): number => performance.now() - since;
const stat = (xs: number[]): string => {
  const s = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return `mean ${mean.toFixed(1)}  median ${s[Math.floor(s.length / 2)].toFixed(1)}  p95 ${s[Math.floor(s.length * 0.95)].toFixed(1)}  max ${s[s.length - 1].toFixed(1)} ms`;
};

let t = performance.now();
for (let i = 0; i < 5; i++) new DistrictPlanner({ seed: WORLD_SEED + i });
console.log(`planner: ${(ms(t) / 5).toFixed(0)} ms each (lots, raster, trees, lamps)`);
t = performance.now();
const probe = new TempestCityZone({ seed: WORLD_SEED });
console.log(`zone: ${ms(t).toFixed(0)} ms (planner included), ${probe.planner.lots.length} lots, ${probe.planner.trees.length} street trees, ${probe.planner.lamps.length} lamps`);

const regions: Array<[string, number, number, number, number]> = [
  ['dense town (residences, commerce)', -150, 150, -150, 150],
  ['tourism sector', 40, 180, 40, 180],
  ['civic compound and public strip', -60, 180, -190, -140],
  ['farms and ponds', 195, 320, -200, 200],
  ['river and east road', 320, 360, -40, 40],
  ['pastures and west gate', -260, -190, -80, 90],
  ['forest', -420, -300, 200, 420],
  ['north road and forest', -40, 40, -520, -330],
];

const all: number[] = [];
for (const [name, lx0, lx1, lz0, lz1] of regions) {
  const cold: number[] = [];
  const warm: number[] = [];
  const cx0 = Math.floor(worldX(lx0) / CHUNK_SIZE), cx1 = Math.floor(worldX(lx1) / CHUNK_SIZE);
  const cz0 = Math.floor((TEMPEST_CENTER_Z + lz0) / CHUNK_SIZE), cz1 = Math.floor((TEMPEST_CENTER_Z + lz1) / CHUNK_SIZE);
  const zone = new TempestCityZone({ seed: WORLD_SEED });
  for (let cz = cz0; cz <= cz1; cz += Math.max(1, Math.floor((cz1 - cz0) / 5))) {
    for (let cx = cx0; cx <= cx1; cx += Math.max(1, Math.floor((cx1 - cx0) / 5))) {
      t = performance.now();
      generateZoneChunk(zone, new Chunk(cx, cz));
      cold.push(ms(t));
      t = performance.now();
      generateZoneChunk(zone, new Chunk(cx, cz));
      warm.push(ms(t));
    }
  }
  all.push(...cold);
  console.log(`${name.padEnd(36)} ${String(cold.length).padStart(2)} chunks   cold ${stat(cold)}\n${' '.repeat(36)}             warm ${stat(warm)}`);
}
console.log(`\nall regions, cold: ${stat(all)}   (${TEMPEST_CENTER_X}, ${TEMPEST_CENTER_Z} is the Central Square)`);
