import { NatureBlock } from '../../content/blocksNature';
import { BlockType } from '../../worldConstants';
import { SimplexNoise, hash2, hash2f } from '../noise';
import { clearanceFromZones } from '../zones/ZoneClearance';

// Cobblestone within this many blocks of a zone, packed path further out, plain dirt beyond that. The same three
// steps the old wilderness road made (cobblestone near the Town, path, dirt), measured from the nearest zone instead
// of from the origin, and with a noise added to the distance so the changes are ragged.
const COBBLE_UNTIL = 130;
const PATH_UNTIL = 520;
const NOISE_BLOCKS = 70;

// What a road is paved with. A function of position and the seed alone.
export class RoadSurface {
  private readonly noise: SimplexNoise;
  private readonly seed: number;

  constructor(seed: number) {
    this.seed = seed;
    this.noise = new SimplexNoise(hash2(84, 0x70ad, seed) | 0);
  }

  // `gap` is the distance from the road's edge (negative inside), so the outermost column wears away.
  blockAt(x: number, z: number, gap: number): number {
    const outside = Math.max(0, clearanceFromZones(x, z));
    const d = outside + NOISE_BLOCKS * this.noise.noise2(x * 0.02 + 7, z * 0.02);
    const r = hash2f(x, z, this.seed + 0x2f1d);
    if (d < COBBLE_UNTIL) {
      if (gap > -1 && r > 0.55) return BlockType.PATH;
      return d > 50 && r > 0.93 ? BlockType.MOSSY_COBBLESTONE : BlockType.COBBLESTONE;
    }
    if (d < PATH_UNTIL) {
      if (gap > -1 && r > 0.6) return BlockType.DIRT;
      return r > 0.96 ? NatureBlock.GRAVEL : BlockType.PATH;
    }
    return r > 0.94 ? NatureBlock.GRAVEL : BlockType.DIRT;
  }
}
