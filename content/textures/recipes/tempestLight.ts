import { RGB, hex, palette, ramp } from '../Pixels';
import { TextureRecipe } from '../TextureRecipe';
import { layers, ranks } from '../noise';
import { glints } from './masonry';
import { DrawnTile, N, at, clamp01 } from './tempestKit';

// Tempest light and screens: shoji and lattice windows, paper and stone lanterns, the magic-ore lamps. The lanterns are
// drawn as pictures laid out by position, because the boxes that wear them show the tile where they stand in the cell
// (docs/tempest-blocks.md). The lit ones are meant to shine: the blocks that use them emit light.

// --- Windows -------------------------------------------------------------------------------------------------

const WOOD = palette('#3f2c1d', '#5b4129', '#7b5a3a');

/** A shoji screen: paper in a three by three grid of wooden bars. The paper is solid, but the block lets light through. */
const shoji = new DrawnTile('shoji', (c, rng) => {
  const paper = palette('#e2dac2', '#ece5d0', '#f6f1e2');
  const fibre = ranks(layers(rng, [[4, 4, 1], [16, 16, 0.5]]));
  c.paint((x, y) => {
    const barX = x % 5 === 0;
    const barY = y % 5 === 0;
    if (barX || barY) return x % 5 === 0 && y % 5 !== 0 ? WOOD[x === 0 ? 2 : 1] : WOOD[y === 0 ? 2 : 1];
    return ramp(paper, clamp01(fibre[at(x, y)] * 0.85 + 0.05));
  });
  for (let k = 0; k < N; k += 5) for (let j = 0; j < N; j += 5) c.set(k, j, WOOD[0]);
}, { tiling: 'none' });

/** The same screen with a lamp lit behind it: warm paper, brightest in the middle of each pane. */
const shojiLit = new DrawnTile('shoji_lit', (c) => {
  const glow = palette('#f2a548', '#fbc063', '#ffd983', '#fff0b4');
  const bar = palette('#5a3217', '#7a4a22');
  c.paint((x, y) => {
    const barX = x % 5 === 0;
    const barY = y % 5 === 0;
    if (barX || barY) return bar[(x + y) % 3 === 0 ? 1 : 0];
    const dx = (x % 5) - 2.5;
    const dy = (y % 5) - 2.5;
    return ramp(glow, clamp01(0.95 - Math.hypot(dx, dy) * 0.28));
  });
}, { tiling: 'none' });

/** A lattice screen for a casement: a diamond mesh of thin bars in a heavy frame, the holes open. */
const latticeWindow = new DrawnTile('lattice_window', (c) => {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const edge = Math.min(x, y, N - 1 - x, N - 1 - y);
      if (edge < 2) {
        c.set(x, y, edge === 0 ? WOOD[0] : x === edge || y === edge ? WOOD[2] : WOOD[1]);
        continue;
      }
      if ((x + y) % 8 === 0) c.set(x, y, WOOD[2]);
      else if ((x - y + 16) % 8 === 0) c.set(x, y, WOOD[1]);
    }
  }
}, { opaque: false, tiling: 'none' });

// --- Lanterns ------------------------------------------------------------------------------------------------

/** Dark lacquer for the caps of lanterns, the tops of low tables and the edge of a sign: near black with a diagonal sheen. */
const blackLacquer = new DrawnTile('black_lacquer', (c, rng) => {
  const lacquer = palette('#1b1311', '#2a1d19', '#3b2a24', '#52392f');
  const field = ranks(layers(rng, [[3, 3, 1], [8, 8, 0.5]]));
  c.paint((x, y) => {
    const sheen = Math.max(0, 1 - Math.abs(((x + y) % 16) - 5) / 3);
    return ramp(lacquer, clamp01(field[at(x, y)] * 0.5 + sheen * 0.6));
  });
  glints(c, rng, hex('#9a7458'), 6);
});

