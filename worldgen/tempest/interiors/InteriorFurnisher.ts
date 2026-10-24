import { NatureBlock } from '../../../content/blocksNature';
import { TempestBlock as T } from '../../../content/blocksTempest';
import { ShapedBlock } from '../../../content/blocksShaped';
import { BlockType } from '../../../worldConstants';
import { AIR_CELL, packCell } from '../../../engine/cell';
import { stairState } from '../../../engine/models/StairModel';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { DX, DZ, Dir, EAST, NORTH, Rect, SOUTH, WEST, opposite } from '../../structures/BlueprintBuilder';
import { Role, StylePack } from '../../structures/StylePack';
import { turnCell } from '../../structures/orientation';
import { TEMPEST_STYLE } from '../style';

// The interior furnisher puts rooms and furniture into a blueprint: a hearth and a low table with cushions, futons, shelves of
// books, lanterns hanging from the ceiling, scrolls and plants, a kitchen corner, a shop with a counter and goods, and the
// larger rooms of the pictures (a council hall with a dais, a forge, a weaving room). Kits call it with the room they built:
//
//   furnish(blueprint, room, 'living', rng)
//
// and partition a floor into rooms with `InteriorFurnisher.partition`. The rules, which the tests check on plain box rooms:
//   - the cells just inside a door, and the two beside each, are never built on, and every door stays reachable from every
//     other and from most of the room: furniture is placed one piece at a time and a piece that would cut the room is refused;
//   - furniture stands against walls (corners for what is tall and plain, the middle for tables), and every piece has the
//     cell in front of it free, so it can be used;
//   - lights hang from the ceiling at least three blocks above the floor, with a cord up to the ceiling when it is higher;
//   - nothing is random but the generator it is given: the same room, kind and generator always give the same furniture.

export type RoomKind =
  | 'living' | 'bedroom' | 'kitchen' | 'shop' | 'storage' | 'study' | 'inn' | 'lobby' | 'barracks'
  | 'council' | 'forge' | 'weaving';

export const ROOM_KINDS: readonly RoomKind[] = [
  'living', 'bedroom', 'kitchen', 'shop', 'storage', 'study', 'inn', 'lobby', 'barracks', 'council', 'forge', 'weaving',
];

/** A door of a room: the cell just inside it, and the way you walk in. */
export interface RoomDoor { x: number; z: number; inward: Dir }

/** A floored room: the cells inside the walls, the floor row, the lowest ceiling row and the doors. */
export interface InteriorRoom {
  rect: Rect;
  /** The floor row. Things stand on it at floorY + 1. */
  floorY: number;
  /** The row of the lowest ceiling block. Default floorY + 4: three free cells over the floor. */
  ceilingY?: number;
  doors: readonly RoomDoor[];
}

export interface Placed { x: number; y: number; z: number }

export interface FurnishResult {
  /** Every block set as furniture, in the order placed. */
  items: Placed[];
  /** The lights hung or set. */
  lights: Placed[];
  /** Cells of the room left clear, and the share of them a walker can reach from the door. */
  free: number;
  reachable: number;
}

type Where = 'wall' | 'corner' | 'center' | 'any';

interface PieceCell {
  dx: number;
  dz: number;
  /** Height above the standing level (0 on the floor). */
  dy?: number;
  block: number | Role;
  state?: number;
}

/** A piece of furniture written with its back to the north: its back row at dz 0, its front at dz d - 1. */
interface Piece {
  cells: readonly PieceCell[];
  w: number;
  d: number;
  where: Where;
  /** Cells in front of its front row that must be free. Default 1. */
  reach?: number;
}

const cell = (dx: number, dz: number, block: number | Role, dy = 0, state = 0): PieceCell => ({ dx, dz, dy, block, state });

// Blocks the pieces use from outside the Tempest set.
const STONEB = BlockType.COBBLESTONE;
const WOODSTAIRS = ShapedBlock.DARK_PLANK_STAIRS;
const WOODDARKSLAB = ShapedBlock.DARK_PLANK_SLAB;

// --- The pieces ----------------------------------------------------------------------------------------------------------

const single = (block: number | Role, where: Where = 'wall', state = 0): Piece => ({ cells: [cell(0, 0, block, 0, state)], w: 1, d: 1, where });
const tall = (block: number | Role, n: number, where: Where = 'wall'): Piece => ({
  cells: Array.from({ length: n }, (_, k) => cell(0, 0, block, k)), w: 1, d: 1, where,
});
const row = (blocks: ReadonlyArray<number | Role>, where: Where = 'wall'): Piece => ({
  cells: blocks.map((b, i) => cell(i, 0, b)), w: blocks.length, d: 1, where,
});

