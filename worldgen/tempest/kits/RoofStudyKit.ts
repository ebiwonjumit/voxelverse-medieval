import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, SOUTH, rect } from '../../structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../structures/BuildingKit';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';
import { FLARED, FLARED_DEEP, GENTLE, STEEP } from '../../structures/roofProfile';

// The roof study: the same walls under each of the builder's roofs, one variant each, so a roof can be judged on its own
// in the viewer (`?sandbox=kits&row=roof-study`). It is a test bench, not a building: no door, no furniture.
//   0 gable, flared      1 hip, flared      2 hip and gable (irimoya)      3 two storeys: skirt roof under a hip
//   4 gable, steep (Western)      5 gable, gentle      6 gable, deep flare
export class RoofStudyKit extends BuildingKit {
  readonly name = 'roof-study';
  readonly frontage: KitSize = { min: 9, max: 31 };
  readonly depth: KitSize = { min: 9, max: 31 };
  readonly variants = 7;

  preferredSize(variant = 0): { frontage: number; depth: number; floors: number } {
    return variant === 3 ? { frontage: 17, depth: 17, floors: 2 } : variant === 6 ? { frontage: 19, depth: 17, floors: 1 } : { frontage: 15, depth: 15, floors: 1 };
  }

  build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const W = lot.frontage;
    const D = lot.depth;
    const profile = variant === 4 ? STEEP : variant === 5 ? GENTLE : variant === 6 ? FLARED_DEEP : FLARED;
    const o = profile.overhang;
    const walls = rect(o, o, W - 1 - o, D - 1 - o);
    const base = 1;
    b.floor(walls, 0, 'wallBase');
    const wallTop = variant === 3 ? 4 : 4;
    b.frame(walls, base, wallTop - 1, { panel: 'wall', post: 'post', spacing: 4 });
    b.beamRing(walls, wallTop, 'beam');
    b.opening(walls, { side: SOUTH, at: Math.floor((walls.x1 - walls.x0) / 2), y: base, kind: 'door' });
    switch (variant) {
      case 0: case 4: case 5: case 6:
        b.gable(walls, wallTop, { profile, axis: 'x', tips: variant === 0 || variant === 6 ? 2 : 0 });
        break;
      case 1:
        b.hip(walls, wallTop, { profile, tips: 2 });
        break;
      case 2:
        b.hipGable(walls, wallTop, { profile, tips: 2 });
        break;
      default: {
        // A lower storey with a skirt roof of two rings, an upper storey standing inside it, a hip above.
        const outer = { x0: 0, z0: 0, x1: W - 1, z1: D - 1 };
        const inner = b.eaves(outer, wallTop + 1, FLARED.overhang + 2, FLARED, 2);
        if (inner) {
          const upper = rect(inner.x0, inner.z0, inner.x1, inner.z1);
          const y0 = wallTop + 2;
          b.floor(upper, y0 - 1, 'wallBase');
          b.frame(upper, y0, y0 + 2, { panel: 'wall', post: 'accent', spacing: 4 });
          b.beamRing(upper, y0 + 3, 'beam');
          b.hip(upper, y0 + 3, { profile: FLARED, tips: 2 });
        }
      }
    }
    return b.build();
  }
}
