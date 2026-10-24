import { TempestBlock as T } from '../../../content/blocksTempest';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, Dir, EAST, NORTH, SOUTH, WEST, rect } from '../../structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../structures/BuildingKit';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';
import { FLARED } from '../../structures/roofProfile';
import { layGarden } from './garden';
import { RoofKind, bays, furnishRoom, mirrorX, planter, roofOver, stairDoors, staircase, windowRow } from './parts';

// A garden house: a small timber house in a big garden, the kind of lot the luxury quarter and the guest houses are made of.
//   variant 0  a tea house at the back of a pond garden, a veranda on the front and one side, a hip or hip and gable roof
//   variant 1  a two storey villa at one side of the lot with a dry garden of raked gravel, boulders and bamboo next to it
export class GardenHouseKit extends BuildingKit {
  readonly name = 'garden-house';
  readonly frontage: KitSize = { min: 17, max: 29 };
  readonly depth: KitSize = { min: 17, max: 29 };
  readonly floors: KitSize = { min: 1, max: 2 };
  readonly variants = 2;

  preferredSize(variant = 0): { frontage: number; depth: number; floors: number } {
    return variant === 0 ? { frontage: 21, depth: 23, floors: 1 } : { frontage: 25, depth: 21, floors: 2 };
  }

  build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const W = lot.frontage;
    const D = lot.depth;
    const mirror = rng.chance(0.5);
    const entrance = (['centre', 'left', 'right'] as const)[rng.int(3)];
    const roof: RoofKind = variant === 1 ? 'gable-x' : rng.chance(0.5) ? 'hip-gable' : 'hip';
    const chimney = rng.chance(0.4);
    const planterAt = rng.chance(0.6);
    const sideVeranda = rng.chance(0.7);
    const FLOOR = 1;
    const PLATE1 = 5;
    const PLATE2 = 9;
    const storeys = variant === 1 ? Math.min(lot.floors, 2) : 1;

    // The house: nine wide, seven or eight deep, three blocks from the back of the lot; the villa a few blocks from one side.
    const ww = 9;
    const wd = variant === 0 ? 7 : 8;
    const x0 = variant === 0 ? Math.floor((W - ww) / 2) : 3;
    const walls = rect(x0, 3, x0 + ww - 1, 3 + wd - 1);
    const inner = rect(walls.x0 + 1, walls.z0 + 1, walls.x1 - 1, walls.z1 - 1);
    const spacing = 4;
    b.floor(walls, 0, 'wallBase');
    b.ring(walls, 1, 1, 'wallBase');
    b.floor(inner, FLOOR, 'interiorFloor');
    b.frame(walls, 2, PLATE1 - 1, { panel: 'wall', post: 'post', spacing });
    b.beamRing(walls, PLATE1, 'beam');
    const front = bays(walls, SOUTH, spacing);
    const doorBay = front[entrance === 'left' ? 0 : entrance === 'right' ? front.length - 1 : Math.floor((front.length - 1) / 2)];
    const doorAt = doorBay.at + Math.floor((doorBay.len - 1) / 2);
    const doorX = walls.x0 + doorAt;
    b.opening(walls, { side: SOUTH, at: doorAt, y: 2, kind: 'door', noren: true, height: 2 });
    windowRow(b, walls, SOUTH, spacing, { y: 3, height: 2, kind: 'shoji', lit: true, width: 3, sill: 'trim' }, (bay) => bay.from === doorBay.from);
    for (const wall of [EAST, WEST, NORTH] as Dir[]) windowRow(b, walls, wall, spacing, { y: 3, height: 2, kind: 'shoji', lit: wall !== NORTH, width: 2, sill: 'trim' });

