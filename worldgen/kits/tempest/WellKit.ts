import { TempestBlock as T } from '../../../content/blocksTempest';
import { BlockType } from '../../../worldConstants';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, rect } from '../../structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../structures/BuildingKit';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';
import { STEEP } from '../../structures/roofProfile';
import { bench, mirrorX, planter } from './parts';

// A well in a little paved square: a ring of mossy stone round the water, two posts and a cross beam with the bucket
// hanging from it.
//   variant 0  a small gabled roof over the beam with a ridge cap, fan paving round it, stone lanterns at the corners
//   variant 1  a plain rope well with no roof, barrels, crates and a bench on a square of ordinary paving, planters
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
    const cx = Math.floor((W - 1) / 2);
    const cz = Math.floor((D - 1) / 2);
    const ring = rect(cx - 1, cz - 1, cx + 1, cz + 1);
    b.floor(rect(0, 0, W - 1, D - 1), 0, variant === 0 ? 'pathAlt' : 'path');
    // The shaft: water under a ring of mossy stone, a slab rim on its north and south sides.
    b.floor(ring, 0, 'stone');
    b.set(cx, 0, cz, BlockType.WATER);
    b.ring(ring, 1, 1, 'stone');
    for (let x = cx - 1; x <= cx + 1; x++) { b.set(x, 2, cz - 1, 'stoneSlab', 0); b.set(x, 2, cz + 1, 'stoneSlab', 0); }
    // Two posts on the east and west of the ring, a beam across, the bucket hanging from its middle.
    b.column(cx - 1, cz, 2, 4, 'post');
    b.column(cx + 1, cz, 2, 4, 'post');
    b.beam(cx - 1, cz, cx + 1, cz, 5, 'beam');
    b.set(cx, 4, cz, T.BUCKET);
    if (variant === 0) {
      b.gable(rect(cx - 1, cz, cx + 1, cz), 5, { profile: STEEP, axis: 'x', tips: 0 });
      const lanterns: Array<[number, number]> = [[1, 1], [W - 2, D - 2]];
      if (rng.chance(0.5)) lanterns.push([W - 2, 1], [1, D - 2]);
      for (const [x, z] of lanterns) b.stoneLantern(x, 1, z);
    } else {
      b.set(cx + 2, 1, cz + 1, T.BARREL);
      b.set(cx - 2, 1, cz - 1, T.CRATE);
      b.set(cx + 2, 1, cz - 2, T.BUCKET);
      if (W >= 7 && D >= 7) bench(b, 1, D - 2, 'x');
      if (rng.chance(0.6)) planter(b, W - 3, 1, D - 2, 2, 'x');
    }
    const bp = b.build();
    return mirror ? mirrorX(bp, W) : bp;
  }
}
