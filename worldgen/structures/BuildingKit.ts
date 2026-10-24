import { Rng } from '../noise';
import { Blueprint } from './Blueprint';
import { Lot } from './Lot';
import { StylePack } from './StylePack';

// A building kit knows how to build one kind of building (a townhouse, a shop, a gate) for a lot. It draws a blueprint
// with the builder, in the frame described in Lot.ts, and takes everything that can differ (sizes, palette, details) from
// the lot, the style pack and the generator it is given, so the same lot always gets the same building.

export interface KitSize {
  min: number;
  max: number;
}

export abstract class BuildingKit {
  /** A unique, stable name: the registry and the viewer's `&kit=` use it. */
  abstract readonly name: string;
  /** Footprint limits along the front and in depth, in blocks. A lot outside them is not offered to this kit. */
  abstract readonly frontage: KitSize;
  abstract readonly depth: KitSize;
  /** Storeys the kit can build, 1 to 3. Default 1 to 3. */
  readonly floors: KitSize = { min: 1, max: 3 };
  /** How many different buildings the kit can make with `variant` 0, 1, 2... (a viewer shows them in a row). */
  readonly variants: number = 1;

  /**
   * The footprint the kit looks best at, for a viewer or a test that has no lot of its own. Defaults to the middle of
   * the limits, odd where possible (roofs close on a ridge when the span is odd).
   */
  preferredSize(_variant = 0): { frontage: number; depth: number; floors: number } {
    const mid = (s: KitSize): number => {
      const m = Math.floor((s.min + s.max) / 2);
      return m % 2 === 1 ? m : Math.min(m + 1, s.max);
    };
    return { frontage: mid(this.frontage), depth: mid(this.depth), floors: this.floors.min };
  }

  fits(lot: Lot): boolean {
    return lot.frontage >= this.frontage.min && lot.frontage <= this.frontage.max && lot.depth >= this.depth.min && lot.depth <= this.depth.max;
  }

  /**
   * Builds the building: front south, footprint at x 0..frontage-1 and z 0..depth-1, ground surface at y = 0. `rng` is
   * seeded from the lot (and the variant), and the pack is the family the planner or the registry chose. `variant` picks
   * one of the kit's `variants` (0 when the caller has no preference).
   */
  abstract build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint;
}

/** The generator a kit gets for a lot and variant: the lot's seed forked by the kit's name and the variant. */
export const kitRng = (lot: Lot, kit: BuildingKit, variant = 0): Rng => {
  let h = 0x811c9dc5;
  for (let i = 0; i < kit.name.length; i++) h = Math.imul(h ^ kit.name.charCodeAt(i), 0x01000193);
  return new Rng(lot.seed).fork((h ^ Math.imul(variant + 1, 0x9e3779b1)) | 0);
};

/**
 * Builds a lot with a kit the standard way: the family comes from the lot (or from the style's weights for the
 * district), the generator from the lot's seed. Returns the blueprint, facing south.
 */
export const buildWithKit = (kit: BuildingKit, lot: Lot, style: StylePack, variant = 0): Blueprint => {
  const rng = kitRng(lot, kit, variant);
  const family = lot.family ?? (style.familyNames.length > 0 ? style.pickFamily(rng.fork(0x7a), lot.district) : undefined);
  const pack = family ? style.family(family) : style;
  return kit.build(lot, pack, rng, variant);
};
