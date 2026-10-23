import { Canvas, RGB, hex, mix, palette, ramp } from '../Pixels';
import { SeededRng } from '../Rng';
import { TILE_SIZE, TextureRecipe, Tiling } from '../TextureRecipe';
import { layers, ranks, voronoi, waveVeins } from '../noise';

const N = TILE_SIZE;
const at = (x: number, y: number) => y * N + x;

/** One-pixel bevel: lit top and left, shaded bottom and right. */
const bevel = (c: Canvas, light: RGB, dark: RGB): void => {
  for (let i = 0; i < N; i++) {
    c.set(i, 0, light);
    c.set(0, i, light);
  }
  for (let i = 0; i < N; i++) {
    c.set(i, N - 1, dark);
    c.set(N - 1, i, dark);
  }
  c.set(N - 1, 0, mix(light, dark, 0.5));
  c.set(0, N - 1, mix(light, dark, 0.5));
};

export class Gold extends TextureRecipe {
  readonly id = 'gold';
  readonly tiling: Tiling = 'none';
  private static readonly SHADES = palette('#b57a0d', '#d99f14', '#f2c32b', '#ffdf5e');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const v = ranks(layers(rng, [[3, 3, 1], [8, 8, 0.5]]));
    // A diagonal sweep from lit upper left to shaded lower right, broken up by noise.
    c.paint((x, y) => ramp(Gold.SHADES, Math.min(0.99, Math.max(0, (1 - (x + y) / 30) * 0.7 + v[at(x, y)] * 0.35))));
    bevel(c, hex('#fff6b0'), hex('#8a5808'));
    // Glints across the face.
    for (const d of [8, 9, 18]) {
      for (let x = 2; x < 14; x++) {
        const y = d - x;
        if (y >= 2 && y < 14 && (x + d) % 3 !== 0) c.set(x, y, hex('#fff2a0'));
      }
    }
    return c.data;
  }
}

export class Iron extends TextureRecipe {
  readonly id = 'iron';
  readonly tiling: Tiling = 'none';
  private static readonly SHADES = palette('#98a3aa', '#aeb9bf', '#c4ced3', '#d9e1e5');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    // Brushed streaks along x.
    const v = ranks(layers(rng, [[2, 16, 1], [4, 16, 0.5]]));
    c.paint((x, y) => ramp(Iron.SHADES, v[at(x, y)]));
    bevel(c, hex('#f1f5f7'), hex('#707c84'));
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) {
      c.set(x, y, hex('#69747b'));
      c.set(x - 1, y - 1, hex('#eef3f5'));
    }
    return c.data;
  }
}

export class Obsidian extends TextureRecipe {
  readonly id = 'obsidian';
  private static readonly SHADES = palette('#0c0912', '#140e1f', '#1e1530', '#2b2045', '#46327a');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    // Mostly near-black with violet glassy flows; the exponent keeps the bright shades rare.
    const v = ranks(layers(rng, [[3, 3, 1], [6, 6, 0.7]]));
    c.paint((x, y) => ramp(Obsidian.SHADES, Math.pow(v[at(x, y)], 1.7)));
    // Conchoidal glints: short diagonal streaks.
    for (let i = 0; i < 5; i++) {
      const x = rng.int(N);
      const y = rng.int(N);
      for (let k = 0; k < 3; k++) c.set(x + k, y + k, Obsidian.SHADES[k === 1 ? 4 : 3]);
    }
    return c.data;
  }
}

/** A clear pane: opaque frame, transparent middle, a couple of glints. */
export class Glass extends TextureRecipe {
  readonly id = 'glass';
  readonly opaque = false;
  readonly tiling: Tiling = 'none';

  generate(): Uint8Array {
    const c = new Canvas();
    const lit = hex('#d6eff9');
    const shade = hex('#8fc6de');
    for (let i = 0; i < N; i++) {
      c.set(i, 0, lit);
      c.set(0, i, lit);
      c.set(i, N - 1, shade);
      c.set(N - 1, i, shade);
    }
    // The pane has a second, fainter inner ring so it reads as thick glass.
    for (let i = 1; i < N - 1; i++) {
      c.set(i, 1, hex('#b4dcec'));
      c.set(1, i, hex('#b4dcec'));
    }
    const glint = hex('#ffffff');
    for (let k = 0; k < 5; k++) {
      c.set(3 + k, 8 - k, glint);
      if (k % 2 === 0) c.set(4 + k, 8 - k, glint);
    }
    c.set(11, 12, glint);
    c.set(12, 11, glint);
    return c.data;
  }
}

export class Steel extends TextureRecipe {
  readonly id = 'steel';
  readonly tiling: Tiling = 'none';
  private static readonly SHADES = palette('#222d33', '#2c3a42', '#37474f', '#46595f', '#587078');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    // Brushed along y, like a rolled beam.
    const v = ranks(layers(rng, [[16, 2, 1], [16, 4, 0.5]]));
    c.paint((x, y) => ramp(Steel.SHADES, Math.min(0.99, v[at(x, y)] * 0.8 + 0.05)));
    // Flanges top and bottom, a recessed web down the middle.
    for (let x = 0; x < N; x++) {
      c.set(x, 0, Steel.SHADES[4]);
      c.set(x, 1, Steel.SHADES[3]);
      c.set(x, N - 2, Steel.SHADES[0]);
      c.set(x, N - 1, hex('#161e22'));
    }
    for (let y = 2; y < N - 2; y++) {
      c.set(7, y, Steel.SHADES[0]);
      c.set(8, y, Steel.SHADES[1]);
    }
    for (const [x, y] of [[3, 4], [12, 4], [3, 11], [12, 11]]) {
      c.set(x, y, hex('#8da3ad'));
      c.set(x + 1, y + 1, hex('#141b1f'));
    }
    return c.data;
  }
}