const BOOKSHELF = tall(T.BOOKSHELF, 2);
const BOOKSHELF_LOW = single(T.BOOKSHELF);
const HEARTH = single(T.HEARTH, 'wall');
const HEARTH_CORNER = single(T.HEARTH, 'corner');
const VASE = single(T.VASE, 'wall');
const BARREL = single(T.BARREL, 'wall');
const BARREL_STACK: Piece = { cells: [cell(0, 0, T.BARREL), cell(0, 0, T.CRATE, 1)], w: 1, d: 1, where: 'wall' };
const CRATE_STACK: Piece = { cells: [cell(0, 0, T.CRATE), cell(0, 0, T.CRATE, 1)], w: 1, d: 1, where: 'wall' };
const CRATE = single(T.CRATE, 'wall');
const RICE = single(T.RICE_BALE, 'wall');
const BUCKET = single(T.BUCKET, 'wall');
const PLANTER: Piece = { cells: [cell(0, 0, T.BUCKET), cell(0, 0, NatureBlock.FERN, 1)], w: 1, d: 1, where: 'corner' };
const BAMBOO_POT: Piece = { cells: [cell(0, 0, T.BUCKET), cell(0, 0, NatureBlock.BAMBOO, 1)], w: 1, d: 1, where: 'corner' };
const CUSHION = single(T.CUSHION, 'any');
const LOW_TABLE = single(T.LOW_TABLE, 'any');
// A low table with a lantern on it: the lamp beside a bed or a reading cushion.
const LAMP_TABLE: Piece = { cells: [cell(0, 0, T.LOW_TABLE), cell(0, 0, 'light', 1)], w: 1, d: 1, where: 'wall' };
// Washing, a scroll or a sign hung in the cell beside a wall, at head height.
const SCROLL: Piece = { cells: [cell(0, 0, T.SIGNBOARD, 1)], w: 1, d: 1, where: 'wall', reach: 0 };

/** A low table with a cushion on each side but the one the room's door side leaves open: three cushions round it. */
const TABLE_SET: Piece = {
  cells: [cell(1, 1, T.LOW_TABLE), cell(0, 1, T.CUSHION), cell(2, 1, T.CUSHION), cell(1, 0, T.CUSHION)],
  w: 3, d: 3, where: 'center',
};
const TABLE_PAIR: Piece = { cells: [cell(0, 0, T.LOW_TABLE), cell(1, 0, T.CUSHION)], w: 2, d: 1, where: 'any' };

/** A bed: two futons end to end along the wall with a cushion for a pillow. */
const BED: Piece = { cells: [cell(0, 0, T.FUTON), cell(0, 1, T.FUTON), cell(0, 0, T.CUSHION, 1)], w: 1, d: 2, where: 'wall' };

/** A forge: a block of cobblestone three wide with a glowing fire-box in its face, a hearth in front, a hood above. */
const FURNACE: Piece = {
  cells: [
    cell(0, 0, STONEB), cell(1, 0, STONEB), cell(2, 0, STONEB),
    cell(0, 0, STONEB, 1), cell(1, 0, STONEB, 1), cell(2, 0, STONEB, 1),
    cell(0, 0, STONEB, 2), cell(1, 0, STONEB, 2), cell(2, 0, STONEB, 2),
    cell(1, 1, T.STONE_LANTERN_LIGHT), cell(0, 1, T.HEARTH), cell(2, 1, T.HEARTH),
  ],
  w: 3, d: 2, where: 'wall',
};
const ANVIL: Piece = { cells: [cell(0, 0, BlockType.IRON_BLOCK), cell(0, 0, ShapedBlock.STONE_BRICK_SLAB, 1)], w: 1, d: 1, where: 'center' };
const COAL = single(BlockType.BASALT, 'wall');

/** A loom: two posts, a beam across them and the warp hanging between, a stool in front. */
const LOOM: Piece = {
  cells: [
    cell(0, 0, T.TIMBER_POST), cell(0, 0, T.TIMBER_POST, 1), cell(0, 0, T.TIMBER_POST, 2),
    cell(2, 0, T.TIMBER_POST), cell(2, 0, T.TIMBER_POST, 1), cell(2, 0, T.TIMBER_POST, 2),
    cell(1, 0, T.TIMBER_BEAM, 2), cell(1, 0, T.NOREN_WHITE, 1), cell(1, 0, T.NOREN_WHITE, 0), cell(1, 1, T.CUSHION),
  ],
  w: 3, d: 2, where: 'wall',
};

/** A counter: shelves of goods on the wall, an aisle for the keeper, and the counter one cell out with a lantern on it. */
const counterPiece = (length: number): Piece => {
  const cells: PieceCell[] = [];
  const goods = [T.BOOKSHELF, T.CRATE, T.BARREL, T.RICE_BALE, T.VASE, T.CRATE];
  for (let i = 0; i < length; i++) {
    cells.push(cell(i, 0, goods[i % goods.length]));
    if (goods[i % goods.length] === T.BOOKSHELF) cells.push(cell(i, 0, T.BOOKSHELF, 1));
    cells.push(cell(i, 2, T.VERMILION_PLANKS));
  }
  cells.push(cell(Math.floor(length / 2), 2, 'light', 1));
  return { cells, w: length, d: 3, where: 'wall' };
};

/** A long shelf of goods against a wall: crates, barrels, bales, vases and books. */
const goodsRow = (length: number, rng: Rng): Piece => {
  const choices: Array<ReadonlyArray<number | Role>> = [[T.BOOKSHELF], [T.CRATE], [T.BARREL], [T.RICE_BALE], [T.VASE]];
  const cells: PieceCell[] = [];
  for (let i = 0; i < length; i++) {
    const pick = choices[rng.int(choices.length)][0];
    cells.push(cell(i, 0, pick));
    if (pick === T.BOOKSHELF || pick === T.CRATE) cells.push(cell(i, 0, pick === T.CRATE ? T.CRATE : T.BOOKSHELF, 1));
  }
  return { cells, w: length, d: 1, where: 'wall' };
};

// --- Geometry --------------------------------------------------------------------------------------------------------

const key = (x: number, z: number): string => `${x},${z}`;

