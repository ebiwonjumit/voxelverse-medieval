import { Canvas, RGB, hex, palette, ramp } from '../Pixels';
import { SeededRng } from '../Rng';
import { TextureRecipe } from '../TextureRecipe';
import { layers, ranks } from '../noise';
import { glints } from './masonry';
import { DrawnTile, N, at, clamp01 } from './tempestKit';

// Tempest walls and roofs: white plaster, timber frames, the stone footing, a fluted column, and the five roofs of the
// town (terracotta, dark Japanese tile, green glaze, the teal civic roof and thatch) with their ridge caps. See
// docs/tempest-blocks.md.

const PLASTER = palette('#cfd5d9', '#dfe4e6', '#ebeef0', '#f7f8f7');
const FRAME = palette('#2b1d15', '#3d2b20', '#523a2b');

/** The plaster fill shared by the white wall tiles: soft patches, a faint wash running down, a few short trowel marks. */
const plasterFill = (c: Canvas, rng: SeededRng): void => {
  const patches = ranks(layers(rng, [[2, 2, 1], [4, 4, 0.8], [16, 16, 0.35]]));
  const wash = ranks(layers(rng, [[8, 1, 1], [16, 2, 0.4]]));
  c.paint((x, y) => ramp(PLASTER, clamp01(patches[at(x, y)] * 0.75 + wash[at(x, y)] * 0.25)));
  for (let i = 0; i < 5; i++) {
    const x = rng.int(N);
    const y = rng.int(N);
    const len = 3 + rng.int(3);
    for (let k = 0; k < len; k++) c.set(x + k, y, i % 2 ? PLASTER[3] : PLASTER[0]);
  }
};

const plasterWhite = new DrawnTile('plaster_white', (c, rng) => {
  plasterFill(c, rng);
  // The coat is laid in panels: a hairline where one meets the next.
  for (let x = 0; x < N; x++) c.set(x, 0, hex('#b3bcc2'));
  c.set(rng.int(N), 0, PLASTER[1]);
});

/** Plaster between a timber frame: a post down one side, a rail along the top and a brace across the panel. */
const plasterTimber = new DrawnTile('plaster_timber', (c, rng) => {
  plasterFill(c, rng);
  for (let y = 0; y < N; y++) {
    c.set(0, y, FRAME[1]);
    c.set(1, y, FRAME[0]);
  }
  for (let x = 0; x < N; x++) {
    c.set(x, 0, FRAME[2]);
    c.set(x, 1, FRAME[0]);
  }
  c.set(0, 0, FRAME[1]);
  // The brace climbs from the lower left to the upper right, two pixels thick, shaded on its lower side.
  for (let k = 0; k < 12; k++) {
    c.set(2 + k, 14 - k, FRAME[2]);
    c.set(2 + k, 15 - k, FRAME[0]);
    c.set(3 + k, 14 - k, FRAME[1]);
  }
});

/** Plaster over a stone footing: the lower third is rubble in two courses, with a shadow line where the plaster stops. */
const plasterBase = new DrawnTile('plaster_base', (c, rng) => {
  const stone = palette('#6b7075', '#868b90', '#a2a7ab', '#bcc0c3');
  const mortar = hex('#454a4f');
  plasterFill(c, rng);
  const courses = [[10, 3], [13, 3]];
  courses.forEach(([y0, h], row) => {
    let x = rng.int(N);
    let used = 0;
    while (used < N) {
      const w = Math.min(N - used, 4 + rng.int(3));
      const tone = rng.next();
      for (let dx = 0; dx < w; dx++) {
        for (let dy = 0; dy < h; dy++) {
          const px = x + dx;
          const py = y0 + dy;
          if (dx === w - 1 || dy === h - 1) c.set(px, py, mortar);
          else c.set(px, py, ramp(stone, clamp01(tone * 0.7 + (dy === 0 ? 0.3 : 0) + (dx === 0 ? 0.1 : 0))));
        }
      }
      x += w;
      used += w;
    }
    if (row === 0) for (let k = 0; k < N; k++) if (k % 4 === 0) c.set(k, y0 - 1, hex('#9aa2a6'));
  });
}, { tiling: 'x' });

/**
 * A fluted column, for the civic hall: four flutes across the tile, each a groove, a lit edge, a soft middle and a
 * shaded edge, so a round shaft built from three boxes reads as carved. It repeats every four pixels.
 */
