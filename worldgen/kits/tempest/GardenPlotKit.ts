import { TempestBlock as T } from '../../../content/blocksTempest';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, SOUTH, rect } from '../../structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../structures/BuildingKit';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';
import { FLARED_TIGHT } from '../../structures/roofProfile';
import { layGarden, layKitchenGarden } from './garden';
import { mirrorX, roofOver, bays } from './parts';

// A garden plot: a lot with no house on it, which the town keeps as a place to sit, to grow food or to look at.
//   variant 0  a pond garden: a bamboo fence with a gate, stepping stones, a pond with koi and a small arched bridge,
//              stone lanterns, a bench, boulders, a bamboo clump and places left for sakura and cedar
//   variant 1  a kitchen garden: furrows of crops, a scarecrow, a barrel and crates, a tool hut with a tiled hip roof
export class GardenPlotKit extends BuildingKit {
  readonly name = 'garden-plot';
  readonly frontage: KitSize = { min: 9, max: 27 };
  readonly depth: KitSize = { min: 9, max: 27 };
  readonly floors: KitSize = { min: 1, max: 1 };
  readonly variants = 2;

  preferredSize(): { frontage: number; depth: number; floors: number } {
    return { frontage: 17, depth: 15, floors: 1 };
  }

  build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const W = lot.frontage;
    const D = lot.depth;
    const mirror = rng.chance(0.5);
    const g = rect(1, 1, W - 2, D - 2);
    if (variant === 0) {
      layGarden(b, g, rng, { pond: true, bridge: true, lanterns: 2, bench: true, trees: 3, bamboo: true, rock: rng.chance(0.4) });
    } else {
      // The hut at the back; the crops in front of it.
      const hut = rect(Math.floor(W / 2) - 3, 2, Math.floor(W / 2) + 2, 6);
      b.floor(hut, 0, 'wallBase');
      b.frame(hut, 1, 3, { panel: 'wall', post: 'post', spacing: 5 });
      b.beamRing(hut, 4, 'beam');
      b.opening(hut, { side: SOUTH, at: 2, y: 1, kind: 'door', noren: true });
      for (const bay of bays(hut, SOUTH, 5)) if (bay.at !== 1) b.opening(hut, { side: SOUTH, at: bay.at, y: 2, width: 1, kind: 'lattice' });
      roofOver(b, hut, 4, { kind: 'hip', profile: FLARED_TIGHT, tips: 1 });
      b.floor(rect(hut.x0 + 1, hut.z0 + 1, hut.x1 - 1, hut.z1 - 1), 0, 'interiorFloor');
      b.set(hut.x0 + 1, 1, hut.z0 + 1, T.CRATE);
      b.set(hut.x1 - 1, 1, hut.z0 + 1, T.BARREL);
      // The crops.
      const field = rect(2, hut.z1 + 3, W - 3, D - 3);
      if (field.z1 - field.z0 >= 3) layKitchenGarden(b, field, rng);
      b.fenceRect(rect(1, hut.z1 + 2, W - 2, D - 2), 1, [[Math.floor(W / 2) - 1, D - 2], [Math.floor(W / 2), D - 2], [Math.floor(W / 2) + 1, D - 2]]);
      // A scarecrow: a post with a crossbar and a barrel for a head.
      const sx = Math.floor(W / 2) + 3;
      const sz = Math.floor((field.z0 + field.z1) / 2);
      b.column(sx, sz, 1, 3, T.BAMBOO_POLE);
      b.beam(sx - 1, sz, sx + 1, sz, 3, T.BAMBOO_POLE);
      b.set(sx, 4, sz, T.VASE);
      b.stoneLantern(1, 1, D - 1);
      b.treeSpot(1, 1, 'sakura');
      b.treeSpot(W - 2, 1, 'cedar');
      b.set(W - 3, 1, hut.z1 + 1, T.BARREL);
      b.set(W - 4, 1, hut.z1 + 1, T.CRATE);
    }
    const bp = b.build();
    return mirror ? mirrorX(bp, W) : bp;
  }
}