/** An offset turned `turns` quarter turns clockwise seen from above: east becomes south. */
const turnOffset = (dx: number, dz: number, turns: number): [number, number] => {
  switch (turns & 3) {
    case 1: return [0 - dz, dx];
    case 2: return [0 - dx, 0 - dz];
    case 3: return [dz, 0 - dx];
    default: return [dx, dz];
  }
};

interface Candidate { x: number; z: number; back: Dir }

/** The furnisher over one blueprint. Cheap to make; `furnish` and `partition` are the two jobs. */
export class InteriorFurnisher {
  constructor(readonly bp: Blueprint, readonly style: StylePack = TEMPEST_STYLE) {}

  private resolve(block: number | Role): number {
    return typeof block === 'number' ? block : this.style.block(block);
  }

  private setCell(x: number, y: number, z: number, block: number | Role, state = 0): void {
    this.bp.set(x, y, z, packCell(this.resolve(block), state));
  }

  /**
   * Furnishes a room as `kind`. Returns what it placed and how much of the floor it left. Deterministic in `rng`.
   * The room's floor and walls are the caller's; this only adds what stands on the floor and hangs from the ceiling.
   */
  furnish(room: InteriorRoom, kind: RoomKind, rng: Rng): FurnishResult {
    const session = new Session(this, room, rng);
    RECIPES[kind](session);
    session.lights();
    return session.result();
  }

  /**
   * Splits the inside of a floor into rooms: partitions of shoji screens on timber posts, a doorway in each, then furnishes
   * every room. `kinds` lists the rooms wanted, most important first: the room the entrance opens into gets the first, the
   * biggest of the rest the next, and so on (the last kind repeats for any rooms left). Rooms are at least `minSize` across.
   * The partitions and doorways are built into the blueprint; the walls round `interior` are the caller's.
   */
  partition(
    interior: Rect, floorY: number, entrance: RoomDoor, kinds: readonly RoomKind[], rng: Rng,
    options: { ceilingY?: number; minSize?: number; furnishRooms?: boolean; maxRooms?: number } = {},
  ): Array<{ room: InteriorRoom; kind: RoomKind }> {
    const ceilingY = options.ceilingY ?? floorY + 4;
    const minSize = Math.max(3, options.minSize ?? 4);
    const maxRooms = options.maxRooms ?? kinds.length;
    // Doorways cut so far, as the cells just inside each side of the partition: rooms collect their doors from these.
    const doorways: Array<{ a: RoomDoor; b: RoomDoor }> = [];
    const leaves: Rect[] = [interior];
    const splittable = (r: Rect): boolean => Math.max(r.x1 - r.x0 + 1, r.z1 - r.z0 + 1) >= minSize * 2 + 1;
    const inRect = (r: Rect, x: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
    // Where a partition may stand in a room: not on a line through the entrance or a doorway already cut inside the room
    // (it would wall them in), and leaving minSize on each side. Returns the offsets from the room's west or north edge.
    const cuts = (r: Rect, alongX: boolean): number[] => {
      const len = alongX ? r.x1 - r.x0 + 1 : r.z1 - r.z0 + 1;
      const origin = alongX ? r.x0 : r.z0;
      const taken = new Set<number>();
      const note = (x: number, z: number): void => { if (inRect(r, x, z)) taken.add((alongX ? x : z) - origin); };
      note(entrance.x, entrance.z);
      for (const w of doorways) { note(w.a.x, w.a.z); note(w.b.x, w.b.z); }
      const out: number[] = [];
      for (let at = minSize; at <= len - minSize - 1; at++) {
        if (taken.has(at) || taken.has(at - 1) || taken.has(at + 1)) continue;
        out.push(at);
      }
      return out;
    };
    // Split the biggest room that can be split until there are enough rooms; a room that cannot be split is left whole.
    const failed = new Set<Rect>();
    while (leaves.length < maxRooms) {
      let pick = -1;
      for (let i = 0; i < leaves.length; i++) {
        if (failed.has(leaves[i]) || !splittable(leaves[i])) continue;
        if (pick < 0 || area(leaves[i]) > area(leaves[pick])) pick = i;
      }
      if (pick < 0) break;
      const r = leaves[pick];
      const w = r.x1 - r.x0 + 1;
      const d = r.z1 - r.z0 + 1;
      // The longer side first; the other when the first has no place for a wall.
      const order = w >= d ? [true, false] : [false, true];
      let options: number[] = [];
      let alongX = order[0];
      for (const axis of order) {
        const len = axis ? w : d;
        if (len < minSize * 2 + 1) continue;
        options = cuts(r, axis);
        if (options.length > 0) { alongX = axis; break; }
      }
      if (options.length === 0) { failed.add(r); continue; }
      leaves.splice(pick, 1);
      const len = alongX ? w : d;
      // Nearest the middle, with a little jitter from the generator.
      const want = Math.floor(len / 2) + rng.int(3) - 1;
      const at = options.reduce((best, o) => (Math.abs(o - want) < Math.abs(best - want) ? o : best), options[0]);
      if (alongX) {
        const px = r.x0 + at;
        this.wallLine(px, r.z0, px, r.z1, floorY, ceilingY);
        const dz = r.z0 + 1 + rng.int(d - 2);
        this.carveDoorway(px, dz, floorY);
        doorways.push({ a: { x: px - 1, z: dz, inward: WEST }, b: { x: px + 1, z: dz, inward: EAST } });
        leaves.push({ x0: r.x0, z0: r.z0, x1: px - 1, z1: r.z1 }, { x0: px + 1, z0: r.z0, x1: r.x1, z1: r.z1 });
      } else {
        const pz = r.z0 + at;
        this.wallLine(r.x0, pz, r.x1, pz, floorY, ceilingY);
        const dx = r.x0 + 1 + rng.int(w - 2);
        this.carveDoorway(dx, pz, floorY);
        doorways.push({ a: { x: dx, z: pz - 1, inward: NORTH }, b: { x: dx, z: pz + 1, inward: SOUTH } });
        leaves.push({ x0: r.x0, z0: r.z0, x1: r.x1, z1: pz - 1 }, { x0: r.x0, z0: pz + 1, x1: r.x1, z1: r.z1 });
      }
    }
    const inside = (r: Rect, x: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
    const rooms = leaves.map((rect): InteriorRoom => {
      const doors: RoomDoor[] = [];
      if (inside(rect, entrance.x, entrance.z)) doors.push(entrance);
      for (const w of doorways) {
        if (inside(rect, w.a.x, w.a.z)) doors.push(w.a);
        if (inside(rect, w.b.x, w.b.z)) doors.push(w.b);
      }
      return { rect, floorY, ceilingY, doors };
    });
    // Kinds: the entrance room first, then the others by size, biggest first.
    const entry = rooms.findIndex((r) => inside(r.rect, entrance.x, entrance.z));
    const order = rooms.map((_, i) => i).filter((i) => i !== entry)
      .sort((a, b) => area(rooms[b].rect) - area(rooms[a].rect) || a - b);
    const out: Array<{ room: InteriorRoom; kind: RoomKind }> = [];
    const assign = (i: number, n: number): void => { out.push({ room: rooms[i], kind: kinds[Math.min(n, kinds.length - 1)] }); };
    if (entry >= 0) assign(entry, 0);
    order.forEach((i, n) => assign(i, n + 1));
    if (options.furnishRooms !== false) for (const r of out) this.furnish(r.room, r.kind, rng.fork(r.room.rect.x0 * 31 + r.room.rect.z0));
    return out;
  }

  private wallLine(x0: number, z0: number, x1: number, z1: number, floorY: number, ceilingY: number): void {
    // Posts at both ends, timber at the foot and head, shoji between.
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const end = (x === x0 && z === z0) || (x === x1 && z === z1);
        for (let y = floorY + 1; y < ceilingY; y++) {
          if (end) this.setCell(x, y, z, 'post');
          else if (y === floorY + 1) this.setCell(x, y, z, 'beam');
          else if (y === ceilingY - 1) this.setCell(x, y, z, 'beam');
          else this.setCell(x, y, z, 'shoji');
        }
      }
    }
  }

