import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, Dir, EAST, NORTH, SOUTH, WEST, rect } from '../../structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../structures/BuildingKit';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';
import { FLARED } from '../../structures/roofProfile';
import {
  RoofKind, bays, chimneyStack, eaveBrackets, furnishRoom, goodsAt, hangingSign, mirrorX, pent, planter, postCoords, roofOver, setOnWall, stairDoors, staircase, windowRow,
} from './parts';

// The shop: a trade on the ground floor and the family's rooms above, its front open to the street.
//   variant 0  an open timber front under a tiled lean-to eave: a counter between the posts, noren, goods, a blade sign
//   variant 1  sliding screens and a door under a deep striped awning, a sign board across the front, barrels outside
//   variant 2  an arcade: the upper floor stands out on posts over a covered walk, the shop set back behind it
// A lot that asks for one storey gets the shop alone, two the shop with rooms above (when the depth has room for the stair).
export class ShopKit extends BuildingKit {
  readonly name = 'shop';
  readonly frontage: KitSize = { min: 9, max: 17 };
  readonly depth: KitSize = { min: 10, max: 17 };
  readonly floors: KitSize = { min: 1, max: 2 };
  readonly variants = 3;

  preferredSize(variant = 0): { frontage: number; depth: number; floors: number } {
    return variant === 2 ? { frontage: 13, depth: 16, floors: 2 } : variant === 1 ? { frontage: 11, depth: 14, floors: 2 } : { frontage: 13, depth: 14, floors: 2 };
  }

  build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const W = lot.frontage;
    const D = lot.depth;
    const mirror = rng.chance(0.5);
    const noren = rng.chance(0.5) ? 'noren' : 'norenAlt';
    const sign = rng.chance(0.5);
    const planterAt = rng.chance(0.6);
    const chimney = rng.chance(0.4);
    const PLATE1 = 5;
    const PLATE2 = 9;
    const kind: RoofKind = variant === 0 ? 'gable-x' : variant === 1 ? 'hip-gable' : 'hip';
    const reachX = kind === 'gable-x' ? 1 : 2;
    const arcade = variant === 2 ? (D >= 14 ? 2 : 1) : 0;
    // From the wall to the lot's front edge: the lean-to, the awning with its paving, or the arcade and the eave beyond it.
    const front = variant === 0 ? 3 : variant === 1 ? 2 : arcade + 2;
    const side = W > 13 ? 1 : 0;
    const walls = rect(reachX + side, 2, W - 1 - reachX - side, D - 1 - front);
    const inner = rect(walls.x0 + 1, walls.z0 + 1, walls.x1 - 1, walls.z1 - 1);
    const ww = walls.x1 - walls.x0;
    const spacing = ww % 4 === 0 ? 4 : ww % 3 === 0 ? 3 : 4;
    const z1 = walls.z1;
    const storeys = lot.floors >= 2 && inner.z1 - inner.z0 >= 4 ? 2 : 1;

    // The ground floor is at street level: paving behind the counter, planks in a shop with screens.
    const floorRole = variant === 1 ? 'interiorFloor' : 'path';
    b.floor(walls, 0, 'wallBase');
    b.floor(inner, 0, floorRole);
    b.ring(walls, 1, 1, 'wallBase');
    b.frame(walls, 2, PLATE1 - 1, { panel: 'wall', post: 'post', spacing });
    b.beamRing(walls, PLATE1, 'beam');
    const frontBays = bays(walls, SOUTH, spacing);
    const centre = Math.floor((frontBays.length - 1) / 2);
    const doorBay = frontBays[centre];
    const doorWidth = doorBay.len >= 3 ? 2 : 1;
    const doorAt = doorBay.at + Math.floor((doorBay.len - doorWidth) / 2);
    const doorX = walls.x0 + doorAt;
    for (const wall of [EAST, WEST, NORTH] as Dir[]) windowRow(b, walls, wall, spacing, { y: 3, height: 2, kind: 'lattice', width: 2 });

    if (variant === 0 || variant === 2) {
      // The open front: each bay carved down to a counter under a lintel band; the doorway's bay is open to the floor.
      frontBays.forEach((bay, i) => {
        const isDoor = i === centre;
        for (let t = bay.from; t <= bay.to; t++) {
          for (let y = 1; y <= 4; y++) b.carve(t, y, z1);
          b.set(t, 4, z1, 'wallFrame');
          if (isDoor) {
            if (t >= doorX && t < doorX + doorWidth) setOnWall(b, walls, SOUTH, t - walls.x0, 3, noren, 0);
          } else {
            b.set(t, 1, z1, 'wallBase');
            b.set(t, 2, z1, 'trim');
            if ((t + i) % 2 === 0) goodsAt(b, t, 3, z1, t * 7 + i);
          }
        }
      });
      b.mark({ kind: 'door', x: doorX, y: 1, z: z1, facing: SOUTH });
    } else {
      // Screens: shoji panels between the posts, the door in the middle bay.
      frontBays.forEach((bay, i) => {
        if (i === centre) return;
        b.opening(walls, { side: SOUTH, at: bay.at, y: 2, width: bay.len, height: 3, kind: 'shoji', lit: true, sill: 'wallBase' });
      });
      b.opening(walls, { side: SOUTH, at: doorAt, y: 1, width: doorWidth, height: 3, kind: 'door', noren });
      for (let t = 0; t < doorWidth; t++) setOnWall(b, walls, SOUTH, doorAt + t, 4, 'lattice');
    }

