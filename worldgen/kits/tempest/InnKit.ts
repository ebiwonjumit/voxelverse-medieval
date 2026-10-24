import { NatureBlock } from '../../../content/blocksNature';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, Dir, EAST, NORTH, SOUTH, WEST, rect } from '../../structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../structures/BuildingKit';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';
import { FLARED } from '../../structures/roofProfile';
import { Rect, bayWindow, bays, furnishRoom, gardenBridge, middleBay, mirrorX, pent, roofOver, setOnWall, stairDoors, staircase, windowRow } from './parts';

// The inn: the biggest house of the town, two or three storeys, a veranda all round the ground floor, lanterns along its
// eave, lit windows in every bay, and a garden of its own behind it.
//   variant 0  tiers: each storey stands two blocks in from the one below under a skirt roof of its own, a hip on top
//   variant 1  one long gable roof over two storeys, a lean-to roof over the veranda, a courtyard garden behind
export class InnKit extends BuildingKit {
  readonly name = 'inn';
  readonly frontage: KitSize = { min: 15, max: 27 };
  readonly depth: KitSize = { min: 17, max: 29 };
  readonly floors: KitSize = { min: 2, max: 3 };
  readonly variants = 2;

  preferredSize(variant = 0): { frontage: number; depth: number; floors: number } {
    return variant === 0 ? { frontage: 21, depth: 27, floors: 3 } : { frontage: 21, depth: 23, floors: 2 };
  }

  build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const W = lot.frontage;
    const D = lot.depth;
    const mirror = rng.chance(0.5);
    const lanternAlt = rng.chance(0.5);
    const FLOOR = 1;
    const PLATE1 = 5;
    // The veranda is two blocks deep and the roof's lip hangs on its posts; a block of steps beyond it.
    const veranda = 2;
    // A three storey inn needs the depth for its tiers (each tier is four blocks narrower than the one below).
    const want = variant === 0 ? lot.floors : Math.min(2, lot.floors);
    const garden = Math.max(5, Math.min(9, D - (want >= 3 ? 24 : 17)));
    const M = rect(3, garden + 3, W - 4, D - 1 - veranda - 1);
    const spacing = 4;
    const inner = rect(M.x0 + 1, M.z0 + 1, M.x1 - 1, M.z1 - 1);

    // Footing, floor and the ground storey walls.
    b.floor(M, 0, 'wallBase');
    b.ring(M, 1, 1, 'wallBase');
    b.floor(inner, FLOOR, 'interiorFloor');
    b.frame(M, 2, PLATE1 - 1, { panel: 'wall', post: 'post', spacing });
    b.beamRing(M, PLATE1, 'beam');

    // Entrance: a double door in the middle bay, lit screens in the others.
    const frontBays = bays(M, SOUTH, spacing);
    const mid = middleBay(M, SOUTH, spacing);
    const doorWidth = Math.min(mid.len, 3);
    const doorAt = mid.at + Math.floor((mid.len - doorWidth) / 2);
    const doorX = M.x0 + doorAt;
    b.opening(M, { side: SOUTH, at: doorAt, y: 2, width: doorWidth, height: 2, kind: 'door', noren: true });
    for (let i = 0; i < doorWidth; i++) setOnWall(b, M, SOUTH, doorAt + i, 4, 'lattice');
    for (const bay of frontBays) if (bay.from !== mid.from) bayWindow(b, M, bay, { y: 3, height: 2, kind: 'shoji', lit: true, width: 3, sill: 'trim' });
    for (const side of [EAST, WEST, NORTH] as Dir[]) windowRow(b, M, side, spacing, { y: 3, height: 2, kind: side === NORTH ? 'lattice' : 'shoji', lit: side !== NORTH, width: 2, sill: 'trim' });

    // The veranda: all round the front and both sides, posts at its outer edge up to the plate, a beam on them, lanterns below it.
    const gap = Array.from({ length: doorWidth }, (_, i) => doorX + i);
    const vz = M.z1 + veranda;
    b.engawa(M, FLOOR, SOUTH, veranda, { from: M.x0 - veranda, to: M.x1 + veranda, gap, posts: 4, postTop: PLATE1 });
    b.engawa(M, FLOOR, EAST, veranda, { from: M.z0, to: M.z1, posts: 4, postTop: PLATE1 });
    b.engawa(M, FLOOR, WEST, veranda, { from: M.z0, to: M.z1, posts: 4, postTop: PLATE1 });
    b.beam(M.x0 - veranda, vz, M.x1 + veranda, vz, PLATE1, 'beam');
    b.beam(M.x0 - veranda, M.z0, M.x0 - veranda, vz, PLATE1, 'beam');
    b.beam(M.x1 + veranda, M.z0, M.x1 + veranda, vz, PLATE1, 'beam');
    for (let x = M.x0 - veranda + 2; x < M.x1 + veranda; x += 4) if (!gap.includes(x)) b.set(x, PLATE1 - 1, vz, (x % 8 === 0) === lanternAlt ? 'lightAlt' : 'light');
    for (let z = M.z0 + 2; z < M.z1; z += 4) { b.set(M.x0 - veranda, PLATE1 - 1, z, 'light'); b.set(M.x1 + veranda, PLATE1 - 1, z, 'light'); }
    for (const x of gap) b.stair(x, FLOOR, vz + 1, SOUTH, 'stoneStairs');

