import { Canvas, RGB, hex, palette, ramp } from '../Pixels';
import { SeededRng } from '../Rng';
import { TextureRecipe } from '../TextureRecipe';
import { layers, ranks, voronoi } from '../noise';
import { DrawnTile, N, at, clamp01 } from './tempestKit';

// Tempest stone: pavements, curbs, garden stones, the warm ashlar of footings and canal walls, moss, and the koi on
// a pond. See docs/tempest-blocks.md.

interface Course {
  /** Rows the course takes. */
  h: number;
  /** Where its first stone starts. */
  offset: number;
  /** Stone widths, summing to 16 so the course wraps. */
  widths: readonly number[];
}

/**
 * Courses of stones with a joint on the right and under each, lit on the top row and left column. The tile repeats:
 * the heights and the widths of every course add up to 16.
 */
const pave = (c: Canvas, rng: SeededRng, courses: readonly Course[], shades: readonly RGB[], joint: RGB, spread = 0.7): void => {
  let y0 = 0;
  for (const course of courses) {
    let x = course.offset;
    for (const w of course.widths) {
      const tone = rng.next();
      for (let dy = 0; dy < course.h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          if (dx === w - 1 || dy === course.h - 1) c.set(x + dx, y0 + dy, joint);
          else c.set(x + dx, y0 + dy, ramp(shades, clamp01(tone * spread + 0.12 + (dy === 0 ? 0.28 : 0) + (dx === 0 ? 0.12 : 0))));
        }
      }
      x += w;
    }
    y0 += course.h;
  }
};

/** Street paving: warm stone slabs in staggered courses, as on the main road. */
const stonePaving = new DrawnTile('stone_paving', (c, rng) => {
  pave(c, rng, [
    { h: 5, offset: 0, widths: [8, 8] },
    { h: 5, offset: 5, widths: [6, 5, 5] },
    { h: 6, offset: 2, widths: [7, 9] },
  ], palette('#a79f8f', '#b8b0a0', '#c8c0af', '#d6cfbe'), hex('#7d776b'));
});

/**
 * Fan paving: rows of overlapping scales, as in the cobbles of the main square. A scale is a disc eight pixels across
 * (a joint round its edge, a lit rim inside the upper arc, a stone that fades to the lower right); rows are four pixels
 * apart and every other row is shifted by half a scale, and each row is drawn over the one above, so what shows of every
 * disc is its upper arch. Discs are drawn at wrapped positions so the tile repeats.
 */
const fanPaving = new DrawnTile('fan_paving', (c, rng) => {
  const stone = palette('#b0a099', '#c6b8af', '#d9ccc2', '#ebe0d6');
  const joint = hex('#7c6e66');
  const R = 4.2;
  const disc = (cx: number, cy: number, tone: number): void => {
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
      for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d = Math.hypot(dx, dy);
        if (d > R) continue;
        if (d > R - 1.05) c.set(x, y, joint);
        else {
          const rim = dy < 0 && d > R - 2.1 ? 0.22 : 0;
          c.set(x, y, ramp(stone, clamp01(tone * 0.45 + 0.28 + rim - (dx + dy) / (R * 2) * 0.3)));
        }
      }
    }
  };
  for (let row = -1; row <= 4; row++) {
    const shift = (((row % 2) + 2) % 2) * 4;
    for (let i = -1; i < 3; i++) disc(4 + shift + i * 8, row * 4, rng.next());
  }
});

/** The top of a stone curb: smooth slabs with a joint at one end. */
const curbTop = new DrawnTile('curb_top', (c, rng) => {
  const stone = palette('#8a9096', '#9da3a8', '#b0b6ba', '#c4c9cc');
  const field = ranks(layers(rng, [[3, 3, 1], [8, 8, 0.6], [16, 16, 0.3]]));
  c.paint((x, y) => ramp(stone, clamp01(field[at(x, y)] * 0.8 + 0.1)));
  for (let y = 0; y < N; y++) {
    c.set(0, y, hex('#5c6166'));
    c.set(1, y, stone[3]);
  }
  for (let x = 0; x < N; x++) c.set(x, 0, hex('#767c82'));
});

/**
 * The face of a stone curb. A curb is a slab, which wears this tile over the whole cell and shows the lower half of it,
 * so the lit top edge is on row 8: a bright edge, a smooth body, a shaded foot, and a joint where two slabs meet.
 */
