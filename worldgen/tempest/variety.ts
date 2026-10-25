import { Rng, hash2 } from '../noise';
import { BuildingKit } from '../structures/BuildingKit';
import { KitRegistry } from '../structures/KitRegistry';
import { Lot } from '../structures/Lot';
import { DistrictPlanner, PlannedLot } from './DistrictPlanner';
import { worldX, worldZ } from './layout';

// Which building stands on which lot: the kit and the variant, chosen with a view of the street. The planner cuts the lots and gives
// each a palette family; this is the step that makes the street read as a street of different houses.
//
//   - **The plan's own wants first.** The shrines stand in their parks, a watchtower beside the compound and each gate, and the
//     production and public sectors are given their workshops and halls: the forge, the smithy, the weaving hall, the lumber yard,
//     the school, the clinic and the barracks each stand somewhere in their sector (`QUOTAS`, `WATCHTOWERS`).
//   - **Then every other lot, in plan order.** The kit is drawn by the registry's district weights, the variant by chance, but never
//     a (kit, variant) pair a lot within `NEAR` cells already has, and with less chance the nearer a repeat would stand. A lot
//     whose every option would repeat a neighbour takes the least bad.
//
// It is a pure function of the planner (which is a pure function of the seed), so a worker and the main thread choose alike.

/** A lot closer than this many cells (the gap between the two rectangles) to another is its neighbour in a street view. */
export const NEAR = 4;
/** Within this gap a repeat of a (kit, variant) pair is allowed but unlikely: the next house or the one after it along the row. */
const FAR = 16;

export interface BuildingChoice {
  kit: BuildingKit;
  variant: number;
  /** The lot the kit builds on: the planned one, or a smaller lot inside it (`fitted`) for a plot bigger than the kit takes. */
  lot: Lot;
  fitted: boolean;
}

export type Plan = ReadonlyMap<number, BuildingChoice>;

/** What the plan wants a sector to hold: every lot of `sector` that `kit` fits gets it, the variants taken in turn (never one a neighbour has). */
interface Quota { sector: string; kit: string; variants: readonly number[] }

export const QUOTAS: readonly Quota[] = [
  // The production sector: forges, smithies, weaving halls and lumber yards along its streets.
  { sector: 'production', kit: 'workshop', variants: [0, 1, 2, 3] },
  // The public strip: schools, clinics and barracks.
  { sector: 'public-facilities', kit: 'public-hall', variants: [0, 1, 2] },
];

/** Where a watchtower stands: the nearest lot it fits to each point, in the picture's frame (cells from the Central Square). */
export const WATCHTOWERS: ReadonlyArray<{ at: [number, number]; variant: number }> = [
  { at: [-64, -150], variant: 0 }, // the compound's west flank
  { at: [64, -150], variant: 1 },  // its east flank
  { at: [-168, -16], variant: 1 }, // the west gate
  { at: [168, 16], variant: 0 },   // the east gatehouse
  { at: [-16, 168], variant: 1 },  // the south gatehouse
];

/** The rectangle's distance to another in cells: the number of free cells between them at the nearest, 0 when they touch. */
export const gapBetween = (a: Lot, b: Lot): number => {
  const gx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0);
  const gz = Math.max(a.z - (b.z + b.d), b.z - (a.z + a.d), 0);
  return Math.max(gx, gz);
};

const withFloors = (lot: Lot, floors: number): Lot => new Lot({
  id: lot.id, x: lot.x, z: lot.z, w: lot.w, d: lot.d, facing: lot.facing, district: lot.district, seed: lot.seed, floors, family: lot.family,
  neighbours: lot.neighbours, groundY: lot.groundY,
});

const sizeFits = (kit: BuildingKit, lot: Lot): boolean =>
  lot.frontage >= kit.frontage.min && lot.depth >= kit.depth.min;

/** The kit on part of a plot too big for it: a lot of the largest size the kit takes, centred along the front. */
const fittedLot = (kit: BuildingKit, lot: Lot): Lot => lot.within(Math.min(lot.frontage, kit.frontage.max), Math.min(lot.depth, kit.depth.max));

