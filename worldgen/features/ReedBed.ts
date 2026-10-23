import { NatureBlock } from '../../content/blocksNature';
import { Rng } from '../noise';
import { BlockList, Place } from './BlockList';
import { Feature, FeatureContext } from './Feature';

// Reeds along a river bank or a pond. The origin sits near water; each reed is only placed if its own column is
// on the shore.
export class ReedBed extends Feature {
  constructor() { super('reeds', 5); }

  build(_ctx: FeatureContext, rng: Rng, out: BlockList): void {
    const r = 3 + rng.int(3);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > r || !rng.chance(0.75 * (1 - 0.5 * (d / r)))) continue;
        const h = 2 + rng.int(3);
        for (let dy = 1; dy <= h; dy++) out.add(dx, dy, dz, NatureBlock.REEDS, Place.SHORE);
      }
    }
  }
}
