import { RGB, hex, mix, palette, ramp } from '../Pixels';
import { TextureRecipe } from '../TextureRecipe';
import { layers, ranks } from '../noise';
import { glints } from './masonry';
import { DrawnTile, N, at, clamp01, inDisc } from './tempestKit';

// Tempest furniture and street props: the tiles of the small box models (a futon, a barrel, a shelf of books, a noren
// curtain). Most are laid over the whole cell and cut by the model, so each one says in its comment which rows and
// columns the boxes of its block show. See docs/tempest-blocks.md.

// --- Rooms ---------------------------------------------------------------------------------------------------

/**
 * The top of a futon, laid over the whole cell. The mattress covers all of it (cream quilting, stitched in diamonds,
 * with an indigo binding) and the pillow lies at the north end, columns 4 to 11 and rows 1 to 5, so that patch is the
 * pillow's own top.
 */
const futonTop = new DrawnTile('futon_top', (c, rng) => {
  const cream = palette('#cfc6ad', '#ddd5bd', '#ebe4cf');
  const indigo = palette('#1f2f5c', '#2c4180');
  const pillow = palette('#d7dce0', '#eef1f2');
  const tone = ranks(layers(rng, [[3, 3, 1], [8, 8, 0.4]]));
  c.paint((x, y) => {
    const edge = Math.min(x, y, N - 1 - x, N - 1 - y);
    if (edge === 0) return indigo[0];
    if (edge === 1) return indigo[1];
    const stitch = ((x + y) % 5 === 0 || (x - y + 16) % 5 === 0) && y > 6;
    return ramp(cream, clamp01(tone[at(x, y)] * 0.7 + (stitch ? -0.28 : 0.12)));
  });
  for (let y = 1; y <= 5; y++) {
    for (let x = 4; x <= 11; x++) {
      const rim = x === 4 || x === 11 || y === 5;
      c.set(x, y, rim ? pillow[0] : pillow[x < 8 ? 1 : 0]);
    }
  }
}, { tiling: 'none' });

/** The sides of a futon: the mattress shows rows 13 to 15 and the pillow rows 11 and 12, the rest is plain cloth. */
const futonSide = new DrawnTile('futon_side', (c) => {
  const cream = palette('#cfc6ad', '#ddd5bd', '#ebe4cf');
  const pillow = palette('#d7dce0', '#eef1f2');
  c.paint((x, y) => {
    if (y <= 10) return cream[1];
    if (y <= 12) return y === 11 ? pillow[1] : pillow[0];
    if (y === 13) return cream[2];
    if (y === 14) return cream[1];
    return hex('#2c4180');
  });
}, { tiling: 'x' });

/**
 * A cushion, a zabuton: indigo cloth inside a thin red piping, a button in the middle and a tassel at each corner. It is
 * stretched over the whole of the little box, so the same picture is squeezed onto the sides.
 */
const cushion = new DrawnTile('cushion', (c, rng) => {
  const cloth = palette('#1c2b57', '#27407d', '#3556a0');
  const red = palette('#7a1a14', '#c93a2c');
  const field = ranks(layers(rng, [[4, 4, 1], [8, 8, 0.4]]));
  c.paint((x, y) => {
    const edge = Math.min(x, y, N - 1 - x, N - 1 - y);
    if (edge === 0) return red[0];
    if (edge === 1) return red[1];
    return ramp(cloth, clamp01(field[at(x, y)] * 0.7 + (x + y < 14 ? 0.18 : 0)));
  });
  for (const [x, y] of [[7, 7], [8, 7], [7, 8], [8, 8]]) c.set(x, y, hex('#d9c27a'));
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) {
    c.set(x, y, red[1]);
    c.set(x + (x < 8 ? 1 : -1), y, red[0]);
  }
}, { tiling: 'none' });

/**
 * A shelf of books, on every side of the block: a dark frame, boards at rows 0, 5, 10 and 15 and books standing
 * between them in colours that repeat but never in the same order, a few leaning and one gap.
 */
