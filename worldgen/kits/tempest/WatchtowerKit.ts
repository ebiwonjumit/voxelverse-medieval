import { TempestBlock as T } from '../../../content/blocksTempest';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, Dir, EAST, NORTH, SOUTH, WEST, rect } from '../../structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../structures/BuildingKit';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';
import { FLARED, FLARED_TIGHT } from '../../structures/roofProfile';
import { Rect, WOOD_SLAB, framedWindow, furnishRoom, mirrorX, pathDoors, roofOver, stairPath, straightPath, windowRow } from './parts';

// The watchtower: a stone base with arrow slits, timber storeys above it with lit screens and a lacquered rail on the
// ledge, a skirt roof under the upper storey, the corners swept up, lanterns on the posts and a stair inside up to the top:
// a straight flight through the base and a spiral round the walls of the narrow storeys above it.
//   variant 0  a stone base, then two timber storeys, the top one under a hip with a ridge cap
//   variant 1  a fire watch: stone base and one closed storey, an open lookout under a hip roof with a bell and a blue ore beacon
export class WatchtowerKit extends BuildingKit {
  readonly name = 'watchtower';
  readonly frontage: KitSize = { min: 11, max: 15 };
  readonly depth: KitSize = { min: 11, max: 15 };
  readonly floors: KitSize = { min: 2, max: 3 };
  readonly variants = 2;

  preferredSize(): { frontage: number; depth: number; floors: number } {
    return { frontage: 13, depth: 13, floors: 3 };
  }

  build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const W = lot.frontage;
    const D = lot.depth;
    const mirror = rng.chance(0.5);
    const lanterns = rng.chance(0.5);
    const cx = Math.floor((W - 1) / 2);
    const cz = Math.floor((D - 1) / 2);
    const half = 4;
    const BASE_TOP = 6;
    const PLATE1 = BASE_TOP + 5;
    const PLATE2 = PLATE1 + 5;

    // The stone base: a square of mossy stone on a plinth, arrow slits, a door in the front with one step up.
    const base = rect(cx - half, cz - half, cx + half, cz + half);
    const baseInner = rect(base.x0 + 1, base.z0 + 1, base.x1 - 1, base.z1 - 1);
    b.floor(rect(base.x0 - 1, base.z0 - 1, base.x1 + 1, base.z1 + 1), 0, 'wallBase');
    b.walls(base, 1, BASE_TOP - 1, 'stone');
    b.ring(base, 1, 1, 'wallBase');
    b.ring(base, BASE_TOP, BASE_TOP, 'wallBase');
    b.floor(baseInner, 1, 'interiorFloor');
    b.opening(base, { side: SOUTH, at: half, y: 2, kind: 'door', noren: true, height: 2 });
    for (const wall of [EAST, WEST, NORTH] as Dir[]) framedWindow(b, base, wall, half, 4, 1, 1, 'lattice');
    for (const t of [1, 7]) framedWindow(b, base, SOUTH, t, 4, 1, 1, 'lattice');
    b.stair(cx, 1, base.z1 + 1, NORTH, 'stoneStairs');
    // Stone slabs cap the corners of the ledge.
    for (const [x, z] of [[base.x0, base.z0], [base.x1, base.z0], [base.x0, base.z1], [base.x1, base.z1]] as const) b.set(x, BASE_TOP + 1, z, 'stoneSlab', 0);

    // The first timber storey stands on the stone a step in from its edge, so a ledge runs round it behind a rail.
    const t1 = rect(base.x0 + 1, base.z0 + 1, base.x1 - 1, base.z1 - 1);
    const t1Inner = rect(t1.x0 + 1, t1.z0 + 1, t1.x1 - 1, t1.z1 - 1);
    b.floor(t1, BASE_TOP, 'interiorFloor');
    b.frame(t1, BASE_TOP + 1, PLATE1 - 1, { panel: variant === 0 ? 'wall' : 'wallFrame', post: 'accent', spacing: 4 });
    b.beamRing(t1, PLATE1, 'accent');
    for (const wall of [SOUTH, EAST, WEST, NORTH] as Dir[]) windowRow(b, t1, wall, 4, { y: BASE_TOP + 2, height: 2, kind: 'shoji', lit: true, width: 2, sill: 'trim' });
    b.ring(base, BASE_TOP + 1, BASE_TOP + 1, 'rail');
    for (const [x, z] of [[base.x0, base.z0], [base.x1, base.z0], [base.x0, base.z1], [base.x1, base.z1]] as const) {
      b.column(x, z, BASE_TOP + 1, BASE_TOP + 2, 'accent');
      if (lanterns) b.set(x, BASE_TOP + 3, z, 'light');
    }

