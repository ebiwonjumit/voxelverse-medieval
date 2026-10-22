// Top-down map of the generated world, for looking at terrain without a browser.
//   npx vite-node tools/render-map.ts -- --cx 0 --cz 0 --size 1024 --step 4 --out /tmp/map.png
// --size is the width of the view in blocks and --step the blocks per pixel. Colours come from the surface block,
// shaded by slope; open water darkens with depth. Zone borders are drawn as thin dark lines with --borders.
import { writeFileSync } from 'node:fs';
import { createDefaultRegistry } from '../content/blocks';
import { WATER_LEVEL } from '../worldConstants';
import { createVoxelverseGenerator } from '../worldgen/VoxelverseGenerator';
import { ZONE_INFOS } from '../worldgen/zones/ZoneInfo';
import { encodePng } from './png';

const args = process.argv.slice(2);
const num = (name: string, fallback: number): number => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const str = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const cx = num('cx', 0);
const cz = num('cz', 0);
const size = num('size', 1024);
const step = num('step', 4);
const seed = args.includes('--seed') ? num('seed', 0) : undefined;
const out = str('out', 'map.png');
const borders = args.includes('--borders');

const registry = createDefaultRegistry();
const gen = createVoxelverseGenerator(registry, seed);
const px = Math.round(size / step);
const x0 = cx - size / 2;
const z0 = cz - size / 2;

const hex = (c: string): [number, number, number] => [
  parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16),
];
const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

const rgb = new Uint8Array(px * px * 3);
for (let j = 0; j < px; j++) {
  for (let i = 0; i < px; i++) {
    const x = Math.floor(x0 + i * step);
    const z = Math.floor(z0 + j * step);
    const h = gen.terrainHeight(x, z);
    let [r, g, b] = hex(registry.get(gen.sampleBlock(x, h, z)).color);
    if (h <= WATER_LEVEL) {
      const depth = Math.min(1, (WATER_LEVEL - h) / 50);
      [r, g, b] = [60 - 40 * depth, 140 - 80 * depth, 230 - 90 * depth];
    } else {
      // Light from the north-west: slope towards the sun is bright.
      const slope = gen.terrainHeight(x - step, z - step) - gen.terrainHeight(x + step, z + step);
      const shade = 1 + Math.max(-0.5, Math.min(0.5, slope * 0.06));
      r *= shade; g *= shade; b *= shade;
    }
    const o = (j * px + i) * 3;
    rgb[o] = clamp255(r); rgb[o + 1] = clamp255(g); rgb[o + 2] = clamp255(b);
  }
}

if (borders) {
  for (const info of ZONE_INFOS) {
    const s = info.shape;
    for (let a = 0; a < 4000; a++) {
      const t = (a / 4000) * Math.PI * 2;
      const x = s.kind === 'circle' ? s.cx + Math.cos(t) * s.radius : s.cx + Math.max(-1, Math.min(1, Math.cos(t) * 1.5)) * s.half;
      const z = s.kind === 'circle' ? s.cz + Math.sin(t) * s.radius : s.cz + Math.max(-1, Math.min(1, Math.sin(t) * 1.5)) * s.half;
      const i = Math.floor((x - x0) / step);
      const j = Math.floor((z - z0) / step);
      if (i < 0 || j < 0 || i >= px || j >= px) continue;
      const o = (j * px + i) * 3;
      rgb[o] = 20; rgb[o + 1] = 20; rgb[o + 2] = 20;
    }
  }
}

writeFileSync(out, encodePng(px, px, rgb));
console.log(`wrote ${out} (${px}x${px}, ${step} blocks per pixel, centre ${cx},${cz})`);
