import { NatureBlock } from '../../../content/blocksNature';
import { ShapedBlock } from '../../../content/blocksShaped';
import { TempestBlock as T } from '../../../content/blocksTempest';
import { BlockType } from '../../../worldConstants';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, Dir, EAST, NORTH, SOUTH, WEST, rect } from '../../structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../structures/BuildingKit';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';
import { FLARED } from '../../structures/roofProfile';
import {
  Rect, bays, chimneyStack, eaveBrackets, furnishRoom, hangingSign, mirrorX, pent, planter, postCoords, roofOver, setOnWall, stairDoors, staircase, windowRow,
} from './parts';

// The workshop: where the town makes things. The production sector of the plan is a quarter of these, and the glow of the forge
// in an open bay, the long lit windows of the weaving hall and the stacks of logs in the yard are what a walker sees there.
//   variant 0  the forge: an open timber hall under a gable roof, a furnace of cobble at the back with its fire-box glowing in the
//              doorway, an anvil and a quenching basin under the lean-to, a chimney through the roof
//   variant 1  the smithy: two storeys of stone and plaster under a hip roof, big double doors, the forge below with the same glow
//              and a loft above, a stone chimney standing against the side wall
//   variant 2  the weaving hall: a long hall with its gable to the street, a ribbon of lit paper windows down both sides, dyed
//              cloth hung from the eaves, looms inside
//   variant 3  the lumber yard: an open shed on posts over saw trestles and stacked boards, piles of logs in a fenced yard
export class WorkshopKit extends BuildingKit {
  readonly name = 'workshop';
  readonly frontage: KitSize = { min: 9, max: 17 };
  readonly depth: KitSize = { min: 13, max: 22 };
  readonly floors: KitSize = { min: 1, max: 2 };
  readonly variants = 4;

  preferredSize(variant = 0): { frontage: number; depth: number; floors: number } {
    switch (variant) {
      case 1: return { frontage: 13, depth: 17, floors: 2 };
      case 2: return { frontage: 11, depth: 19, floors: 1 };
      case 3: return { frontage: 15, depth: 17, floors: 1 };
      default: return { frontage: 13, depth: 16, floors: 1 };
    }
  }

  build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const W = lot.frontage;
    const mirror = rng.chance(0.5);
    const flip = rng.chance(0.5);
    const lanterns = rng.chance(0.7);
    switch (variant) {
      case 1: smithy(b, lot, flip, lanterns); break;
      case 2: weavingHall(b, lot, flip, lanterns); break;
      case 3: lumberYard(b, lot, flip, rng); break;
      default: forge(b, lot, flip, lanterns);
    }
    b.treeSpot(1, 1, 'any');
    b.treeSpot(W - 2, 1, 'any');
    const bp = b.build();
    return mirror ? mirrorX(bp, W) : bp;
  }
}

/** Rows in front of the furnace's back wall that stay bare for the furnisher: the fire-box, the anvil and the way between. */
const FURNACE_DEPTH = 4;

/**
 * A furnace against the back wall of a room: a block of cobble three wide and three high, a fire-box glowing in its face with a
 * hearth either side, an anvil a little way out. `x` is the west column of the furnace, `floorY` the floor row. Returns the
 * rectangle round it that nothing else may stand in.
 */
const furnace = (b: BlueprintBuilder, inner: Rect, floorY: number, x: number): Rect => {
  const z = inner.z0;
  for (let k = 1; k <= 3; k++) for (let dx = 0; dx < 3; dx++) b.set(x + dx, floorY + k, z, BlockType.COBBLESTONE);
  b.set(x + 1, floorY + 1, z + 1, T.STONE_LANTERN_LIGHT);
  b.set(x, floorY + 1, z + 1, T.HEARTH);
  b.set(x + 2, floorY + 1, z + 1, T.HEARTH);
  if (z + 3 <= inner.z1 - 1) {
    b.set(x + 1, floorY + 1, z + 3, BlockType.IRON_BLOCK);
    b.set(x + 1, floorY + 2, z + 3, ShapedBlock.STONE_BRICK_SLAB, 1);
  }
  return rect(x - 1, z, x + 3, Math.min(inner.z1, z + FURNACE_DEPTH - 1));
};

