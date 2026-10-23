import { NatureBlock } from '../../content/blocksNature';
import { BlockType } from '../../worldConstants';
import { Biome } from '../biomes/Biome';
import { Rng } from '../noise';
import { BlockList, Place } from './BlockList';
import { Feature, FeatureContext } from './Feature';

const LOG: Partial<Record<Biome, number>> = {
  [Biome.BIRCH_WOOD]: BlockType.BIRCH_LOG,
  [Biome.CEDAR_FOREST]: NatureBlock.CEDAR_LOG,
  [Biome.PINE_FOREST]: NatureBlock.PINE_LOG,
  [Biome.SAKURA_GROVE]: NatureBlock.SAKURA_LOG,
};

// A trunk lying on the ground, with mushrooms on it now and then.
export class FallenLog extends Feature {
  constructor() { super('fallen_log', 4); }

  build(ctx: FeatureContext, rng: Rng, out: BlockList): void {
    const id = LOG[ctx.biome] ?? BlockType.WOOD_LOG;
    const len = 4 + rng.int(4);
    const alongX = rng.chance(0.5);
    for (let i = 0; i < len; i++) {
      const o = i - (len >> 1);
      const dx = alongX ? o : 0;
      const dz = alongX ? 0 : o;
      out.add(dx, 1, dz, id, Place.LAND);
      if (rng.chance(0.18)) out.add(dx, 2, dz, rng.chance(0.5) ? NatureBlock.MUSHROOM_BROWN : NatureBlock.MUSHROOM_RED, Place.LAND);
    }
  }
}
