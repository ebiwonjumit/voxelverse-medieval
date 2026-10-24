import { NatureBlock } from '../../../content/blocksNature';
import { TempestBlock as T } from '../../../content/blocksTempest';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, Dir, EAST, NORTH, SOUTH, WEST, rect } from '../../structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../structures/BuildingKit';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';
import { FLARED, FLARED_TIGHT } from '../../structures/roofProfile';
import {
  Rect, RoomKind, bayWindow, bays, bench, eaveBrackets, furnishRoom, mirrorX, middleBay, pent, planter, roofOver, setOnWall, stairDoors, staircase, windowRow,
} from './parts';

// The public hall: the long buildings of the plan's public facilities strip, two storeys, a lot of windows, a yard in front.
//   variant 0  the school: a hip and gable roof with a lantern cupola on its crest, a balcony over the door, a flagpole and a fan-paved
//              schoolyard behind a low fence, rows of desks and shelves inside
//   variant 1  the clinic: a veranda all round the front and both ends under a hip roof, benches to wait on, beds of herbs in the
//              front garden, a waiting room below and wards above
//   variant 2  the barracks: a long gable hall under a lean-to canopy hung with red banners, a gravel training ground in front with
//              practice posts and a weapon rack behind a palisade, bunks inside
export class PublicHallKit extends BuildingKit {
  readonly name = 'public-hall';
  readonly frontage: KitSize = { min: 14, max: 34 };
  readonly depth: KitSize = { min: 15, max: 24 };
  readonly floors: KitSize = { min: 2, max: 3 };
  readonly variants = 3;

  preferredSize(variant = 0): { frontage: number; depth: number; floors: number } {
    return variant === 1 ? { frontage: 19, depth: 19, floors: 2 } : variant === 2 ? { frontage: 23, depth: 18, floors: 2 } : { frontage: 21, depth: 19, floors: 2 };
  }

  build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const W = lot.frontage;
    const D = lot.depth;
    const mirror = rng.chance(0.5);
    const lanterns = rng.chance(0.7);
    const FLOOR = 1;
    const PLATE1 = 5;
    const PLATE2 = 9;
    const yard = variant === 1 ? 4 : 5;
    const side = variant === 1 ? 4 : 2;
    const walls = rect(side, 2, W - 1 - side, D - 1 - yard);
    const ww = walls.x1 - walls.x0;
    const wd = walls.z1 - walls.z0;
    const inner = rect(walls.x0 + 1, walls.z0 + 1, walls.x1 - 1, walls.z1 - 1);
    const spacing = ww % 5 === 0 || ww > 17 ? 5 : ww % 4 === 0 ? 4 : 5;
    const z1 = walls.z1;
    const storeys = lot.floors >= 2 && wd >= 7 && ww >= 8 ? 2 : 1;
    const top = storeys === 2 ? PLATE2 : PLATE1;

    // The footing, the floor, the ground storey and the beam that carries the floor above.
    b.floor(walls, 0, 'wallBase');
    b.ring(walls, 1, 1, 'wallBase');
    b.floor(inner, FLOOR, 'interiorFloor');
    b.frame(walls, 2, PLATE1 - 1, { panel: variant === 2 ? 'wallFrame' : 'wall', post: 'post', spacing });
    b.beamRing(walls, PLATE1, 'beam');

    // The entrance: a wide door in the middle bay with a lattice transom and a lacquer frame, lit screens in the others.
    const front = bays(walls, SOUTH, spacing);
    const mid = middleBay(walls, SOUTH, spacing);
    const doorWidth = Math.min(mid.len, 3);
    const doorAt = mid.at + ((mid.len - doorWidth) >> 1);
    const doorX = walls.x0 + doorAt + (doorWidth >> 1);
    b.opening(walls, { side: SOUTH, at: doorAt, y: 2, width: doorWidth, height: 2, kind: 'door', noren: variant !== 0 });
    for (let t = 0; t < doorWidth; t++) setOnWall(b, walls, SOUTH, doorAt + t, 4, 'lattice');
    for (let t = -1; t <= doorWidth; t++) setOnWall(b, walls, SOUTH, doorAt + t, 5, 'accent');
    for (const t of [doorAt - 1, doorAt + doorWidth]) for (let y = 2; y <= 4; y++) setOnWall(b, walls, SOUTH, t, y, 'accent');
    for (const bay of front) if (bay.from !== mid.from) bayWindow(b, walls, bay, { y: 3, height: 2, kind: 'shoji', lit: true, width: Math.min(bay.len, 3), sill: 'trim' });
    for (const wall of [EAST, WEST, NORTH] as Dir[]) windowRow(b, walls, wall, spacing, { y: 3, height: 2, kind: wall === NORTH ? 'lattice' : 'shoji', lit: wall !== NORTH, width: 2, sill: 'trim' });

