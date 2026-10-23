import { NatureBlock } from '../../content/blocksNature';
import { BlockType } from '../../worldConstants';
import { Biome } from '../biomes/Biome';
import { Rng } from '../noise';
import { BlockList, Place } from './BlockList';
import { Feature, FeatureContext } from './Feature';

// A rounded rock that follows the ground: each column gets a stack as tall as the dome is there.
export class Boulder extends Feature {
  constructor() { super('boulder', 4); }

  build(ctx: FeatureContext, rng: Rng, out: BlockList): void {
    const big = rng.chance(0.2);
    const r = big ? rng.range(2.6, 3.7) : rng.range(1.3, 2.6);
    const stoneLike = ctx.biome === Biome.ROCKY_HILLS || ctx.biome === Biome.ALPINE;
    const body = stoneLike ? (rng.chance(0.4) ? NatureBlock.GRANITE : BlockType.STONE) : rng.chance(0.6) ? BlockType.MOSSY_COBBLESTONE : BlockType.STONE;
    const cap = ctx.biome === Biome.ALPINE ? BlockType.SNOW : body;
    const lim = Math.ceil(r);
    for (let dz = -lim; dz <= lim; dz++) {
      for (let dx = -lim; dx <= lim; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > r * r) continue;
        const top = Math.floor(Math.sqrt(r * r - d2) * 0.85 + rng.next() * 0.5);
        for (let dy = 1; dy <= top; dy++) out.add(dx, dy, dz, dy === top ? cap : body, Place.LAND);
      }
    }
  }
}
