import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, rect } from '../../structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../structures/BuildingKit';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';

// The placeholder for the east bridge until the landmark's own arched bridge exists: a straight deck of lacquered planks at
// the road's height with rails, lantern posts at the ends and timber piers every four cells down into the river bed. The
// deck runs along x (the road east crosses the river there); the piers are drawn below the ground row, so the generator
// shows them only where the river has taken the ground away.
export class PlaceholderBridgeKit extends BuildingKit {
  readonly name: string = 'placeholder-bridge';
  readonly frontage: KitSize = { min: 9, max: 60 };
  readonly depth: KitSize = { min: 5, max: 15 };
  readonly floors: KitSize = { min: 1, max: 1 };

  preferredSize(): { frontage: number; depth: number; floors: number } {
    return { frontage: 23, depth: 13, floors: 1 };
  }

  build(lot: Lot, style: StylePack, rng: Rng): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const W = lot.frontage, D = lot.depth;
    const half = 4;
    const cz = Math.floor(D / 2);
    const deck = rect(0, cz - half, W - 1, cz + half);
    b.floor(deck, 0, 'accent');
    b.floor(rect(0, cz - 2, W - 1, cz + 2), 0, 'floor');
    for (const z of [deck.z0, deck.z1]) {
      b.beam(0, z, W - 1, z, 0, 'beam');
      b.fence(0, z, W - 1, z, 1, 'rail');
    }
    for (let x = 2; x < W - 1; x += 4) {
      for (const z of [deck.z0, deck.z1]) { b.column(x, z, -12, -1, 'post'); b.column(x, z, 1, 3, 'post'); }
      for (const z of [deck.z0, deck.z1]) b.set(x, 4, z, x % 8 === 2 ? 'light' : 'lightAlt');
    }
    return b.build();
  }
}
