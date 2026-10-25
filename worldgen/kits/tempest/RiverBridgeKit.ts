import { TempestBlock as T } from '../../../content/blocksTempest';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, NORTH, SOUTH } from '../../structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../structures/BuildingKit';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';

// The river bridge: an arched bridge over the river, its span along the lot's depth and its width along the frontage. The
// deck climbs from the bank in steps of one block to a crown and down again, so the height follows the span: a short
// crossing is nearly flat, a long one rises four blocks. Under the deck a vault of stone (or timber beams on trestle
// piers), at both ends abutments sunk below the bank and, on a long span, piers every twelve blocks; rails run along both
// edges and lamp posts stand at the ends and at the crown. Nothing is carved: the water and the banks beneath stay as the
// terrain made them, the piers just reach down into them.
//   variant 0  stone: a deck of paving, a vault of mossy stone, stone lanterns on the posts
//   variant 1  timber: planks on beams, vermilion rails and posts, paper lanterns, trestle piers
// The span (depth) is 9 to 49 blocks and the width (frontage) 5 to 13.

/** How far below the bank piers and abutments reach, so they stand in the river bed whatever its depth. */
export const BRIDGE_FOUNDATION = -6;

export class RiverBridgeKit extends BuildingKit {
  readonly name = 'river-bridge';
  readonly frontage: KitSize = { min: 5, max: 13 };
  readonly depth: KitSize = { min: 9, max: 49 };
  readonly floors: KitSize = { min: 1, max: 1 };
  readonly variants = 2;

  preferredSize(variant = 0): { frontage: number; depth: number; floors: number } {
    return variant === 0 ? { frontage: 7, depth: 23, floors: 1 } : { frontage: 5, depth: 19, floors: 1 };
  }

  /** The deck height in blocks above the bank at `z` along a span of `length`: a parabola climbing at most a block a block. */
  static deckHeight(z: number, length: number): number {
    const crown = Math.max(1, Math.min(4, Math.floor(length / 5)));
    const t = length <= 1 ? 0 : z / (length - 1);
    const raw = Math.round(crown * (1 - (2 * t - 1) * (2 * t - 1)));
    return Math.max(0, Math.min(raw, z, length - 1 - z));
  }

  build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const W = lot.frontage;
    const L = lot.depth;
    const stone = variant === 0;
    const lampEvery = 7 + rng.int(5);
    const ore = rng.chance(0.5);
    const x0 = 0;
    const x1 = W - 1;
    const dx0 = 1;
    const dx1 = W - 2;
    const h = Array.from({ length: L }, (_, z) => RiverBridgeKit.deckHeight(z, L));
    const abut = Math.min(3, Math.floor(L / 4));
    // The cell's walking row and what it is: a block, a stair rising to +z, or a stair rising to -z.
    const kind = (z: number): 'flat' | 'up' | 'down' => (z > 0 && h[z] > h[z - 1] ? 'up' : z > 0 && h[z] < h[z - 1] ? 'down' : 'flat');
    const row = (z: number): number => (kind(z) === 'down' ? h[z] + 1 : h[z]);
    const crown = Math.max(...h);
    const crownZ = Math.floor((L - 1) / 2);

    for (let z = 0; z < L; z++) {
      const r = row(z);
      const k = kind(z);
      for (let x = dx0; x <= dx1; x++) {
        // The deck.
        if (k === 'flat') b.set(x, r, z, stone ? (x === Math.floor((dx0 + dx1) / 2) && z % 4 === 0 ? 'pathAlt' : 'path') : 'floor');
        else b.stair(x, r, z, k === 'up' ? SOUTH : NORTH, stone ? 'stoneStairs' : 'stoneStairs');
        // What carries it. Over the banks: solid stone down into the ground; over the water: the vault (a soffit row) or beams.
        const bank = z < abut || z >= L - abut;
        if (bank) {
          for (let y = BRIDGE_FOUNDATION; y < r; y++) b.set(x, y, z, 'wallBase');
        } else if (stone) {
          for (let y = Math.max(r - 1, 0); y < r; y++) b.set(x, y, z, 'stone');
        }
      }
      if (!stone) {
        // Timber: three beams along the span under the deck and a cross beam every third cell.
        const ys = r - 1;
        if (ys >= 0 && !(z < abut || z >= L - abut)) {
          for (const x of [dx0, Math.floor((dx0 + dx1) / 2), dx1]) b.set(x, ys, z, 'beam');
          if (z % 3 === 0) for (let x = dx0; x <= dx1; x++) b.set(x, ys, z, 'beam');
        }
      }
    }

    // Piers: stone walls (or trestles of posts) from the river bed to the vault, every twelve blocks on a long span.
    const piers: number[] = [];
    for (let z = abut + 6; z < L - abut - 5; z += 12) piers.push(z);
    if (L > 30) piers.length = Math.max(piers.length, 1);
    for (const z of piers) {
      const top = row(z) - 2;
      if (stone) {
        for (let x = dx0 + 1; x <= dx1 - 1; x++) for (let y = BRIDGE_FOUNDATION; y <= Math.max(top, BRIDGE_FOUNDATION); y++) b.set(x, y, z, 'stone');
      } else {
        for (const x of [dx0, dx1]) for (let y = BRIDGE_FOUNDATION; y <= Math.max(top, BRIDGE_FOUNDATION); y++) b.set(x, y, z, 'post');
        for (let x = dx0; x <= dx1; x++) b.set(x, Math.max(top, BRIDGE_FOUNDATION), z, 'beam');
      }
    }
    // The abutments' faces: a ring of stone at the water's edge side so the end of the vault reads as an arch springing.
    if (stone) {
      for (const z of [abut, L - 1 - abut]) {
        const r = row(z);
        for (let x = dx0; x <= dx1; x++) {
          if (r - 2 >= 0) b.stair(x, r - 2, z, z === abut ? NORTH : SOUTH, 'stoneStairs', true);
        }
      }
    }

    // Rails along both edges, a post every fourth block, and lamp posts at the ends, the crown and every so often between.
    for (let z = 0; z < L; z++) {
      const r = row(z);
      for (const x of [dx0, dx1]) {
        if (z % 4 === 0 || z === L - 1) b.set(x, r + 1, z, stone ? 'stone' : 'post');
        else b.set(x, r + 1, z, 'rail');
      }
    }
    const lampZs = new Set<number>([1, crownZ, L - 2]);
    for (let z = 1 + lampEvery; z < L - 2; z += lampEvery) lampZs.add(z);
    for (const z of lampZs) {
      const r = row(z);
      for (const x of [dx0, dx1]) {
        if (stone) b.stoneLantern(x, r + 2, z);
        else {
          // A lacquered newel with a thin rail post above it, under a paper lantern: slender, like the rails it stands in.
          b.set(x, r + 1, z, 'accent');
          b.set(x, r + 2, z, 'rail');
          b.set(x, r + 3, z, 'rail');
          b.set(x, r + 4, z, z === crownZ ? 'lightAlt' : 'light');
        }
      }
    }
    // Magic ore lamps on the posts at the crown of a stone bridge, and bollards at both ends.
    if (stone && ore && crown >= 2) { b.set(dx0, row(crownZ) + 5, crownZ, T.BLUE_ORE_LAMP); b.set(dx1, row(crownZ) + 5, crownZ, T.GREEN_ORE_LAMP); }
    if (W >= 7) for (const z of [0, L - 1]) for (const x of [x0, x1]) b.set(x, 1, z, T.STONE_BOLLARD);
    return b.build();
  }
}