  private carveDoorway(x: number, z: number, floorY: number): void {
    this.bp.set(x, floorY + 1, z, AIR_CELL);
    this.bp.set(x, floorY + 2, z, AIR_CELL);
    // The cell above the doorway keeps its lintel (the beam row or shoji above).
  }

  /** @internal for Session */
  place(x: number, y: number, z: number, block: number | Role, state: number): void {
    this.setCell(x, y, z, block, state);
  }

  /** @internal for Session: is there already something solid at a cell. */
  occupiedAt(x: number, y: number, z: number): boolean {
    const c = this.bp.get(x, y, z);
    return c !== -1 && c !== AIR_CELL && (c & 0xfff) !== T.TATAMI;
  }

  /** @internal */
  solidAt(x: number, y: number, z: number): boolean {
    return this.bp.solid(x, y, z);
  }

  /** @internal */
  block(role: Role): number {
    return this.style.block(role);
  }
}

const area = (r: Rect): number => (r.x1 - r.x0 + 1) * (r.z1 - r.z0 + 1);

/** The one-call API for kits: furnishes `room` of `blueprint` as `kind`. */
export const furnish = (blueprint: Blueprint, room: InteriorRoom, kind: RoomKind, rng: Rng, style: StylePack = TEMPEST_STYLE): FurnishResult =>
  new InteriorFurnisher(blueprint, style).furnish(room, kind, rng);

// --- A furnishing session: one room, one kind ------------------------------------------------------------------------

class Session {
  readonly r: Rect;
  private readonly w: number;
  private readonly d: number;
  private readonly occupied: Uint8Array;
  private readonly reserved: Uint8Array;
  private readonly placed: Placed[] = [];
  private readonly hung: Placed[] = [];
  private readonly ceilingY: number;
  private readonly floorY: number;

  constructor(readonly f: InteriorFurnisher, readonly room: InteriorRoom, readonly rng: Rng) {
    this.r = room.rect;
    this.w = this.r.x1 - this.r.x0 + 1;
    this.d = this.r.z1 - this.r.z0 + 1;
    this.occupied = new Uint8Array(this.w * this.d);
    this.reserved = new Uint8Array(this.w * this.d);
    this.floorY = room.floorY;
    this.ceilingY = room.ceilingY ?? room.floorY + 4;
    // What is there already (a hearth the kit built, a pillar) is in the way; so is the cell above the floor row if solid.
    for (let z = this.r.z0; z <= this.r.z1; z++) for (let x = this.r.x0; x <= this.r.x1; x++) {
      if (f.occupiedAt(x, this.floorY + 1, z)) this.occupied[this.idx(x, z)] = 1;
    }
    // The doorway's path: the cell inside and two more along it, and the cells beside the first two.
    for (const door of room.doors) {
      for (let k = 0; k <= 2; k++) {
        const cx = door.x + DX[door.inward] * k;
        const cz = door.z + DZ[door.inward] * k;
        this.reserve(cx, cz);
        if (k <= 1) {
          this.reserve(cx + DX[(door.inward + 1) & 3], cz + DZ[(door.inward + 1) & 3]);
          this.reserve(cx + DX[(door.inward + 3) & 3], cz + DZ[(door.inward + 3) & 3]);
        }
      }
    }
  }