const bookshelf = new DrawnTile('bookshelf', (c, rng) => {
  const wood = palette('#4a3322', '#6b4c32');
  const books = palette('#a3342b', '#2f5f8a', '#3f7a4a', '#c9a24a', '#e8e0cc', '#5a3b6a');
  const shade = hex('#241810');
  c.fill(shade);
  for (const y of [0, 5, 10, 15]) for (let x = 0; x < N; x++) c.set(x, y, wood[y === 0 || y === 10 ? 1 : 0]);
  for (const x of [0, 15]) for (let y = 0; y < N; y++) c.set(x, y, wood[0]);
  for (const top of [1, 6, 11]) {
    let x = 1;
    let last = -1;
    while (x < 15) {
      let colour = rng.int(books.length);
      if (colour === last) colour = (colour + 1) % books.length;
      last = colour;
      const w = 2 + rng.int(2);
      const h = 2 + rng.int(3);
      if (rng.next() < 0.12) {
        x += 3; // a gap in the row
        continue;
      }
      for (let dx = 0; dx < w && x + dx < 15; dx++) {
        for (let dy = 0; dy < h; dy++) c.set(x + dx, top + 4 - dy, books[colour]);
        c.set(x + dx, top + 4 - h + 1, books[4]); // the page edge at the head of the book
      }
      x += w + 1; // and a hairline of shadow before the next
    }
  }
}, { tiling: 'none' });

/**
 * The top of a sunken hearth, an irori: a frame of dark timber three pixels wide round a bed of grey ash, with embers
 * glowing in it. The block that wears it gives off light.
 */
const hearthTop = new DrawnTile('hearth_top', (c, rng) => {
  const frame = palette('#2b1d15', '#3d2b20', '#523a2b');
  const ash = palette('#6f6c68', '#8d8a85', '#a9a6a0', '#c4c1ba');
  const ember = palette('#a8360f', '#e0601c', '#ff9a2e', '#ffdc78');
  const field = ranks(layers(rng, [[3, 3, 1], [8, 8, 0.5]]));
  c.paint((x, y) => {
    const edge = Math.min(x, y, N - 1 - x, N - 1 - y);
    if (edge < 3) return frame[edge === 0 ? 0 : edge === 1 ? 2 : 1];
    return ramp(ash, clamp01(field[at(x, y)] * 0.8));
  });
  // A heap of embers a little off centre: bright in the middle, red at the edge, with black charcoal between.
  for (let y = 3; y < 13; y++) {
    for (let x = 3; x < 13; x++) {
      const d = Math.hypot(x - 7.2, y - 8.4);
      const jitter = rng.next() * 1.4;
      if (d + jitter < 2) c.set(x, y, ember[3 - Math.min(1, Math.floor(d))]);
      else if (d + jitter < 3.6) c.set(x, y, rng.next() < 0.6 ? ember[1] : ember[0]);
      else if (d + jitter < 4.4 && rng.next() < 0.5) c.set(x, y, ash[0]);
    }
  }
}, { tiling: 'none' });

/** The side of the hearth box, which shows rows 6 to 15: a timber rail on top (rows 6 to 8) and plastered clay below. */
const hearthSide = new DrawnTile('hearth_side', (c, rng) => {
  const timber = palette('#2b1d15', '#3d2b20', '#523a2b', '#6e5039');
  const clay = palette('#5d4a3e', '#7a6455', '#94806e');
  const field = ranks(layers(rng, [[8, 2, 1], [16, 3, 0.5]]));
  c.paint((x, y) => {
    if (y < 9) return ramp(timber, clamp01(field[at(x, y)] * 0.7 + (y === 6 ? 0.3 : 0)));
    if (y === 9) return timber[0];
    return ramp(clay, clamp01(field[at(x, y)] * 0.85 + (y === 10 ? 0.25 : 0) - (y > 13 ? 0.15 : 0)));
  });
  for (let k = 0; k < 4; k++) c.set(rng.int(N), 11 + rng.int(4), clay[0]);
}, { tiling: 'x' });

// --- Street and store ----------------------------------------------------------------------------------------

/**
 * Barrel staves, with a hoop of dark iron near the top and the bottom. Each stave is four pixels wide (a seam, a lit
 * edge, the face, a shaded edge) so the tile repeats sideways.
 */
const barrelSide = new DrawnTile('barrel_side', (c, rng) => {
  const wood = palette('#6b4a28', '#8a6236', '#a67a45', '#c19257');
  const iron = palette('#26262c', '#43434b', '#6a6a74');
  const tone = Array.from({ length: 4 }, () => rng.next() * 0.2);
  const profile = [0.04, 0.78, 0.58, 0.3];
  c.paint((x, y) => {
    const grain = ((y * 7 + (x >> 2) * 5) % 11 === 0) ? -0.16 : 0;
    return ramp(wood, clamp01(profile[x & 3] * 0.8 + tone[x >> 2] + grain));
  });
  for (const y of [2, 3, 11, 12]) {
    for (let x = 0; x < N; x++) c.set(x, y, y === 2 || y === 11 ? iron[2] : iron[0]);
  }
  for (const y of [3, 12]) for (let x = 2; x < N; x += 5) c.set(x, y, iron[1]);
}, { tiling: 'x' });