    // The skirt roof of the first storey, one ring wider than the stone.
    const skirt = b.eaves(rect(base.x0 - 1, base.z0 - 1, base.x1 + 1, base.z1 + 1), PLATE1 + 1, 2, FLARED_TIGHT, 2) ?? t1;
    let top = PLATE1;
    let roofWalls: Rect = skirt;
    const floorsAbove: Array<{ inner: Rect; row: number }> = [];
    if (variant === 0 || lot.floors >= 3) {
      floorsAbove.push({ inner: t1Inner, row: PLATE1 });
      b.floor(t1Inner, PLATE1, 'interiorFloor');
      if (variant === 0) {
        b.frame(skirt, PLATE1 + 1, PLATE2 - 1, { panel: 'wallFrame', post: 'accent', spacing: 4 });
        b.beamRing(skirt, PLATE2, 'accent');
        for (const wall of [SOUTH, EAST, WEST, NORTH] as Dir[]) windowRow(b, skirt, wall, 4, { y: PLATE1 + 2, height: 2, kind: 'shoji', lit: true, width: 2, sill: 'trim' });
      } else {
        // The open lookout: lacquered posts at the corners, a rail, a bell under the roof, a beacon of blue ore on a post.
        b.ring(skirt, PLATE1 + 1, PLATE1 + 1, 'rail');
        b.columns([[skirt.x0, skirt.z0], [skirt.x1, skirt.z0], [skirt.x0, skirt.z1], [skirt.x1, skirt.z1]], PLATE1 + 1, PLATE2, 'accent');
        b.beamRing(skirt, PLATE2, 'accent');
        b.beam(skirt.x0, cz, skirt.x1, cz, PLATE2, 'beam');
        b.set(cx, PLATE2 - 1, cz, T.PAPER_LANTERN_RED);
        b.set(skirt.x1, PLATE2 + 1, skirt.z0, T.BLUE_ORE_LAMP);
      }
      top = PLATE2;
      roofWalls = skirt;
    }
    roofOver(b, roofWalls, top, { kind: 'hip', profile: FLARED, tips: 3 });

    // Inside: a flight of five up the east side of the base into the first storey, another up the west side to the next.
    const flight1 = straightPath(t1Inner.x1, t1Inner.z1, NORTH, 5);
    const flight2 = straightPath(t1Inner.x0, t1Inner.z1, NORTH, 5);
    // Nothing stands at the foot of a flight, on its landing or beside it: a player climbs a stair from the cell in front of it.
    const foot = (f: ReadonlyArray<readonly [number, number]>): Rect => rect(f[0][0] - 1, f[0][1], f[0][0] + 1, f[0][1] + 1);
    const groundRoom = b.room(baseInner, 1, { doors: [{ x: cx, z: base.z1 - 1, inward: NORTH }, ...pathDoors(flight1)] });
    furnishRoom(b, groundRoom, 'store', { keepClear: [foot(flight1)] });
    const storey = b.room(baseInner, BASE_TOP, { doors: [...pathDoors(flight1), ...(floorsAbove.length > 0 ? pathDoors(flight2) : [])] });
    furnishRoom(b, { ...storey, rect: t1Inner }, 'living', { keepClear: [foot(flight2), rect(flight2[0][0] - 1, flight2[0][1], flight2[0][0] + 1, flight2[0][1]), rect(flight1[4][0] - 1, flight1[4][1] - 1, flight1[4][0] + 1, flight1[4][1])] });
    if (floorsAbove.length > 0) {
      const upperRoom = b.room(t1Inner, PLATE1, { doors: pathDoors(flight2) });
      furnishRoom(b, upperRoom, variant === 0 ? 'sleeping' : 'empty', { keepClear: [rect(flight2[4][0] - 1, flight2[4][1] - 1, flight2[4][0] + 1, flight2[4][1])] });
      b.set(cx, PLATE1 - 1, cz, 'light');
    }
    b.set(cx, BASE_TOP - 1, cz, 'light');
    stairPath(b, flight1, 1);
    if (floorsAbove.length > 0) {
      stairPath(b, flight2, BASE_TOP);
      // The second flight starts against the wall of the storey, with no cell in front of its foot: a player steps up onto it from the side,
      // which the back half of a stair block forbids at floor height. A slab beside the foot is the half step in between.
      const beside = flight2[0][0] + (flight2[0][0] < cx ? 1 : -1);
      b.set(beside, BASE_TOP + 1, flight2[0][1], WOOD_SLAB, 0);
    }
    b.treeSpot(1, 1, 'cedar');
    b.treeSpot(W - 2, 1, 'cedar');
    void WEST;
    const bp = b.build();
    return mirror ? mirrorX(bp, W) : bp;
  }
}
