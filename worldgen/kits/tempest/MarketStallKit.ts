import { TempestBlock as T } from '../../../content/blocksTempest';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, SOUTH, rect } from '../../structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../structures/BuildingKit';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';
import { FLARED_TIGHT } from '../../structures/roofProfile';
import { goodsAt, mirrorX } from './parts';

// A market stall: four posts, a counter on the street side, stock on the counter and crates and barrels behind it, a roof
// of some kind over the top, and red lanterns along the eave for the evening market.
//   variant 0  a small tiled hip roof with horned ridge ends, lanterns hung all round the eave, counters on the front and one side
//   variant 1  a striped cloth awning on a timber frame, higher at the back, a signboard over the counter
//   variant 2  a tent of roof stairs on posts, a rack of washing at the back, a low table with a rice bale, a bucket
export class MarketStallKit extends BuildingKit {
  readonly name = 'market-stall';
  readonly frontage: KitSize = { min: 7, max: 11 };
  readonly depth: KitSize = { min: 6, max: 9 };
  readonly floors: KitSize = { min: 1, max: 1 };
  readonly variants = 3;

  preferredSize(): { frontage: number; depth: number; floors: number } {
    return { frontage: 9, depth: 7, floors: 1 };
  }

  build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const W = lot.frontage;
    const D = lot.depth;
    const mirror = rng.chance(0.5);
    const sideCounter = rng.chance(0.6);
    // The stall stands inside the lot with a strip of paving in front where people stop; the roof reaches a block past its posts.
    const apron = 1;
    const frame = rect(1, 1, W - 2, D - 2 - apron);
    const z1 = frame.z1;
    const cx = Math.floor((frame.x0 + frame.x1) / 2);
    b.floor(rect(0, 0, W - 1, D - 1), 0, 'path');
    b.floor(frame, 0, 'wallBase');
    const posts: Array<[number, number]> = [[frame.x0, frame.z0], [frame.x1, frame.z0], [frame.x0, frame.z1], [frame.x1, frame.z1]];

    // The counter: a board along the front between the front posts, and one along the east side; stock on top of them.
    const counterCells: Array<[number, number]> = [];
    for (let x = frame.x0 + 1; x <= frame.x1 - 1; x++) counterCells.push([x, z1]);
    if (sideCounter) for (let z = frame.z0 + 1; z <= z1 - 1; z++) counterCells.push([frame.x1, z]);
    for (const [x, z] of counterCells) {
      b.set(x, 1, z, 'wall');
      b.set(x, 2, z, 'interiorFloor');
      const roll = rng.int(8);
      if (roll === 0) b.set(x, 3, z, T.VASE);
      else if (roll === 1) b.set(x, 3, z, T.RICE_BALE);
      else if (roll === 2) b.set(x, 3, z, T.BUCKET);
      else if (roll === 3) b.set(x, 3, z, T.CRATE);
      else if (roll === 4) b.set(x, 3, z, T.BARREL);
    }
    // Behind the counter: barrels and crates against the back, a low table inside.
    for (let x = frame.x0 + 1; x <= frame.x1 - 1; x += 2) goodsAt(b, x, 1, frame.z0, x + variant);
    b.set(frame.x0 + 1, 1, Math.min(z1 - 1, frame.z0 + 2), T.LOW_TABLE);

    if (variant === 0) {
      b.columns(posts, 1, 3, T.BAMBOO_POLE);
      b.beamRing(frame, 4, 'trim');
      b.hip(rect(frame.x0, frame.z0, frame.x1, frame.z1), 4, { profile: FLARED_TIGHT, tips: 2 });
      // Red lanterns all round the eave, one under every other beam block.
      let k = 0;
      for (let x = frame.x0 + 1; x < frame.x1; x += 2) {
        b.set(x, 3, z1 === frame.z0 ? z1 : z1, k % 2 === 0 ? 'light' : 'lightAlt');
        b.set(x, 3, frame.z0, k % 2 === 0 ? 'lightAlt' : 'light');
        k++;
      }
      for (let z = frame.z0 + 1; z < z1; z += 2) {
        if (!counterCells.some(([cxx, czz]) => cxx === frame.x1 && czz === z)) b.set(frame.x1, 3, z, 'light');
        b.set(frame.x0, 3, z, 'lightAlt');
      }
    } else if (variant === 1) {
      b.columns([[frame.x0, frame.z0], [frame.x1, frame.z0]], 1, 5, T.BAMBOO_POLE);
      b.columns([[frame.x0, frame.z1], [frame.x1, frame.z1]], 1, 4, T.BAMBOO_POLE);
      b.beam(frame.x0, frame.z0, frame.x1, frame.z0, 5, 'beam');
      b.beam(frame.x0, z1, frame.x1, z1, 4, 'beam');
      // The cloth: rows from the back, the high edge north, stepping down to the street.
      for (let z = frame.z0; z <= z1 + 1; z++) {
        for (let x = frame.x0 - 1; x <= frame.x1 + 1; x++) {
          const y = z <= frame.z0 + 1 ? 5 : 4;
          b.set(x, y, z, (x - frame.x0 + 1) % 2 === 0 ? 'awning' : 'awningAlt', 0);
        }
      }
      b.signboard(cx, 3, z1 + 1, 'x');
      for (let x = frame.x0 + 1; x < frame.x1; x += 2) b.set(x, 3, z1 + 1, x % 4 === 1 ? 'light' : 'lightAlt');
    } else {
      b.columns(posts, 1, 3, T.BAMBOO_POLE);
      b.beamRing(frame, 4, 'trim');
      // A tent of roof stairs with a ridge cap along it.
      b.gable(rect(frame.x0, frame.z0 + 1, frame.x1, z1 - 1), 4, { profile: FLARED_TIGHT, axis: 'x', tips: 0 });
      b.set(frame.x1 - 1, 1, frame.z0 + 1, T.LAUNDRY_POLE, 0);
      b.set(frame.x1 - 1, 2, frame.z0 + 1, T.RICE_BALE);
      for (let x = frame.x0 + 1; x < frame.x1; x += 2) b.set(x, 3, z1, 'light');
    }
    // The way in: a door marker on the street side for the planner's paths.
    b.mark({ kind: 'door', x: cx, y: 1, z: z1 + 1, facing: SOUTH });
    const bp = b.build();
    return mirror ? mirrorX(bp, W) : bp;
  }
}