    // The upper storey: the same bays, lit.
    if (storeys === 2) {
      b.floor(inner, PLATE1, 'interiorFloor');
      b.frame(walls, PLATE1 + 1, PLATE2 - 1, { panel: variant === 2 ? 'wallFrame' : 'wall', post: 'post', spacing });
      b.beamRing(walls, PLATE2, 'beam');
      for (const wall of [SOUTH, EAST, WEST, NORTH] as Dir[]) {
        windowRow(b, walls, wall, spacing, { y: PLATE1 + 3, height: 2, kind: wall === NORTH ? 'lattice' : 'shoji', lit: wall !== NORTH, width: wall === SOUTH ? 3 : 2, sill: 'trim' });
      }
    }

    // The roof, and what stands on and under it, by variant.
    const kind = variant === 0 ? 'hip-gable' : variant === 1 ? 'hip' : 'gable-x';
    const info = roofOver(b, walls, top, { kind, profile: FLARED, tips: 2, gableWall: 'wallFrame' });
    eaveBrackets(b, walls, top, kind === 'gable-x' ? [NORTH, SOUTH] : [NORTH, SOUTH, EAST, WEST], spacing);
    const cx = (walls.x0 + walls.x1) >> 1;
    const stepsAt = walls.x0 + doorAt;