    // The veranda along the front and, on the garden side, along the east wall.
    const gap = [doorX];
    b.engawa(walls, FLOOR, SOUTH, 1, { from: walls.x0, to: walls.x1, gap, posts: 4, postTop: PLATE1 });
    b.stair(doorX, FLOOR, walls.z1 + 1, SOUTH, 'stoneStairs');
    if (sideVeranda) b.engawa(walls, FLOOR, EAST, 1, { from: walls.z0, to: walls.z1, posts: 4, postTop: PLATE1 });
    let top = PLATE1;
    let upperInner = inner;
    if (storeys === 2) {
      top = PLATE2;
      upperInner = inner;
      b.floor(inner, PLATE1, 'interiorFloor');
      b.frame(walls, PLATE1 + 1, PLATE2 - 1, { panel: 'wallFrame', post: 'post', spacing });
      b.beamRing(walls, PLATE2, 'beam');
      for (const wall of [SOUTH, EAST, WEST, NORTH] as Dir[]) windowRow(b, walls, wall, spacing, { y: PLATE1 + 3, height: 2, kind: wall === NORTH ? 'lattice' : 'shoji', lit: wall !== NORTH, width: 2, sill: 'trim' });
      b.balcony(walls, PLATE1, SOUTH, walls.x0, walls.x1, 1, { rail: true });
    }
    const info = roofOver(b, walls, top, { kind: roof, profile: FLARED, tips: 2 });
    if (chimney) {
      b.column(walls.x0 + 1, walls.z0 + 1, FLOOR + 1, info.crestTop + 1, 'wallBase');
      b.set(walls.x0 + 1, info.crestTop + 2, walls.z0 + 1, 'stoneSlab', 0);
    }

    // Rooms, and the stair of the villa in the east corner, climbing north.
    const stairX = upperInner.x1;
    const stairZ = upperInner.z0 + 3;
    const run = stairDoors(stairX, stairZ, NORTH, 4);
    const room = b.room(inner, FLOOR, { doors: [{ x: doorX, z: walls.z1 - 1, inward: NORTH }, ...(storeys === 2 ? run : [])] });
    b.tatami(room);
    furnishRoom(b, room, 'living');
    if (storeys === 2) {
      const bedroom = b.room(inner, PLATE1, { doors: run });
      b.tatami(bedroom);
      furnishRoom(b, bedroom, 'sleeping');
      b.set(Math.floor((inner.x0 + inner.x1) / 2), PLATE1 - 1, Math.floor((inner.z0 + inner.z1) / 2), 'light');
      staircase(b, stairX, stairZ, NORTH, FLOOR, 4);
    }

    // The garden: the lot in front of the house for the tea house, beside it for the villa.
    const frontGarden = rect(1, walls.z1 + 4, W - 2, D - 2);
    if (variant === 0) {
      layGarden(b, frontGarden, rng, { pond: true, bridge: rng.chance(0.7), lanterns: 1 + rng.int(2), trees: 2, bamboo: rng.chance(0.5), rock: rng.chance(0.3) });
      b.stoneLantern(walls.x0 - 2, 1, walls.z1 + 2);
    } else {
      const side = rect(walls.x1 + 4, 2, W - 2, D - 2);
      if (side.x1 - side.x0 >= 8) layGarden(b, side, rng, { pond: side.x1 - side.x0 >= 10 && rng.chance(0.5), bridge: true, lanterns: 2, trees: 2, bamboo: true, rock: true, gate: null });
      b.fenceRect(rect(1, walls.z1 + 3, Math.min(walls.x1 + 3, W - 2), D - 2), 1, [[doorX, D - 2], [doorX + 1, D - 2]]);
      b.stoneLantern(walls.x0 - 1, 1, walls.z1 + 3);
      if (planterAt) planter(b, walls.x1 - 2, 1, walls.z1 + 2, 2, 'x');
      b.set(walls.x1 - 1, 1, walls.z1 + 3, T.BARREL);
      b.treeSpot(2, walls.z1 + 4, 'sakura');
    }
    const bp = b.build();
    return mirror ? mirrorX(bp, W) : bp;
  }
}