/** Posts a wall of this span in bays about four across. */
const spacingFor = (walls: Rect): number => {
  const ww = walls.x1 - walls.x0;
  return ww % 4 === 0 ? 4 : ww % 3 === 0 ? 3 : 4;
};

// --- variant 0: the forge --------------------------------------------------------------------------------------------------

const forge = (b: BlueprintBuilder, lot: Lot, flip: boolean, lanterns: boolean): void => {
  const W = lot.frontage;
  const D = lot.depth;
  const PLATE = 6;
  const side = W > 13 ? 1 : 0;
  const walls = rect(1 + side, 2, W - 2 - side, D - 1 - 4);
  const inner = rect(walls.x0 + 1, walls.z0 + 1, walls.x1 - 1, walls.z1 - 1);
  const spacing = spacingFor(walls);
  const z1 = walls.z1;

  b.floor(walls, 0, 'wallBase');
  b.floor(inner, 0, 'path');
  b.ring(walls, 1, 1, 'wallBase');
  b.frame(walls, 2, PLATE - 1, { panel: 'wall', post: 'post', spacing });
  b.beamRing(walls, PLATE, 'beam');
  // The front: lit screens in the side bays, the middle bay open from the floor to a lintel, so the fire shows from the street.
  const front = bays(walls, SOUTH, spacing);
  const centre = Math.floor((front.length - 1) / 2);
  front.forEach((bay, i) => {
    if (i === centre) {
      for (let t = bay.from; t <= bay.to; t++) {
        for (let y = 1; y <= 4; y++) b.carve(t, y, z1);
        b.set(t, 4, z1, 'accent');
      }
    } else {
      b.opening(walls, { side: SOUTH, at: bay.at, y: 2, width: bay.len, height: 3, kind: 'shoji', lit: true, sill: 'wallBase' });
    }
  });
  const doorBay = front[centre];
  const doorX = walls.x0 + doorBay.at + (doorBay.len >> 1);
  b.mark({ kind: 'door', x: doorX, y: 1, z: z1, facing: SOUTH });
  for (const wall of [EAST, WEST, NORTH] as Dir[]) windowRow(b, walls, wall, spacing, { y: 3, height: 2, kind: 'lattice', width: 2 });

  const info = roofOver(b, walls, PLATE, { kind: 'gable-x', profile: FLARED, tips: 2, gableWall: 'wallFrame' });
  eaveBrackets(b, walls, PLATE, [NORTH], spacing);
  // The lean-to over the yard, on posts, with lanterns under its lip.
  pent(b, walls, SOUTH, walls.x0, walls.x1, PLATE, 3, { postFrom: 1, postEvery: spacing, lanterns });
  b.floor(rect(walls.x0, z1 + 1, walls.x1, z1 + 3), 0, 'path');
  hangingSign(b, doorX + 1, PLATE - 2, z1 + 3, WEST);

  // The furnace in the middle of the back wall, and its chimney through the roof.
  const cx = (inner.x0 + inner.x1) >> 1;
  const keep = furnace(b, inner, 0, cx - 1);
  chimneyStack(b, cx, inner.z0, 4, info.crestTop + 1);
  const room = b.room(inner, 0, { floor: 'path', doors: [{ x: doorX, z: z1 - 1, inward: NORTH }] });
  furnishRoom(b, room, 'store', { keepClear: [keep] });
  // The yard: a quenching basin, an anvil on a block, a barrel and a heap of coal against the wall.
  const dir = flip ? -1 : 1;
  const bx = flip ? walls.x1 - 1 : walls.x0 + 1;
  b.set(bx, 1, z1 + 1, T.STONE_BASIN);
  b.set(bx + 2 * dir, 1, z1 + 2, BlockType.IRON_BLOCK);
  b.set(bx + 2 * dir, 2, z1 + 2, ShapedBlock.STONE_BRICK_SLAB, 1);
  b.set(bx + dir, 1, z1 + 1, T.BARREL);
  const cxo = flip ? walls.x0 + 1 : walls.x1 - 1;
  b.set(cxo, 1, z1 + 1, BlockType.BASALT);
  b.set(cxo - dir, 1, z1 + 1, BlockType.BASALT);
  b.set(cxo, 2, z1 + 1, BlockType.BASALT);
};