  get area(): number { return this.w * this.d; }
  get width(): number { return this.w; }
  get depth(): number { return this.d; }

  private idx(x: number, z: number): number { return (z - this.r.z0) * this.w + (x - this.r.x0); }
  private inside(x: number, z: number): boolean { return x >= this.r.x0 && x <= this.r.x1 && z >= this.r.z0 && z <= this.r.z1; }
  private reserve(x: number, z: number): void { if (this.inside(x, z)) this.reserved[this.idx(x, z)] = 1; }

  /** Marks cells as taken without placing anything (a recipe that builds by hand). */
  occupy(x: number, z: number): void { if (this.inside(x, z)) this.occupied[this.idx(x, z)] = 1; }
  isFree(x: number, z: number): boolean { return this.inside(x, z) && !this.occupied[this.idx(x, z)] && !this.reserved[this.idx(x, z)]; }
  /** Inside the room and not on a door's path; the cell may already hold something this recipe placed (a platform to stand on). */
  usable(x: number, z: number): boolean { return this.inside(x, z) && !this.reserved[this.idx(x, z)]; }

  set(x: number, dy: number, z: number, block: number | Role, state = 0): void {
    this.f.place(x, this.floorY + 1 + dy, z, block, state);
    this.placed.push({ x, y: this.floorY + 1 + dy, z });
  }

  /** The room's inner side nearest a point, for recipes that want the far wall: the wall opposite the first door. */
  farSide(): Dir {
    const door = this.room.doors[0];
    return door ? door.inward : NORTH;
  }

  // Do the free cells stay joined? Every door cell must be reachable from the others, and most free cells from the first.
  private connected(extra: ReadonlySet<number>): boolean {
    const free: number[] = [];
    for (let i = 0; i < this.occupied.length; i++) if (!this.occupied[i] && !extra.has(i)) free.push(i);
    if (free.length === 0) return false;
    const start = this.room.doors.length > 0 ? this.idx(this.room.doors[0].x, this.room.doors[0].z) : free[0];
    if (this.occupied[start] || extra.has(start)) return false;
    const seen = new Uint8Array(this.occupied.length);
    const stack = [start];
    seen[start] = 1;
    let count = 0;
    while (stack.length) {
      const i = stack.pop()!;
      count++;
      const x = i % this.w;
      const z = Math.floor(i / this.w);
      const push = (nx: number, nz: number): void => {
        if (nx < 0 || nz < 0 || nx >= this.w || nz >= this.d) return;
        const j = nz * this.w + nx;
        if (seen[j] || this.occupied[j] || extra.has(j)) return;
        seen[j] = 1;
        stack.push(j);
      };
      push(x + 1, z); push(x - 1, z); push(x, z + 1); push(x, z - 1);
    }
    for (const door of this.room.doors) if (!seen[this.idx(door.x, door.z)]) return false;
    return count >= Math.floor(free.length * 0.7);
  }

  /** Cells of a piece standing at a candidate: [world x, world z, dy, block, state] after turning. */
  private cellsOf(piece: Piece, c: Candidate): Array<[number, number, PieceCell, number]> {
    const turns = c.back; // authored with the back to the north: turn so the back faces c.back
    const out: Array<[number, number, PieceCell, number]> = [];
    let minX = Infinity;
    let minZ = Infinity;
    const raw = piece.cells.map((pc) => turnOffset(pc.dx, pc.dz, turns));
    // The footprint box's corners, so the anchor is the box's minimum corner whatever the turn.
    for (const [x, z] of [turnOffset(0, 0, turns), turnOffset(piece.w - 1, piece.d - 1, turns)]) { minX = Math.min(minX, x); minZ = Math.min(minZ, z); }
    piece.cells.forEach((pc, i) => {
      const [rx, rz] = raw[i];
      const state = turnState(this.f.bp, this.f, pc, turns);
      out.push([c.x + rx - minX, c.z + rz - minZ, pc, state]);
    });
    return out;
  }

  /** The turned footprint box of a piece at a candidate: x0, z0, x1, z1. */
  private boxOf(piece: Piece, c: Candidate): Rect {
    const a = turnOffset(0, 0, c.back);
    const b = turnOffset(piece.w - 1, piece.d - 1, c.back);
    const w = Math.abs(a[0] - b[0]);
    const d = Math.abs(a[1] - b[1]);
    return { x0: c.x, z0: c.z, x1: c.x + w, z1: c.z + d };
  }