/**
 * A hanging paper lantern, drawn as the front of the box that wears it: a cord at the top, a lacquered cap, a ribbed
 * body of glowing paper and a cap underneath. Columns 5 to 10 are the body, rows 2 to 13 the lantern, rows 0 and 1 the
 * cord (which the model draws as a thin post of its own). `stripes` repaint every second column of the body.
 */
const paperLantern = (id: string, paper: readonly RGB[], rib: RGB, stripes?: readonly RGB[]): DrawnTile =>
  new DrawnTile(id, (c) => {
    const cap = hex('#2a1f17');
    const capLit = hex('#5a4430');
    const cord = hex('#1d1612');
    for (const y of [0, 1]) for (const x of [7, 8]) c.set(x, y, cord);
    for (let x = 5; x <= 10; x++) {
      c.set(x, 2, x < 8 ? capLit : cap);
      c.set(x, 13, x < 8 ? capLit : cap);
    }
    // The body: lit on the left, shaded on the right, brightest a little left of the middle, and curving in at the ends.
    const across = [2, 3, 4, 3, 2, 1];
    for (let y = 3; y <= 12; y++) {
      for (let x = 5; x <= 10; x++) {
        const round = y === 3 || y === 12 ? 1 : 0;
        const lit = Math.max(0, Math.min(paper.length - 1, across[x - 5] - round));
        if (stripes && (x - 5) % 2 === 1) c.set(x, y, stripes[Math.min(stripes.length - 1, lit >> 1)]);
        else c.set(x, y, paper[lit]);
      }
    }
    // Ribs of bamboo under the paper.
    if (!stripes) for (const y of [5, 8, 11]) for (let x = 5; x <= 10; x++) c.set(x, y, rib);
  }, { opaque: false, tiling: 'none' });

const STONE = palette('#50555a', '#6f757b', '#8f959a', '#b2b7ba');
const MOSS = palette('#3f6a2c', '#5c8c37');

/**
 * Plain garden stone for every part of a stone lantern except its lit windows: grey noise with a few pale chips, and moss
 * creeping up from the foot of the tile.
 */
const lanternStone = new DrawnTile('lantern_stone', (c, rng) => {
  const field = ranks(layers(rng, [[3, 3, 1], [8, 8, 0.7], [16, 16, 0.3]]));
  c.paint((x, y) => ramp(STONE, clamp01(field[at(x, y)] * 0.85 + 0.08)));
  glints(c, rng, hex('#d4d8da'), 5);
  const growth = ranks(layers(rng, [[4, 2, 1], [8, 4, 0.6]]));
  for (let y = 12; y < N; y++) for (let x = 0; x < N; x++) if (growth[at(x, y)] > 0.55 + (15 - y) * 0.12) c.set(x, y, MOSS[(x + y) & 1]);
});

/**
 * The firebox of a stone lantern, laid over the whole cell: the chamber walls are columns 4 to 11 and rows 4 to 13, with
 * a square opening cut in each face and filled with firelight, and plain stone round it for the plates above and below.
 */
const stoneLanternLight = new DrawnTile('stone_lantern_light', (c, rng) => {
  const field = ranks(layers(rng, [[3, 3, 1], [8, 8, 0.7]]));
  c.paint((x, y) => ramp(STONE, clamp01(field[at(x, y)] * 0.8 + 0.1)));
  const fire = [hex('#d9741c'), hex('#ff9f33'), hex('#ffc65a'), hex('#ffe8a0')];
  for (let y = 6; y <= 11; y++) {
    for (let x = 5; x <= 10; x++) {
      const d = Math.hypot(x - 7.5, y - 8.8);
      c.set(x, y, fire[Math.max(0, Math.min(3, 3 - Math.floor(d * 1.05)))]);
    }
  }
  // A mullion down the middle of the opening and a dark inner edge on the lit side.
  for (let y = 6; y <= 11; y++) c.set(8, y, fire[0]);
  for (let x = 5; x <= 10; x++) c.set(x, 5, STONE[0]);
  for (let y = 5; y <= 12; y++) c.set(4, y, STONE[3]);
  glints(c, rng, hex('#d4d8da'), 3, (x, y) => (x < 4 || x > 11 || y < 4 || y > 13));
});

