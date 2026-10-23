// Dumps the whole texture catalog as one contact sheet.
//
//   npx vite-node bench/textureSheet.ts            (writes docs/screens/p3/catalog.png)
//   npx vite-node bench/textureSheet.ts out.png
//
// Sections: every tile at 6x with its name; the grass tiles under each zone's biome tint; and the tileable
// tiles repeated 2x2 so seams show up.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createDefaultCatalog } from '../content/textures/TextureCatalog';
import { hex } from '../content/textures/Pixels';
import { applyTint } from '../content/textures/tint';
import { COLORS } from '../worldConstants';
import { encodePng } from './png';

const out = process.argv[2] ?? 'docs/screens/p3/catalog.png';
const catalog = createDefaultCatalog();

// 3x5 pixel font, enough for tile names.
const GLYPHS: Record<string, string> = {
  a: '010101111101101', b: '110101110101110', c: '011100100100011', d: '110101101101110', e: '111100110100111',
  f: '111100110100100', g: '011100101101011', h: '101101111101101', i: '111010010010111', j: '001001001101010',
  k: '101101110101101', l: '100100100100111', m: '101111111101101', n: '110101101101101', o: '010101101101010',
  p: '110101110100100', q: '010101101111011', r: '110101110101101', s: '011100010001110', t: '111010010010010',
  u: '101101101101111', v: '101101101101010', w: '101101111111101', x: '101101010101101', y: '101101010010010',
  z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010', '8': '111101111101111',
  '9': '111101111001110', _: '000000000000111', ' ': '000000000000000', '.': '000000000000010', '-': '000000111000000',
};

const W = 1360;
const MARGIN = 12;
const TEXT = 2; // font scale
const BG = hex('#1d1f24');
let img: Uint8Array;
let H = 0;

const px = (x: number, y: number, c: readonly number[], a = 255) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  const f = a / 255;
  img[i] = Math.round(c[0] * f + img[i] * (1 - f));
  img[i + 1] = Math.round(c[1] * f + img[i + 1] * (1 - f));
  img[i + 2] = Math.round(c[2] * f + img[i + 2] * (1 - f));
  img[i + 3] = 255;
};

const text = (s: string, x: number, y: number, c: readonly number[] = [210, 214, 220]) => {
  for (const ch of s.toLowerCase()) {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    for (let i = 0; i < 15; i++) {
      if (g[i] === '1') {
        for (let dy = 0; dy < TEXT; dy++) for (let dx = 0; dx < TEXT; dx++) px(x + (i % 3) * TEXT + dx, y + Math.floor(i / 3) * TEXT + dy, c);
      }
    }
    x += 4 * TEXT;
  }
};

// Alpha shows as a checkerboard so cutouts are obvious.
const blit = (tile: Uint8Array, x0: number, y0: number, scale: number, repeat = 1) => {
  const size = 16 * repeat;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = ((y % 16) * 16 + (x % 16)) * 4;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const X = x0 + x * scale + dx;
          const Y = y0 + y * scale + dy;
          const check = ((X >> 3) + (Y >> 3)) % 2 ? [88, 88, 96] : [60, 60, 68];
          px(X, Y, check);
          px(X, Y, [tile[i], tile[i + 1], tile[i + 2]], tile[i + 3]);
        }
      }
    }
  }
};

const names = catalog.names();
const CELL = 16 * 6 + 24;
const perRow = Math.floor((W - MARGIN) / CELL);
const tileable = names.filter((n) => catalog.get(n).recipe.tiling === 'both');
const biomes: Array<[string, string]> = [
  ['sao', COLORS.GRASS_SAO], ['tempest', COLORS.GRASS_TEMPEST], ['amestris', COLORS.GRASS_AMESTRIS],
  ['bosse', COLORS.GRASS_BOSSE], ['fremmevilla', COLORS.GRASS_FREMMEVILLA], ['magnolia', COLORS.GRASS_MAGNOLIA],
];

const sec1 = Math.ceil(names.length / perRow) * (16 * 6 + 30);
const sec2 = 16 * 6 * 2 + 70;
const repCell = 16 * 2 * 3 + 24;
const perRep = Math.floor((W - MARGIN) / repCell);
const sec3 = Math.ceil(tileable.length / perRep) * (16 * 2 * 3 + 24) + 30;
H = MARGIN + 30 + sec1 + 30 + sec2 + 30 + sec3;
img = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) img.set([BG[0], BG[1], BG[2], 255], i * 4);

let y = MARGIN;
text('catalog  ' + names.length + ' tiles', MARGIN, y);
y += 30;
names.forEach((name, n) => {
  const x = MARGIN + (n % perRow) * CELL;
  const yy = y + Math.floor(n / perRow) * (16 * 6 + 30);
  let tile = catalog.render(name);
  if (catalog.get(name).recipe.tint === 'grass') tile = applyTint(tile, catalog.tintMask(name), hex('#79c05a'));
  blit(tile, x, yy, 6);
  text(name, x, yy + 16 * 6 + 5);
});
y += sec1;

text('grass under zone tints', MARGIN, y);
y += 26;
biomes.forEach(([label, color], n) => {
  const x = MARGIN + n * (16 * 6 + 14);
  blit(applyTint(catalog.render('grass_top'), catalog.tintMask('grass_top'), hex(color)), x, y, 6);
  blit(applyTint(catalog.render('grass_side'), catalog.tintMask('grass_side'), hex(color)), x, y + 16 * 6 + 4, 6);
  text(label, x, y + 16 * 12 + 12);
});
y += sec2;

text('tileable tiles repeated 2x2', MARGIN, y);
y += 26;
tileable.forEach((name, n) => {
  const x = MARGIN + (n % perRep) * repCell;
  const yy = y + Math.floor(n / perRep) * (16 * 2 * 3 + 24);
  let tile = catalog.render(name);
  if (catalog.get(name).recipe.tint === 'grass') tile = applyTint(tile, catalog.tintMask(name), hex('#79c05a'));
  blit(tile, x, yy, 3, 2);
  text(name, x, yy + 16 * 2 * 3 + 4);
});

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, encodePng(img, W, H));
console.log(`wrote ${out} (${W}x${H}, ${names.length} tiles)`);