/** The lid of a barrel, an octagon of boards inside the hoop: boards run left to right, the iron rim is the outer ring. */
const barrelTop = new DrawnTile('barrel_top', (c, rng) => {
  const wood = palette('#7a5530', '#97703f', '#b38650');
  const iron = palette('#26262c', '#5a5a64');
  const tone = Array.from({ length: 4 }, () => rng.next());
  c.paint((x, y) => {
    const edge = Math.min(x, y, N - 1 - x, N - 1 - y);
    if (edge < 2) return edge === 0 ? iron[0] : iron[1];
    if (y % 4 === 3) return wood[0];
    return ramp(wood, clamp01(tone[y >> 2] * 0.7 + (y % 4 === 0 ? 0.25 : 0.05) + (x % 7 === 0 ? -0.1 : 0)));
  });
}, { tiling: 'none' });

/** A crate: a frame of planks round four slats, a diagonal brace across the front and a nail at every corner. */
const crate = new DrawnTile('crate', (c, rng) => {
  const wood = palette('#76552f', '#8f6b3b', '#a98146', '#c19857');
  const gap = hex('#3c2814');
  const nail = hex('#d8d2c0');
  const tone = Array.from({ length: 8 }, () => rng.next());
  c.paint((x, y) => {
    const edge = Math.min(x, y, N - 1 - x, N - 1 - y);
    if (edge < 3) {
      // The frame: planks along the edges, a dark seam between frame and slats.
      if (edge === 2) return gap;
      return ramp(wood, clamp01(0.5 + tone[(x + y) & 7] * 0.3 + (edge === 0 ? 0.15 : 0)));
    }
    if ((y - 3) % 3 === 2) return gap; // gaps between the slats
    return ramp(wood, clamp01(tone[(y >> 1) & 7] * 0.6 + 0.12 + (((y - 3) % 3) === 0 ? 0.2 : 0)));
  });
  // The brace, two pixels wide, shaded below.
  for (let k = 3; k < 13; k++) {
    c.set(k, k, wood[3]);
    c.set(k + 1, k, wood[2]);
    c.set(k, k + 1, wood[0]);
  }
  for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]]) c.set(x, y, nail);
}, { tiling: 'none' });

/** A bale of rice straw: straw laid in one direction, bound by two twisted ropes. Squeezed onto every face of the bale. */
const riceBale = new DrawnTile('rice_bale', (c, rng) => {
  const straw = palette('#8a6b30', '#a98a42', '#c7a85a', '#e0c77c');
  const rope = palette('#4a3718', '#6e5528');
  const strands = ranks(layers(rng, [[12, 2, 1], [16, 4, 0.5]]));
  c.paint((x, y) => ramp(straw, clamp01(strands[at(x, y)])));
  for (const y of [3, 11]) {
    for (let x = 0; x < N; x++) {
      c.set(x, y, rope[(x + 1) & 2 ? 1 : 0]);
      c.set(x, y + 1, rope[x & 2 ? 0 : 1]);
    }
  }
  glints(c, rng, hex('#f4e4a0'), 6, (_, y) => y !== 3 && y !== 4 && y !== 11 && y !== 12);
}, { tiling: 'none' });

/**
 * A vase in blue and white porcelain, drawn as a pattern for the boxes of its body, shoulder and neck to take their
 * share of: a rim line, a blue band of scrolls at rows 9 to 12 and a foot line, on a white glaze that is brighter on the
 * left.
 */
const vase = new DrawnTile('vase', (c) => {
  const glaze = palette('#aab6bd', '#cfd8dc', '#e8eef0');
  const blue = palette('#223f7a', '#3a63b0', '#6c93d6');
  c.paint((x, y) => glaze[x < 5 ? 2 : x < 10 ? 1 : 0]);
  for (const y of [3, 7, 14]) for (let x = 0; x < N; x++) c.set(x, y, y === 14 ? blue[0] : blue[1]);
  for (let x = 0; x < N; x++) {
    c.set(x, 9, blue[1]);
    c.set(x, 12, blue[1]);
    // A running scroll between the two lines.
    c.set(x, 10 + ((x >> 1) & 1), blue[x % 4 < 2 ? 2 : 1]);
  }
}, { tiling: 'none' });

