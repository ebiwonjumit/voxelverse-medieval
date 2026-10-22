import { NatureBlock } from '../../content/blocksNature';
import { BlockType } from '../../worldConstants';
import { Biome } from '../biomes/Biome';
import { Rng } from '../noise';
import { BlockList, Place } from './BlockList';
import { Feature, FeatureContext } from './Feature';

type Mix = ReadonlyArray<readonly [number, number]>; // [block, weight]

const FLOWERS_MEADOW: Mix = [
  [BlockType.FLOWER_YELLOW, 3], [BlockType.FLOWER_RED, 2], [NatureBlock.WILDFLOWER_BLUE, 2],
  [NatureBlock.WILDFLOWER_WHITE, 3], [NatureBlock.WILDFLOWER_PINK, 2], [NatureBlock.WILDFLOWER_PURPLE, 1],
];

// What grows in a patch, by biome: weighted blocks, so a fern wood gets mostly ferns and the odd mushroom.
const MIX: Record<Biome, Mix> = {
  [Biome.MEADOW]: [[BlockType.TALL_GRASS, 6], ...FLOWERS_MEADOW],
  [Biome.BIRCH_WOOD]: [[BlockType.TALL_GRASS, 4], [NatureBlock.FERN, 4], [NatureBlock.WILDFLOWER_WHITE, 2], [NatureBlock.MUSHROOM_BROWN, 1], [NatureBlock.FALLEN_LEAVES, 3]],
  [Biome.OAK_WOOD]: [[BlockType.TALL_GRASS, 5], [NatureBlock.FERN, 2], [BlockType.FLOWER_RED, 1], [BlockType.FLOWER_YELLOW, 1], [NatureBlock.MUSHROOM_RED, 1], [NatureBlock.MUSHROOM_BROWN, 1], [NatureBlock.FALLEN_LEAVES, 3]],
  [Biome.CEDAR_FOREST]: [[NatureBlock.FERN, 8], [NatureBlock.MUSHROOM_BROWN, 2], [NatureBlock.MUSHROOM_RED, 1], [NatureBlock.FALLEN_LEAVES, 3], [BlockType.TALL_GRASS, 1]],
  [Biome.PINE_FOREST]: [[NatureBlock.FERN, 4], [BlockType.TALL_GRASS, 3], [NatureBlock.MUSHROOM_BROWN, 2], [NatureBlock.MUSHROOM_RED, 1], [NatureBlock.FALLEN_LEAVES, 3]],
  [Biome.BAMBOO_GROVE]: [[NatureBlock.FERN, 5], [BlockType.TALL_GRASS, 5], [NatureBlock.MUSHROOM_BROWN, 1], [NatureBlock.FALLEN_LEAVES, 2]],
  [Biome.SAKURA_GROVE]: [[NatureBlock.SAKURA_PETALS, 6], [BlockType.TALL_GRASS, 2], [NatureBlock.WILDFLOWER_PINK, 3], [NatureBlock.WILDFLOWER_WHITE, 2], [NatureBlock.FERN, 1]],
  [Biome.WETLAND]: [[BlockType.TALL_GRASS, 5], [NatureBlock.FERN, 2], [NatureBlock.WILDFLOWER_BLUE, 2], [NatureBlock.MUSHROOM_BROWN, 1]],
  [Biome.ROCKY_HILLS]: [[BlockType.TALL_GRASS, 4], [BlockType.SMALL_ROCK, 3], [NatureBlock.WILDFLOWER_PURPLE, 2], [NatureBlock.FERN, 1]],
  [Biome.ALPINE]: [[NatureBlock.WILDFLOWER_PURPLE, 2], [NatureBlock.WILDFLOWER_WHITE, 2], [BlockType.SMALL_ROCK, 3]],
  [Biome.BEACH]: [[BlockType.TALL_GRASS, 1]],
};

const TOTAL = Object.fromEntries(Object.entries(MIX).map(([b, m]) => [b, m.reduce((s, e) => s + e[1], 0)])) as Record<number, number>;

// A round patch of ground cover. Each column picks from the biome's mix and the patch thins out towards its edge.
export class UndergrowthPatch extends Feature {
  constructor() { super('undergrowth', 6); }

  build(ctx: FeatureContext, rng: Rng, out: BlockList): void {
    const r = 3 + rng.int(4);
    const mix = MIX[ctx.biome];
    const total = TOTAL[ctx.biome];
    // Some patches are all one kind (a bed of ferns, a carpet of flowers), most are mixed.
    const single = rng.chance(0.35) ? mix[rng.int(mix.length)][0] : -1;
    const density = rng.range(0.35, 0.8);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > r || !rng.chance(density * (1 - 0.7 * (d / r)))) continue;
        let id = single;
        if (id < 0) {
          let roll = rng.next() * total;
          id = mix[0][0];
          for (const [block, w] of mix) {
            roll -= w;
            if (roll <= 0) { id = block; break; }
          }
        }
        // Small rocks sit on bare ground too; everything else needs soil to root in.
        out.add(dx, 1, dz, id, id === BlockType.SMALL_ROCK ? Place.LAND : Place.SOIL);
      }
    }
  }
}
