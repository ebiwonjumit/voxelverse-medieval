// Compares two screenshots of the same view taken a moment apart, to show that the wind and the water move.
//
//   npx vite-node tools/shot-diff.ts -- a.png b.png out.png [--crop x,y,w,h] [--scale n] [--gain n]
//
// Prints how many pixels changed and where, and writes a sheet with the first shot, the second and the difference side by
// side (the difference is the per-channel gap times --gain, default 4, on black). --crop and --scale (default 1) zoom
// into one part of the view with nearest-neighbour scaling, which is how a swaying plant is shown at pixel scale.
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng } from '../bench/png';

const args = process.argv.slice(2).filter((a) => a !== '--');
const option = (name: string, fallback: string | null): string | null => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (files.length < 3) {
  console.error('usage: shot-diff a.png b.png out.png [--crop x,y,w,h] [--scale n] [--gain n]');
  process.exit(1);
}
const [fileA, fileB, out] = files;
const a = decodePng(readFileSync(fileA));
const b = decodePng(readFileSync(fileB));
if (a.width !== b.width || a.height !== b.height) throw new Error('the two screenshots are not the same size');

const gain = Number(option('gain', '4'));
const scale = Math.max(1, Math.floor(Number(option('scale', '1'))));
const crop = (option('crop', null) ?? `0,0,${a.width},${a.height}`).split(',').map(Number);
const [cx, cy, cw, ch] = crop;

// How many pixels differ at all, by more than a few levels (so the encoder's dither does not count), and where.
const THRESHOLD = 6;
let changed = 0;
let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
let moved = 0;
for (let y = 0; y < a.height; y++) {
  for (let x = 0; x < a.width; x++) {
    const o = (y * a.width + x) * 4;
    const d = Math.max(Math.abs(a.rgba[o] - b.rgba[o]), Math.abs(a.rgba[o + 1] - b.rgba[o + 1]), Math.abs(a.rgba[o + 2] - b.rgba[o + 2]));
    if (d > THRESHOLD) {
      changed++;
      moved += d;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
const total = a.width * a.height;
console.log(`${changed} of ${total} pixels differ by more than ${THRESHOLD} levels (${((100 * changed) / total).toFixed(2)} percent)` +
  (changed ? `, inside x ${minX}..${maxX}, y ${minY}..${maxY}` : ''));

const panelW = cw * scale;
const panelH = ch * scale;
const gap = 4;
const sheetW = panelW * 3 + gap * 2;
const sheet = new Uint8Array(sheetW * panelH * 4).fill(0);
for (let i = 0; i < sheetW * panelH; i++) sheet[i * 4 + 3] = 255;
const put = (panel: number, x: number, y: number, r: number, g: number, bl: number) => {
  const o = (y * sheetW + panel * (panelW + gap) + x) * 4;
  sheet[o] = r;
  sheet[o + 1] = g;
  sheet[o + 2] = bl;
};
for (let y = 0; y < panelH; y++) {
  for (let x = 0; x < panelW; x++) {
    const sx = cx + Math.floor(x / scale);
    const sy = cy + Math.floor(y / scale);
    if (sx >= a.width || sy >= a.height) continue;
    const o = (sy * a.width + sx) * 4;
    put(0, x, y, a.rgba[o], a.rgba[o + 1], a.rgba[o + 2]);
    put(1, x, y, b.rgba[o], b.rgba[o + 1], b.rgba[o + 2]);
    put(2, x, y, Math.min(255, Math.abs(a.rgba[o] - b.rgba[o]) * gain), Math.min(255, Math.abs(a.rgba[o + 1] - b.rgba[o + 1]) * gain),
      Math.min(255, Math.abs(a.rgba[o + 2] - b.rgba[o + 2]) * gain));
  }
}
writeFileSync(out, encodePng(sheet, sheetW, panelH));
console.log(`Wrote ${out} (${sheetW} x ${panelH})`);
