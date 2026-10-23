import { hex, palette, ramp } from '../Pixels';
import { TextureRecipe } from '../TextureRecipe';
import { layers, ranks } from '../noise';
import { glints } from './masonry';
import { Plank } from './wood';
import { DrawnTile, N, at, clamp01, fillRamp } from './tempestKit';

// Tempest timber, lacquer, bamboo and floors: the warm and dark wood of the city. See docs/tempest-blocks.md.

const VERMILION = palette('#5c0f0d', '#80170f', '#a52419', '#c8382a');
const VERMILION_HIGH = hex('#e8705a');
const TIMBER = palette('#251810', '#33231a', '#432f22', '#563d2c');

/** Vermilion lacquered column: vertical grain under a rounded sheen, so a stack of logs reads as one round pillar. */
const vermilionSide: DrawnTile = new DrawnTile('vermilion_log_side', (c, rng) => {
  const field = ranks(layers(rng, [[8, 2, 1], [16, 4, 0.5]]));
  // Lit on the left, in shade on the right, whatever the grain says.
  const shade = (x: number) => (x === 3 || x === 4 ? 0.34 : x < 3 ? 0.1 : x < 9 ? 0.04 : x < 12 ? -0.08 : -0.28);
  c.paint((x, y) => ramp(VERMILION, clamp01(field[at(x, y)] * 0.55 + 0.25 + shade(x))));
  // The sheen is a broken line, as lacquer over wood never gleams evenly; two dark grooves where boards were joined.
  for (let y = 0; y < N; y++) if ((y + 3) % 7 !== 0) c.set(3, y, VERMILION_HIGH);
  for (const x of [7 + rng.int(2), 12 + rng.int(2)]) for (let y = 0; y < N; y++) if ((y * 5 + x) % 9 > 1) c.set(x, y, hex('#3d0907'));
}, { tiling: 'none' });

/** The end of a lacquered log: pale wood rings inside a rim of vermilion. */
const vermilionTop = new DrawnTile('vermilion_log_top', (c, rng) => {
  const wood = palette('#b98a5a', '#d1a574', '#e3bd8c');
  const wobble = layers(rng, [[3, 3, 1], [6, 6, 0.5]]);
  const rim = ranks(layers(rng, [[8, 8, 1]]));
  const centre = (N - 1) / 2;
  c.paint((x, y) => {
    const dx = x - centre;
    const dy = y - centre;
    const edge = Math.max(Math.abs(dx), Math.abs(dy));
    if (edge > 5.9) return ramp(VERMILION, clamp01(rim[at(x, y)] * 0.8 + (edge > 7.4 ? -0.2 : 0.1)));
    const d = Math.hypot(dx, dy) + (wobble[at(x, y)] - 0.5) * 1.6;
    if (d < 1.1) return hex('#8a5a34');
    return wood[Math.floor(d / 1.3) % 2 ? 1 : Math.floor(d / 1.3) % 4 === 0 ? 2 : 0];
  });
}, { tiling: 'none' });

/**
 * A dark timber post, planed: long straight grain lines down a smooth dark face, a pale flat edge on the lit side and a
 * deep shade on the other, and only two pale flecks of knot. Two shades dominate, so a stack of posts reads as one
 * clean timber and not as bark.
 */
const POST = palette('#2c1d14', '#432f20', '#5b4231', '#765842');
const timberPost = new DrawnTile('timber_post_side', (c, rng) => {
  const field = ranks(layers(rng, [[10, 2, 1], [16, 3, 0.5]]));
  c.paint((x, y) => {
    const edge = x <= 1 ? 0.24 - x * 0.12 : x >= N - 2 ? -0.22 : 0;
    return ramp(POST, clamp01(field[at(x, y)] * 0.6 + 0.22 + edge));
  });
  for (let k = 0; k < 4; k++) {
    const x = 2 + rng.int(N - 4);
    const phase = rng.range(0, 6);
    for (let y = 0; y < N; y++) c.set(x + Math.round(Math.sin((y + phase) * 0.4) * 0.6), y, POST[0]);
  }
  glints(c, rng, hex('#8d6a4c'), 3);
});

/** The end grain of a post or beam: square rings, the way a squared timber is cut. */
const timberEnd = new DrawnTile('timber_end', (c, rng) => {
  const shades = palette('#3b281b', '#523829', '#69493a', '#7e5c46');
  const wobble = layers(rng, [[3, 3, 1], [6, 6, 0.5]]);
  const centre = (N - 1) / 2;
  c.paint((x, y) => {
    const d = Math.max(Math.abs(x - centre), Math.abs(y - centre)) + (wobble[at(x, y)] - 0.5) * 1.4;
    if (d > 7.2) return hex('#241810');
    if (d < 1) return hex('#2c1c13');
    return shades[Math.floor(d / 1.5) % 2 ? 1 : Math.floor(d / 1.5) % 4 === 0 ? 3 : 2];
  });
}, { tiling: 'none' });

