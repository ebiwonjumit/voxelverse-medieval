import { TempestBlock as T } from '../../../content/blocksTempest';
import { cellId } from '../../../engine/cell';
import { Rng } from '../../noise';
import { Blueprint, NO_CELL } from '../../structures/Blueprint';
import { BlueprintBuilder, Dir, EAST, NORTH, SOUTH, WEST, rect } from '../../structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../structures/BuildingKit';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';
import { FLARED, FLARED_TIGHT, STEEP } from '../../structures/roofProfile';
import { RoofKind, bays, chimneyStack, eaveBrackets, furnishRoom, lanternBracket, mirrorX, planter, roofOver, setOnWall, stairDoors, staircase, tipsFor, windowRow } from './parts';

// The townhouse: the ordinary house of the town, one or two storeys, its front to the street. What makes two of them differ
// comes from the lot's seed (which bay the door is in, whether it is mirrored, the wall of the upper storey, a chimney,
// planters, washing); the four variants differ in their silhouette.
//   variant 0  two storeys, a porch under a balcony on posts, a hip and gable roof (irimoya)
//   variant 1  two storeys under a steep gable that faces the street, half-timbered, with a small canopy over the door
//   variant 2  tiers: a skirt roof round the ground floor, a smaller storey above under a hip with raised corners
//   variant 3  one storey, a veranda along the front, a long gable roof, a yard with a fence and a lantern
// A lot that asks for one storey gets the same house without the upper walls.
export class TownhouseKit extends BuildingKit {
  readonly name = 'townhouse';
  readonly frontage: KitSize = { min: 9, max: 17 };
  readonly depth: KitSize = { min: 9, max: 22 };
  readonly floors: KitSize = { min: 1, max: 2 };
  readonly variants = 4;

  preferredSize(variant = 0): { frontage: number; depth: number; floors: number } {
    switch (variant) {
      case 1: return { frontage: 11, depth: 14, floors: 2 };
      case 2: return { frontage: 13, depth: 14, floors: 2 };
      case 3: return { frontage: 15, depth: 15, floors: 1 };
      default: return { frontage: 13, depth: 13, floors: 2 };
    }
  }

  build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const W = lot.frontage;
    const D = lot.depth;
    const mirror = rng.chance(0.5);
    const entrance = (['centre', 'left', 'right'] as const)[rng.int(3)];
    const chimney = rng.chance(0.5);
    const planterAt = rng.chance(0.6);
    const upperPanel = rng.chance(0.65) ? 'wallFrame' : 'wall';
    const sideKind = rng.chance(0.5) ? 'lattice' : 'shoji';
    const FLOOR = 1;
    const PLATE1 = FLOOR + 4; // the beam that carries the upper floor, or the plate of a one storey house
    const PLATE2 = PLATE1 + 4;

    // The wall rectangle: the roof reaches 2 blocks past the wall of a hip, 1 past the gable ends of a gable; a yard takes the rest of the depth.
    const kind: RoofKind = variant === 1 ? 'gable-z' : variant === 3 ? 'gable-x' : variant === 2 ? 'hip' : 'hip-gable';
    const profile = variant === 1 ? STEEP : FLARED;
    const reachX = kind === 'gable-x' ? 1 : profile.overhang;
    const reachZ = kind === 'gable-z' ? 1 : profile.overhang;
    const yard = variant === 3 ? Math.max(0, Math.min(3, D - 12)) : 1;
    const side = W > 13 ? 1 : 0;
    let walls = variant === 2
      ? rect(2, 2, W - 3, D - 3 - yard)
      : rect(reachX + side, reachZ, W - 1 - reachX - side, D - 1 - reachZ - yard);
    const ww = walls.x1 - walls.x0;
    const wd = walls.z1 - walls.z0;
    // A second storey needs a stair of four cells inside the walls: a house on a small lot keeps to one.
    const storeys = variant === 3 || wd < 7 || ww < 5 ? 1 : Math.min(lot.floors, 2);
    const tiered = variant === 2 && storeys === 2 && ww >= 8 && wd >= 8;
    if (variant === 2 && !tiered) walls = rect(reachX, reachZ, W - 1 - reachX, D - 1 - reachZ - yard);
    const inner = rect(walls.x0 + 1, walls.z0 + 1, walls.x1 - 1, walls.z1 - 1);
    const spacing = (walls.x1 - walls.x0) % 5 === 0 || walls.x1 - walls.x0 > 11 ? 5 : 4;

