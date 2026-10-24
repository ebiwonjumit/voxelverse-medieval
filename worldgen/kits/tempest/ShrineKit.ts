import { NatureBlock } from '../../../content/blocksNature';
import { TempestBlock as T } from '../../../content/blocksTempest';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, NORTH, SOUTH, rect } from '../../structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../structures/BuildingKit';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';
import { FLARED, FLARED_DEEP, FLARED_TIGHT } from '../../structures/roofProfile';
import { mirrorX, roofOver } from './parts';

// The shrine complex: a vermilion torii gate at the street, a path of paving between stone lanterns, a purification
// basin under a little roof, steps up to a terrace and the shrine hall on it, with a curved roof, lacquered posts and a
// shimenawa of white cloth across its front, inside a low fence with trees. The lacquer is always vermilion whatever the
// family: the posts, rails and the torii take the style's accent, the roof and walls the family's.
//   variant 0  the full complex: torii, a long path, basin, a hall under a hip and gable roof, a side shrine, a sacred tree
//   variant 1  a smaller wayside shrine: two torii one behind the other, lanterns along the path, a hall under a gable
export class ShrineKit extends BuildingKit {
  readonly name = 'shrine';
  readonly frontage: KitSize = { min: 15, max: 31 };
  readonly depth: KitSize = { min: 21, max: 37 };
  readonly floors: KitSize = { min: 1, max: 1 };
  readonly variants = 2;

  preferredSize(variant = 0): { frontage: number; depth: number; floors: number } {
    return variant === 0 ? { frontage: 25, depth: 31, floors: 1 } : { frontage: 15, depth: 23, floors: 1 };
  }

  build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const W = lot.frontage;
    const D = lot.depth;
    const cx = Math.floor((W - 1) / 2);
    const mirror = rng.chance(0.5);
    const basinSide = rng.chance(0.5) ? 1 : -1;
    const lanternPairs = 2 + rng.int(3);
    const sideShrine = rng.chance(0.65);
    const emaRack = rng.chance(0.6);
    const treeSpecies = rng.chance(0.5) ? 'sakura' : 'cedar';

    // The precinct: moss and gravel underfoot, a low vermilion fence all round it with a gap at the torii.
    const g = rect(1, 1, W - 2, D - 2);
    for (let z = g.z0; z <= g.z1; z++) for (let x = g.x0; x <= g.x1; x++) {
      const n = (x * 73856093 ^ z * 19349663) >>> 0;
      if (n % 5 === 0) b.set(x, 0, z, NatureBlock.MOSS);
      else if (n % 3 === 0) b.set(x, 0, z, NatureBlock.GRAVEL);
    }
    b.ring(g, 1, 1, 'rail');
    for (const [x, z] of [[g.x0, g.z0], [g.x1, g.z0], [g.x0, g.z1], [g.x1, g.z1]] as const) b.column(x, z, 1, 2, 'accent');
    for (let t = -3; t <= 3; t++) b.clear(cx + t, 1, g.z1);

    // The terrace and the hall, sized by the lot: wider and deeper lots get a bigger hall.
    const hw = W >= 25 ? 5 : W >= 19 ? 4 : 3;
    const hallD = D >= 31 ? 9 : D >= 25 ? 7 : 5;
    const terrace = rect(cx - hw - 3, 2, cx + hw + 3, 2 + hallD + 3);
    const hall = rect(cx - hw, terrace.z0 + 2, cx + hw, terrace.z0 + 1 + hallD);
    const PLATE = 6;
    b.floor(terrace, 0, 'wallBase');
    b.floor(terrace, 1, 'stone');
    b.ring(terrace, 1, 1, 'wallBase');
    b.floor(rect(terrace.x0 + 1, terrace.z0 + 1, terrace.x1 - 1, terrace.z1 - 1), 1, 'path');
    // Steps up to the terrace, three wide, with blue ore lamps beside them.
    for (let x = cx - 1; x <= cx + 1; x++) { b.stair(x, 1, terrace.z1 + 1, NORTH, 'stoneStairs'); b.set(x, 0, terrace.z1 + 1, 'wallBase'); }
    b.set(cx - 2, 1, terrace.z1 + 1, T.BLUE_ORE_LAMP);
    b.set(cx + 2, 1, terrace.z1 + 1, T.BLUE_ORE_LAMP);
    b.fence(terrace.x0, terrace.z1, cx - 3, terrace.z1, 2, 'rail');
    b.fence(cx + 3, terrace.z1, terrace.x1, terrace.z1, 2, 'rail');
    b.fence(terrace.x0, terrace.z0, terrace.x0, terrace.z1, 2, 'rail');
    b.fence(terrace.x1, terrace.z0, terrace.x1, terrace.z1, 2, 'rail');
    b.fence(terrace.x0, terrace.z0, terrace.x1, terrace.z0, 2, 'rail');