// --- variant 1: the smithy -------------------------------------------------------------------------------------------------

const smithy = (b: BlueprintBuilder, lot: Lot, flip: boolean, lanterns: boolean): void => {
  const W = lot.frontage;
  const D = lot.depth;
  const FLOOR = 1;
  const PLATE1 = 5;
  const PLATE2 = 9;
  const walls = rect(2, 2, W - 3, D - 3 - 1);
  const ww = walls.x1 - walls.x0;
  const wd = walls.z1 - walls.z0;
  const storeys = lot.floors >= 2 && ww >= 8 && wd >= 8 ? 2 : 1;
  const inner = rect(walls.x0 + 1, walls.z0 + 1, walls.x1 - 1, walls.z1 - 1);
  const spacing = ww % 5 === 0 || ww > 11 ? 5 : 4;
  const z1 = walls.z1;

  b.floor(walls, 0, 'wallBase');
  b.ring(walls, 1, 1, 'wallBase');
  b.floor(inner, FLOOR, 'path');
  // Stone below, plaster above: a smith's house is built to stand a fire.
  b.frame(walls, 2, PLATE1 - 1, { panel: 'wallBase', post: 'post', spacing });
  b.beamRing(walls, PLATE1, 'beam');
  const front = bays(walls, SOUTH, spacing);
  const centre = Math.floor((front.length - 1) / 2);
  const doorBay = front[centre];
  const doorWidth = Math.min(doorBay.len, 3);
  const doorAt = doorBay.at + ((doorBay.len - doorWidth) >> 1);
  const doorX = walls.x0 + doorAt + (doorWidth >> 1);
  b.opening(walls, { side: SOUTH, at: doorAt, y: 2, width: doorWidth, height: 2, kind: 'door', noren: true });
  // The doors are framed in lacquer under a lattice transom.
  for (let t = 0; t < doorWidth; t++) setOnWall(b, walls, SOUTH, doorAt + t, 4, 'lattice');
  for (let t = -1; t <= doorWidth; t++) setOnWall(b, walls, SOUTH, doorAt + t, 5 - 0, 'accent');
  for (const t of [doorAt - 1, doorAt + doorWidth]) for (let y = 2; y <= 4; y++) setOnWall(b, walls, SOUTH, t, y, 'accent');
  front.forEach((bay, i) => {
    if (i !== centre) b.opening(walls, { side: SOUTH, at: bay.at + (bay.len > 2 ? 1 : 0), y: 3, width: Math.min(bay.len, 2), height: 2, kind: 'shoji', lit: true, sill: 'wallBase' });
  });
  for (const wall of [EAST, WEST, NORTH] as Dir[]) windowRow(b, walls, wall, spacing, { y: 3, height: 2, kind: 'lattice', width: 2 });

  let top = PLATE1;
  if (storeys === 2) {
    top = PLATE2;
    b.floor(inner, PLATE1, 'interiorFloor');
    b.frame(walls, PLATE1 + 1, PLATE2 - 1, { panel: 'wall', post: 'post', spacing });
    b.beamRing(walls, PLATE2, 'beam');
    for (const wall of [SOUTH, EAST, WEST, NORTH] as Dir[]) {
      windowRow(b, walls, wall, spacing, { y: PLATE1 + 3, height: 2, kind: wall === SOUTH ? 'shoji' : 'lattice', lit: wall === SOUTH, width: wall === SOUTH ? 3 : 2, sill: 'trim' });
    }
  }
  const info = roofOver(b, walls, top, { kind: 'hip', profile: FLARED, tips: 2, gableWall: 'wallFrame' });
  eaveBrackets(b, walls, top, [NORTH, SOUTH, EAST, WEST], spacing);
  b.floor(rect(walls.x0, z1 + 1, walls.x1, D - 1), 0, 'path');
  for (let i = 0; i < doorWidth; i++) b.stair(walls.x0 + doorAt + i, FLOOR, z1 + 1, NORTH, 'stoneStairs');
  if (lanterns) {
    for (const lx of [walls.x0 + doorAt - 2, walls.x0 + doorAt + doorWidth + 1]) if (lx > walls.x0 && lx < walls.x1) b.stoneLantern(lx, 1, z1 + 2);
  }
  hangingSign(b, flip ? walls.x0 : walls.x1, 4, z1 + 1, SOUTH);

  // A stone chimney against the side wall, taller than the roof, with a glowing lantern in its throat.
  const chX = flip ? walls.x0 - 1 : walls.x1 + 1;
  const chZ = walls.z0 + 3;
  b.column(chX, chZ, 1, info.crestTop + 2, 'wallBase');
  b.set(chX, info.crestTop + 3, chZ, 'stoneSlab', 0);
  b.set(chX, FLOOR + 1, chZ + 1, T.STONE_LANTERN_LIGHT);

  // The forge inside: the furnace at one end of the back wall, the loft stair at the other.
  const fx = flip ? inner.x1 - 2 : inner.x0;
  const keep = furnace(b, inner, FLOOR, fx);
  const stairX = flip ? inner.x0 : inner.x1;
  const stairZ = inner.z0 + 4;
  const run = stairDoors(stairX, stairZ, NORTH, 4);
  const room = b.room(inner, FLOOR, { floor: 'path', doors: [{ x: doorX, z: z1 - 1, inward: NORTH }, ...(storeys === 2 ? run : [])] });
  furnishRoom(b, room, 'store', { keepClear: [keep] });
  if (storeys === 2) {
    const loft = b.room(inner, PLATE1, { doors: run });
    b.tatami(loft);
    furnishRoom(b, loft, 'living');
    b.set((inner.x0 + inner.x1) >> 1, PLATE1 - 1, (inner.z0 + inner.z1) >> 1, 'light');
    staircase(b, stairX, stairZ, NORTH, FLOOR, 4);
  }
  b.set((inner.x0 + inner.x1) >> 1, PLATE1 - 1, inner.z1 - 1, 'light');
};