  /** Tries to place one piece; true when it fit. */
  add(piece: Piece): boolean {
    const candidates: Candidate[] = [];
    for (const back of [NORTH, EAST, SOUTH, WEST] as const) {
      const a = turnOffset(0, 0, back);
      const b = turnOffset(piece.w - 1, piece.d - 1, back);
      const bw = Math.abs(a[0] - b[0]) + 1;
      const bd = Math.abs(a[1] - b[1]) + 1;
      for (let z = this.r.z0; z + bd - 1 <= this.r.z1; z++) {
        for (let x = this.r.x0; x + bw - 1 <= this.r.x1; x++) {
          const box = { x0: x, z0: z, x1: x + bw - 1, z1: z + bd - 1 };
          const touchN = box.z0 === this.r.z0;
          const touchS = box.z1 === this.r.z1;
          const touchW = box.x0 === this.r.x0;
          const touchE = box.x1 === this.r.x1;
          const touches = (touchN ? 1 : 0) + (touchS ? 1 : 0) + (touchW ? 1 : 0) + (touchE ? 1 : 0);
          const backTouch = back === NORTH ? touchN : back === SOUTH ? touchS : back === WEST ? touchW : touchE;
          if (piece.where === 'wall' && !backTouch) continue;
          if (piece.where === 'corner' && !(backTouch && touches >= 2)) continue;
          if (piece.where === 'center' && touches > 0) continue;
          candidates.push({ x, z, back });
        }
      }
    }
    // A random order from the room's generator, so the same room always gets the same arrangement.
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1);
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const limit = Math.min(candidates.length, 60);
    for (let n = 0; n < limit; n++) {
      const c = candidates[n];
      const cells = this.cellsOf(piece, c);
      let ok = true;
      const extra = new Set<number>();
      for (const [x, z] of cells) {
        if (!this.inside(x, z) || this.occupied[this.idx(x, z)] || this.reserved[this.idx(x, z)]) { ok = false; break; }
        extra.add(this.idx(x, z));
      }
      if (!ok) continue;
      // The reach: the cells straight out from the front of the piece, inside the room, are free.
      const reach = piece.reach ?? 1;
      const box = this.boxOf(piece, c);
      if (reach > 0 && !this.reachFree(box, c.back, reach, extra)) continue;
      // Pieces with no floor cells (a scroll) never cut the room.
      const floor = cells.filter(([, , pc]) => (pc.dy ?? 0) === 0);
      const floorCells = new Set<number>();
      for (const [x, z] of floor) floorCells.add(this.idx(x, z));
      if (floorCells.size > 0 && !this.connected(floorCells)) continue;
      for (const [x, z, pc, state] of cells) {
        this.set(x, pc.dy ?? 0, z, pc.block, state);
        if ((pc.dy ?? 0) === 0) this.occupy(x, z);
      }
      return true;
    }
    return false;
  }

  private reachFree(box: Rect, back: Dir, reach: number, own: ReadonlySet<number>): boolean {
    // The front is opposite the back. Check the cells along the front edge: at least one has `reach` free cells straight out.
    const front = opposite(back);
    const cells: Array<[number, number]> = [];
    if (front === SOUTH) for (let x = box.x0; x <= box.x1; x++) cells.push([x, box.z1]);
    else if (front === NORTH) for (let x = box.x0; x <= box.x1; x++) cells.push([x, box.z0]);
    else if (front === EAST) for (let z = box.z0; z <= box.z1; z++) cells.push([box.x1, z]);
    else for (let z = box.z0; z <= box.z1; z++) cells.push([box.x0, z]);
    return cells.some(([x, z]) => {
      for (let k = 1; k <= reach; k++) {
        const nx = x + DX[front] * k;
        const nz = z + DZ[front] * k;
        if (!this.inside(nx, nz) || this.occupied[this.idx(nx, nz)] || own.has(this.idx(nx, nz))) return false;
      }
      return true;
    });
  }

  /** Adds up to `n` of a piece, returns how many went in. */
  many(piece: Piece, n: number): number {
    let done = 0;
    for (let i = 0; i < n; i++) if (this.add(piece)) done++;
    return done;
  }

  /** Free cells along a wall side, as [x, z] from one end to the other (for recipes that build lines by hand). */
  wallCells(side: Dir): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    if (side === NORTH || side === SOUTH) { const z = side === NORTH ? this.r.z0 : this.r.z1; for (let x = this.r.x0; x <= this.r.x1; x++) out.push([x, z]); }
    else { const x = side === WEST ? this.r.x0 : this.r.x1; for (let z = this.r.z0; z <= this.r.z1; z++) out.push([x, z]); }
    return out;
  }

  /**
   * Lights: paper lanterns hanging from the ceiling, spread over the room by farthest point, never over a doorway's path.
   * A room with a ceiling at least four above the floor gets them at floorY + 3 (or the height the ceiling allows, with a
   * cord of bamboo up to it); a low room gets none from here (the recipes put lanterns on tables).
   */
  lights(): void {
    const n = Math.max(1, Math.round(this.area / 18));
    const height = this.ceilingY - this.floorY;
    if (height < 4) return;
    const candidates: Array<[number, number]> = [];
    for (let z = this.r.z0; z <= this.r.z1; z++) for (let x = this.r.x0; x <= this.r.x1; x++) {
      if (this.reserved[this.idx(x, z)]) continue;
      if (!this.f.solidAt(x, this.ceilingY, z)) continue;
      // The cells the lamp and its cord take must be empty (not a banner, not a beam).
      let clear = true;
      for (let y = this.floorY + 3; y < this.ceilingY; y++) if (this.f.occupiedAt(x, y, z)) clear = false;
      if (clear) candidates.push([x, z]);
    }
    if (candidates.length === 0) return;
    const chosen: Array<[number, number]> = [];
    const cx = (this.r.x0 + this.r.x1) / 2;
    const cz = (this.r.z0 + this.r.z1) / 2;
    const first = candidates.reduce((best, c) => (Math.hypot(c[0] - cx, c[1] - cz) < Math.hypot(best[0] - cx, best[1] - cz) ? c : best));
    chosen.push(first);
    while (chosen.length < n) {
      let best: [number, number] | null = null;
      let bestD = 2.5;
      for (const c of candidates) {
        let d = Infinity;
        for (const o of chosen) d = Math.min(d, Math.hypot(c[0] - o[0], c[1] - o[1]));
        // Prefer the middle of the free space; break ties by the generator's choice of which candidate comes first.
        if (d > bestD) { bestD = d; best = c; }
      }
      if (!best) break;
      chosen.push(best);
    }
    // A tall room hangs its lamps lower, on longer cords, so they are seen from the floor: three blocks under the ceiling, at
    // most five over the floor.
    const lampY = Math.max(this.floorY + 3, Math.min(this.floorY + 5, this.ceilingY - 3));
    chosen.forEach(([x, z], i) => {
      // A cord of bamboo from the ceiling down to the lantern when the ceiling is higher than one cell above it.
      for (let y = lampY + 1; y < this.ceilingY; y++) this.f.place(x, y, z, T.BAMBOO_POLE, 0);
      this.f.place(x, lampY, z, i % 3 === 2 ? 'lightAlt' : 'light', 0);
      this.hung.push({ x, y: lampY, z });
    });
  }

  result(): FurnishResult {
    let free = 0;
    for (let i = 0; i < this.occupied.length; i++) if (!this.occupied[i]) free++;
    return { items: this.placed, lights: this.hung, free, reachable: this.reachableCount() };
  }

  private reachableCount(): number {
    const door = this.room.doors[0];
    if (!door) return 0;
    const start = this.idx(door.x, door.z);
    if (this.occupied[start]) return 0;
    const seen = new Uint8Array(this.occupied.length);
    const stack = [start];
    seen[start] = 1;
    let count = 0;
    while (stack.length) {
      const i = stack.pop()!;
      count++;
      const x = i % this.w;
      const z = Math.floor(i / this.w);
      for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
        if (nx < 0 || nz < 0 || nx >= this.w || nz >= this.d) continue;
        const j = nz * this.w + nx;
        if (seen[j] || this.occupied[j]) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    return count;
  }
}