    // The hall: plaster walls behind lacquered posts, the front open between the posts, a lattice at the back, a cloth rope across.
    b.floor(hall, 1, 'interiorFloor');
    b.ring(hall, 2, PLATE - 1, 'wall');
    for (let x = hall.x0; x <= hall.x1; x += 2) b.column(x, hall.z1, 2, PLATE - 1, 'accent');
    for (let z = hall.z0; z <= hall.z1; z += 2) { b.column(hall.x0, z, 2, PLATE - 1, 'accent'); b.column(hall.x1, z, 2, PLATE - 1, 'accent'); }
    for (const x of [hall.x0, hall.x1]) for (const z of [hall.z0, hall.z1]) b.column(x, z, 2, PLATE - 1, 'accent');
    b.beamRing(hall, PLATE, 'accent');
    b.beamRing(hall, PLATE - 1, 'accent');
    for (let x = hall.x0 + 1; x < hall.x1; x += 2) for (let y = 2; y <= PLATE - 2; y++) b.carve(x, y, hall.z1);
    for (let x = cx - 1; x <= cx + 1; x++) for (let y = 2; y <= PLATE - 2; y++) b.carve(x, y, hall.z1);
    for (let x = hall.x0 + 1; x < hall.x1; x++) b.set(x, PLATE - 2, hall.z1, T.NOREN_WHITE, 0);
    for (let x = hall.x0 + 1; x < hall.x1; x += 2) b.opening(hall, { side: NORTH, at: x - hall.x0, y: 3, kind: 'lattice' });
    b.mark({ kind: 'door', x: cx, y: 2, z: hall.z1, facing: SOUTH });
    b.set(cx - 2, PLATE - 2, hall.z1 + 1, 'light');
    b.set(cx + 2, PLATE - 2, hall.z1 + 1, 'light');
    b.set(cx, PLATE - 2, hall.z1 + 1, 'lightAlt');
    roofOver(b, hall, PLATE, { kind: variant === 0 ? 'hip-gable' : 'gable-x', profile: variant === 0 && hw >= 4 ? FLARED_DEEP : FLARED, tips: 3 });
    // Inside: tatami, the offering box and a vase on the altar at the back, a lantern.
    const room = b.room(rect(hall.x0 + 1, hall.z0 + 1, hall.x1 - 1, hall.z1 - 1), 1, { doors: [{ x: cx, z: hall.z1 - 1, inward: NORTH }] });
    b.tatami(room);
    b.set(cx, 2, hall.z0 + 1, T.LOW_TABLE);
    b.set(cx - 1, 3, hall.z0 + 1, T.VASE);
    b.set(cx + 1, 3, hall.z0 + 1, T.VASE);
    b.set(cx, 2, hall.z0 + 3 <= hall.z1 - 2 ? hall.z0 + 3 : hall.z0 + 2, T.CRATE);
    b.set(cx - 2, 2, hall.z0 + 1, 'lightAlt');

    // The path from the street to the steps: paving three wide between curbs, stone lanterns in pairs along it.
    for (let z = terrace.z1 + 2; z <= D - 1; z++) {
      for (let x = cx - 1; x <= cx + 1; x++) b.set(x, 0, z, z % 5 === 0 ? 'pathAlt' : 'path');
      b.set(cx - 2, 0, z, 'curb', 0);
      b.set(cx + 2, 0, z, 'curb', 0);
    }
    const pathLen = D - 1 - (terrace.z1 + 2);
    for (let i = 0; i < lanternPairs; i++) {
      const z = terrace.z1 + 4 + Math.floor((i * (pathLen - 6)) / Math.max(1, lanternPairs - 1));
      if (z >= D - 6) continue;
      b.stoneLantern(cx - 3, 1, z);
      b.stoneLantern(cx + 3, 1, z);
    }

    // The torii at the street, and a second one half way up the path of the small shrine.
    this.torii(b, cx, D - 3, 5, 5);
    if (variant === 1 && D - 3 - (terrace.z1 + 2) >= 11) this.torii(b, cx, D - 3 - Math.floor((D - 3 - terrace.z1 - 2) / 2), 4, 5);