// --- variant 2: the weaving hall -------------------------------------------------------------------------------------------

const weavingHall = (b: BlueprintBuilder, lot: Lot, flip: boolean, lanterns: boolean): void => {
  const W = lot.frontage;
  const D = lot.depth;
  const FLOOR = 1;
  const PLATE = 6;
  const side = W > 13 ? 1 : 0;
  const walls = rect(2 + side, 1, W - 3 - side, D - 2 - 1);
  const inner = rect(walls.x0 + 1, walls.z0 + 1, walls.x1 - 1, walls.z1 - 1);
  const spacing = (walls.z1 - walls.z0) % 5 === 0 || walls.z1 - walls.z0 > 11 ? 5 : 4;
  const z1 = walls.z1;

  b.floor(walls, 0, 'wallBase');
  b.ring(walls, 1, 1, 'wallBase');
  b.floor(inner, FLOOR, 'interiorFloor');
  b.frame(walls, 2, PLATE - 1, { panel: 'wallFrame', post: 'post', spacing });
  b.beamRing(walls, PLATE, 'beam');
  // The street front is the gable end: a wide door in the middle, a lit screen either side, a loft window in the gable.
  const frontSpan = walls.x1 - walls.x0 + 1;
  const doorWidth = frontSpan >= 9 ? 3 : 2;
  const doorAt = (frontSpan - doorWidth) >> 1;
  const doorX = walls.x0 + doorAt + (doorWidth >> 1);
  b.opening(walls, { side: SOUTH, at: doorAt, y: 2, width: doorWidth, height: 2, kind: 'door', noren: true });
  for (let t = 0; t < doorWidth; t++) setOnWall(b, walls, SOUTH, doorAt + t, 4, 'lattice');
  for (let i = -1; i <= doorWidth; i++) setOnWall(b, walls, SOUTH, doorAt + i, 5, 'accent');
  for (const t of [doorAt - 1, doorAt + doorWidth]) for (let y = 2; y <= 4; y++) setOnWall(b, walls, SOUTH, t, y, 'accent');
  for (const at of [1, frontSpan - 3]) {
    if (at > doorAt - 3 && at < doorAt + doorWidth + 2) continue;
    b.opening(walls, { side: SOUTH, at, y: 3, width: 2, height: 2, kind: 'shoji', lit: true, sill: 'trim' });
  }
  // The ribbon: lit paper windows right along both long sides, in every bay, three high.
  for (const wall of [EAST, WEST] as Dir[]) windowRow(b, walls, wall, spacing, { y: 3, height: 3, kind: 'shoji', lit: true, sill: 'wallBase' });
  windowRow(b, walls, NORTH, spacing, { y: 3, height: 2, kind: 'lattice', width: 2 });

  const info = roofOver(b, walls, PLATE, { kind: 'gable-z', profile: FLARED, tips: 2, gableWall: 'wallFrame' });
  eaveBrackets(b, walls, PLATE, [EAST, WEST], spacing);
  const cx = (walls.x0 + walls.x1) >> 1;
  if (info.gable) for (let k = 0; k < 2; k++) if (b.bp.has(cx, info.base + k, z1)) b.set(cx, info.base + k, z1, 'shojiLit');
  b.floor(rect(walls.x0, z1 + 1, walls.x1, D - 1), 0, 'path');
  for (let i = 0; i < doorWidth; i++) b.stair(walls.x0 + doorAt + i, FLOOR, z1 + 1, NORTH, 'stoneStairs');

  // Dyed cloth hung out to dry from the eaves along both sides: indigo, red and white, a cell outside the wall under the lip of the roof.
  const cloths = [T.NOREN_INDIGO, T.NOREN_RED, T.NOREN_WHITE];
  for (const x of [walls.x0 - 1, walls.x1 + 1]) {
    for (let z = walls.z0 + 2; z <= walls.z1 - 2; z += 2) {
      const cloth = cloths[(z + (x === walls.x0 - 1 ? 0 : 1)) % 3];
      b.set(x, PLATE - 1, z, cloth, 1);
      b.set(x, PLATE - 2, z, cloth, 1);
      if ((z >> 1) % 2 === 0) b.set(x, PLATE - 3, z, cloth, 1);
    }
  }
  if (lanterns) for (const lx of [walls.x0 + doorAt - 2, walls.x0 + doorAt + doorWidth + 1]) if (lx > walls.x0 && lx < walls.x1) b.set(lx, 4, z1 + 1, 'light');
  hangingSign(b, flip ? walls.x0 : walls.x1, 4, z1 + 1, SOUTH);

  const room = b.room(inner, FLOOR, { doors: [{ x: doorX, z: z1 - 1, inward: NORTH }] });
  furnishRoom(b, room, 'weaving');
  // Tie beams across the hall, and a lantern hung from each.
  for (const z of [inner.z0 + 2, (inner.z0 + inner.z1) >> 1, inner.z1 - 2]) {
    b.beam(walls.x0, z, walls.x1, z, PLATE, 'beam');
    b.set(cx, PLATE - 1, z, 'light');
  }
  planter(b, flip ? walls.x1 : walls.x0, 1, z1 + 1, 1, 'x');
};