/**
 * A hanging signboard, cut from the whole cell: two chains at columns 3 and 12 (rows 0 to 3) and a board at rows 4 to 12
 * with a dark frame, a cream panel and a bold red mark of three strokes and a ring. The mark is our own, not a letter.
 */
const signboard = new DrawnTile('signboard', (c) => {
  const frame = palette('#2b1d15', '#4a3322', '#6b4c32');
  const panel = palette('#cdbf9c', '#e0d4b4', '#efe5c8');
  const red = palette('#7a1a14', '#b3281d');
  const chain = palette('#2a2a30', '#6a6a74');
  for (const x of [3, 12]) for (let y = 0; y < 4; y++) c.set(x, y, chain[y & 1]);
  for (let y = 4; y <= 12; y++) {
    for (let x = 0; x < N; x++) {
      const edge = Math.min(x, y - 4, 15 - x, 12 - y);
      if (edge === 0) c.set(x, y, frame[x === 0 || y === 4 ? 2 : 0]);
      else if (edge === 1) c.set(x, y, frame[1]);
      else c.set(x, y, panel[x < 6 ? 2 : x > 10 ? 0 : 1]);
    }
  }
  for (let y = 6; y <= 10; y++) {
    c.set(3, y, red[0]);
    c.set(12, y, red[0]);
  }
  for (let x = 5; x <= 10; x++) c.set(x, 6, red[1]);
  for (let x = 5; x <= 10; x++) c.set(x, 10, red[1]);
  for (const [x, y] of [[7, 7], [8, 7], [6, 8], [9, 8], [7, 9], [8, 9]]) c.set(x, y, red[0]);
}, { opaque: false, tiling: 'none' });

// --- Cloth ---------------------------------------------------------------------------------------------------

/**
 * A noren, the curtain that hangs in a door: a rod across row 0, then cloth in two halves, columns 1 to 6 and 9 to 14,
 * with a slit between them from row 3 down and a ragged hem. A small mark sits on each half. The model draws rows 1 to 10
 * of it as a thin plate and the rod as a second one.
 */
const noren = (id: string, cloth: readonly RGB[], mark: RGB): DrawnTile =>
  new DrawnTile(id, (c, rng) => {
    const rod = palette('#3d2b20', '#7a5a3c');
    for (let x = 0; x < N; x++) c.set(x, 0, rod[x % 5 === 0 ? 0 : 1]);
    const hem = [10, 9, 10, 10, 9, 10, 10, 10, 10, 10, 9, 10, 10, 9, 10, 10];
    for (let x = 1; x <= 14; x++) {
      if ((x === 7 || x === 8)) continue;
      const last = hem[x] + (rng.next() < 0.2 ? 0 : 0);
      for (let y = 1; y <= last; y++) {
        const fold = (x % 4 === 1 ? 1 : 0) + (x % 4 === 3 ? -1 : 0) + (x < 7 ? 1 : 0);
        c.set(x, y, cloth[Math.max(0, Math.min(cloth.length - 1, 1 + fold))]);
      }
    }
    for (const x of [7, 8]) for (let y = 1; y <= 2; y++) c.set(x, y, cloth[1]);
    // The hem line and the mark on each half.
    for (let x = 1; x <= 14; x++) {
      if (x === 7 || x === 8) continue;
      c.set(x, hem[x], cloth[0]);
    }
    for (const cx of [3.5, 11.5]) {
      for (let y = 3; y <= 8; y++) {
        for (let x = 1; x <= 14; x++) {
          if (x === 7 || x === 8) continue;
          if (Math.abs(x + 0.5 - cx - 0.5) + Math.abs(y + 0.5 - 5.5) <= 2.1 && Math.abs(x + 0.5 - cx - 0.5) + Math.abs(y + 0.5 - 5.5) > 1.0) c.set(x, y, mark);
        }
      }
    }
  }, { opaque: false, tiling: 'none' });

/**
 * Awning cloth in stripes four pixels wide, running straight down the cell so they follow the slope of the awning
 * whichever way it faces. A soft weave shows in both colours.
 */