    if (variant === 0) {
      // A balcony over the door, and a lantern cupola on the crest: four posts, lit paper between them, a small hip roof.
      if (storeys === 2) {
        b.balcony(walls, PLATE1, SOUTH, walls.x0 + doorAt - 1, walls.x0 + doorAt + doorWidth, 1, { rail: true });
      }
      const crest = info.crestTop;
      const cup = rect(cx - 1, ((walls.z0 + walls.z1) >> 1) - 1, cx + 1, ((walls.z0 + walls.z1) >> 1) + 1);
      for (const [qx, qz] of [[cup.x0, cup.z0], [cup.x1, cup.z0], [cup.x0, cup.z1], [cup.x1, cup.z1]]) b.column(qx, qz, crest, crest + 3, 'post');
      for (const [qx, qz] of [[cx, cup.z0], [cx, cup.z1], [cup.x0, cup.z0 + 1], [cup.x1, cup.z0 + 1]]) {
        b.set(qx, crest + 1, qz, 'shojiLit');
        b.set(qx, crest + 2, qz, 'shojiLit');
      }
      b.floor(cup, crest + 4, 'beam');
      b.hip(cup, crest + 4, { profile: FLARED_TIGHT, tips: 2 });
      // The schoolyard: fan paving, a flagpole, stone lanterns by the steps.
      b.floor(rect(walls.x0 - 1, z1 + 1, walls.x1 + 1, D - 2), 0, 'pathAlt');
      for (let x = walls.x0 - 1; x <= walls.x1 + 1; x++) b.set(x, 0, D - 2, 'path');
      b.column(walls.x0 + 1 + (cx - walls.x0) / 2 | 0, z1 + 3, 1, 9, T.BAMBOO_POLE);
      for (let k = 0; k < 3; k++) b.set((walls.x0 + 1 + (cx - walls.x0) / 2 | 0) + 1, 9 - k, z1 + 3, k === 1 ? T.NOREN_WHITE : T.NOREN_RED, 1);
      if (lanterns) { b.stoneLantern(stepsAt - 2, 1, z1 + 2); b.stoneLantern(stepsAt + doorWidth + 1, 1, z1 + 2); }
      b.fence(1, D - 1, W - 2, D - 1, 1, 'fence');
      for (let x = doorX - 1; x <= doorX + 1; x++) b.clear(x, 1, D - 1);
    } else if (variant === 1) {
      // A veranda round the front and both ends, a post at every bay, benches between them and lanterns under the beam.
      const gap = Array.from({ length: doorWidth }, (_, i) => walls.x0 + doorAt + i);
      b.engawa(walls, FLOOR, SOUTH, 2, { from: walls.x0 - 2, to: walls.x1 + 2, gap, posts: spacing, postTop: PLATE1, post: 'accent' });
      b.engawa(walls, FLOOR, EAST, 2, { from: walls.z0, to: walls.z1, posts: spacing, postTop: PLATE1, post: 'accent' });
      b.engawa(walls, FLOOR, WEST, 2, { from: walls.z0, to: walls.z1, posts: spacing, postTop: PLATE1, post: 'accent' });
      const vz = z1 + 2;
      b.beam(walls.x0 - 2, vz, walls.x1 + 2, vz, PLATE1, 'beam');
      b.beam(walls.x0 - 2, walls.z0, walls.x0 - 2, vz, PLATE1, 'beam');
      b.beam(walls.x1 + 2, walls.z0, walls.x1 + 2, vz, PLATE1, 'beam');
      for (let x = walls.x0 - 2 + 2; x < walls.x1 + 2; x += 4) if (!gap.includes(x)) b.set(x, PLATE1 - 1, vz, x % 8 === 0 ? 'lightAlt' : 'light');
      for (const x of gap) b.stair(x, FLOOR, vz + 1, NORTH, 'stoneStairs');
      // Benches on the side verandas, where nobody walks to the door.
      for (const x of [walls.x0 - 1, walls.x1 + 1]) bench(b, x, walls.z0 + 2, 'z', FLOOR + 1);
      // The herb garden in front of the veranda: raised beds in rows with a path to the steps.
      b.floor(rect(1, vz + 2, W - 2, D - 1), 0, 'path');
      for (let z = vz + 2; z <= D - 2; z += 2) {
        for (const [x0, x1] of [[2, doorX - 2], [doorX + 2, W - 3]]) {
          if (x1 - x0 >= 1) planter(b, x0, 1, z, Math.min(x1 - x0 + 1, 7), 'x');
        }
      }
      if (lanterns) { b.stoneLantern(doorX - 1, 1, D - 2); b.stoneLantern(doorX + 1, 1, D - 2); }
    } else {
      // The barracks: a canopy the width of the hall hung with banners, a gravel yard with practice posts, a palisade round it.
      pent(b, walls, SOUTH, walls.x0, walls.x1, PLATE1, 3, { postFrom: 1, postEvery: spacing, lanterns: true });
      for (let x = walls.x0 + 1; x < walls.x1; x += 3) {
        if (Math.abs(x - doorX) <= 1) continue;
        b.set(x, PLATE1 - 1, z1 + 3, T.NOREN_RED, 0);
        b.set(x, PLATE1 - 2, z1 + 3, T.NOREN_WHITE, 0);
      }
      b.floor(rect(walls.x0, z1 + 1, walls.x1, z1 + 3), 0, 'path');
      b.floor(rect(1, z1 + 4, W - 2, D - 2), 0, 'path');
      for (let z = z1 + 4; z <= D - 2; z++) for (let x = 1; x <= W - 2; x++) if ((x * 7 + z * 13) % 5 === 0) b.set(x, 0, z, NatureBlock.GRAVEL);
      // Practice posts: a timber post with a cross-bar and a straw bale for a body.
      for (const x of [3, W - 4, cx]) {
        if (Math.abs(x - doorX) < 3 && x !== doorX) continue;
        const pz = Math.min(D - 3, z1 + 6);
        if (x === doorX) continue;
        b.column(x, pz, 1, 3, 'post');
        b.set(x - 1, 3, pz, 'beam');
        b.set(x + 1, 3, pz, 'beam');
        b.set(x, 2, pz, T.RICE_BALE);
      }
      // The weapon rack by the wall: a fence rail with banners behind it.
      for (let x = walls.x0; x <= walls.x0 + 3; x++) b.set(x, 1, z1 + 1, 'fence');
      b.fence(1, D - 1, W - 2, D - 1, 1, 'fence');
      b.fence(1, z1 + 4, 1, D - 1, 1, 'fence');
      b.fence(W - 2, z1 + 4, W - 2, D - 1, 1, 'fence');
      for (let x = doorX - 1; x <= doorX + 1; x++) b.clear(x, 1, D - 1);
      for (const x of [1, W - 2]) { b.column(x, D - 1, 1, 3, 'post'); b.set(x, 4, D - 1, 'light'); }
    }
    if (variant !== 1) for (let i = 0; i < doorWidth; i++) b.stair(walls.x0 + doorAt + i, FLOOR, z1 + 1, NORTH, 'stoneStairs');

    // Inside, the stair in the east corner climbing north, the rooms by variant.
    const stairX = inner.x1;
    const stairZ = inner.z0 + 4;
    const run = stairDoors(stairX, stairZ, NORTH, 4);
    const ground: RoomKind = variant === 0 ? 'study' : variant === 1 ? 'lobby' : 'barracks';
    const upstairs: RoomKind = variant === 0 ? 'study' : variant === 1 ? 'sleeping' : 'barracks';
    const room = b.room(inner, FLOOR, { doors: [{ x: doorX, z: z1 - 1, inward: NORTH }, ...(storeys === 2 ? run : [])] });
    furnishRoom(b, room, ground);
    if (storeys === 2) {
      const floor2 = b.room(inner, PLATE1, { doors: run });
      furnishRoom(b, floor2, upstairs);
      staircase(b, stairX, stairZ, NORTH, FLOOR, 4);
    }
    for (let z = inner.z0 + 2; z < inner.z1; z += 4) b.set(cx, PLATE1 - 1, z, 'light');
    b.treeSpot(1, 1, 'sakura');
    b.treeSpot(W - 2, 1, 'cedar');
    const bp = b.build();
    return mirror ? mirrorX(bp, W) : bp;
  }
}

export type { Rect };
