import { TempestBlock } from '../../content/blocksTempest';
import { AIR_CELL, packCell } from '../../engine/cell';
import { stairState } from '../../engine/models/StairModel';
import { BlockType } from '../../worldConstants';
import { Rng } from '../noise';
import { Blueprint, Marker } from './Blueprint';
import { BlockSpec, Role, StylePack } from './StylePack';
import { FLARED, RoofProfile } from './roofProfile';
import {
  Rect, RoofInfo, RoofOptions, RoofSink, eaveRings, gableRoof, hipGableRoof, hipRoof,
} from './roofs';

// The builder is the vocabulary kits are written in: boxes, walls with openings, posts and beams, roofs with curved
// eaves, verandas, awnings, garden pieces and furnished rooms. Everything goes through the style pack, so a kit says
// 'wall' or 'roofStairs' and the pack picks the block; a block id or a {id, state} can be given where a role is not enough.
//
// Coordinates are the blueprint's: x east, y up, z south, ranges inclusive. A kit builds with the front of the
// building towards south and the footprint's north west corner at 0, 0 (see Blueprint.ts and Lot.ts).

export type BlockRef = Role | number | BlockSpec;

/** The four sides, in the order stairs and the models turn: clockwise from north. */
export const NORTH = 0;
export const EAST = 1;
export const SOUTH = 2;
export const WEST = 3;
export type Dir = 0 | 1 | 2 | 3;
export const DX: readonly number[] = [0, 1, 0, -1];
export const DZ: readonly number[] = [-1, 0, 1, 0];
export const opposite = (d: Dir): Dir => ((d + 2) & 3) as Dir;
export const turnRight = (d: Dir): Dir => ((d + 1) & 3) as Dir;
export const turnLeft = (d: Dir): Dir => ((d + 3) & 3) as Dir;

export type { Rect, RoofOptions, RoofInfo };
export const rect = (x0: number, z0: number, x1: number, z1: number): Rect => ({
  x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1),
});

export type OpeningKind = 'door' | 'open' | 'arch' | 'window' | 'glass' | 'shoji' | 'lattice' | 'blind';

/** A hole in a wall made by `walls` or `opening`: a doorway, a screen, a glazed or latticed opening. */
export interface Opening {
  /** Which wall of the rectangle it is in. */
  side: Dir;
  /** Distance of its first cell from the wall's west end (north and south walls) or north end (east and west walls). */
  at: number;
  /** Level of its lowest cell. */
  y: number;
  /** Cells along the wall. Default 1. */
  width?: number;
  /** Cells up. Default 2 for a door, 1 otherwise. */
  height?: number;
  kind: OpeningKind;
  /** A screen glowing from inside: the lit shoji. */
  lit?: boolean;
  /** Hang a curtain in a doorway: true for the style's noren, or a block. */
  noren?: boolean | BlockRef;
  /** Block under a window, in the row below `y`. */
  sill?: BlockRef;
}

export type Where = 'wall' | 'corner' | 'center' | 'any';

export interface FurnitureItem {
  block: BlockRef;
  count: number;
  /** Where it prefers to stand. Default 'wall'. */
  where?: Where;
  state?: number;
  /** Cells above the first it also fills (a bookshelf two high). Default 0. */
  tall?: number;
}

/** A floored room: the interior rectangle, the floor row and the cells just inside each door. */
export interface Room {
  rect: Rect;
  /** The floor row. Things stand on it at floorY + 1. */
  floorY: number;
  /** The cell just inside each door and the way in; `stair` marks the ends of a stair, which are not entrances. */
  doors: Array<{ x: number; z: number; inward: Dir; stair?: boolean }>;
}

export interface Placed { x: number; y: number; z: number }

export class BlueprintBuilder implements RoofSink {
  readonly bp: Blueprint;

  constructor(readonly style: StylePack, readonly rng: Rng, name = 'building') {
    this.bp = new Blueprint(name);
  }

  // --- Blocks -------------------------------------------------------------------------------------------------------

  resolve(ref: BlockRef, state = 0): BlockSpec {
    if (typeof ref === 'string') return { id: this.style.block(ref), state };
    if (typeof ref === 'number') return { id: ref, state };
    return { id: ref.id, state: ref.state ?? state };
  }

