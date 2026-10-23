import { NatureBlock } from '../../content/blocksNature';
import { BlockType } from '../../worldConstants';
import { Biome } from '../biomes/Biome';
import { Rng } from '../noise';
import { BlockList, Place } from './BlockList';
import { Feature, FeatureContext } from './Feature';
import { blob, disc, scatter, trunk } from './shapes';

// Every tree is a trunk from the ground up and leaves over it. Dy 1 is the block on top of the surface.

export class OakTree extends Feature {
  constructor() { super('oak', 6); }

  build(_ctx: FeatureContext, rng: Rng, out: BlockList): void {
    const big = rng.chance(0.16);
    const h = big ? 7 + rng.int(3) : 4 + rng.int(3);
    trunk(out, 1, h, BlockType.WOOD_LOG);
    if (big) {
      blob(out, 0, h + 1, 0, 3.6, 2.8, BlockType.LEAVES, rng);
      blob(out, 3, h - 1, 1, 2.2, 1.8, BlockType.LEAVES, rng);
      blob(out, -3, h, -1, 2.2, 1.8, BlockType.LEAVES, rng);
      blob(out, 1, h, -3, 2, 1.6, BlockType.LEAVES, rng);
    } else {
      blob(out, 0, h, 0, 2.6, 2.2, BlockType.LEAVES, rng);
      if (rng.chance(0.5)) blob(out, rng.chance(0.5) ? 2 : -2, h - 1, rng.chance(0.5) ? 1 : -1, 1.8, 1.5, BlockType.LEAVES, rng);
    }
  }
}

export class BirchTree extends Feature {
  constructor() { super('birch', 4); }

  build(_ctx: FeatureContext, rng: Rng, out: BlockList): void {
    const h = 5 + rng.int(4);
    trunk(out, 1, h, BlockType.BIRCH_LOG);
    // Slim and tall: an oval crown that starts well up the trunk.
    blob(out, 0, h, 0, 2.2, 3, BlockType.BIRCH_LEAVES, rng);
    if (rng.chance(0.4)) blob(out, rng.chance(0.5) ? 1 : -1, h - 2, rng.chance(0.5) ? 1 : -1, 1.6, 1.6, BlockType.BIRCH_LEAVES, rng);
  }
}

export class PineTree extends Feature {
  constructor() { super('pine', 4); }

  build(ctx: FeatureContext, rng: Rng, out: BlockList): void {
    const h = 8 + rng.int(6);
    const maxR = h > 11 ? 4 : 3;
    const leaves = ctx.biome === Biome.ALPINE ? NatureBlock.SNOWY_PINE_LEAVES : BlockType.PINE_LEAVES;
    trunk(out, 1, h + 1, NatureBlock.PINE_LOG);
    // A cone of discs from the crown down: wide discs alternate with narrow ones so the tiers show.
    const first = 3;
    for (let dy = h + 2, i = 0; dy >= first; dy--, i++) {
      let r = Math.min(maxR, Math.floor(i * 0.42) + (i === 0 ? 0 : 1));
      if (i % 3 === 2 && r > 1) r--;
      if (r === 0) out.add(0, dy, 0, leaves);
      else disc(out, dy, r, leaves, rng, 0.25);
    }
  }
}

export class CedarTree extends Feature {
  constructor() { super('cedar', 4); }

  build(_ctx: FeatureContext, rng: Rng, out: BlockList): void {
    const h = 12 + rng.int(9);
    trunk(out, 1, h, NatureBlock.CEDAR_LOG);
    // Tall and slim, with the crown in separate layers: a wide disc and a narrower one under it, every other block.
    out.add(0, h + 1, 0, NatureBlock.CEDAR_LEAVES);
    out.add(0, h + 2, 0, NatureBlock.CEDAR_LEAVES);
    for (let tier = 0, dy = h; dy >= 5; tier++, dy -= 2) {
      const r = Math.min(3, 1 + Math.floor(tier * 0.5));
      disc(out, dy, r, NatureBlock.CEDAR_LEAVES, rng, 0.2);
      if (r > 1) disc(out, dy - 1, r - 1, NatureBlock.CEDAR_LEAVES, rng, 0.1);
    }
  }
}

export class SakuraTree extends Feature {
  constructor() { super('sakura', 8); }

  build(_ctx: FeatureContext, rng: Rng, out: BlockList): void {
    const h = 3 + rng.int(3);
    trunk(out, 1, h, NatureBlock.SAKURA_LOG);
    // Two limbs lean out of the top of the trunk, and the crown is wide and flat, like a parasol.
    const lean = rng.chance(0.5) ? 1 : -1;
    out.add(lean, h, 0, NatureBlock.SAKURA_LOG);
    out.add(lean * 2, h + 1, 0, NatureBlock.SAKURA_LOG);
    out.add(-lean, h, rng.chance(0.5) ? 1 : -1, NatureBlock.SAKURA_LOG);
    blob(out, 0, h + 2, 0, 4.6, 2.4, NatureBlock.SAKURA_LEAVES, rng);
    const lobes = 3 + rng.int(2);
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const d = 3.4 + rng.next();
      blob(out, Math.round(Math.cos(a) * d), h + 1, Math.round(Math.sin(a) * d), 2.6, 1.8, NatureBlock.SAKURA_LEAVES, rng);
    }
    // Petals drift down on the ground under it.
    scatter(out, 5, 0.4, NatureBlock.SAKURA_PETALS, rng, Place.SOIL);
  }
}