// --- Magic-ore lamps -----------------------------------------------------------------------------------------

/**
 * A lump of dark rock cracked open on a cluster of glowing crystal: a few shards leaning out of the middle, bright on the
 * lit side, with the rock round them tinted by the glow. The block that wears it emits light.
 */
const oreLamp = (id: string, rock: readonly RGB[], crystal: readonly RGB[], core: RGB): DrawnTile =>
  new DrawnTile(id, (c, rng) => {
    const field = ranks(layers(rng, [[3, 3, 1], [8, 8, 0.6]]));
    const rubble = ranks(layers(rng, [[4, 4, 1], [16, 16, 0.4]]));
    c.paint((x, y) => ramp(rock, clamp01(field[at(x, y)] * 0.9)));
    // Dark pits and a bright chip of rock here and there, so the rock reads as broken stone.
    for (let k = 0; k < 6; k++) {
      const x = rng.int(N);
      const y = rng.int(N);
      c.set(x, y, rock[0]);
      if (rubble[at(x, y)] > 0.5) c.set(x + 1, y, rock[0]);
    }
    const shards = 5;
    const lit = new Set<number>();
    for (let s = 0; s < shards; s++) {
      const cx = 8 + rng.range(-2.6, 2.6);
      const cy = 9 + rng.range(-2.4, 2.4);
      const angle = -Math.PI / 2 + rng.range(-0.75, 0.75);
      const a = 2.8 + rng.range(0, 2.2);
      const b = 1.2 + rng.range(0, 0.7);
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const dx = x + 0.5 - cx;
          const dy = y + 0.5 - cy;
          const u = dx * ca + dy * sa; // along the shard
          const v = -dx * sa + dy * ca; // across it
          const d = Math.abs(u) / a + Math.abs(v) / b;
          if (d > 1) continue;
          let col = v < -0.2 ? crystal[2] : crystal[1];
          if (d < 0.35) col = crystal[3];
          if (d > 0.82) col = crystal[0];
          c.set(x, y, col);
          lit.add(at(((x % N) + N) % N, ((y % N) + N) % N));
        }
      }
    }
    // The glow stains the rock beside the shards, and a few motes of light float off them.
    c.paint((x, y) => {
      if (lit.has(at(x, y))) return null;
      let near = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (lit.has(at((x + dx + N) % N, (y + dy + N) % N))) near++;
      return near ? crystal[0] : null;
    });
    for (let k = 0; k < 3; k++) c.set(rng.int(N), rng.int(N), core);
  }, { tiling: 'none' });

const blueOreLamp = oreLamp(
  'blue_ore_lamp', palette('#161d2b', '#222c40', '#2f3b55'), palette('#1b6fb8', '#2f9be0', '#6fcaff', '#c9f1ff'), hex('#ffffff'),
);
const greenOreLamp = oreLamp(
  'green_ore_lamp', palette('#14221b', '#1f3328', '#2c4637'), palette('#1f8a47', '#38c06a', '#7be89a', '#d2ffd9'), hex('#ffffff'),
);

export const tempestLightRecipes = (): TextureRecipe[] => [
  shoji,
  shojiLit,
  latticeWindow,
  blackLacquer,
  paperLantern('paper_lantern_red', palette('#6e1410', '#a3241b', '#d03a2a', '#ee6a4a', '#ff9468'), hex('#7a1710')),
  paperLantern('paper_lantern_striped', palette('#6e1410', '#a3241b', '#d03a2a', '#ee6a4a', '#ff9468'), hex('#4a0d0a'), palette('#d8cfb8', '#f2ead8')),
  stoneLanternLight,
  lanternStone,
  blueOreLamp,
  greenOreLamp,
];