  /** Sets one cell. */
  set(x: number, y: number, z: number, ref: BlockRef, state = 0): this {
    const b = this.resolve(ref, state);
    this.bp.set(x, y, z, packCell(b.id, b.state ?? 0));
    return this;
  }

  /** Sets a cell only where the blueprint has nothing yet. */
  setIfEmpty(x: number, y: number, z: number, ref: BlockRef, state = 0): this {
    if (!this.bp.has(x, y, z)) this.set(x, y, z, ref, state);
    return this;
  }

  /** Air: the stamp clears what stands there (a doorway, a courtyard). */
  carve(x: number, y: number, z: number): this {
    this.bp.set(x, y, z, AIR_CELL);
    return this;
  }

  /** Unsets a cell: the blueprint says nothing there (a gap cut in a fence). */
  clear(x: number, y: number, z: number): this {
    this.bp.unset(x, y, z);
    return this;
  }

  mark(marker: Marker): this {
    this.bp.addMarker(marker);
    return this;
  }

  build(): Blueprint {
    return this.bp;
  }

  // --- Roof sink (what roofs.ts calls) -------------------------------------------------------------------------------

  put(x: number, y: number, z: number, role: 'roofBlock' | 'roofStairs' | 'roofSlab' | 'ridge' | 'ridgeHorn', state = 0): void {
    this.set(x, y, z, role, state);
  }

  fill(x: number, y: number, z: number, block: BlockRef): void {
    this.setIfEmpty(x, y, z, block);
  }

  get hasRidge(): boolean {
    return this.style.block('ridge') !== this.style.block('roofBlock');
  }

  get hasHorn(): boolean {
    return this.style.block('ridgeHorn') !== this.style.block('ridge');
  }

