import { Canvas, RGB, hex, mix, palette, ramp, scale } from '../Pixels';
import { SeededRng } from '../Rng';
import { TILE_SIZE, TextureRecipe } from '../TextureRecipe';
import { layers, ranks, voronoi, waveVeins } from '../noise';

const N = TILE_SIZE;
const at = (x: number, y: number) => y * N + x;

const COBBLE = palette('#686a70', '#797b81', '#8a8c92', '#9b9da3');
const COBBLE_GAP = hex('#3b3c41');

/** Rounded stones with dark gaps, lit from the upper left. */
const cobbleCanvas = (rng: SeededRng): Canvas => {
  const c = new Canvas();
  const cells = voronoi(rng, 4, 0.95);
  const tone = Array.from({ length: 16 }, () => rng.next());
  c.paint((x, y) => {
    const cell = cells[at(x, y)];
    const edge = cell.d2 - cell.d1;
    if (edge < 1.25) return COBBLE_GAP;
    let v = tone[cell.id] * 0.8 + 0.1;
    if (edge < 2.6) v += (-(cell.dx + cell.dy) / 8) * 0.55; // rim light on the upper left, shade on the lower right
    return ramp(COBBLE, Math.min(0.99, Math.max(0, v)));
  });
  return c;
};

export class Cobble extends TextureRecipe {
  readonly id = 'cobble';
  generate(rng: SeededRng): Uint8Array {
    return cobbleCanvas(rng).data;
  }
}

export class MossyCobble extends TextureRecipe {
  readonly id = 'mossy_cobble';
  private static readonly MOSS = palette('#35602a', '#477a36', '#5b9443', '#72ad52');

  generate(rng: SeededRng): Uint8Array {
    const c = cobbleCanvas(rng);
    // Patches rather than veins: smooth noise, and moss covers stone and gaps alike above the threshold.
    const v = ranks(layers(rng, [[2, 2, 1], [4, 4, 0.8], [8, 8, 0.4]]));
    c.paint((x, y) => {
      const m = v[at(x, y)];
      if (m < 0.6) return null;
      const [r, g, b] = c.get(x, y);
      const lit = (r + g + b) / 3 > 125; // darker stone shows through as shadow in the moss
      return ramp(MossyCobble.MOSS, Math.min(0.99, (m - 0.6) / 0.4 + (lit ? 0.15 : 0)));
    });
    return c.data;
  }
}

interface BrickSpot {
  /** Pixel is part of a mortar joint. */
  mortar: boolean;
  /** Which brick, unique across the tile. */
  id: number;
  /** Position inside the brick. */
  lx: number;
  ly: number;
}

/** Running bond: courses `h` pixels tall (the top row of each is mortar), bricks `w` wide, alternate courses shifted by half. */
const brickAt = (x: number, y: number, w: number, h: number): BrickSpot => {
  const course = Math.floor(y / h);
  const shift = course % 2 ? w / 2 : 0;
  const bx = (((x + shift) % N) + N) % N;
  const index = Math.floor(bx / w);
  const lx = bx % w;
  const ly = y % h;
  return { mortar: ly === 0 || lx === 0, id: course * (N / w) + index, lx, ly };
};

export class StoneBrick extends TextureRecipe {
  readonly id = 'stone_brick';
  private static readonly SHADES = palette('#62656c', '#6f727a', '#7c7f87', '#898c94');
  private static readonly MORTAR = hex('#3f4147');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const tone = Array.from({ length: 8 }, () => rng.next());
    const grain = ranks(layers(rng, [[8, 8, 1], [16, 16, 0.6]]));
    c.paint((x, y) => {
      const b = brickAt(x, y, 8, 8);
      if (b.mortar) return StoneBrick.MORTAR;
      let v = tone[b.id] * 0.55 + grain[at(x, y)] * 0.45;
      if (b.ly === 1 || b.lx === 1) v += 0.35; // lit top and left edges
      if (b.ly === 7 || b.lx === 7) v -= 0.3; // shaded bottom and right edges
      return ramp(StoneBrick.SHADES, Math.min(0.99, Math.max(0, v)));
    });
    // Cracks wander through two bricks.
    for (const id of [rng.int(8), rng.int(8)]) {
      let x = (id % 2) * 8 + 2 + rng.int(4);
      let y = Math.floor(id / 2) * 8 + 2;
      for (let s = 0; s < 4; s++) {
        const [r, g, b] = c.get(x, y);
        if (r !== StoneBrick.MORTAR[0] || g !== StoneBrick.MORTAR[1] || b !== StoneBrick.MORTAR[2]) c.set(x, y, StoneBrick.SHADES[0]);
        y += 1;
        x += rng.chance(0.5) ? 1 : 0;
      }
    }
    return c.data;
  }
}