    // The canopy over the front.
    if (variant === 0) {
      pent(b, walls, SOUTH, walls.x0, walls.x1, PLATE1, 3, { postFrom: 1, postEvery: spacing, lanterns: true });
      b.floor(rect(walls.x0, z1 + 1, walls.x1, z1 + 3), 0, 'path');
      hangingSign(b, doorX + doorWidth, PLATE1 - 2, z1 + 3, WEST);
      if (sign) for (let i = 0; i < doorWidth; i++) b.signboard(doorX + i, PLATE1 + 1, z1 + 1, 'x');
    } else if (variant === 1) {
      // A deep striped awning over a paved strip; barrels and crates by the wall; a sign board above.
      b.awning(z1, walls.x0, walls.x1, 4, SOUTH, { alt: true });
      b.floor(rect(walls.x0, z1 + 1, walls.x1, z1 + 2), 0, 'path');
      for (let t = walls.x0; t <= walls.x1; t++) {
        if (t >= doorX - 1 && t <= doorX + doorWidth) continue;
        if (rng.chance(0.4)) goodsAt(b, t, 1, z1 + 1, t * 3 + 1);
      }
      for (let t = walls.x0 + 1; t < walls.x1; t += 3) b.set(t, 3, z1 + 1, 'light');
      for (let t = 0; t < doorWidth; t++) b.signboard(doorX + t, 5, z1 + 1, 'x');
      hangingSign(b, walls.x1, 5, z1 + 1, SOUTH);
    } else {
      b.floor(rect(walls.x0, z1 + 1, walls.x1, z1 + arcade), 0, 'path');
    }

    // The rooms above, and the roof.
    let top = PLATE1;
    let roofWalls = walls;
    let upperInner = inner;
    if (storeys === 2) {
      top = PLATE2;
      const upper = variant === 2 ? rect(walls.x0, walls.z0, walls.x1, z1 + arcade) : walls;
      roofWalls = upper;
      upperInner = rect(upper.x0 + 1, upper.z0 + 1, upper.x1 - 1, upper.z1 - 1);
      b.floor(upperInner, PLATE1, 'interiorFloor');
      b.beamRing(upper, PLATE1, 'beam');
      if (variant === 2) {
        // The upper floor stands out over the walk on posts, one at each of the bays' edges, on stone footings.
        for (const x of postCoords(walls.x0, walls.x1, spacing)) {
          b.column(x, upper.z1, 1, 4, 'post');
          b.set(x, 0, upper.z1, 'wallBase');
        }
        for (let x = walls.x0; x <= walls.x1; x++) b.setIfEmpty(x, 4, upper.z1, 'trim');
        for (let x = walls.x0 + 2; x < walls.x1; x += 3) b.set(x, 4, upper.z1 - 0, x % 2 === 0 ? 'light' : 'lightAlt');
      }
      b.frame(upper, PLATE1 + 1, PLATE2 - 1, { panel: rng.chance(0.6) ? 'wallFrame' : 'wall', post: 'post', spacing });
      b.beamRing(upper, PLATE2, 'beam');
      for (const wall of [SOUTH, EAST, WEST, NORTH] as Dir[]) {
        windowRow(b, upper, wall, spacing, { y: PLATE1 + 3, height: 2, kind: wall === SOUTH ? 'shoji' : 'lattice', lit: wall === SOUTH, width: wall === SOUTH ? 3 : 2, sill: 'trim' });
      }
    }
    const info = roofOver(b, roofWalls, top, { kind, profile: FLARED, tips: 2, gableWall: 'wallFrame' });
    eaveBrackets(b, roofWalls, top, kind === 'gable-x' ? [NORTH] : variant === 2 ? [NORTH, EAST, WEST, SOUTH] : [NORTH, EAST, WEST, SOUTH], spacing);
    if (chimney) chimneyStack(b, walls.x0 + 1, walls.z0 + 1, 1, info.crestTop + 1);

    // Inside: stock along the walls on the shop floor, a bedroom above; the stair in the east corner climbing north.
    const stairX = upperInner.x1;
    const stairZ = upperInner.z0 + 4;
    const run = stairDoors(stairX, stairZ, NORTH, 5);
    const room = b.room(inner, 0, { floor: floorRole, doors: [{ x: doorX, z: z1 - 1, inward: NORTH }, ...(storeys === 2 ? run : [])] });
    furnishRoom(b, room, 'shop');
    if (storeys === 2) {
      const bedroom = b.room(inner, PLATE1, { doors: run });
      b.tatami({ ...bedroom, rect: upperInner });
      furnishRoom(b, { ...bedroom, rect: upperInner }, 'sleeping');
      b.set(Math.floor((inner.x0 + inner.x1) / 2), PLATE1 - 1, Math.floor((inner.z0 + inner.z1) / 2), 'light');
      staircase(b, stairX, stairZ, NORTH, 0, 5);
    }

    // Street life.
    if (planterAt) planter(b, walls.x0, 1, z1 + front - 1, 1, 'x');
    b.treeSpot(1, 1, 'any');
    const bp = b.build();
    return mirror ? mirrorX(bp, W) : bp;
  }
}