  // --- Solids -------------------------------------------------------------------------------------------------------

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, ref: BlockRef, state = 0): this {
    const [ax, bx] = x0 <= x1 ? [x0, x1] : [x1, x0];
    const [ay, by] = y0 <= y1 ? [y0, y1] : [y1, y0];
    const [az, bz] = z0 <= z1 ? [z0, z1] : [z1, z0];
    for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) this.set(x, y, z, ref, state);
    return this;
  }

  /** A box with only its shell: four walls, and the top and bottom when given. */
  hollowBox(
    x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, ref: BlockRef,
    caps: { top?: BlockRef; bottom?: BlockRef } = {},
  ): this {
    const r = rect(x0, z0, x1, z1);
    const [ay, by] = y0 <= y1 ? [y0, y1] : [y1, y0];
    this.ring(r, ay, by, ref);
    if (caps.top !== undefined) this.floor(r, by, caps.top);
    if (caps.bottom !== undefined) this.floor(r, ay, caps.bottom);
    return this;
  }

  /** A flat fill of one row. */
  floor(r: Rect, y: number, ref: BlockRef, state = 0): this {
    for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) this.set(x, y, z, ref, state);
    return this;
  }

  /** The cells of a rectangle's boundary, from y0 to y1. */
  ring(r: Rect, y0: number, y1: number, ref: BlockRef, state = 0): this {
    for (let y = y0; y <= y1; y++) {
      for (let x = r.x0; x <= r.x1; x++) { this.set(x, y, r.z0, ref, state); this.set(x, y, r.z1, ref, state); }
      for (let z = r.z0; z <= r.z1; z++) { this.set(r.x0, y, z, ref, state); this.set(r.x1, y, z, ref, state); }
    }
    return this;
  }

  // --- Walls, frames, openings ---------------------------------------------------------------------------------------

  /** Four walls from y0 to y1, then the openings cut into them. */
  walls(r: Rect, y0: number, y1: number, ref: BlockRef, openings: readonly Opening[] = []): this {
    this.ring(r, y0, y1, ref);
    for (const o of openings) this.opening(r, o);
    return this;
  }

  /** Cuts a doorway or window into a wall of `r`: carves the cells, then fills a screen, glass or curtain. */
  opening(r: Rect, o: Opening): this {
    const width = o.width ?? 1;
    const height = o.height ?? (o.kind === 'door' || o.kind === 'arch' ? 2 : 1);
    const along = o.side === NORTH || o.side === SOUTH ? 'x' : 'z';
    const wallLen = along === 'x' ? r.x1 - r.x0 + 1 : r.z1 - r.z0 + 1;
    if (o.at < 0 || o.at + width > wallLen) throw new RangeError(`Opening at ${o.at} width ${width} is outside a wall of ${wallLen}`);
    const cell = (i: number): [number, number] => {
      const t = o.at + i;
      switch (o.side) {
        case NORTH: return [r.x0 + t, r.z0];
        case SOUTH: return [r.x0 + t, r.z1];
        case WEST: return [r.x0, r.z0 + t];
        default: return [r.x1, r.z0 + t];
      }
    };
    const pane = o.kind === 'glass' ? 'glassPane' : o.kind === 'shoji' ? (o.lit ? 'shojiLit' : 'shoji') : o.kind === 'lattice' ? 'lattice' : o.kind === 'blind' ? 'blind' : null;
    for (let i = 0; i < width; i++) {
      const [x, z] = cell(i);
      for (let k = 0; k < height; k++) {
        if (pane) this.set(x, o.y + k, z, pane);
        else this.carve(x, o.y + k, z);
      }
      if (o.sill !== undefined && pane) this.set(x, o.y - 1, z, o.sill);
      if (o.noren && !pane) {
        const ref = o.noren === true ? 'noren' : o.noren;
        this.set(x, o.y + height - 1, z, ref, along === 'x' ? 0 : 1);
      }
    }
    if (o.kind === 'door') {
      const [x, z] = cell(Math.floor((width - 1) / 2));
      this.mark({ kind: 'door', x, y: o.y, z, facing: o.side });
    }
    return this;
  }

  /** A column of one block. */
  column(x: number, z: number, y0: number, y1: number, ref: BlockRef = 'post'): this {
    return this.box(x, y0, z, x, y1, z, ref);
  }

  /** Posts at the given cells. */
  columns(cells: ReadonlyArray<readonly [number, number]>, y0: number, y1: number, ref: BlockRef = 'post'): this {
    for (const [x, z] of cells) this.column(x, z, y0, y1, ref);
    return this;
  }

  /** A horizontal timber between two cells on one row, along x or z. */
  beam(x0: number, z0: number, x1: number, z1: number, y: number, ref: BlockRef = 'beam'): this {
    if (x0 !== x1 && z0 !== z1) throw new RangeError('A beam runs along x or along z');
    return this.box(x0, y, z0, x1, y, z1, ref);
  }

  /** A rectangle of beams: the wall plate or a storey band. */
  beamRing(r: Rect, y: number, ref: BlockRef = 'beam'): this {
    return this.ring(r, y, y, ref);
  }

  /**
   * A timber frame round `r` from y0 to y1: infill panels, posts at the corners and at most `spacing` apart along each
   * wall, and beams at the levels in `beams`. Doors and windows are cut afterwards with `opening`.
   */
  frame(
    r: Rect, y0: number, y1: number,
    options: { panel?: BlockRef; post?: BlockRef; beam?: BlockRef; spacing?: number; beams?: readonly number[]; footing?: BlockRef | false } = {},
  ): this {
    const { panel = 'wall', post = 'post', beam = 'beam', spacing = 4, beams = [], footing = false } = options;
    this.ring(r, y0, y1, panel);
    if (footing !== false) this.ring(r, y0, y0, footing);
    const posts = (a: number, b: number): number[] => {
      const len = b - a;
      const n = Math.max(1, Math.ceil(len / spacing));
      const out: number[] = [];
      for (let i = 0; i <= n; i++) out.push(a + Math.round((len * i) / n));
      return out;
    };
    for (const x of posts(r.x0, r.x1)) { this.column(x, r.z0, y0, y1, post); this.column(x, r.z1, y0, y1, post); }
    for (const z of posts(r.z0, r.z1)) { this.column(r.x0, z, y0, y1, post); this.column(r.x1, z, y0, y1, post); }
    for (const y of beams) this.beamRing(r, y, beam);
    return this;
  }

  // --- Roofs ---------------------------------------------------------------------------------------------------------

  /**
   * A gable roof over the walls `wall` whose last course is at `plateY`, the ridge along `axis`. With the default flared
   * profile the eaves run out flat and sweep up, and the gable triangles are filled with the half-timber panel.
   */
  gable(wall: Rect, plateY: number, options: RoofOptions = {}): RoofInfo {
    return gableRoof(this, wall, plateY, options);
  }

  /** A hip roof: four sloping faces closing in a crest. */
  hip(wall: Rect, plateY: number, options: RoofOptions = {}): RoofInfo {
    return hipRoof(this, wall, plateY, options);
  }

  /** A hip and gable roof (irimoya): hips round the edge, a gable above. */
  hipGable(wall: Rect, plateY: number, options: RoofOptions = {}): RoofInfo {
    return hipGableRoof(this, wall, plateY, options);
  }

  /**
   * The skirt round a lower storey: `rings` rings of the profile from the outer edge `outer`, starting at level
   * `baseY` (the cell above the wall's last course). Returns the rectangle inside it, where the upper walls stand.
   */
  eaves(outer: Rect, baseY: number, rings: number, profile: RoofProfile = FLARED, tips = 0): Rect | null {
    return eaveRings(this, outer, baseY, rings, profile, tips);
  }

  /** A ridge cap along a line, with horns at both ends when the style has them. */
  ridgeCap(x0: number, z0: number, x1: number, z1: number, y: number): this {
    if (x0 !== x1 && z0 !== z1) throw new RangeError('A ridge runs along x or along z');
    const axis = x0 !== x1 ? 'x' : 'z';
    const a = axis === 'x' ? x0 : z0;
    const b = axis === 'x' ? x1 : z1;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    for (let t = lo; t <= hi; t++) {
      const x = axis === 'x' ? t : x0;
      const z = axis === 'z' ? t : z0;
      const turn = axis === 'x' ? 0 : 1;
      if (this.hasHorn && (t === lo || t === hi)) this.set(x, y, z, 'ridgeHorn', (turn + (t === lo ? 2 : 0)) & 3);
      else this.set(x, y, z, 'ridge', turn);
    }
    return this;
  }

  // --- Verandas, balconies, rails, hangings --------------------------------------------------------------------------

  /**
   * An engawa: a veranda of `depth` blocks along one side of the building, floored at row `y`, with posts along its outer
   * edge (up to `postTop`, so they can hold the eave) and a rail between them, except for the `gap` cells (where steps
   * come up). The floor spans `from` to `to` along the wall.
   */
  engawa(
    r: Rect, y: number, side: Dir, depth = 2,
    options: { from?: number; to?: number; rail?: boolean; posts?: number; gap?: readonly number[]; floor?: BlockRef; postTop?: number; post?: BlockRef } = {},
  ): this {
    const { rail = true, posts = 3, gap = [], floor = 'floor', post = 'post' } = options;
    const postTop = options.postTop ?? y + 1;
    const horizontal = side === NORTH || side === SOUTH;
    const lo = options.from ?? (horizontal ? r.x0 : r.z0);
    const hi = options.to ?? (horizontal ? r.x1 : r.z1);
    const edge = side === NORTH ? r.z0 : side === SOUTH ? r.z1 : side === WEST ? r.x0 : r.x1;
    for (let d = 1; d <= depth; d++) {
      for (let t = lo; t <= hi; t++) {
        const x = horizontal ? t : edge + DX[side] * d;
        const z = horizontal ? edge + DZ[side] * d : t;
        this.set(x, y, z, floor);
      }
    }
    const outer = depth;
    for (let t = lo; t <= hi; t++) {
      const x = horizontal ? t : edge + DX[side] * outer;
      const z = horizontal ? edge + DZ[side] * outer : t;
      // A gap is where the steps come up: no post or rail there, even where a post would fall.
      if (gap.includes(t)) continue;
      const isPost = t === lo || t === hi || (posts > 0 && (t - lo) % posts === 0);
      if (isPost) this.column(x, z, y + 1, postTop, post);
      else if (rail) this.set(x, y + 1, z, 'rail');
    }
    return this;
  }

  /** A balcony: a floor `depth` blocks out from the wall at `at`, along x0..x1 (or z0..z1 for east and west), with a rail. */
  balcony(
    r: Rect, y: number, side: Dir, from: number, to: number, depth = 1,
    options: { rail?: boolean; floor?: BlockRef; bracket?: boolean } = {},
  ): this {
    const { rail = true, floor = 'floor', bracket = true } = options;
    const horizontal = side === NORTH || side === SOUTH;
    const edge = side === NORTH ? r.z0 : side === SOUTH ? r.z1 : side === WEST ? r.x0 : r.x1;
    for (let d = 1; d <= depth; d++) {
      for (let t = from; t <= to; t++) {
        const x = horizontal ? t : edge + DX[side] * d;
        const z = horizontal ? edge + DZ[side] * d : t;
        this.set(x, y, z, floor);
        // Brackets under the outer row at both ends hold it up.
        if (bracket && d === depth && (t === from || t === to)) this.set(x, y - 1, z, 'beam');
      }
    }
    if (rail) {
      for (let t = from; t <= to; t++) {
        for (let d = 1; d <= depth; d++) {
          const outerRow = d === depth;
          const sideRow = t === from || t === to;
          if (!outerRow && !sideRow) continue;
          const x = horizontal ? t : edge + DX[side] * d;
          const z = horizontal ? edge + DZ[side] * d : t;
          this.set(x, y + 1, z, 'rail');
        }
      }
    }
    return this;
  }

  /** A straight run of rail or fence along x or z on row y. */
  railing(x0: number, z0: number, x1: number, z1: number, y: number, ref: BlockRef = 'rail'): this {
    if (x0 !== x1 && z0 !== z1) throw new RangeError('A railing runs along x or along z');
    return this.box(x0, y, z0, x1, y, z1, ref);
  }

  /** A fence along x or z, `y` the row of the posts. */
  fence(x0: number, z0: number, x1: number, z1: number, y: number, ref: BlockRef = 'fence'): this {
    return this.railing(x0, z0, x1, z1, y, ref);
  }

  /** A fence round a rectangle, leaving gaps at the cells listed as [x, z]. */
  fenceRect(r: Rect, y: number, gaps: ReadonlyArray<readonly [number, number]> = [], ref: BlockRef = 'fence'): this {
    this.ring(r, y, y, ref);
    for (const [x, z] of gaps) this.bp.unset(x, y, z);
    return this;
  }

  /**
   * A lantern hung out from a wall: a short beam sticking out of the cell at (x, y, z) on `side`, with the lantern under
   * its end. The beam's root must touch the wall, so give the cell just outside it.
   */
  lanternHanger(x: number, y: number, z: number, side: Dir, lantern: BlockRef = 'light'): this {
    this.set(x, y, z, 'beam');
    this.set(x + DX[side], y, z + DZ[side], 'beam');
    this.set(x + DX[side], y - 1, z + DZ[side], lantern);
    return this;
  }

  /** A stone chimney: a shaft of the footing material from y0 to y1 with a slab cap. */
  chimney(x: number, z: number, y0: number, y1: number, ref: BlockRef = 'wallBase'): this {
    this.column(x, z, y0, y1, ref);
    this.set(x, y1 + 1, z, 'stoneSlab', 0);
    return this;
  }

  // --- Steps, stairs --------------------------------------------------------------------------------------------------

  /** One stair block climbing towards `facing`. */
  stair(x: number, y: number, z: number, facing: Dir, ref: BlockRef = 'stoneStairs', upsideDown = false): this {
    return this.set(x, y, z, ref, stairState(facing, upsideDown));
  }

  /**
   * Steps down from a doorway: `count` stairs, the first at (x, y, z), each one lower and one further out towards `out`,
   * `width` cells wide (extending east or south from the first cell). They climb back towards the building.
   */
  steps(x: number, y: number, z: number, out: Dir, count: number, width = 1, ref: BlockRef = 'stoneStairs'): this {
    const across = out === NORTH || out === SOUTH ? 'x' : 'z';
    for (let k = 0; k < count; k++) {
      for (let w = 0; w < width; w++) {
        const sx = x + DX[out] * k + (across === 'x' ? w : 0);
        const sz = z + DZ[out] * k + (across === 'z' ? w : 0);
        this.stair(sx, y - k, sz, opposite(out), ref);
      }
    }
    return this;
  }

  // --- Cloth and signs -------------------------------------------------------------------------------------------------

  /**
   * An awning over a shop front: cloth from the wall out to `depth` blocks, `from` to `to` along it, its high edge at
   * level y against the wall. `out` is the direction it falls towards. Alternates two cloths when `alt` is given.
   */
  awning(wallCoord: number, from: number, to: number, y: number, out: Dir, options: { alt?: boolean; ref?: BlockRef; refAlt?: BlockRef } = {}): this {
    const { alt = false, ref = 'awning', refAlt = 'awningAlt' } = options;
    // The model is written with its wall to the north and its cloth falling south; turn 0 is out = south.
    const turns = (out + 2) & 3;
    const horizontal = out === NORTH || out === SOUTH;
    for (let t = from; t <= to; t++) {
      const x = horizontal ? t : wallCoord + DX[out];
      const z = horizontal ? wallCoord + DZ[out] : t;
      const use = alt && Math.floor((t - from) / 2) % 2 === 1 ? refAlt : ref;
      this.set(x, y, z, use, turns);
    }
    return this;
  }

  /** A signboard in a cell: `axis` is the way its face runs (along x or along z). */
  signboard(x: number, y: number, z: number, axis: 'x' | 'z' = 'x', ref: BlockRef = 'sign'): this {
    return this.set(x, y, z, ref, axis === 'x' ? 0 : 1);
  }

  /** A curtain hanging in a doorway along x or z, over `width` cells. */
  noren(x: number, y: number, z: number, axis: 'x' | 'z' = 'x', width = 1, ref: BlockRef = 'noren'): this {
    for (let i = 0; i < width; i++) this.set(axis === 'x' ? x + i : x, y, axis === 'z' ? z + i : z, ref, axis === 'x' ? 0 : 1);
    return this;
  }

  // --- Garden ----------------------------------------------------------------------------------------------------------

  /**
   * A pond at row y: water inside `r` with a rim of the style's garden stone round it, and koi swimming on `koi` of the
   * cells. The pond is level with the ground; the stones that ring it are the only edge.
   */
  pond(r: Rect, y = 0, koi = 2, rim: BlockRef = 'stone'): this {
    for (let z = r.z0 - 1; z <= r.z1 + 1; z++) {
      for (let x = r.x0 - 1; x <= r.x1 + 1; x++) {
        const inside = x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
        this.set(x, y, z, inside ? BlockType.WATER : rim);
      }
    }
    const cells: Array<[number, number]> = [];
    for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) cells.push([x, z]);
    for (let i = 0; i < koi && cells.length > 0; i++) {
      const [x, z] = cells.splice(this.rng.int(cells.length), 1)[0];
      this.set(x, y, z, TempestBlock.KOI_POND);
    }
    return this;
  }

  /** Stepping stones over the cells given, on the row above the ground. */
  steppingStones(cells: ReadonlyArray<readonly [number, number]>, y = 1): this {
    for (const [x, z] of cells) this.set(x, y, z, TempestBlock.STEPPING_STONES);
    return this;
  }

  /** A line of stepping stones from one cell to another, a stone every `every` cells with a little sideways wobble. */
  steppingPath(x0: number, z0: number, x1: number, z1: number, y = 1, every = 1): this {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
    for (let i = 0; i <= n; i += every) {
      const x = Math.round(x0 + ((x1 - x0) * i) / Math.max(n, 1));
      const z = Math.round(z0 + ((z1 - z0) * i) / Math.max(n, 1));
      this.set(x, y, z, TempestBlock.STEPPING_STONES);
    }
    return this;
  }

  /** Marks a place for a tree: the zone grows it (a sakura, a cedar) with its own tree features. */
  treeSpot(x: number, z: number, species: 'sakura' | 'cedar' | 'bamboo' | 'any' = 'any', y = 1): this {
    return this.mark({ kind: 'tree', x, y, z, tag: species });
  }

  /** A stone lantern: foot, firebox and cap stacked from y. */
  stoneLantern(x: number, y: number, z: number): this {
    this.set(x, y, z, TempestBlock.STONE_LANTERN_BASE);
    this.set(x, y + 1, z, TempestBlock.STONE_LANTERN_LIGHT);
    this.set(x, y + 2, z, TempestBlock.STONE_LANTERN_CAP);
    return this;
  }

  /** A street lamp: a timber post `height` tall under a paper lantern (or any block). */
  lampPost(x: number, y: number, z: number, height = 3, lamp: BlockRef = 'light'): this {
    this.column(x, z, y, y + height - 1, 'post');
    this.set(x, y + height, z, lamp);
    return this;
  }

  // --- Interiors -------------------------------------------------------------------------------------------------------

  /** A floored room: lays the floor row and notes the doors, so furniture keeps them clear. */
  room(interior: Rect, floorY: number, options: { floor?: BlockRef; doors?: ReadonlyArray<{ x: number; z: number; inward: Dir; stair?: boolean }> } = {}): Room {
    this.floor(interior, floorY, options.floor ?? 'interiorFloor');
    return { rect: interior, floorY, doors: [...(options.doors ?? [])] };
  }

  /**
   * Tatami over the room's floor, a mat a cell, except on the cell just inside each door: the entry (genkan) is bare floor. A
   * door is two blocks high and a person 1.92, so a mat a quarter block high at the threshold would be a step the lintel does
   * not leave room to climb; the step is taken one cell further in, where the room is open above.
   */
  tatami(room: Room): this {
    const y = room.floorY + 1;
    const bare = new Set(room.doors.filter((d) => !d.stair).map((d) => `${d.x},${d.z}`));
    for (let z = room.rect.z0; z <= room.rect.z1; z++) {
      for (let x = room.rect.x0; x <= room.rect.x1; x++) if (!bare.has(`${x},${z}`)) this.set(x, y, z, TempestBlock.TATAMI);
    }
    return this;
  }

  /**
   * Furniture in a room, never on the cells a door opens onto (nor the two behind them) and never walling a door in.
   * Deterministic: it draws from the builder's own generator. Returns where things went.
   */
  furnish(room: Room, items: readonly FurnitureItem[]): Placed[] {
    const { rect: r, floorY } = room;
    const y = floorY + 1;
    const key = (x: number, z: number): string => `${x},${z}`;
    const blocked = new Set<string>();
    for (const d of room.doors) {
      for (let k = 0; k <= 2; k++) {
        const cx = d.x + DX[d.inward] * k;
        const cz = d.z + DZ[d.inward] * k;
        blocked.add(key(cx, cz));
        // The cells beside the doorway's path too, so a table never leaves only a one-cell gap.
        blocked.add(key(cx + DX[turnRight(d.inward)], cz + DZ[turnRight(d.inward)]));
        blocked.add(key(cx + DX[turnLeft(d.inward)], cz + DZ[turnLeft(d.inward)]));
      }
    }
    const placed: Placed[] = [];
    const taken = new Set<string>();
    const kindOf = (x: number, z: number): Where => {
      const nearX = x === r.x0 || x === r.x1;
      const nearZ = z === r.z0 || z === r.z1;
      if (nearX && nearZ) return 'corner';
      if (nearX || nearZ) return 'wall';
      return 'center';
    };
    for (const item of items) {
      const want = item.where ?? 'wall';
      for (let n = 0; n < item.count; n++) {
        const candidates: Array<[number, number]> = [];
        for (let z = r.z0; z <= r.z1; z++) {
          for (let x = r.x0; x <= r.x1; x++) {
            const k = key(x, z);
            if (blocked.has(k) || taken.has(k)) continue;
            if (want !== 'any' && kindOf(x, z) !== want) continue;
            candidates.push([x, z]);
          }
        }
        if (candidates.length === 0) break;
        const [x, z] = candidates[this.rng.int(candidates.length)];
        taken.add(key(x, z));
        for (let h = 0; h <= (item.tall ?? 0); h++) {
          this.set(x, y + h, z, item.block, item.state ?? 0);
          placed.push({ x, y: y + h, z });
        }
      }
    }
    return placed;
  }
}

/** The facing a rotation of whole turns gives a Dir. */
export const turnDir = (d: Dir, turns: number): Dir => ((d + turns) & 3) as Dir;