/**
 * A horizontal beam: grain runs along it, in a warmer and lighter wood than the posts so a frame reads as post and beam;
 * the top edge catches light, the underside is in shade, and two dowel heads sit in the face.
 */
const BEAM = palette('#3b281b', '#523827', '#6c4d37', '#8a6648');
const timberBeam = new DrawnTile('timber_beam', (c, rng) => {
  const field = ranks(layers(rng, [[2, 10, 1], [3, 16, 0.5]]));
  c.paint((x, y) => {
    const edge = y < 2 ? 0.3 - y * 0.08 : y >= N - 2 ? -0.3 : 0;
    return ramp(BEAM, clamp01(field[at(x, y)] * 0.7 + 0.2 + edge));
  });
  for (const x of [3, 11]) {
    c.set(x, 8, hex('#9a7552'));
    c.set(x + 1, 8, BEAM[0]);
    c.set(x, 9, BEAM[0]);
  }
  glints(c, rng, hex('#a58260'), 6, (_, y) => y > 1 && y < N - 2);
}, { tiling: 'x' });

// --- Bamboo --------------------------------------------------------------------------------------------------

const BAMBOO = palette('#436428', '#5f8a2d', '#82ad3a', '#a9cf55');
const BAMBOO_NODE = hex('#2b4318');
const LASHING = hex('#8c6a3a');

/**
 * The tile a bamboo fence is cut from. A fence shows the tile by position, so the post is the middle columns and the
 * rails are the bands at rows 1 to 3 and 7 to 9: vertical canes everywhere, horizontal canes in the two bands, and
 * lashing where a rail meets the post.
 */
const bambooFence = new DrawnTile('bamboo_fence', (c, rng) => {
  const tone = Array.from({ length: 4 }, () => rng.next() * 0.25);
  const nodeRow = Array.from({ length: 4 }, () => rng.int(N));
  c.paint((x, y) => {
    const cane = x >> 2;
    const across = [1, 3, 2, 1][x & 3];
    return BAMBOO[Math.min(3, Math.max(0, Math.round(across - 0.6 + tone[cane] * 2)))];
  });
  for (let cane = 0; cane < 4; cane++) {
    for (const row of [nodeRow[cane], (nodeRow[cane] + 8) % N]) {
      for (let x = cane * 4; x < cane * 4 + 4; x++) {
        c.set(x, row, BAMBOO_NODE);
        c.set(x, row + 1, BAMBOO[3]);
      }
    }
  }
  for (const band of [1, 7]) {
    for (let r = 0; r < 3; r++) {
      for (let x = 0; x < N; x++) c.set(x, band + r, BAMBOO[[3, 2, 0][r]]);
    }
    for (const x of [3, 12]) for (let r = 0; r < 3; r++) c.set(x, band + r, BAMBOO_NODE);
    for (let x = 5; x < 11; x++) if (x === 5 || x === 10 || x === 7) for (let r = 0; r < 3; r++) c.set(x, band + r, LASHING);
  }
}, { tiling: 'none' });

/** A single cane, four pixels wide in the middle of the tile with a node every eight rows, so poles stack into one. */
const bambooPole = new DrawnTile('bamboo_pole', (c) => {
  const cols = [BAMBOO[3], BAMBOO[2], BAMBOO[1], BAMBOO[0]];
  for (let y = 0; y < N; y++) {
    for (let x = 6; x < 10; x++) c.set(x, y, cols[x - 6]);
  }
  for (const row of [2, 10]) {
    for (let x = 6; x < 10; x++) {
      c.set(x, row, BAMBOO_NODE);
      c.set(x, row + 1, BAMBOO[1]);
    }
    c.set(5, row, BAMBOO[0]);
    c.set(10, row, BAMBOO[0]);
  }
}, { opaque: false, tiling: 'none' });

