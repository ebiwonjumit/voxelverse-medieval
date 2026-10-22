// Top-down maps of the generated world, for looking at it without a browser.
//   npx vite-node tools/render-map.ts                      every preset, written to docs/maps/
//   npx vite-node tools/render-map.ts -- --preset corridor one preset
//   npx vite-node tools/render-map.ts -- --cx 0 --cz 0 --size 1024 --step 4 --out /tmp/map.png [--blocks] [--seed 1]
// Biome mode (the default) paints each column in its biome's colour, shaded by slope; open water darkens with depth,
// rivers and ponds show as water, roads (once the generator has them) as grey, zone footprints as outlines.
// Blocks mode generates the chunks and paints the topmost visible block, so trees, boulders and reeds show.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createDefaultRegistry } from '../content/blocks';
import { Chunk } from '../engine/Chunk';
import { cellId } from '../engine/cell';
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from '../engine/coords';
import { WATER_LEVEL } from '../worldConstants';
import { Biome } from '../worldgen/biomes/Biome';
import { VoxelverseGenerator, createVoxelverseGenerator } from '../worldgen/VoxelverseGenerator';
import { ZONE_INFOS } from '../worldgen/zones/ZoneInfo';
import { encodePng } from './png';

type Rgb = [number, number, number];

const BIOME_COLOR: Record<Biome, Rgb> = {
  [Biome.MEADOW]: [160, 210, 96],
  [Biome.BIRCH_WOOD]: [226, 220, 112],
  [Biome.OAK_WOOD]: [62, 140, 52],
  [Biome.CEDAR_FOREST]: [34, 104, 92],
  [Biome.PINE_FOREST]: [14, 58, 40],
  [Biome.BAMBOO_GROVE]: [150, 228, 64],
  [Biome.SAKURA_GROVE]: [246, 150, 192],
  [Biome.WETLAND]: [96, 140, 124],
  [Biome.ROCKY_HILLS]: [140, 130, 118],
  [Biome.ALPINE]: [232, 238, 244],
  [Biome.BEACH]: [236, 216, 150],
};
const ZONE_TINT: Rgb = [200, 190, 175];

interface View { name: string; cx: number; cz: number; width: number; height: number; step: number; blocks?: boolean }

// The maps the phase asks for, plus a few that check places the overview cannot show.
const PRESETS: View[] = [
  { name: 'overview', cx: 0, cz: 0, width: 6000, height: 6000, step: 4 },
  { name: 'corridor', cx: 1100, cz: 0, width: 2200, height: 800, step: 1 },
  { name: 'tempest', cx: 1500, cz: 0, width: 1600, height: 1600, step: 1 },
  { name: 'corridor-blocks', cx: 700, cz: 0, width: 800, height: 320, step: 1, blocks: true },
  { name: 'tempest-blocks', cx: 1300, cz: 480, width: 640, height: 320, step: 1, blocks: true },
  { name: 'east-mountains', cx: 11500, cz: 0, width: 5000, height: 5000, step: 8 },
  { name: 'south-forest', cx: 500, cz: 5200, width: 5000, height: 3500, step: 6 },
  { name: 'west-coast', cx: -3200, cz: 0, width: 3000, height: 3000, step: 4 },
];

const args = process.argv.slice(2);
const has = (name: string): boolean => args.includes(`--${name}`);
const num = (name: string, fallback: number): number => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const str = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const registry = createDefaultRegistry();
const seed = has('seed') ? num('seed', 0) : undefined;
const gen: VoxelverseGenerator = createVoxelverseGenerator(registry, seed);

const hex = (c: string): Rgb => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

const waterColor = (depth: number): Rgb => {
  const t = Math.min(1, depth / 50);
  return [60 - 40 * t, 140 - 80 * t, 230 - 90 * t];
};

const outline = (rgb: Uint8Array, view: View, w: number, h: number): void => {
  const x0 = view.cx - view.width / 2;
  const z0 = view.cz - view.height / 2;
  for (const info of ZONE_INFOS) {
    const s = info.shape;
    const n = Math.max(2000, Math.ceil(((s.kind === 'circle' ? s.radius : s.half * 4) * 8) / view.step));
    for (let a = 0; a < n; a++) {
      const t = (a / n) * Math.PI * 2;
      let x: number, z: number;
      if (s.kind === 'circle') {
        x = s.cx + Math.cos(t) * s.radius;
        z = s.cz + Math.sin(t) * s.radius;
      } else {
        x = s.cx + Math.max(-1, Math.min(1, Math.cos(t) * 1.5)) * s.half;
        z = s.cz + Math.max(-1, Math.min(1, Math.sin(t) * 1.5)) * s.half;
      }
      const i = Math.floor((x - x0) / view.step);
      const j = Math.floor((z - z0) / view.step);
      if (i < 0 || j < 0 || i >= w || j >= h) continue;
      const o = (j * w + i) * 3;
      rgb[o] = 20; rgb[o + 1] = 20; rgb[o + 2] = 20;
    }
  }
};