export const chooseBuildings = (planner: DistrictPlanner, kits: KitRegistry): Plan => {
  const choices = new Map<number, BuildingChoice>();
  const lots = planner.lots.filter((p) => p.kind === 'building');
  const set = (p: PlannedLot, kit: BuildingKit, variant: number, lot = p.lot, fitted = false): void => {
    choices.set(p.index, { kit, variant: variant % kit.variants, lot, fitted });
  };

  // --- The plan's wants -------------------------------------------------------------------------------------------------
  for (const p of lots) {
    if (p.role === 'shrine') {
      const kit = kits.get('shrine');
      if (kit && sizeFits(kit, p.lot)) {
        const fits = kit.fits(p.lot);
        set(p, kit, p.block === 'c4r4' ? 0 : 1, fits ? p.lot : fittedLot(kit, p.lot), !fits);
      }
    }
  }
  const watch = kits.get('watchtower');
  if (watch) {
    for (const { at, variant } of WATCHTOWERS) {
      const [wx, wz] = [worldX(at[0]), worldZ(at[1])];
      let best: PlannedLot | null = null;
      let bestD = Infinity;
      for (const p of lots) {
        // A tower fits a lot of its own size (a small lot of a dense block), is not a set piece's lot and is not already wanted.
        if (p.piece || p.role || choices.has(p.index) || !watch.fits(p.lot)) continue;
        // Not beside another tower: they are landmarks, a street apart at least.
        if ([...choices.values()].some((c) => c.kit === watch && gapBetween(c.lot, p.lot) < 40)) continue;
        const d = Math.hypot(p.lot.x + p.lot.w / 2 - wx, p.lot.z + p.lot.d / 2 - wz);
        if (d < bestD) { bestD = d; best = p; }
      }
      // A tower is three storeys whatever the district would build.
      if (best) set(best, watch, variant, withFloors(best.lot, 3));
    }
  }
  for (const q of QUOTAS) {
    const kit = kits.get(q.kit);
    if (!kit) continue;
    let turn = 0;
    for (const p of lots) {
      if (p.sector !== q.sector || p.piece || choices.has(p.index) || !kit.fits(p.lot)) continue;
      // The next variant in the turn that no lot beside this one has; a lot every variant is taken beside is left to the other kits.
      let variant = -1;
      for (let k = 0; k < q.variants.length && variant < 0; k++) {
        const v = q.variants[(turn + k) % q.variants.length];
        const taken = lots.some((o) => { const c = choices.get(o.index); return c && c.kit === kit && c.variant === v && gapBetween(o.lot, p.lot) < NEAR; });
        if (!taken) variant = v;
      }
      if (variant < 0) continue;
      turn++;
      set(p, kit, variant, kit.floors.min > p.lot.floors ? withFloors(p.lot, kit.floors.min) : p.lot);
    }
  }

  // --- Every other lot, the ones with the fewest options first --------------------------------------------------------
  // (a lot only one kit fits must get its pick before its neighbour, which has others, takes the same one)
  interface Option { kit: BuildingKit; variant: number; weight: number; lot: Lot; fitted: boolean }
  const optionsFor = (p: PlannedLot): Option[] => {
    const out: Option[] = [];
    const candidates = kits.candidates(p.lot);
    if (candidates.length > 0) {
      for (const { kit, weight } of candidates) for (let v = 0; v < kit.variants; v++) out.push({ kit, variant: v, weight: weight / kit.variants, lot: p.lot, fitted: false });
    } else {
      // A plot bigger than every kit of the district takes: the kit that fits part of it, built on that part.
      const f = kits.pickFitted(p.lot);
      if (f) for (let v = 0; v < f.kit.variants; v++) out.push({ kit: f.kit, variant: v, weight: 1 / f.kit.variants, lot: f.lot, fitted: true });
    }
    return out;
  };
  const todo = lots.filter((p) => !choices.has(p.index)).map((p) => ({ p, options: optionsFor(p) })).filter((t) => t.options.length > 0);
  todo.sort((a, c) => a.options.length - c.options.length || a.p.index - c.p.index);
  const chosen: Array<[PlannedLot, BuildingChoice]> = lots.filter((p) => choices.has(p.index)).map((p) => [p, choices.get(p.index)!]);
  for (const { p, options: all } of todo) {
    const rng = new Rng(hash2(p.lot.seed, 0x7a41, 0x51));
    const repeats = (o: Option, gap: number): number => {
      let n = 0;
      for (const [q, c] of chosen) if (c.kit === o.kit && c.variant === o.variant && gapBetween(q.lot, p.lot) < gap) n++;
      return n;
    };
    // Never a repeat of a house within NEAR; if that leaves nothing, the options with the fewest repeats.
    let options = all.filter((o) => repeats(o, NEAR) === 0);
    if (options.length === 0) {
      const least = Math.min(...all.map((o) => repeats(o, NEAR)));
      options = all.filter((o) => repeats(o, NEAR) === least);
    }
    const weights = options.map((o) => o.weight * Math.pow(0.25, repeats(o, FAR)));
    let roll = rng.next() * weights.reduce((s, w) => s + w, 0);
    let pick = options[options.length - 1];
    for (let i = 0; i < options.length; i++) {
      roll -= weights[i];
      if (roll < 0) { pick = options[i]; break; }
    }
    set(p, pick.kit, pick.variant, pick.lot, pick.fitted);
    chosen.push([p, choices.get(p.index)!]);
  }
  return choices;
};

/** `kit#variant`: what two buildings must not share when they stand within `NEAR` cells of each other. */
export const pairKeyOf = (c: BuildingChoice): string => `${c.kit.name}#${c.variant}`;