const column = new DrawnTile('column_white', (c, rng) => {
  const stone = palette('#aab2b9', '#cfd5d9', '#e6eaec', '#f8f9f8');
  const grain = ranks(layers(rng, [[2, 6, 1], [4, 12, 0.5]]));
  const profile = [0.04, 0.95, 0.62, 0.3];
  c.paint((x, y) => {
    const v = profile[x & 3] * 0.82 + grain[at(x, y)] * 0.18;
    return ramp(stone, clamp01(v));
  });
}, { tiling: 'x' });

// --- Roofs ---------------------------------------------------------------------------------------------------

const clampTone = (v: number): number => (v < 0 ? 0 : v > 0.999 ? 0.999 : v);

const TERRACOTTA = palette('#7a2d1a', '#a54727', '#c9632f', '#e3854a');
const TERRACOTTA_HIGH = hex('#f6b878');

/**
 * Terracotta barrel tile, the main roof of the town. Each column four pixels wide is one half-round tile (a seam, a
 * lit shoulder, the crown, a shaded flank), and tiles overlap in courses of eight rows, the joints of neighbouring
 * columns four rows apart. The lip of each course is a dark line with a bright row under it, so from above the roof is
 * a warm orange field with a fine rib that never repeats exactly: every tile has its own tone.
 */
const terracotta = new DrawnTile('terracotta_roof', (c, rng) => {
  const tone = Array.from({ length: 8 }, () => rng.next());
  const profile = [0.06, 0.62, 0.86, 0.42];
  for (let x = 0; x < N; x++) {
    const col = x >> 2;
    const phase = (col & 1) * 4;
    for (let y = 0; y < N; y++) {
      const r = (y + phase) & 7;
      const course = (y + phase) >> 3;
      const t = tone[col * 2 + (course & 1)];
      let v = profile[x & 3] * 0.7 + t * 0.34 - 0.05;
      if (r === 0) v = 0.03;
      else if (r === 1) v += 0.2;
      else if (r === 7) v -= 0.1;
      c.set(x, y, ramp(TERRACOTTA, clampTone(v)));
    }
  }
  // A glint on the crown of a few tiles, never along the whole run.
  for (let col = 0; col < 4; col++) {
    const y = (col * 5 + rng.int(4)) % N;
    c.set(col * 4 + 2, y, TERRACOTTA_HIGH);
  }
});

interface Ridged {
  shades: readonly RGB[];
  /** The bright pixel on a lit ridge. */
  high: RGB;
}

/**
 * Japanese kawara, heavy and ridged: eight pixels hold one bold rounded ridge (a seam, a lit shoulder, the crown, the
 * shadow it throws) and a flat tile beside it, and each course of four rows lips over the next with a dark line. Light is
 * from the upper left, so the crown is bright and the shadow lands on the right.
 */
const kawara = (id: string, p: Ridged): DrawnTile =>
  new DrawnTile(id, (c, rng) => {
    const tone = Array.from({ length: 8 }, () => rng.next());
    const grain = ranks(layers(rng, [[8, 8, 1], [16, 16, 0.5]]));
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const course = y >> 2;
        const r = y & 3;
        const u = x & 7;
        const t = tone[course * 2 + (x >> 3)];
        const g = (grain[at(x, y)] - 0.5) * 0.16;
        let v: number;
        if (u === 0) v = 0.02;
        else if (u === 1) v = 0.6 + t * 0.12;
        else if (u === 2) v = 0.84 + t * 0.1;
        else if (u === 3) v = 0.08;
        else {
          v = 0.3 + t * 0.3 + (u >= 6 ? 0.08 : 0);
          if (r === 0) v = 0.04;
          else if (r === 1) v += 0.26;
        }
        if ((u === 1 || u === 2) && r === 0) v -= 0.28; // where one rounded tile ends under the next
        c.set(x, y, ramp(p.shades, clamp01(v + g)));
      }
    }
    // The crown of each ridge catches the light in short runs, never the whole way down.
    for (let course = 0; course < 4; course++) {
      for (const half of [0, 8]) {
        const run = 1 + rng.int(2);
        c.set(half + 2, course * 4 + run, p.high);
        if (course % 2 === 0) c.set(half + 1, course * 4 + run + 1, p.high);
      }
    }
  });

const darkTile = kawara('dark_tile_roof', {
  shades: palette('#181c25', '#262c38', '#363f50', '#4d586c'),
  high: hex('#8a97ad'),
});

/**
 * Green glazed tile: flat rectangular tiles eight pixels wide and four tall, laid in courses with the joints half a tile
 * apart. Every tile is glazed, so it has a bright lip on top and a dark joint below and to the right.
 */