    // Footing and the raised floor.
    b.floor(walls, 0, 'wallBase');
    b.ring(walls, 1, 1, 'wallBase');
    b.floor(inner, FLOOR, 'interiorFloor');

    // Ground storey: plaster in a timber frame, the door in one bay of the front, lit screens in the rest.
    b.frame(walls, 2, PLATE1 - 1, { panel: 'wall', post: 'post', spacing });
    b.beamRing(walls, PLATE1, 'beam');
    const front = bays(walls, SOUTH, spacing);
    const doorIndex = entrance === 'left' ? 0 : entrance === 'right' ? front.length - 1 : Math.floor((front.length - 1) / 2);
    const doorBay = front[doorIndex];
    const doorWidth = doorBay.len >= 4 ? 2 : 1;
    const doorAt = doorBay.at + Math.floor((doorBay.len - doorWidth) / 2);
    const doorX = walls.x0 + doorAt;
    const doorZ = walls.z1;
    b.opening(walls, { side: SOUTH, at: doorAt, y: 2, width: doorWidth, height: 2, kind: 'door', noren: true });
    for (let i = 0; i < doorWidth; i++) setOnWall(b, walls, SOUTH, doorAt + i, 4, 'lattice');
    windowRow(b, walls, SOUTH, spacing, { y: 3, height: 2, kind: 'shoji', lit: true, width: 2, sill: 'trim' }, (bay) => bay.from === doorBay.from);
    for (const wall of [EAST, WEST, NORTH] as Dir[]) {
      windowRow(b, walls, wall, spacing, { y: 3, height: 2, kind: sideKind, width: 2 }, (_bay, i, n) => wall === NORTH && n > 2 && i === 0);
    }

    // The upper storey, and the roof over it.
    let plate = PLATE1;
    let upper = walls;
    if (storeys === 2) {
      plate = PLATE2;
      if (tiered) {
        // The skirt roof round the ground floor, and a smaller storey standing inside it.
        upper = b.eaves(rect(walls.x0 - 1, walls.z0 - 1, walls.x1 + 1, walls.z1 + 1), PLATE1 + 1, 2, FLARED_TIGHT, 3) ?? rect(walls.x0 + 1, walls.z0 + 1, walls.x1 - 1, walls.z1 - 1);
      }
      const upperSpacing = tiered ? ((upper.x1 - upper.x0) % 5 === 0 || upper.x1 - upper.x0 > 11 ? 5 : 4) : spacing;
      b.floor(inner, PLATE1, 'interiorFloor');
      b.frame(upper, PLATE1 + 1, PLATE2 - 1, { panel: upperPanel, post: 'post', spacing: upperSpacing });
      b.beamRing(upper, PLATE2, 'beam');
      for (const wall of [SOUTH, EAST, WEST, NORTH] as Dir[]) {
        windowRow(b, upper, wall, upperSpacing, {
          y: PLATE1 + 3, height: 2, kind: wall === SOUTH && variant !== 1 ? 'shoji' : 'lattice', lit: wall === SOUTH, width: wall === SOUTH ? 3 : 2,
          sill: wall === SOUTH && variant === 0 ? undefined : 'trim',
        });
      }
    }
    const roofInfo = roofOver(b, upper, plate, { kind, profile, tips: variant === 1 ? 0 : tipsFor(upper), gableWall: 'wallFrame' });
    // Brackets under the eaves: the stubs of the beams that carry the roof (a steep gable has no deep eave to hold them).
    const eaveSides: Dir[] = kind === 'gable-x' ? [NORTH, SOUTH] : kind === 'gable-z' ? [] : [NORTH, SOUTH, EAST, WEST];
    eaveBrackets(b, upper, plate, eaveSides, tiered ? 4 : spacing);
    if (tiered) eaveBrackets(b, walls, PLATE1, [NORTH, SOUTH, EAST, WEST], spacing);

