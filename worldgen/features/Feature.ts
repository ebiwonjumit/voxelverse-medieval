import { Rng } from '../noise';
import { Biome } from '../biomes/Biome';
import { BlockList } from './BlockList';

// What a feature knows about the place it grows from.
export interface FeatureContext {
  readonly x: number;
  readonly z: number;
  readonly ground: number;
  readonly biome: Biome;
}

// Something that grows or lies in the wilderness: a tree, a boulder, a patch of ferns. A feature is stateless. It
// describes itself as a list of blocks relative to its origin, drawn from the Rng it is given, so the same origin
// and seed always give the same feature no matter which chunk asks for it.
export abstract class Feature {
  // `radius` is the furthest any block reaches from the origin along x or z. The placer uses it to know which
  // origins can touch a chunk, and to keep features clear of roads and zones.
  constructor(readonly name: string, readonly radius: number) {}

  abstract build(ctx: FeatureContext, rng: Rng, out: BlockList): void;
}