/** The state of a piece cell turned with the piece. */
const turnState = (_bp: Blueprint, f: InteriorFurnisher, pc: PieceCell, turns: number): number => {
  const id = typeof pc.block === 'number' ? pc.block : f.block(pc.block);
  return turnCell(packCell(id, pc.state ?? 0), turns) >> 12;
};

// --- The recipes -----------------------------------------------------------------------------------------------------

type Recipe = (s: Session) => void;

const smallRoom = (s: Session): boolean => s.area < 20 || Math.min(s.width, s.depth) < 4;

const RECIPES: Record<RoomKind, Recipe> = {
  living: (s) => {
    if (smallRoom(s)) s.add(TABLE_PAIR); else s.add(TABLE_SET);
    s.add(HEARTH);
    s.many(BOOKSHELF, Math.max(1, Math.floor(s.area / 30)));
    s.add(VASE);
    s.add(s.rng.chance(0.5) ? PLANTER : BAMBOO_POT);
    s.many(SCROLL, 2);
    if (s.area >= 30) s.add(LAMP_TABLE);
    s.add(CUSHION);
  },
  bedroom: (s) => {
    s.many(BED, 1 + Math.floor(s.area / 24));
    s.add(LAMP_TABLE);
    s.add(BOOKSHELF);
    s.add(VASE);
    s.add(PLANTER);
    s.many(SCROLL, 1);
    if (s.area >= 20) s.add(TABLE_PAIR);
  },
  kitchen: (s) => {
    s.add(row([T.HEARTH, T.HEARTH]));
    s.many(BARREL_STACK, 1 + Math.floor(s.area / 20));
    s.many(RICE, 1 + Math.floor(s.area / 25));
    s.many(BUCKET, 2);
    s.many(CRATE_STACK, Math.floor(s.area / 20));
    s.add(BOOKSHELF_LOW);
    if (!smallRoom(s)) s.add(TABLE_SET);
    s.add(VASE);
  },
  shop: (s) => {
    const span = Math.max(3, Math.min(s.width, s.depth) - 2, 3);
    const long = Math.max(s.width, s.depth);
    s.add(counterPiece(Math.min(long - 2, Math.max(3, span + 1))));
    s.many(goodsRow(Math.max(2, Math.min(4, Math.floor(long / 2))), s.rng), 1 + Math.floor(s.area / 30));
    s.many(BARREL_STACK, 1 + Math.floor(s.area / 30));
    s.many(RICE, 1);
    s.many(SCROLL, 2);
    s.add(PLANTER);
  },
  storage: (s) => {
    s.many(CRATE_STACK, Math.max(2, Math.floor(s.area / 6)));
    s.many(BARREL_STACK, Math.max(2, Math.floor(s.area / 9)));
    s.many(RICE, Math.max(1, Math.floor(s.area / 10)));
    s.add(BOOKSHELF);
    s.many(BUCKET, 1);
    s.add(CRATE);
  },
  study: (s) => {
    s.many(BOOKSHELF, 2 + Math.floor(s.area / 20));
    s.add(smallRoom(s) ? TABLE_PAIR : TABLE_SET);
    s.add(LAMP_TABLE);
    s.many(SCROLL, 3);
    s.add(PLANTER);
    s.add(VASE);
  },
  inn: (s) => {
    s.many(TABLE_SET, Math.max(1, Math.floor(s.area / 28)));
    s.add(HEARTH);
    s.add(counterPiece(Math.max(3, Math.min(5, Math.max(s.width, s.depth) - 3))));
    s.many(BARREL_STACK, 1 + Math.floor(s.area / 40));
    s.many(LAMP_TABLE, 2);
    s.many(SCROLL, 2);
    s.many(PLANTER, 1);
  },
  lobby: (s) => {
    s.many(PLANTER, 2);
    s.many(BAMBOO_POT, 1);
    s.many(row([WOODDARKSLAB, WOODDARKSLAB, WOODDARKSLAB]), 1 + Math.floor(s.area / 40));
    s.many(SCROLL, 3);
    s.add(VASE);
    s.add(LAMP_TABLE);
  },
  barracks: (s) => {
    s.many(BED, Math.max(2, Math.floor(s.area / 8)));
    s.many(CRATE_STACK, 2);
    s.many(BARREL, 1);
    s.add(HEARTH);
    s.add(TABLE_SET);
    s.many(SCROLL, 2);
  },
  council: (s) => {
    councilRoom(s);
  },
  forge: (s) => {
    s.add(FURNACE);
    s.add(ANVIL);
    s.many(COAL, 3);
    s.many(BARREL, 2);
    s.many(BUCKET, 2);
    s.many(CRATE_STACK, 2);
    s.many(RICE, 1);
    s.add(BOOKSHELF);
    s.many(SCROLL, 1);
  },
  weaving: (s) => {
    s.many(LOOM, Math.max(1, Math.floor(s.area / 30)));
    s.many(RICE, 2);
    s.many(BUCKET, 3);
    s.add(TABLE_SET);
    s.add(BOOKSHELF);
    s.many(PLANTER, 1);
    s.many(SCROLL, 2);
  },
};