/** Small running-bond bricks. Red houses and the darker, sooty factory variant. */
export class Brick extends TextureRecipe {
  constructor(
    readonly id: string,
    private readonly shades: readonly RGB[],
    private readonly mortar: RGB,
    private readonly soot = false,
  ) {
    super();
  }

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const tone = Array.from({ length: 16 }, () => rng.next());
    const fleck = ranks(layers(rng, [[8, 8, 1], [16, 16, 0.8]]));
    // Soot runs down in streaks. It darkens by stepping down the palette, so the tile keeps its few shades.
    const streak = ranks(layers(rng, [[8, 1, 1], [16, 2, 0.4]]));
    const sooty = this.soot ? 0.45 : 0;
    c.paint((x, y) => {
      const b = brickAt(x, y, 8, 4);
      if (b.mortar) return this.soot && streak[at(x, 0)] > 0.7 ? scale(this.mortar, 0.75) : this.mortar;
      let v = tone[b.id] * 0.6 + fleck[at(x, y)] * 0.35;
      if (b.ly === 1) v += 0.25;
      if (b.ly === 3) v -= 0.2;
      v -= sooty * streak[at(x, 0)] * (1 - (y / N) * 0.5);
      return ramp(this.shades, Math.min(0.99, Math.max(0, v)));
    });
    return c.data;
  }
}

/**
 * Overlapping round-bottomed tiles in rows. Each tile is 8 wide and hangs one pixel over the course below,
 * so the lower edge is a scallop with a shadow under it.
 */
export class RoofTile extends TextureRecipe {
  constructor(readonly id: string, private readonly shades: readonly RGB[]) {
    super();
  }

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const [dark, mid, light, lighter] = this.shades;
    const grain = ranks(layers(rng, [[8, 8, 1], [16, 16, 0.5]]));
    const tone = Array.from({ length: 8 }, () => rng.next());
    const courses = N / 4;
    // Lowest bottom row of a tile at each of its 8 columns: deepest in the middle, shortest at the corners.
    const bottom = [2, 3, 4, 4, 4, 4, 3, 2];

    // Each tile also continues two rows up underneath the course above, so the gaps beside that course's
    // rounded corners show tile rather than nothing. These go down first; everything else covers them.
    const under = mix(dark, mid, 0.5);
    const gap = mix(dark, mid, 0.25);
    for (let course = 0; course < courses; course++) {
      const shift = (course % 2) * 4;
      for (let x = 0; x < N; x++) {
        const u = (x - shift + N) % 8;
        c.set(x, course * 4 - 2, u === 0 ? dark : under);
        c.set(x, course * 4 - 1, u === 0 ? dark : under);
      }
    }

    const drawCourse = (course: number, wrappedOnly: boolean) => {
      const shift = (course % 2) * 4;
      for (let i = 0; i < 2; i++) {
        const left = shift + i * 8;
        const t = tone[course * 2 + i];
        for (let u = 0; u < 8; u++) {
          for (let r = 0; r <= bottom[u]; r++) {
            const y = course * 4 + r;
            if (wrappedOnly && y < N) continue;
            const x = left + u;
            const g = grain[at(((x % N) + N) % N, y % N)];
            let col: RGB;
            if (r === bottom[u]) col = dark; // bottom edge of the tile
            else if (u === 0) col = gap; // gap between neighbours
            else if (r === 0) col = g > 0.5 ? lighter : light;
            else col = g * 0.5 + t * 0.5 > 0.55 ? light : mid;
            if (r === bottom[u] - 1 && r > 0) col = mid; // curve of the lip
            c.set(x, y, col);
          }
          // The lip throws a shadow on the tile below it.
          const sy = course * 4 + bottom[u] + 1;
          if (!wrappedOnly || sy >= N) {
            if (c.get(left + u, sy)[3]) c.set(left + u, sy, under);
          }
        }
      }
    };

    // Upper courses go on top of lower ones; then the bottom course's overhang is redrawn over the
    // top course of the next tile, which is what makes the tile repeat vertically.
    for (let course = courses - 1; course >= 0; course--) drawCourse(course, false);
    drawCourse(courses - 1, true);
    return c.data;
  }
}