// --- variant 3: the lumber yard --------------------------------------------------------------------------------------------

const lumberYard = (b: BlueprintBuilder, lot: Lot, flip: boolean, rng: Rng): void => {
  const W = lot.frontage;
  const D = lot.depth;
  const PLATE = 5;
  const walls = rect(2, 2, W - 3, Math.min(D - 1 - 5, 12));
  const inner = rect(walls.x0 + 1, walls.z0 + 1, walls.x1 - 1, walls.z1 - 1);
  const z1 = walls.z1;
  const spacing = 4;
  const logs = [BlockType.WOOD_LOG, NatureBlock.CEDAR_LOG];

  // The ground under the shed and the yard: packed earth and sawdust.
  b.floor(rect(1, 1, W - 2, D - 1), 0, 'path');
  b.floor(inner, 0, 'wallBase');
  // An open shed: a post at every corner and along both long sides, a beam on top of them, the gable roof over it.
  const xs = postCoords(walls.x0, walls.x1, spacing);
  const zs = postCoords(walls.z0, walls.z1, spacing);
  for (const x of xs) { b.column(x, walls.z0, 1, PLATE - 1, 'post'); b.column(x, walls.z1, 1, PLATE - 1, 'post'); }
  for (const z of zs) { b.column(walls.x0, z, 1, PLATE - 1, 'post'); b.column(walls.x1, z, 1, PLATE - 1, 'post'); }
  b.beamRing(walls, PLATE, 'beam');
  // A solid back wall of boards keeps the stacks from the weather.
  for (let x = walls.x0; x <= walls.x1; x++) for (let y = 1; y <= PLATE - 1; y++) b.setIfEmpty(x, y, walls.z0, 'wallFrame');
  roofOver(b, walls, PLATE, { kind: 'gable-x', profile: FLARED, tips: 2, gableWall: 'wallFrame' });
  eaveBrackets(b, walls, PLATE, [NORTH, SOUTH], spacing);

  // Seasoning stacks of logs and boards against the back wall and one side, in courses.
  const stackAt = (x: number, z: number, h: number, log: number): void => {
    for (let y = 1; y <= h; y++) b.set(x, y, z, y % 2 === 0 ? ShapedBlock.WOOD_PLANK_SLAB : log, 0);
  };
  for (let x = inner.x0; x <= inner.x1; x++) if (x % 3 !== 0) stackAt(x, inner.z0, 3, logs[(x >> 1) & 1]);
  const sideX = flip ? inner.x1 : inner.x0;
  for (let z = inner.z0 + 2; z <= inner.z1 - 2; z++) if ((z + 1) % 3 !== 0) stackAt(sideX, z, 2, logs[z & 1]);
  // A saw trestle in the middle: two fence posts under a log, a plank across.
  const tz = (inner.z0 + inner.z1 + 1) >> 1;
  const tx = (inner.x0 + inner.x1) >> 1;
  b.set(tx - 1, 1, tz, 'fence');
  b.set(tx + 1, 1, tz, 'fence');
  b.set(tx, 2, tz, logs[0]);
  b.set(tx - 1, 2, tz, ShapedBlock.WOOD_PLANK_SLAB, 0);
  b.set(tx + 1, 2, tz, ShapedBlock.WOOD_PLANK_SLAB, 0);
  // Lamps along the beams, so the shed glows after dark.
  for (const x of xs) {
    if (x <= walls.x0 || x >= walls.x1) continue;
    b.set(x, PLATE - 1, z1 - 1, 'light');
    b.set(x, PLATE - 1, walls.z0 + 1, 'lightAlt');
  }
  // The door marker stands in the middle bay of the open front.
  const doorX = (walls.x0 + walls.x1) >> 1;
  b.mark({ kind: 'door', x: doorX, y: 1, z: z1, facing: SOUTH });
  hangingSign(b, doorX + 1, PLATE - 2, z1 + 1, SOUTH);

  // The yard in front, fenced, with a gap for the cartway: piles of logs and a stump.
  const fz = D - 1;
  b.fence(1, fz, W - 2, fz, 1, 'fence');
  for (let x = doorX - 1; x <= doorX + 1; x++) b.clear(x, 1, fz);
  b.fence(1, z1 + 1, 1, fz, 1, 'fence');
  b.fence(W - 2, z1 + 1, W - 2, fz, 1, 'fence');
  const yardZ0 = z1 + 2;
  const piles = [[3, yardZ0], [W - 5, yardZ0 + 1], [flip ? W - 4 : 3, Math.min(fz - 3, yardZ0 + 3)]];
  for (const [px, pz] of piles) {
    if (px < 2 || px > W - 4 || pz >= fz - 1) continue;
    const h = 1 + rng.int(3);
    for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
      for (let y = 1; y <= h - (dx + dz > 1 ? 1 : 0); y++) b.set(px + dx, y, pz + dz, logs[(px + pz + y) & 1]);
    }
  }
  const stumpX = doorX + 3 > W - 4 ? doorX - 3 : doorX + 3;
  b.set(stumpX, 1, yardZ0, BlockType.WOOD_LOG);
  b.set(stumpX, 1, yardZ0 + 1, 'stoneSlab', 0);
  planter(b, flip ? 2 : W - 3, 1, fz - 1, 1, 'x');
};