const curbSide = new DrawnTile('curb_side', (c, rng) => {
  const stone = palette('#8a9096', '#9da3a8', '#b0b6ba', '#c4c9cc');
  const field = ranks(layers(rng, [[3, 3, 1], [8, 8, 0.6]]));
  c.paint((x, y) => {
    if (x === 0) return hex('#5c6166');
    if (y === 8) return stone[3];
    if (y >= N - 2) return y === N - 1 ? hex('#5c6166') : stone[0];
    return ramp(stone, clamp01(field[at(x, y)] * 0.75 + 0.1));
  });
}, { tiling: 'x' });

/** Flat stones laid in the grass: three round ones with a moss rim, on nothing. */
const steppingStones = new DrawnTile('stepping_stones', (c, rng) => {
  const stone = palette('#8a8078', '#a29a90', '#bdb5aa');
  const outline = hex('#4a443e');
  const moss = palette('#3f6a2c', '#5c8c37');
  const spots: Array<[number, number, number]> = [
    [4.5 + rng.range(-0.5, 0.5), 4.5, 3.4],
    [11.5, 6 + rng.range(-0.5, 0.5), 3.6],
    [6.5 + rng.range(-0.5, 0.5), 11.8, 3.9],
  ];
  for (const [cx, cy, r] of spots) {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d = Math.hypot(dx, dy * 1.12);
        if (d > r) continue;
        if (d > r - 0.95) c.set(x, y, dx + dy > 1.5 ? outline : moss[(x + y) & 1]);
        else c.set(x, y, ramp(stone, clamp01(0.45 - (dx + dy) / (r * 2) * 0.9 + rng.range(-0.08, 0.08))));
      }
    }
  }
}, { opaque: false, tiling: 'none' });

/** Big irregular stones furred with moss, thickest on top of each stone. */
const mossyStone = new DrawnTile('mossy_stone', (c, rng) => {
  const stone = palette('#767b80', '#8a9095', '#9ea4a8', '#b2b8bb');
  const green = palette('#3a642b', '#4f812f', '#6c9e3a', '#8dba52');
  const seam = hex('#4a4f54');
  const cells = voronoi(rng, 3, 0.85);
  const tone = Array.from({ length: 9 }, () => rng.next());
  const growth = ranks(layers(rng, [[2, 2, 1], [4, 4, 0.8], [8, 8, 0.4]]));
  c.paint((x, y) => {
    const cell = cells[at(x, y)];
    const edge = cell.d2 - cell.d1;
    if (edge < 1.1) return growth[at(x, y)] > 0.7 ? green[0] : seam;
    const lit = edge < 2.4 ? -(cell.dx + cell.dy) / 10 : 0;
    const moss = growth[at(x, y)] * 0.8 - cell.dy / 9 * 0.35;
    if (moss > 0.62) return ramp(green, clamp01((moss - 0.62) / 0.3 + (lit > 0 ? 0.15 : 0)));
    return ramp(stone, clamp01(tone[cell.id] * 0.7 + 0.1 + lit * 0.5));
  });
});

/** Dressed stone: large blocks of warm grey in three staggered courses, for footings and canal walls. */
const ashlar = new DrawnTile('ashlar', (c, rng) => {
  pave(c, rng, [
    { h: 5, offset: 0, widths: [9, 7] },
    { h: 5, offset: 4, widths: [6, 10] },
    { h: 6, offset: 9, widths: [8, 8] },
  ], palette('#8f8a80', '#a19c91', '#b3aea2', '#c5c0b4'), hex('#66625a'), 0.55);
});

/**
 * Koi in a pond, drawn on nothing so the water shows round them: two fish, one long and one half turned, each a tail
 * fin, a body of orange and white and a dark spot. The block is a water cell with this plate lying on its surface.
 */
