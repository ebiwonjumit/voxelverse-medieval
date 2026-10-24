import { TempestBlock as T } from '../../../content/blocksTempest';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, Dir, EAST, NORTH, SOUTH, WEST, rect } from '../../structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../structures/BuildingKit';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';
import { FLARED, FLARED_TIGHT } from '../../structures/roofProfile';
import { bays, framedWindow, furnishRoom, mirrorX, pent, roofOver, setOnWall, stairDoors, staircase } from './parts';

// The kura: a storehouse of white plaster on a stone plinth with a heavy tile roof, a few small windows set deep in
// the wall and one big door with a lacquered frame. Nothing about it is open or light: it is where the town keeps its rice.
//   variant 0  a single storey under a long gable roof, a small eave over the door
//   variant 1  two storeys: a skirt roof round the stone-footed ground floor, a smaller plastered storey above under a gable
export class StorehouseKit extends BuildingKit {
  readonly name = 'storehouse';
  readonly frontage: KitSize = { min: 9, max: 17 };
  readonly depth: KitSize = { min: 10, max: 18 };
  readonly floors: KitSize = { min: 1, max: 2 };
  readonly variants = 2;

  preferredSize(variant = 0): { frontage: number; depth: number; floors: number } {
    return variant === 1 ? { frontage: 13, depth: 15, floors: 2 } : { frontage: 13, depth: 14, floors: 1 };
  }

  build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const W = lot.frontage;
    const D = lot.depth;
    const mirror = rng.chance(0.5);
    const lanterns = rng.chance(0.7);
    const FLOOR = 2;
    const PLATE1 = 7;
    const PLATE2 = 11;
    const yard = 2;
    const margin = variant === 1 ? 2 : 1;
    const side = W > 13 ? 1 : 0;
    const walls = rect(margin + side, 2, W - 1 - margin - side, D - 1 - 2 - yard);
    const inner = rect(walls.x0 + 1, walls.z0 + 1, walls.x1 - 1, walls.z1 - 1);
    const two = variant === 1 && lot.floors >= 2 && walls.x1 - walls.x0 >= 8 && inner.z1 - inner.z0 >= 6;
    const z1 = walls.z1;

    // The stone plinth two blocks high, the floor on top of it.
    b.floor(walls, 0, 'wallBase');
    b.ring(walls, 1, FLOOR, 'wallBase');
    b.floor(inner, FLOOR, 'interiorFloor');
    // Thick plaster walls, posts only at the corners, a half-timber band under the plate.
    b.walls(walls, FLOOR + 1, PLATE1 - 1, 'wall');
    b.columns([[walls.x0, walls.z0], [walls.x1, walls.z0], [walls.x0, walls.z1], [walls.x1, walls.z1]], FLOOR + 1, PLATE1 - 1, 'post');
    b.walls(walls, PLATE1 - 1, PLATE1 - 1, 'wallFrame');
    b.beamRing(walls, PLATE1, 'beam');

    // The big door in the middle of the front, framed in lacquer, with a small window either side.
    const cx = Math.floor((walls.x0 + walls.x1) / 2);
    const doorAt = cx - walls.x0 - 1;
    b.opening(walls, { side: SOUTH, at: doorAt, y: FLOOR + 1, width: 3, height: 3, kind: 'door' });
    for (let t = doorAt - 1; t <= doorAt + 3; t++) setOnWall(b, walls, SOUTH, t, FLOOR + 4, 'accent');
    for (const t of [doorAt - 1, doorAt + 3]) for (let y = FLOOR + 1; y <= FLOOR + 3; y++) setOnWall(b, walls, SOUTH, t, y, 'accent');
    for (let t = 0; t < 3; t++) setOnWall(b, walls, SOUTH, doorAt + t, FLOOR + 3, 'wallFrame');
    for (const t of [doorAt - 4, doorAt + 6]) {
      if (t < 1 || t > walls.x1 - walls.x0 - 1) continue;
      framedWindow(b, walls, SOUTH, t, FLOOR + 3, 1, 1, 'lattice');
    }
    // Small high windows along the sides.
    for (const wall of [EAST, WEST] as Dir[]) {
      for (const bay of bays(walls, wall, 5)) framedWindow(b, walls, wall, bay.at + Math.floor(bay.len / 2), FLOOR + 3, 1, 1, 'lattice');
    }

