import { TempestBlock as T } from '../../../content/blocksTempest';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder } from '../../structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../structures/BuildingKit';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';

// A market stall: four bamboo posts, a striped awning, a counter with goods on it and heaps behind, red paper lanterns under
// the cloth. The planner puts them along the boundary road, where the plan has "small stalls".
//   variant 0 rice and vases, 1 barrels and crates, 2 a lantern stall (the lanterns are the goods)
export class StallKit extends BuildingKit {
  readonly name: string = 'street-stall';
  readonly frontage: KitSize = { min: 4, max: 6 };
  readonly depth: KitSize = { min: 2, max: 3 };
  readonly floors: KitSize = { min: 1, max: 1 };
  readonly variants = 3;

  preferredSize(): { frontage: number; depth: number; floors: number } {
    return { frontage: 4, depth: 2, floors: 1 };
  }

  build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const W = lot.frontage, D = lot.depth;
    const front = D - 1;
    for (const x of [0, W - 1]) for (const z of [0, front]) b.column(x, z, 1, 3, T.BAMBOO_POLE);
    // The cloth over the whole stall, falling to the front, in two colours; lanterns hanging from its front edge.
    for (let x = 0; x < W; x++) for (let z = 0; z <= front; z++) b.set(x, 4, z, (x + variant) % 2 === 0 ? 'awning' : 'awningAlt', 0);
    for (let x = 1; x < W - 1; x++) b.set(x, 3, front, variant === 2 ? 'lightAlt' : 'light');
    // The counter and what is on it.
    for (let x = 1; x < W - 1; x++) b.set(x, 1, front, T.CRATE);
    const goods = variant === 0 ? [T.RICE_BALE, T.VASE] : variant === 1 ? [T.BUCKET, T.BARREL] : [T.VASE, T.CUSHION];
    for (let x = 1; x < W - 1; x++) b.set(x, 2, front, goods[(x + rng.int(2)) % 2]);
    // Heaps at the back.
    b.set(1, 1, 0, variant === 1 ? T.BARREL : T.CRATE);
    if (W > 4 || variant === 1) b.set(W - 2, 1, 0, variant === 0 ? T.RICE_BALE : T.BARREL);
    return b.build();
  }
}