const renderBiomes = (view: View): { w: number; h: number; rgb: Uint8Array } => {
  const w = Math.round(view.width / view.step);
  const h = Math.round(view.height / view.step);
  const x0 = view.cx - view.width / 2;
  const z0 = view.cz - view.height / 2;
  const ground = new Int16Array(w * h);
  const base: Rgb[] = new Array(w * h);
  const water = new Float32Array(w * h); // depth of open water, 0 on land

  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = Math.floor(x0 + i * view.step);
      const z = Math.floor(z0 + j * view.step);
      const col = gen.columnAt(x, z);
      const k = j * w + i;
      ground[k] = col.ground;
      if (col.ground < WATER_LEVEL) water[k] = WATER_LEVEL - col.ground;
      base[k] = col.wild ? BIOME_COLOR[col.biome] : ZONE_TINT;
    }
  }

  const rgb = new Uint8Array(w * h * 3);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      let [r, g, b] = base[k];
      if (water[k] > 0) {
        [r, g, b] = waterColor(water[k]);
      } else {
        // Light from the north-west: slope towards the sun is bright.
        const a = ground[Math.max(0, j - 1) * w + Math.max(0, i - 1)];
        const c = ground[Math.min(h - 1, j + 1) * w + Math.min(w - 1, i + 1)];
        const shade = 1 + Math.max(-0.45, Math.min(0.45, ((a - c) * 0.07) / Math.max(1, view.step / 2)));
        r *= shade; g *= shade; b *= shade;
        // A little height shading for the broad shape of the land too.
        const lift = 1 + Math.max(-0.12, Math.min(0.25, (ground[k] - 10) / 260));
        r *= lift; g *= lift; b *= lift;
      }
      const o = k * 3;
      rgb[o] = clamp255(r); rgb[o + 1] = clamp255(g); rgb[o + 2] = clamp255(b);
    }
  }
  return { w, h, rgb };
};

const renderBlocks = (view: View): { w: number; h: number; rgb: Uint8Array } => {
  const w = view.width;
  const h = view.height;
  const x0 = Math.round(view.cx - view.width / 2);
  const z0 = Math.round(view.cz - view.height / 2);
  const rgb = new Uint8Array(w * h * 3);
  const cx0 = Math.floor(x0 / CHUNK_SIZE);
  const cx1 = Math.floor((x0 + w - 1) / CHUNK_SIZE);
  const cz0 = Math.floor(z0 / CHUNK_SIZE);
  const cz1 = Math.floor((z0 + h - 1) / CHUNK_SIZE);
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const chunk = new Chunk(cx, cz);
      gen.generateChunk(chunk);
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const x = cx * CHUNK_SIZE + lx;
          const z = cz * CHUNK_SIZE + lz;
          const i = x - x0;
          const j = z - z0;
          if (i < 0 || j < 0 || i >= w || j >= h) continue;
          // Topmost block that is not air and not water; open water is painted by depth.
          let top = WORLD_MAX_Y;
          let id = 0;
          for (; top >= WORLD_MIN_Y; top--) {
            id = cellId(chunk.getCell(lx, top, lz));
            if (id !== 0) break;
          }
          let [r, g, b] = hex(registry.get(id).color);
          const ground = gen.terrainHeight(x, z);
          if (id === 5) [r, g, b] = waterColor(Math.max(0, WATER_LEVEL - ground));
          // Taller things read darker underneath and lighter on top: shade by height above the ground.
          const above = top - ground;
          const shade = id === 5 ? 1 : 1 + Math.min(0.3, above * 0.03);
          const o = (j * w + i) * 3;
          rgb[o] = clamp255(r * shade); rgb[o + 1] = clamp255(g * shade); rgb[o + 2] = clamp255(b * shade);
        }
      }
    }
  }
  return { w, h, rgb };
};

const write = (view: View, out: string): void => {
  const t0 = performance.now();
  const { w, h, rgb } = view.blocks ? renderBlocks(view) : renderBiomes(view);
  if (!view.blocks) outline(rgb, view, w, h);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(w, h, rgb));
  console.log(`wrote ${out} (${w}x${h}, ${view.step} block${view.step === 1 ? '' : 's'} per pixel, centre ${view.cx},${view.cz}) in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
};

const only = str('preset', '');
if (has('cx') || has('cz') || has('size') || has('out')) {
  const size = num('size', 1024);
  const step = num('step', 4);
  const blocks = has('blocks');
  write(
    { name: 'custom', cx: num('cx', 0), cz: num('cz', 0), width: blocks ? size : size, height: blocks ? num('height', size) : num('height', size), step: blocks ? 1 : step, blocks },
    resolve(str('out', 'map.png')),
  );
} else {
  for (const view of PRESETS) {
    if (only && only !== view.name) continue;
    write(view, resolve('docs/maps', `${view.name}.png`));
  }
}