export class Lantern extends TextureRecipe {
  readonly id = 'lantern';
  readonly opaque = false;
  readonly tiling: Tiling = 'none';

  generate(): Uint8Array {
    const c = new Canvas();
    const iron = palette('#1d1d24', '#2c2c36', '#44444f');
    const glow = palette('#ff9a1c', '#ffbf2e', '#ffe05a', '#fff6bd');
    // Hanging ring.
    for (const [x, y] of [[6, 2], [7, 1], [8, 1], [9, 2]]) c.set(x, y, iron[2]);
    c.set(6, 3, iron[1]);
    c.set(9, 3, iron[1]);
    // Cap.
    for (let x = 4; x <= 11; x++) {
      c.set(x, 4, x < 8 ? iron[2] : iron[1]);
      if (x >= 3 && x <= 12) c.set(x, 4, x < 8 ? iron[2] : iron[1]);
    }
    for (let x = 5; x <= 10; x++) c.set(x, 3, iron[1]);
    // Glass body: bright core, orange toward the iron.
    for (let y = 5; y <= 11; y++) {
      for (let x = 5; x <= 10; x++) {
        const d = Math.hypot(x - 7.5, y - 8) / 3.6;
        c.set(x, y, glow[Math.min(3, Math.max(0, 3 - Math.floor(d * 3.2)))]);
      }
    }
    // Corner posts and a middle bar.
    for (let y = 5; y <= 11; y++) {
      c.set(4, y, iron[1]);
      c.set(11, y, iron[0]);
    }
    for (let x = 5; x <= 10; x++) c.set(x, 8, iron[1]);
    // Base.
    for (let x = 4; x <= 11; x++) c.set(x, 12, iron[1]);
    for (let x = 5; x <= 10; x++) c.set(x, 13, iron[0]);
    return c.data;
  }
}

/** Faceted purple gem: lit and shaded planes with bright edges. */
export class Crystal extends TextureRecipe {
  readonly id = 'crystal';
  private static readonly SHADES = palette('#53127a', '#7620a6', '#9a2ccf', '#c23cf2', '#e17cff');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const cells = voronoi(rng, 3, 1);
    const tone = Array.from({ length: 9 }, () => rng.next());
    c.paint((x, y) => {
      const cell = cells[at(x, y)];
      if (cell.d2 - cell.d1 < 0.9) return hex('#f3b8ff'); // bright facet edge
      // Each facet is a lit plane: brighter toward the upper left of its own centre.
      const v = tone[cell.id] * 0.55 + 0.2 + (-(cell.dx + cell.dy) / 10) * 0.5;
      return ramp(Crystal.SHADES, Math.min(0.99, Math.max(0, v)));
    });
    for (let i = 0; i < 4; i++) c.set(rng.int(N), rng.int(N), hex('#ffffff'));
    return c.data;
  }
}

/** A gel cube: bright shell, dark outline, deeper core with a highlight. */
export class Slime extends TextureRecipe {
  readonly id = 'slime';
  readonly tiling: Tiling = 'none';
  private static readonly SHELL = palette('#5ee890', '#79f5a5', '#9bffbf');
  private static readonly CORE = palette('#0f9f45', '#17b84f', '#27d062', '#42e47c');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const shell = ranks(layers(rng, [[4, 4, 1], [8, 8, 0.5]]));
    const core = ranks(layers(rng, [[3, 3, 1], [6, 6, 0.6]]));
    c.paint((x, y) => {
      const edge = Math.min(x, y, N - 1 - x, N - 1 - y);
      if (edge < 2) return ramp(Slime.SHELL, shell[at(x, y)]);
      if (edge === 2) return hex('#0b8038');
      return ramp(Slime.CORE, core[at(x, y)]);
    });
    for (const [x, y] of [[5, 5], [6, 5], [5, 6]]) c.set(x, y, hex('#d9ffe6'));
    for (const [x, y] of [[10, 10], [11, 11]]) c.set(x, y, hex('#0a7a33'));
    return c.data;
  }
}

/** Pink stone threaded with cyan veins and a few gold sparkles. */
export class MagicStone extends TextureRecipe {
  readonly id = 'magic_stone';
  private static readonly SHADES = palette('#d494b3', '#e3a8c4', '#efbbd2', '#f8cfe0');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const base = ranks(layers(rng, [[3, 3, 1], [6, 6, 0.7]]));
    const vein = waveVeins(rng, 2, 1, 0.9);
    c.paint((x, y) => {
      const d = vein[at(x, y)];
      if (d < 0.2) return hex('#7fe3ff');
      if (d < 0.34) return hex('#c4c6f0');
      return ramp(MagicStone.SHADES, base[at(x, y)]);
    });
    for (let i = 0; i < 3; i++) {
      const x = rng.int(N);
      const y = rng.int(N);
      const gold = hex('#fff0a6');
      c.set(x, y, gold);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.set(x + dx, y + dy, mix(gold, hex('#efbbd2'), 0.55));
    }
    return c.data;
  }
}