    // The purification basin: four posts, a small roof, a basin with the water jet, a bucket.
    const bx = cx + basinSide * (hw + 6);
    const bz = Math.min(D - 8, terrace.z1 + 7);
    if (bx - 2 >= 2 && bx + 2 <= W - 3 && bz > terrace.z1 + 3) {
      const basin = rect(bx - 1, bz - 1, bx + 1, bz + 1);
      b.floor(basin, 0, 'path');
      b.columns([[basin.x0, basin.z0], [basin.x1, basin.z0], [basin.x0, basin.z1], [basin.x1, basin.z1]], 1, 3, 'accent');
      b.beamRing(basin, 4, 'beam');
      b.set(bx, 1, bz, T.STONE_BASIN);
      b.set(bx, 2, bz, T.WATER_JET);
      roofOver(b, basin, 4, { kind: 'hip', profile: FLARED_TIGHT, tips: 1 });
      b.set(bx, 1, bz + 2, T.BUCKET);
      // A rack of wooden prayer plaques beside it.
      if (emaRack && bx + basinSide * 4 >= 3 && bx + basinSide * 4 <= W - 4) {
        const rx = bx + basinSide * 4;
        b.column(rx, bz, 1, 3, 'post');
        b.column(rx + 2, bz, 1, 3, 'post');
        b.beam(rx, bz, rx + 2, bz, 3, 'beam');
        for (const x of [rx + 1]) b.signboard(x, 2, bz, 'x');
      }
    }

    // The side shrine of the full complex: a small gabled hall on a stone base.
    if (variant === 0 && sideShrine) {
      const sx = terrace.x0 - 7 >= 3 ? terrace.x0 - 7 : terrace.x1 + 5;
      if (sx >= 3 && sx + 2 <= W - 4) {
        const s = rect(sx, terrace.z0 + 2, sx + 2, terrace.z0 + 4);
        const base = rect(s.x0 - 1, s.z0 - 1, s.x1 + 1, s.z1 + 1);
        b.floor(base, 0, 'wallBase');
        b.floor(base, 1, 'stone');
        b.walls(s, 2, 3, 'wall');
        b.columns([[s.x0, s.z0], [s.x1, s.z0], [s.x0, s.z1], [s.x1, s.z1]], 2, 3, 'accent');
        b.beamRing(s, 4, 'accent');
        b.opening(s, { side: SOUTH, at: 1, y: 2, kind: 'lattice', height: 2 });
        b.gable(s, 4, { profile: FLARED_TIGHT, axis: 'x', tips: 1 });
        b.stoneLantern(s.x1 + 2 <= W - 3 ? s.x1 + 2 : s.x0 - 2, 1, s.z1 + 1);
      }
    }
    // Places for trees: the sacred tree on one side of the terrace, others along the back and the sides.
    b.treeSpot(Math.min(W - 3, terrace.x1 + 3), terrace.z0 + 2, treeSpecies);
    b.treeSpot(Math.max(2, terrace.x0 - 3), terrace.z1 + 2, treeSpecies === 'sakura' ? 'cedar' : 'sakura');
    b.treeSpot(g.x1 - 1, g.z0 + 1, 'cedar');
    b.treeSpot(g.x0 + 1, g.z0 + 1, 'cedar');
    const bp = b.build();
    return mirror ? mirrorX(bp, W) : bp;
  }

  /**
   * A torii: two lacquered posts on stone feet, a tie beam between them, a top beam of planks that reaches past the posts with a
   * dark cap over it whose ends turn up, and a plaque in the middle.
   */
  private torii(b: BlueprintBuilder, cx: number, z: number, height: number, width: number): void {
    const half = Math.floor(width / 2);
    for (const x of [cx - half, cx + half]) {
      b.set(x, 0, z, 'stone');
      b.column(x, z, 1, height, 'accent');
    }
    b.beam(cx - half, z, cx + half, z, height - 1, T.VERMILION_PLANKS);
    b.beam(cx - half - 1, z, cx + half + 1, z, height + 1, T.VERMILION_PLANKS);
    b.beam(cx - half - 1, z, cx + half + 1, z, height + 2, 'roofSlab');
    b.set(cx - half - 2, height + 2, z, 'roofSlab', 1);
    b.set(cx + half + 2, height + 2, z, 'roofSlab', 1);
    b.signboard(cx, height, z, 'x');
  }
}