const koi = new DrawnTile('koi', (c, rng) => {
  const orange = palette('#d9561f', '#f0782c', '#ff9d45');
  const white = palette('#d9d2c4', '#f4efe6');
  const dark = hex('#2a2320');
  const ripple = hex('#a9dcec');
  const fish = (cx: number, cy: number, angle: number, len: number, seed: number): void => {
    const ax = Math.cos(angle);
    const ay = Math.sin(angle);
    for (let s = 0; s <= len * 2; s++) {
      const t = s / (len * 2); // 0 at the tail, 1 at the head
      const half = t < 0.22 ? 1.7 - t * 5.5 : Math.max(0.5, 1.45 * Math.sin(Math.PI * Math.min(1, (t - 0.12) / 0.95)));
      for (let u = -Math.ceil(half); u <= Math.ceil(half); u++) {
        if (Math.abs(u) > half + 0.2) continue;
        const px = cx + ax * (t - 0.5) * len - ay * u * 0.9;
        const py = cy + ay * (t - 0.5) * len + ax * u * 0.9;
        const band = Math.floor(t * 4.2 + seed) % 3;
        let col: RGB;
        if (t < 0.22) col = orange[2];
        else if (band === 0) col = orange[u < 0 ? 2 : 1];
        else if (band === 1) col = white[u < 0 ? 1 : 0];
        else col = orange[u < 0 ? 1 : 0];
        if (t > 0.9 && Math.abs(u) <= 0) col = dark;
        c.set(Math.floor(px), Math.floor(py), col);
      }
    }
    const spot = 0.55 + seed * 0.05;
    c.set(Math.floor(cx + ax * (spot - 0.5) * len), Math.floor(cy + ay * (spot - 0.5) * len), dark);
  };
  fish(5.5, 5, Math.PI * 0.12 + rng.range(-0.1, 0.1), 8, 0);
  fish(10.5, 11.5, Math.PI * 0.82 + rng.range(-0.1, 0.1), 7, 1);
  // A ring of ripple behind one of them.
  for (const [x, y] of [[11, 4], [12, 3], [13, 4], [12, 5], [2, 11], [3, 10], [2, 13], [3, 14]]) c.set(x, y, ripple);
}, { opaque: false, tiling: 'none' });

/**
 * The top of a stone basin, laid over the whole cell: a rim of dressed stone two pixels wide round a pool, drawn as
 * water because the model sets a plate of it below the rim. Light ripples run across it.
 */
const basinTop = new DrawnTile('basin_top', (c, rng) => {
  const stone = palette('#8f8a80', '#a8a398', '#bfbab0');
  const water = palette('#2b78a8', '#3b94c4', '#5db4dc', '#9ad8ee');
  const ripple = ranks(layers(rng, [[4, 2, 1], [8, 4, 0.5]]));
  c.paint((x, y) => {
    const edge = Math.min(x, y, N - 1 - x, N - 1 - y);
    if (edge < 2) return edge === 0 ? stone[0] : stone[(x + y) & 1 ? 2 : 1];
    const wave = Math.sin((x + y * 0.6) * 1.1 + ripple[at(x, y)] * 3) > 0.82 ? 0.3 : 0;
    return ramp(water, clamp01(ripple[at(x, y)] * 0.72 + 0.04 + wave - (edge === 2 ? 0.14 : 0)));
  });
}, { tiling: 'none' });

/**
 * A fountain jet, drawn over the whole cell for two boxes: a column four pixels wide in the middle (columns 6 to 9, the
 * whole height) and a spray ten pixels wide at the top (columns 3 to 12, rows 0 to 3), with droplets falling out of it.
 */
const waterJet = new DrawnTile('water_jet', (c, rng) => {
  const spray = palette('#7fc0e0', '#b4e0f2', '#e6f6fc', '#ffffff');
  for (let y = 0; y < N; y++) {
    for (let x = 6; x <= 9; x++) {
      const lit = x === 6 ? 2 : x === 7 ? 3 : x === 8 ? 1 : 0;
      c.set(x, y, spray[(y + x) % 5 === 0 ? Math.max(0, lit - 1) : lit]);
    }
  }
  for (let y = 0; y < 4; y++) {
    for (let x = 3; x <= 12; x++) {
      const edge = (x === 3 || x === 12) && (y === 0 || y === 3);
      if (edge) continue;
      c.set(x, y, spray[(x + y) % 3 === 0 ? 3 : (x < 7) === (y < 2) ? 2 : 1]);
    }
  }
  for (let k = 0; k < 5; k++) c.set(rng.int(2) ? 4 + rng.int(2) : 10 + rng.int(2), 4 + rng.int(8), spray[2]);
}, { opaque: false, tiling: 'none' });

export const tempestStoneRecipes = (): TextureRecipe[] => [
  stonePaving,
  fanPaving,
  curbTop,
  curbSide,
  steppingStones,
  mossyStone,
  ashlar,
  koi,
  basinTop,
  waterJet,
];