    // Steps up to the door, a paved yard in front.
    b.steps(cx - 1, FLOOR, z1 + 1, SOUTH, 2, 3, 'stoneStairs');
    b.floor(rect(walls.x0, z1 + 1, walls.x1, D - 1), 0, 'path');
    for (let x = cx - 1; x <= cx + 1; x++) b.set(x, 0, z1 + 1, 'wallBase');

    let top = PLATE1;
    let roofWalls = walls;
    let upperInner = inner;
    if (two) {
      // The skirt roof round the stone-footed ground floor and the smaller storey that stands inside it.
      const skirt = b.eaves(rect(walls.x0 - 1, walls.z0 - 1, walls.x1 + 1, walls.z1 + 1), PLATE1 + 1, 2, FLARED_TIGHT, 2);
      const upper = skirt ?? rect(walls.x0 + 1, walls.z0 + 1, walls.x1 - 1, walls.z1 - 1);
      b.floor(inner, PLATE1, 'interiorFloor');
      b.walls(upper, PLATE1 + 1, PLATE2 - 1, 'wall');
      b.columns([[upper.x0, upper.z0], [upper.x1, upper.z0], [upper.x0, upper.z1], [upper.x1, upper.z1]], PLATE1 + 1, PLATE2 - 1, 'post');
      b.beamRing(upper, PLATE2, 'beam');
      framedWindow(b, upper, SOUTH, Math.floor((upper.x1 - upper.x0) / 2) - 1, PLATE1 + 2, 3, 1, 'lattice');
      for (const wall of [EAST, WEST] as Dir[]) framedWindow(b, upper, wall, Math.floor((upper.z1 - upper.z0) / 2), PLATE1 + 2, 1, 1, 'lattice');
      top = PLATE2;
      roofWalls = upper;
      upperInner = rect(upper.x0 + 1, upper.z0 + 1, upper.x1 - 1, upper.z1 - 1);
    }
    const info = roofOver(b, roofWalls, top, { kind: 'gable-x', profile: FLARED, tips: 2, gableWall: 'wall' });
    // A small eave over the door of a single storey.
    if (!two) pent(b, walls, SOUTH, cx - 2, cx + 2, PLATE1 - 1, 2);
    // A lattice window in each gable end.
    if (info.gable) {
      const mid = Math.floor((roofWalls.z0 + roofWalls.z1) / 2);
      for (const t of [roofWalls.x0, roofWalls.x1]) if (b.bp.has(t, info.base, mid)) b.set(t, info.base, mid, 'lattice');
    }
    // Lanterns beside the door, barrels and rice bales against the wall.
    if (lanterns) {
      b.stoneLantern(walls.x0, 1, z1 + 2);
      b.stoneLantern(walls.x1, 1, z1 + 2);
    }
    b.set(walls.x0 + 2, 1, z1 + 1, T.BARREL);
    b.set(walls.x0 + 3, 1, z1 + 1, T.BARREL);
    b.set(walls.x1 - 2, 1, z1 + 1, T.RICE_BALE);
    b.set(walls.x1 - 3, 1, z1 + 1, T.CRATE);

    // Inside: crates, rice bales and barrels; the stair to the loft in the east corner, climbing north.
    const stairX = upperInner.x1;
    const stairZ = upperInner.z0 + 4;
    const run = stairDoors(stairX, stairZ, NORTH, 5);
    const room = b.room(inner, FLOOR, { doors: [{ x: cx, z: z1 - 1, inward: NORTH }, ...(two ? run : [])] });
    furnishRoom(b, room, 'store');
    if (two) {
      const loft = b.room(inner, PLATE1, { doors: run });
      furnishRoom(b, { ...loft, rect: upperInner }, 'store');
      staircase(b, stairX, stairZ, NORTH, FLOOR, 5);
    }
    b.treeSpot(walls.x0 - 1, D - 1, 'cedar');
    const bp = b.build();
    return mirror ? mirrorX(bp, W) : bp;
  }
}
