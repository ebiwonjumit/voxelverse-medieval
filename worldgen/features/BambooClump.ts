import { NatureBlock } from '../../content/blocksNature';
import { Rng } from '../noise';
import { BlockList, Place } from './BlockList';
import { Feature, FeatureContext } from './Feature';

// A cluster of slim stalks, each standing on its own ground, with a tuft of leaves at the top.
export class BambooClump extends Feature {
  constructor() { super('bamboo', 4); }

  build(_ctx: FeatureContext, rng: Rng, out: BlockList): void {
    const stalks = 5 + rng.int(6);
    const used = new Set<number>();
    for (let n = 0; n < stalks; n++) {
      const a = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.next()) * 2.6;
      const dx = Math.round(Math.cos(a) * d);
      const dz = Math.round(Math.sin(a) * d);
      const key = dx * 16 + dz;
      if (used.has(key)) continue;
      used.add(key);
      const h = 6 + rng.int(8);
      for (let dy = 1; dy <= h; dy++) out.add(dx, dy, dz, NatureBlock.BAMBOO, Place.SOIL);
      out.add(dx, h + 1, dz, NatureBlock.BAMBOO_LEAVES, Place.SOIL);
      for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (rng.chance(0.55)) out.add(dx + ox, h, dz + oz, NatureBlock.BAMBOO_LEAVES, Place.SOIL);
        if (rng.chance(0.25)) out.add(dx + ox, h - 1, dz + oz, NatureBlock.BAMBOO_LEAVES, Place.SOIL);
      }
    }
  }
}
