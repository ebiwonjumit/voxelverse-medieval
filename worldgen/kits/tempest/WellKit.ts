import { TempestBlock as T } from '../../../content/blocksTempest';
import { BlockType } from '../../../worldConstants';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, rect } from '../../structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../structures/BuildingKit';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';
import { FLARED_TIGHT } from '../../structures/roofProfile';
import { mirrorX } from './parts';

// A well in a little paved square: a ring of mossy stone round the water, two posts and a cross beam with the bucket
// hanging from it, a hood over the top.
//   variant 0  a hood of tile with a ridge cap, fan paving round it, a stone lantern
//   variant 1  a plain rope well: posts and a beam, no roof, a bucket on the rim, planters and a bench
export class WellKit extends BuildingKit {
  readonly name = 'well';
  readonly frontage: KitSize = { min: 5, max: 9 };
  readonly depth: KitSize = { min: 5, max: 9 };
  readonly floors: KitSize = { min: 1, max: 1 };
  readonly variants = 2;

  preferredSize(): { frontage: number; depth: number; floors: number } {
    return { frontage: 7, depth: 7, floors: 1 };
  }

  build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const mirror = rng.chance(0.5);
    const W = lot.frontage;
    const D = lot.depth;
    const cx = Math.floor(W / 2);
    const cz = Math.floor(D / 2);
    b.floor(rect(0, 0, W - 1, D - 1), 0, variant === 0 ? 'pathAlt' : 'path');
    // The shaft: water two blocks deep under a ring of stone.
    b.set(cx, 0, cz, BlockType.WATER);
    b.floor(rect(cx - 1, cz - 1, cx + 1, cz + 1), 0, 'stone');
    b.set(cx, 0, cz, BlockType.WATER);
    b.ring(rect(cx - 1, cz - 1, cx + 1, cz + 1), 1, 1, 'stone');
    b.ring(rect(cx - 1, cz - 1, cx + 1, cz + 1), 2, 2, 'stoneSlab', 0);
    // The posts at the east and west of the ring, a beam across, the bucket hanging in the middle.
    b.column(cx - 1, cz, 2, 4, 'post');
    b.column(cx + 1, cz, 2, 4, 'post');
    b.set(cx - 1, 2, cz, 'post');
    b.beam(cx - 1, cz, cx + 1, cz, 5, 'beam');
    b.set(cx, 4, cz, T.BUCKET);
    b.set(cx, 3, cz, 'fence');
    if (variant === 0) {
      // A hood over the well: a small hip roof on the two posts' beam, the eaves one block out.
      b.beam(cx - 1, cz - 1, cx + 1, cz - 1, 5, 'beam');
      b.beam(cx - 1, cz + 1, cx + 1, cz + 1, 5, 'beam');
      b.column(cx - 1, cz - 1, 3, 4, 'post');
      b.column(cx + 1, cz - 1, 3, 4, 'post');
      b.column(cx - 1, cz + 1, 3, 4, 'post');
      b.column(cx + 1, cz + 1, 3, 4, 'post');
      b.hip(rect(cx - 1, cz - 1, cx + 1, cz + 1), 5, { profile: FLARED_TIGHT, tips: 1 });
      b.stoneLantern(1, 1, 1);
      b.stoneLantern(W - 2, 1, D - 2);
    } else {
      b.set(cx + 2, 1, cz + 1, T.BARREL);
      b.set(cx - 2, 1, cz - 1, T.CRATE);
      b.set(cx + 2, 1, cz - 2, T.BUCKET);
    }
    const bp = b.build();
    return mirror ? mirrorX(bp, W) : bp;
  }
}
