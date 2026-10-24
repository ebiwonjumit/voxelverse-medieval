import { Rng } from '../noise';
import { Blueprint } from './Blueprint';
import { BlueprintBuilder, SOUTH, rect } from './BlueprintBuilder';
import { BuildingKit, KitSize } from './BuildingKit';
import { Lot } from './Lot';
import { StylePack } from './StylePack';
import { RoofProfile } from './roofProfile';

// One block of overhang and a plain stair roof: the placeholder does not show off the style's curved eaves.
const PLAIN_ROOF: RoofProfile = { name: 'box', overhang: 1, tail: 'steep', rings: [{ shape: 'stair', y: -1 }, { shape: 'stair', y: 0 }] };

// The placeholder: a plain walled box with a door, windows and a hip roof, in whatever style it is given. It exists so
// a zone can fill every lot with something real before the proper kits are written, and so a new style pack can be tried
// on a building at once. Nothing about it is Japanese on purpose.
export class BoxHouseKit extends BuildingKit {
  readonly name: string = 'box-house';
  readonly frontage: KitSize = { min: 5, max: 40 };
  readonly depth: KitSize = { min: 5, max: 40 };
  readonly floors: KitSize = { min: 1, max: 3 };

  preferredSize(): { frontage: number; depth: number; floors: number } {
    return { frontage: 11, depth: 9, floors: 2 };
  }

  build(lot: Lot, style: StylePack, rng: Rng): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const w = lot.frontage;
    const d = lot.depth;
    // The roof overhangs by one block, so the walls stand one block in from the lot on every side.
    const walls = rect(1, 1, w - 2, d - 2);
    const storeyHeight = 3;
    const top = lot.floors * storeyHeight;
    b.floor(walls, 0, 'wallBase');
    b.walls(walls, 1, top, 'wall');
    const doorAt = Math.floor((walls.x1 - walls.x0) / 2);
    b.opening(walls, { side: SOUTH, at: doorAt, y: 1, kind: 'door' });
    for (let f = 0; f < lot.floors; f++) {
      const y = 2 + f * storeyHeight;
      for (let x = walls.x0 + 1; x < walls.x1; x += 3) {
        if (f === 0 && Math.abs(x - walls.x0 - doorAt) <= 1) continue;
        b.opening(walls, { side: SOUTH, at: x - walls.x0, y, kind: 'glass' });
      }
    }
    b.hip(walls, top, { profile: PLAIN_ROOF, ridgeCap: false });
    return b.build();
  }
}
