import { TempestBlock as T } from '../../../content/blocksTempest';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, SOUTH, rect } from '../../structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../structures/BuildingKit';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';
import { FLARED_TIGHT } from '../../structures/roofProfile';
import { goodsAt, mirrorX, roofOver } from './parts';

// A market stall: four posts, a counter on the street side, stock on the counter and crates and barrels behind it, and
// something over the top to keep the sun off.
//   variant 0  a small tiled roof with horned ridge ends and red lanterns along the eave
//   variant 1  a striped cloth awning on a timber frame, a signboard on the front
//   variant 2  a low thatched canopy over a table, a rack of laundry, a bucket and a rice bale
export class MarketStallKit extends BuildingKit {
  readonly name = 'market-stall';
  readonly frontage: KitSize = { min: 5, max: 9 };
  readonly depth: KitSize = { min: 4, max: 7 };
  readonly floors: KitSize = { min: 1, max: 1 };
  readonly variants = 3;

  preferredSize(variant = 0): { frontage: number; depth: number; floors: number } {
    return variant === 0 ? { frontage: 7, depth: 7, floors: 1 } : { frontage: 7, depth: 5, floors: 1 };
  }

  build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const W = lot.frontage;
    const D = lot.depth;
    const mirror = rng.chance(0.5);
    // The stall stands inside the lot with a strip of paving in front where people stop.
    const apron = 1;
    const frame = variant === 0 ? rect(2, 2, W - 3, D - 2 - apron) : rect(1, 1, W - 2, D - 2 - apron);
    const z1 = frame.z1;
    b.floor(rect(0, 0, W - 1, D - 1), 0, 'path');
    b.floor(rect(frame.x0, frame.z0, frame.x1, frame.z1), 0, 'wallBase');
    const posts: Array<[number, number]> = [[frame.x0, frame.z0], [frame.x1, frame.z0], [frame.x0, frame.z1], [frame.x1, frame.z1]];

    // The counter: a timber board along the front between the front posts, one along each side.
    b.beam(frame.x0 + 1, z1, frame.x1 - 1, z1, 1, 'beam');
    b.beam(frame.x0 + 1, z1, frame.x1 - 1, z1, 2, 'trim');
    b.set(frame.x0, 1, frame.z0 + 1, 'beam');
    b.set(frame.x1, 1, frame.z0 + 1, 'beam');
    // Stock on the counter: a mix by roll.
    for (let x = frame.x0 + 1; x <= frame.x1 - 1; x++) {
      if (rng.chance(0.7)) {
        const pick = rng.int(5);
        if (pick === 0) b.set(x, 3, z1, T.VASE);
        else if (pick === 1) b.set(x, 3, z1, T.RICE_BALE);
        else if (pick === 2) b.set(x, 3, z1, T.BUCKET);
        else if (pick === 3) b.set(x, 3, z1, T.CRATE);
        else b.set(x, 3, z1, T.BARREL);
      }
    }
    // Behind the counter: a barrel and crates against the back.
    for (let x = frame.x0 + 1; x <= frame.x1 - 1; x += 2) goodsAt(b, x, 1, frame.z0, x + variant);

    if (variant === 0) {
      b.columns(posts, 1, 4, 'post');
      b.beamRing(frame, 4, 'beam');
      roofOver(b, frame, 4, { kind: 'hip', profile: FLARED_TIGHT, tips: 1 });
      // Red lanterns along the front and the sides of the eave.
      for (let x = frame.x0 + 1; x < frame.x1; x += 2) b.set(x, 3, z1 + 1 > D - 1 ? z1 : z1 + 1, 'light');
    } else if (variant === 1) {
      b.columns(posts, 1, 4, 'post');
      b.beamRing(frame, 5, 'beam');
      b.column(frame.x0, frame.z0, 5, 5, 'post');
      // The cloth: rows from the back, the high edge north, stepping down towards the street.
      for (let z = frame.z0; z <= z1 + 1 && z < D; z++) {
        for (let x = frame.x0 - 1; x <= frame.x1 + 1; x++) {
          const y = z <= frame.z0 + 1 ? 5 : 4;
          b.set(x, y, z, Math.floor((x - frame.x0 + 1) / 1) % 2 === 0 ? 'awning' : 'awningAlt', 0);
        }
      }
      b.signboard(Math.floor((frame.x0 + frame.x1) / 2), 3, z1 + 1 < D ? z1 + 1 : z1, 'x');
    } else {
      b.columns(posts, 1, 3, 'post');
      b.beamRing(frame, 4, 'beam');
      // A low canopy of thatch-coloured roof slabs over the table.
      for (let z = frame.z0 - 1; z <= z1 + 1 && z < D; z++) for (let x = frame.x0 - 1; x <= frame.x1 + 1; x++) b.set(x, 5, z, 'roofSlab', 0);
      for (let x = frame.x0; x <= frame.x1; x++) b.set(x, 5, frame.z0 + 1 < z1 ? frame.z0 + 1 : frame.z0, 'roofBlock');
      b.set(frame.x0 + 1, 1, frame.z0 + 1, T.LAUNDRY_POLE, 0);
      b.set(frame.x1 - 1, 2, z1 - 1, T.LOW_TABLE);
    }
    b.mark({ kind: 'door', x: Math.floor((frame.x0 + frame.x1) / 2), y: 1, z: z1 + 1 < D ? z1 + 1 : z1, facing: SOUTH });
    const bp = b.build();
    return mirror ? mirrorX(bp, W) : bp;
  }
}