/** A roll-up blind: slats with a gap of nothing between them, hung from two cords. */
const bambooBlind = new DrawnTile('bamboo_blind', (c, rng) => {
  const slat = palette('#7a6a2f', '#98893f', '#b4a553', '#cfc070');
  const cord = hex('#4a3a22');
  const tone = Array.from({ length: 4 }, () => rng.next());
  const fibre = ranks(layers(rng, [[8, 1, 1], [16, 1, 0.5]]));
  for (let y = 0; y < N; y++) {
    const s = y >> 2;
    const r = y & 3;
    for (let x = 0; x < N; x++) {
      if (r === 3) {
        if (x === 3 || x === 12) c.set(x, y, cord);
        continue;
      }
      const v = tone[s] * 0.4 + fibre[at(x, 0)] * 0.3 + (r === 0 ? 0.3 : r === 2 ? -0.1 : 0.1);
      c.set(x, y, ramp(slat, clamp01(v)));
    }
  }
  for (const x of [3, 12]) for (let y = 0; y < N; y++) if ((y & 3) !== 3) c.set(x, y, cord);
}, { opaque: false });

// --- Floors --------------------------------------------------------------------------------------------------

/** The top of a tatami mat: pale straw woven in fine rows, a dark cloth border down both long edges. */
const tatamiTop = new DrawnTile('tatami_top', (c, rng) => {
  const straw = palette('#9aa25c', '#adb571', '#c1c887', '#d8dda4');
  const field = ranks(layers(rng, [[2, 16, 1], [4, 16, 0.6]]));
  c.paint((x, y) => {
    // Each row of straw is slightly offset from its neighbour, and a fine weave shows every fourth stalk.
    const weave = ((x + (y >> 1) * 3) & 3) === 0 ? 0.2 : 0;
    const row = y & 1 ? -0.14 : 0.1;
    return ramp(straw, clamp01(field[at(x, y)] * 0.62 + 0.16 + weave + row));
  });
  for (let y = 0; y < N; y++) {
    c.set(0, y, hex('#232d1d'));
    c.set(N - 1, y, hex('#232d1d'));
    c.set(1, y, hex('#44533a'));
    c.set(N - 2, y, hex('#44533a'));
  }
}, { tiling: 'both' });

/**
 * The edge of a mat. The mat is four sixteenths thick and wears this tile over the whole cell, so only the bottom four
 * rows show: a line of straw, two rows of dark green binding (with a stitch) and the board underneath. The rows above
 * are binding too, so the tile reads as cloth if it is ever seen whole.
 */
const tatamiSide = new DrawnTile('tatami_side', (c, rng) => {
  const straw = palette('#a6ae66', '#c9cf90');
  const cloth = palette('#26402d', '#30503a');
  const board = palette('#4a3626', '#5c432f');
  c.paint((x, y) => {
    if (y < 12) return cloth[(x + y) & 1];
    if (y === 12) return straw[x % 5 === 0 ? 0 : 1];
    if (y === 13) return x % 3 === 0 ? hex('#58845f') : cloth[1];
    if (y === 14) return cloth[0];
    return board[(x * 3 + rng.int(2)) % 7 === 0 ? 0 : 1];
  });
}, { tiling: 'x' });

/** Polished cypress boards, long and narrow, with the odd peg. */
const engawa = new DrawnTile('engawa_floor', (c, rng) => {
  const wood = palette('#b4824f', '#c4935f', '#d5a46f', '#e4b782');
  const seam = hex('#7c5330');
  const grain = ranks(layers(rng, [[2, 16, 1], [4, 16, 0.6]]));
  const rows = [[0, 5], [5, 5], [10, 6]];
  rows.forEach(([y0, h], b) => {
    const tone = rng.next() * 0.4;
    const joint = rng.int(N);
    for (let y = y0; y < y0 + h; y++) {
      for (let x = 0; x < N; x++) {
        if (y === y0 + h - 1 || x === joint) {
          c.set(x, y, seam);
          continue;
        }
        c.set(x, y, ramp(wood, clamp01(tone + grain[at(x, y)] * 0.55 + (y === y0 ? 0.2 : 0))));
      }
    }
    c.set(joint + 2, y0 + 1, wood[0]);
    c.set(joint + N - 2, y0 + 1, wood[0]);
    // A peg now and then.
    if (b !== 1) c.set((joint + 8) % N, y0 + 2, seam);
  });
}, { tiling: 'both' });

export const tempestWoodRecipes = (): TextureRecipe[] => [
  vermilionSide,
  vermilionTop,
  new Plank('vermilion_planks', palette('#6e1510', '#8f1f16', '#b02c1e', '#cc3f2c'), hex('#3d0a08'), true, 0, 'both', hex('#e46a50')),
  timberPost,
  timberEnd,
  timberBeam,
  bambooFence,
  bambooPole,
  bambooBlind,
  tatamiTop,
  tatamiSide,
  engawa,
];