const awning = (id: string, cloth: readonly RGB[], white: readonly RGB[]): DrawnTile =>
  new DrawnTile(id, (c, rng) => {
    const weave = ranks(layers(rng, [[8, 8, 1], [16, 16, 0.5]]));
    c.paint((x, y) => {
      const stripe = (x >> 2) & 1;
      const shades = stripe ? white : cloth;
      const lean = (x & 3) === 0 ? 0.12 : (x & 3) === 3 ? -0.12 : 0;
      return ramp(shades, clamp01(weave[at(x, y)] * 0.55 + 0.25 + lean + ((x + y) % 4 === 0 ? 0.08 : 0)));
    });
  }, { tiling: 'both' });

/**
 * Washing on a line, cut from the whole cell: the pole across rows 1 and 2, a white sheet at columns 1 to 7, an indigo
 * towel with a pale stripe at columns 9 to 14, and a peg at each top corner.
 */
const laundry = new DrawnTile('laundry', (c) => {
  const pole = palette('#4a3322', '#8c6a46');
  const sheet = palette('#c9ced2', '#e4e8ea', '#f7f8f8');
  const towel = palette('#1f2f5c', '#2c4180', '#4a63a8');
  for (let x = 0; x < N; x++) {
    c.set(x, 1, pole[1]);
    c.set(x, 2, pole[0]);
  }
  for (let y = 3; y <= 12; y++) {
    for (let x = 1; x <= 7; x++) c.set(x, y, sheet[(x + (y >> 2)) % 3 === 0 ? 0 : x < 4 ? 2 : 1]);
  }
  for (let x = 1; x <= 7; x++) if (x % 2 === 1) c.set(x, 13, sheet[0]);
  for (let y = 3; y <= 9; y++) {
    for (let x = 9; x <= 14; x++) c.set(x, y, y === 7 || y === 8 ? sheet[2] : towel[x < 11 ? 2 : x > 12 ? 0 : 1]);
  }
  for (const x of [1, 7, 9, 14]) c.set(x, 3, pole[0]);
}, { opaque: false, tiling: 'none' });

/** The staves of a wooden pail, shown by a box seven pixels tall (rows 9 to 15): two bamboo hoops and pale cedar between. */
const bucketSide = new DrawnTile('bucket_side', (c, rng) => {
  const wood = palette('#8a6a3c', '#a68450', '#c09f66', '#d8b97e');
  const hoop = palette('#4a3d1a', '#7a6a32');
  const profile = [0.06, 0.8, 0.55, 0.3];
  const tone = Array.from({ length: 4 }, () => rng.next() * 0.2);
  c.paint((x, y) => ramp(wood, clamp01(profile[x & 3] * 0.8 + tone[x >> 2])));
  for (const y of [10, 14]) for (let x = 0; x < N; x++) c.set(x, y, hoop[(x + y) & 2 ? 1 : 0]);
}, { tiling: 'x' });

/** The top of a pail, laid over the cell: a ring of cedar columns 4 to 11 round dark water. */
const bucketTop = new DrawnTile('bucket_top', (c, rng) => {
  const wood = palette('#a68450', '#c09f66', '#d8b97e');
  const water = palette('#1d2c36', '#2d4656', '#4f7790');
  const field = ranks(layers(rng, [[4, 4, 1], [8, 8, 0.4]]));
  c.paint((x, y) => {
    const ring = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (ring > 4.2) return wood[1];
    if (ring > 3.2) return wood[(x + y) & 1 ? 2 : 0];
    return ramp(water, clamp01(field[at(x, y)] * 0.8 + (inDisc(x, y, 6.5, 6.5, 1.6) ? 0.2 : 0)));
  });
}, { tiling: 'none' });

const INDIGO = palette('#16224a', '#1f3170', '#2b4495');
const RED = palette('#6a150f', '#a3241b', '#cc3b2c');
const CREAM = palette('#c9cbc2', '#e4e6dd', '#f6f6f0');

export const tempestPropRecipes = (): TextureRecipe[] => [
  futonTop,
  futonSide,
  cushion,
  bookshelf,
  hearthTop,
  hearthSide,
  barrelSide,
  barrelTop,
  crate,
  riceBale,
  vase,
  signboard,
  noren('noren_indigo', INDIGO, hex('#e9edf2')),
  noren('noren_red', RED, hex('#f0e8d8')),
  noren('noren_white', CREAM, hex('#24386b')),
  awning('awning_red', palette('#7a1a14', '#a8281d', '#cc3b2c'), CREAM),
  awning('awning_indigo', palette('#1b2a5c', '#27407d', '#3a58a8'), CREAM),
  laundry,
  bucketSide,
  bucketTop,
];