    // The front, by variant.
    const gap = Array.from({ length: doorWidth }, (_, i) => doorX + i);
    if (variant === 0 || variant === 3) {
      // A veranda along the front; the door steps down between its posts. Two storeys: a balcony on the posts above it.
      b.engawa(walls, FLOOR, SOUTH, 1, { from: walls.x0, to: walls.x1, gap, posts: 4, postTop: variant === 0 && storeys === 2 ? PLATE1 - 1 : PLATE1 });
      for (let i = 0; i < doorWidth; i++) b.stair(doorX + i, FLOOR, doorZ + 1, NORTH, 'stoneStairs');
      if (variant === 0 && storeys === 2) {
        b.balcony(walls, PLATE1, SOUTH, walls.x0, walls.x1, 1, { rail: true });
        for (const bay of front) if (bay.from !== doorBay.from) b.set(bay.from + Math.floor(bay.len / 2), PLATE1 - 1, doorZ + 1, 'light');
        if (planterAt) planter(b, front[front.length - 1].from, PLATE1 + 1, doorZ + 1, 2, 'x');
        else b.set(front[0].from + 1, PLATE1 + 1, doorZ + 1, T.LAUNDRY_POLE, 0);
      }
    } else {
      b.steps(doorX, FLOOR, doorZ + 1, SOUTH, 1, doorWidth, 'stoneStairs');
    }
    if (variant === 1) {
      // The front gable carries a king post; a small canopy over the door.
      const gz = upper.z1;
      const cx = Math.floor((upper.x0 + upper.x1) / 2);
      for (let y = roofInfo.base; y < roofInfo.crestTop - 1; y++) {
        const c = b.bp.get(cx, y, gz);
        if (c !== NO_CELL && cellId(c) === style.block('wallFrame')) b.set(cx, y, gz, 'post');
      }
      for (let i = 0; i < doorWidth; i++) {
        b.set(doorX + i, 4, doorZ + 1, 'beam');
        b.stair(doorX + i, 5, doorZ + 1, SOUTH, 'roofStairs');
        b.set(doorX + i, 5, doorZ + 2, 'roofSlab', 1);
      }
    }
    if (variant === 3 && yard >= 2) {
      // A fence, a path of stepping stones and a lantern in the yard.
      const fenceZ = D - 1;
      b.fence(1, fenceZ, W - 2, fenceZ, 1, 'fence');
      b.clear(doorX, 1, fenceZ);
      b.steppingPath(doorX, doorZ + 3, doorX, fenceZ - 1, 1, 1);
      b.stoneLantern(walls.x1 - 1, 1, doorZ + 3);
    }
    // Lanterns either side of the door (never in front of it), hung from the eave.
    const lx0 = doorX - 1;
    const lx1 = doorX + doorWidth;
    for (const lx of [lx0, lx1]) {
      if (lx <= walls.x0 || lx >= walls.x1) continue;
      if (variant === 3) b.set(lx, PLATE1 - 1, doorZ + 1, 'light');
      else if (variant !== 0) lanternBracket(b, lx, 4, doorZ + 1, 'light');
    }

    // Rooms: tatami, a table, a hearth below; a bedroom above. The stair stands in the east corner of the rooms, climbing north;
    // the door and the stair stay clear.
    const upperInner = rect(upper.x0 + 1, upper.z0 + 1, upper.x1 - 1, upper.z1 - 1);
    const stairX = upperInner.x1;
    const stairZ = upperInner.z0 + 3;
    const run = stairDoors(stairX, stairZ, NORTH, 4);
    const room = b.room(inner, FLOOR, { doors: [{ x: doorX, z: doorZ - 1, inward: NORTH }, ...(storeys === 2 ? run : [])] });
    b.tatami(room);
    furnishRoom(b, room, 'living');
    if (storeys === 2) {
      const bedroom = b.room(inner, PLATE1, { doors: run });
      b.tatami({ ...bedroom, rect: upperInner });
      furnishRoom(b, { ...bedroom, rect: upperInner }, 'sleeping');
      b.set(Math.floor((inner.x0 + inner.x1) / 2), PLATE1 - 1, Math.floor((inner.z0 + inner.z1) / 2), 'light');
      staircase(b, stairX, stairZ, NORTH, FLOOR, 4);
    }

    // A chimney in the back corner, through the roof; planters under the windows; a place for a tree at the back.
    if (chimney) {
      const cx = walls.x0 + 1;
      const cz = walls.z0 + 1;
      chimneyStack(b, cx, cz, FLOOR + 1, roofInfo.crestTop + 1);
    }
    // The planter stands under a window, never in front of the door.
    if (planterAt && variant !== 0) {
      const px = walls.x0 + 1 >= doorX - 1 && walls.x0 + 1 <= doorX + doorWidth ? walls.x1 - 1 : walls.x0 + 1;
      planter(b, px, 1, doorZ + 1 + (variant === 3 ? 1 : 0), 1, 'x');
    }
    b.treeSpot(1, 1, 'any');
    b.treeSpot(W - 2, 1, 'any');

    const bp = b.build();
    return mirror ? mirrorX(bp, W) : bp;
  }
}