/**
 * The council hall: a dais against the far wall, opposite the first door, with a high seat and banners behind it, a long
 * table down the middle with a chair at every place, braziers at the front corners of the dais and scrolls along the walls.
 * What would fall on a cell the door's path needs is left out.
 */
const councilRoom = (s: Session): void => {
  // A room too small for a dais and a table is furnished as a study instead.
  if (s.width < 9 || s.depth < 7) { RECIPES.study(s); return; }
  const r = s.r;
  const far = s.farSide();
  const horizontal = far === NORTH || far === SOUTH;
  const along = horizontal ? s.width : s.depth;
  const depth = horizontal ? s.depth : s.width;
  const dw = Math.max(3, Math.min(along - 4, (Math.floor(along * 0.5) | 1)));
  const dd = depth >= 11 ? 3 : 2;
  const mid = horizontal ? Math.floor((r.x0 + r.x1) / 2) : Math.floor((r.z0 + r.z1) / 2);
  // t runs along the far wall from its middle, k out from the wall towards the room.
  const cellAt = (t: number, k: number): [number, number] => {
    if (far === NORTH) return [mid + t, r.z0 + k];
    if (far === SOUTH) return [mid + t, r.z1 - k];
    if (far === WEST) return [r.x0 + k, mid + t];
    return [r.x1 - k, mid + t];
  };
  const half = Math.floor(dw / 2);
  const axis = horizontal ? 0 : 1;
  const put = (t: number, k: number, dy: number, block: number | Role, state = 0, occupy = true): void => {
    const [x, z] = cellAt(t, k);
    if (!s.isFree(x, z)) return;
    s.set(x, dy, z, block, state);
    if (occupy && dy === 0) s.occupy(x, z);
  };
  const onDais = (t: number, k: number, dy: number, block: number | Role, state = 0): void => {
    const [x, z] = cellAt(t, k);
    if (!s.usable(x, z)) return;
    s.set(x, dy, z, block, state);
  };
  for (let t = -half; t <= half; t++) for (let k = 0; k < dd; k++) put(t, k, 0, T.VERMILION_PLANKS);
  // Three steps across the front of the dais, climbing towards the far wall.
  for (const t of [-1, 0, 1]) put(t, dd, 0, WOODSTAIRS, stairState(far, false));
  // The high seat against the wall, its tall back to it, with a lacquered post behind the sitter's head.
  onDais(0, 0, 1, WOODSTAIRS, stairState(far, false));
  onDais(0, 0, 2, T.VERMILION_LOG);
  // Banners on the wall behind the dais.
  for (let t = -half; t <= half; t += 2) {
    if (t === 0) continue;
    onDais(t, 0, 3, T.NOREN_RED, axis);
    onDais(t, 0, 2, T.NOREN_RED, axis);
  }
  // Braziers at the dais's front corners.
  for (const t of [-half, half]) onDais(t, dd - 1, 1, T.HEARTH);
  // The long table down the middle (slabs in the upper half, held by the chairs beside it) and a chair at every place.
  const tableLen = Math.max(3, Math.min(along - 4, depth - dd - 6));
  const near = dd + 2;
  for (let k = near; k < near + tableLen; k++) {
    put(0, k, 0, WOODDARKSLAB, 1);
    put(-1, k, 0, WOODSTAIRS, stairState(horizontal ? WEST : NORTH, false));
    put(1, k, 0, WOODSTAIRS, stairState(horizontal ? EAST : SOUTH, false));
  }
  // Scrolls along the side walls, plants by the dais.
  s.many(SCROLL, Math.max(2, Math.floor(s.area / 40)));
  s.many(PLANTER, 2);
  s.many(BAMBOO_POT, 1);
};