    // Upper storeys, each with the stair that reaches it.
    interface Level { walls: Rect; inner: Rect; floorRow: number }
    const levels: Level[] = [{ walls: M, inner, floorRow: FLOOR }];
    let plate = PLATE1;
    let walls: Rect = M;
    for (let t = 1; t < want; t++) {
      let next: Rect | null;
      if (variant === 0) {
        next = b.eaves(rect(walls.x0 - 2, walls.z0 - 2, walls.x1 + 2, walls.z1 + 2), plate + 1, 4, FLARED, 2);
        // Too small to carry another storey (a stair needs four blocks of depth): a hip goes on as it is.
        if (!next || next.z1 - next.z0 < 5 || next.x1 - next.x0 < 5) break;
      } else {
        next = walls;
      }
      const nextPlate = plate + 4;
      const prevInner = levels[t - 1].inner;
      b.floor(prevInner, plate, 'interiorFloor');
      b.frame(next, plate + 1, nextPlate - 1, { panel: variant === 1 || t % 2 === 1 ? 'wallFrame' : 'wall', post: 'post', spacing });
      b.beamRing(next, nextPlate, 'beam');
      for (const side of [SOUTH, EAST, WEST, NORTH] as Dir[]) {
        windowRow(b, next, side, spacing, { y: plate + 3, height: 2, kind: side === NORTH ? 'lattice' : 'shoji', lit: side !== NORTH, width: 3, sill: 'trim' });
      }
      walls = next;
      plate = nextPlate;
      levels.push({ walls: next, inner: rect(next.x0 + 1, next.z0 + 1, next.x1 - 1, next.z1 - 1), floorRow: levels[t - 1].floorRow + 4 });
    }
    roofOver(b, walls, plate, { kind: variant === 0 ? 'hip' : 'gable-x', profile: FLARED, tips: variant === 0 ? 3 : 2, gableWall: 'wallFrame' });
    if (variant === 1) {
      // A lean-to over the veranda on the front and both sides, under the upper floor.
      pent(b, M, SOUTH, M.x0 - veranda, M.x1 + veranda, PLATE1 + 1, 2);
      pent(b, M, EAST, M.z0, M.z1, PLATE1 + 1, 2);
      pent(b, M, WEST, M.z0, M.z1, PLATE1 + 1, 2);
    }

    // Rooms: a hall of low tables on tatami below, bedrooms above, a stair for every storey in the corner of the one it reaches.
    const runs = levels.slice(1).map((lv) => ({ x: lv.inner.x1, z: lv.inner.z0 + 3, floorY: lv.floorRow - 4 }));
    const doorsOn = (floorRow: number): Array<{ x: number; z: number; inward: Dir }> =>
      runs.filter((r) => r.floorY === floorRow || r.floorY + 4 === floorRow).flatMap((r) => stairDoors(r.x, r.z, NORTH, 4));
    levels.forEach((lv, t) => {
      const doors = doorsOn(lv.floorRow);
      if (t === 0) {
        const room = b.room(lv.inner, lv.floorRow, { doors: [{ x: doorX, z: M.z1 - 1, inward: NORTH }, ...doors] });
        b.tatami(room);
        furnishRoom(b, room, 'hall');
      } else {
        const room = b.room(levels[t - 1].inner, lv.floorRow, { doors });
        const here = { ...room, rect: lv.inner };
        b.tatami(here);
        furnishRoom(b, here, t === levels.length - 1 ? 'sleeping' : 'living');
      }
      if (t < levels.length - 1) b.set(Math.floor((lv.inner.x0 + lv.inner.x1) / 2), lv.floorRow + 3, Math.floor((lv.inner.z0 + lv.inner.z1) / 2), 'light');
    });
    for (const r of runs) staircase(b, r.x, r.z, NORTH, r.floorY, 4);

    // The garden behind: walled, with a pond, stepping stones, a bridge, lanterns and trees.
    const g = rect(1, 1, W - 2, M.z0 - 4);
    if (g.z1 - g.z0 >= 4) {
      for (let z = g.z0; z <= g.z1; z++) for (let x = g.x0; x <= g.x1; x++) b.set(x, 0, z, (x * 7 + z * 13) % 5 === 0 ? NatureBlock.MOSS : NatureBlock.GRAVEL);
      // Walls round the garden: plaster, a tile cap, posts at the corners and every few blocks.
      b.ring(g, 1, 2, 'wall');
      b.ring(g, 3, 3, 'roofSlab', 0);
      for (let x = g.x0; x <= g.x1; x += 4) { b.column(x, g.z0, 1, 3, 'post'); b.column(x, g.z1, 1, 3, 'post'); }
      for (let z = g.z0; z <= g.z1; z += 4) { b.column(g.x0, z, 1, 3, 'post'); b.column(g.x1, z, 1, 3, 'post'); }
      // The wall towards the building is open, with paving through it.
      for (let x = g.x0 + 1; x < g.x1; x++) { for (let y = 1; y <= 3; y++) b.clear(x, y, g.z1); b.set(x, 0, g.z1, 'path'); }
      const px0 = Math.floor(W / 2) - 3;
      const pond = rect(px0, g.z0 + 2, px0 + 5, Math.min(g.z1 - 2, g.z0 + 5));
      b.pond(pond, 0, 3, 'stone');
      gardenBridge(b, px0 + 2, pond.z0 - 1, pond.z1 - pond.z0 + 3, 'z');
      b.stoneLantern(g.x0 + 2, 1, g.z1 - 1);
      b.stoneLantern(g.x1 - 2, 1, g.z1 - 1);
      b.treeSpot(g.x0 + 2, g.z0 + 2, 'sakura');
      b.treeSpot(g.x1 - 2, g.z0 + 3, 'cedar');
      b.steppingPath(g.x0 + 3, g.z1 - 1, px0 - 1, pond.z1, 1, 1);
    }

    const bp = b.build();
    return mirror ? mirrorX(bp, W) : bp;
  }
}