export class Plaster extends TextureRecipe {
  readonly id = 'plaster';
  private static readonly SHADES = palette('#d6cebd', '#e0d8c8', '#e9e2d3', '#f1ebdd');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    // Soft patches plus short diagonal trowel marks, so the wall is not a flat fill.
    const v = ranks(layers(rng, [[2, 2, 1], [4, 4, 0.8], [16, 16, 0.35]]));
    c.paint((x, y) => ramp(Plaster.SHADES, v[at(x, y)]));
    for (let i = 0; i < 6; i++) {
      const x = rng.int(N);
      const y = rng.int(N);
      const len = 3 + rng.int(3);
      for (let k = 0; k < len; k++) c.set(x + k, y - (k >> 1), i % 2 ? Plaster.SHADES[3] : Plaster.SHADES[0]);
    }
    // One faint hairline crack and a couple of stains.
    let x = rng.int(N);
    let y = rng.int(4);
    for (let s = 0; s < 7; s++) {
      c.set(x, y, mix(Plaster.SHADES[0], hex('#a79d8a'), 0.6));
      y += 1;
      x += rng.chance(0.5) ? 1 : rng.chance(0.5) ? -1 : 0;
    }
    for (let i = 0; i < 3; i++) c.set(rng.int(N), rng.int(N), hex('#b9ae9a'));
    return c.data;
  }
}

export class Marble extends TextureRecipe {
  readonly id = 'marble';
  private static readonly BASE = palette('#e4e5e7', '#ecedee', '#f4f4f3');
  private static readonly VEIN = hex('#aeb4c0');
  private static readonly HALO = hex('#cfd3da');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const base = ranks(layers(rng, [[2, 2, 1], [6, 6, 0.4]]));
    // Warped diagonal waves give long veins that still wrap at the tile edge.
    const vein = waveVeins(rng, 1, 2);
    const hair = waveVeins(rng, 2, -1, 0.9);
    c.paint((x, y) => {
      const d = vein[at(x, y)];
      if (d < 0.3) return Marble.VEIN;
      if (d < 0.5) return Marble.HALO;
      if (hair[at(x, y)] < 0.2) return Marble.HALO;
      return ramp(Marble.BASE, base[at(x, y)]);
    });
    return c.data;
  }
}

/** Dark volcanic columns: vertical slabs split by cracks. */
export class Basalt extends TextureRecipe {
  readonly id = 'basalt';
  private static readonly SHADES = palette('#27282c', '#313236', '#3c3d42', '#484a50');
  private static readonly GAP = hex('#17181b');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const start = rng.int(N);
    const widths = [5, 6, 5];
    const edges: number[] = [];
    let acc = start;
    for (const w of widths) {
      edges.push(acc % N);
      acc += w;
    }
    const colId = (x: number) => {
      let id = 0;
      for (let i = 0; i < edges.length; i++) if (((x - edges[i]) % N + N) % N < widths[i]) id = i;
      return id;
    };
    const tone = widths.map(() => rng.next());
    const streak = ranks(layers(rng, [[8, 2, 1], [16, 4, 0.6]]));
    c.paint((x, y) => {
      const id = colId(x);
      const local = ((x - edges[id]) % N + N) % N;
      if (local === 0) return Basalt.GAP;
      let v = tone[id] * 0.5 + streak[at(x, y)] * 0.5;
      if (local === 1) v += 0.3;
      if (local === widths[id] - 1) v -= 0.25;
      return ramp(Basalt.SHADES, Math.min(0.99, Math.max(0, v)));
    });
    for (let i = 0; i < 3; i++) {
      const x = rng.int(N);
      const y = rng.int(N);
      c.set(x, y, Basalt.GAP);
      c.set(x + 1, y, Basalt.GAP);
    }
    return c.data;
  }
}

/** Riveted reinforced panels, 2 by 2 across the tile. */
export class HangarWall extends TextureRecipe {
  readonly id = 'hangar_wall';
  private static readonly SHADES = palette('#445b68', '#4f6875', '#5a7583', '#678392');
  private static readonly SEAM = hex('#2b3a43');

  generate(rng: SeededRng): Uint8Array {
    const c = new Canvas();
    const tone = Array.from({ length: 4 }, () => rng.next());
    const wear = ranks(layers(rng, [[4, 4, 1], [16, 16, 0.5]]));
    c.paint((x, y) => {
      const px = x % 8;
      const py = y % 8;
      const panel = (y >> 3) * 2 + (x >> 3);
      if (px === 0 || py === 0) return HangarWall.SEAM;
      let v = tone[panel] * 0.55 + wear[at(x, y)] * 0.4;
      if (px === 1 || py === 1) v += 0.3;
      if (px === 7 || py === 7) v -= 0.25;
      return ramp(HangarWall.SHADES, Math.min(0.99, Math.max(0, v)));
    });
    for (let py = 0; py < 2; py++) {
      for (let px = 0; px < 2; px++) {
        const bx = px * 8;
        const by = py * 8;
        for (const [dx, dy] of [[2, 2], [5, 2], [2, 5], [5, 5]]) {
          c.set(bx + dx, by + dy, hex('#9db4c1'));
          c.set(bx + dx + 1, by + dy + 1, HangarWall.SEAM);
        }
      }
    }
    return c.data;
  }
}