const greenGlaze = new DrawnTile('green_tile_roof', (c, rng) => {
  const glaze = palette('#143b29', '#1f5a3b', '#2f7f50', '#4aa56a');
  const tone = Array.from({ length: 8 }, () => rng.next());
  for (let y = 0; y < N; y++) {
    const course = y >> 2;
    const r = y & 3;
    const shift = (course & 1) * 4;
    for (let x = 0; x < N; x++) {
      const u = (x + shift) & 7;
      const t = tone[course * 2 + (((x + shift) & 15) >> 3)];
      let v = 0.34 + t * 0.36;
      if (r === 0) v = 0.78 + t * 0.2;
      else if (r === 3) v = 0.04;
      if (u === 7) v = 0.05;
      else if (u === 0 && r !== 3) v += 0.12;
      c.set(x, y, ramp(glaze, clamp01(v)));
    }
  }
  // A white-green sheen on the lip of some tiles.
  for (let k = 0; k < 6; k++) {
    const course = rng.int(4);
    c.set(rng.int(N), course * 4, hex('#bfeccd'));
  }
});

/**
 * The teal hip roof of the civic hall: standing-seam sheets, a raised seam every eight pixels with a bright side, and
 * long soft streaks of weathering down each sheet. It has none of the ribbing of the tile roofs, which is what sets the
 * hall apart from the houses around it.
 */
const tealRoof = new DrawnTile('teal_roof', (c, rng) => {
  const sheet = palette('#32707a', '#448790', '#5d9fa5', '#83bfc1');
  const streak = ranks(layers(rng, [[8, 2, 1], [16, 4, 0.4]]));
  c.paint((x, y) => {
    const u = x & 7;
    if (u === 0) return hex('#1e4b55');
    if (u === 1) return hex('#9fd6d2');
    const lean = u < 4 ? 0.08 : u > 5 ? -0.1 : 0;
    return ramp(sheet, clamp01(streak[at(x, y)] * 0.78 + 0.08 + lean));
  });
  // A fixing line across every sheet, half way down.
  for (let x = 0; x < N; x++) if ((x & 7) > 1) c.set(x, 8, hex('#256069'));
});

/** Thatch: straw laid down the slope in long strands, tied in two courses. */
const thatch = new DrawnTile('thatch_roof', (c, rng) => {
  const straw = palette('#6f5428', '#8c6c34', '#a98848', '#c7a763');
  const strands = ranks(layers(rng, [[12, 2, 1], [16, 4, 0.5]]));
  c.paint((x, y) => ramp(straw, clamp01(strands[at(x, y)])));
  for (const y of [6, 14]) {
    for (let x = 0; x < N; x++) {
      c.set(x, y, hex('#4a381a'));
      c.set(x, y + 1, straw[0]);
    }
  }
  glints(c, rng, hex('#e6cf8e'), 9, (_, y) => y !== 6 && y !== 7 && y !== 14 && y !== 15);
});

// --- Ridge caps ----------------------------------------------------------------------------------------------

/**
 * The cap tile of a ridge, laid over the whole cell and cut by the model: its top face shows rows 5 to 10 (the crest
 * runs across the middle of the cell) and its walls show the rows at their own height, so the picture is the profile of a
 * rolled cap: a bright crown, a middling flank and a dark foot, in half-round pieces four pixels long.
 */
const ridgeCap = (id: string, shades: readonly RGB[], high: RGB): DrawnTile =>
  new DrawnTile(id, (c, rng) => {
    const profile = [0.5, 0.56, 0.6, 0.66, 0.74, 0.88, 0.97, 0.99, 0.95, 0.8, 0.64, 0.52, 0.4, 0.2, 0.1, 0.05];
    const tone = Array.from({ length: 4 }, () => rng.next() * 0.14);
    c.paint((x, y) => {
      if ((x & 3) === 0) return shades[0];
      return ramp(shades, clamp01(profile[y] * 0.84 + tone[x >> 2] + ((x & 3) === 1 ? 0.07 : 0)));
    });
    for (let k = 0; k < 4; k++) c.set(k * 4 + 1, 6 + (k & 1), high);
  }, { tiling: 'x' });

const terracottaRidge = ridgeCap('terracotta_ridge', TERRACOTTA, TERRACOTTA_HIGH);
const darkRidge = ridgeCap('dark_ridge', palette('#181c25', '#262c38', '#363f50', '#4d586c'), hex('#8a97ad'));

export const tempestMasonryRecipes = (): TextureRecipe[] => [
  plasterWhite,
  plasterTimber,
  plasterBase,
  column,
  terracotta,
  darkTile,
  greenGlaze,
  tealRoof,
  thatch,
  terracottaRidge,
  darkRidge,
];
