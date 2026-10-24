import { TempestBlock as T } from '../../../content/blocksTempest';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder } from '../../structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../structures/BuildingKit';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';

// The street furniture of the town, one per variant: the lamp post with paper lanterns, the stone lantern in its bed of
// moss, and the post that carries a lump of blue magic ore. Three by three, so they fit a corner of any lot or a verge.
//   variant 0 a lamp post with two red lanterns on a crossbar, 1 a stone lantern on a mossy base, 2 an ore lamp post
export class LanternPostKit extends BuildingKit {
  readonly name = 'lantern-post';
  readonly frontage: KitSize = { min: 3, max: 5 };
  readonly depth: KitSize = { min: 3, max: 5 };
  readonly floors: KitSize = { min: 1, max: 1 };
  readonly variants = 3;

  preferredSize(): { frontage: number; depth: number; floors: number } {
    return { frontage: 3, depth: 3, floors: 1 };
  }

  build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const cx = Math.floor(lot.frontage / 2);
    const cz = Math.floor(lot.depth / 2);
    // A square of paving the post stands in, so it reads on grass and on a street alike.
    b.floor({ x0: cx - 1, z0: cz - 1, x1: cx + 1, z1: cz + 1 }, 0, 'path');
    if (variant === 1) {
      b.floor({ x0: cx - 1, z0: cz - 1, x1: cx + 1, z1: cz + 1 }, 0, 'stone');
      b.stoneLantern(cx, 1, cz);
      b.set(cx - 1, 1, cz + 1, 'stoneSlab', 0);
      b.set(cx + 1, 1, cz - 1, 'stoneSlab', 0);
      return b.build();
    }
    b.set(cx, 1, cz, 'stone');
    b.column(cx, cz, 2, 4, 'post');
    if (variant === 0) {
      // A crossbar under the cap with a lantern hanging from each end, and a small roof on top.
      b.beam(cx - 1, cz, cx + 1, cz, 4, 'beam');
      b.set(cx - 1, 3, cz, 'light');
      b.set(cx + 1, 3, cz, 'light');
      b.set(cx, 5, cz, 'roofSlab', 0);
      b.set(cx - 1, 5, cz, 'roofSlab', 0);
      b.set(cx + 1, 5, cz, 'roofSlab', 0);
      b.set(cx, 6, cz, 'ridgeHorn', 0);
    } else {
      b.set(cx, 5, cz, T.BLUE_ORE_LAMP);
    }
    return b.build();
  }
}
