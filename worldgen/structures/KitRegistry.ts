import { Rng } from '../noise';
import { BuildingKit } from './BuildingKit';
import { Lot } from './Lot';

// The registry picks a kit for a lot. Each kit is registered with weights by district, so a shop kit turns up along the
// avenue and a villa in the luxury quarter; kits whose size limits do not fit the lot are never offered.

export interface KitEntry {
  kit: BuildingKit;
  /** Relative chance by district name; `fallback` for any district not listed (default 0: not offered there). */
  weights: Readonly<Record<string, number>>;
  fallback: number;
}

export class KitRegistry {
  private readonly entries: KitEntry[] = [];

  register(kit: BuildingKit, weights: Readonly<Record<string, number>> = {}, fallback = 0): this {
    if (this.entries.some((e) => e.kit.name === kit.name)) throw new Error(`Kit ${kit.name} is already registered`);
    this.entries.push({ kit, weights, fallback });
    return this;
  }

  get kits(): readonly BuildingKit[] {
    return this.entries.map((e) => e.kit);
  }

  get(name: string): BuildingKit | undefined {
    return this.entries.find((e) => e.kit.name === name)?.kit;
  }

  /** The kits that could build this lot, with their weights for its district. */
  candidates(lot: Lot): Array<{ kit: BuildingKit; weight: number }> {
    const out: Array<{ kit: BuildingKit; weight: number }> = [];
    for (const e of this.entries) {
      if (!e.kit.fits(lot)) continue;
      if (lot.floors < e.kit.floors.min || lot.floors > e.kit.floors.max) continue;
      const weight = e.weights[lot.district] ?? e.fallback;
      if (weight > 0) out.push({ kit: e.kit, weight });
    }
    return out;
  }

  /** Picks by weight with the lot's own seed, so the same lot always gets the same kit. Null when nothing fits. */
  pick(lot: Lot, rng: Rng = new Rng(lot.seed ^ 0x6b17)): BuildingKit | null {
    const options = this.candidates(lot);
    if (options.length === 0) return null;
    const total = options.reduce((s, o) => s + o.weight, 0);
    let roll = rng.next() * total;
    for (const o of options) {
      roll -= o.weight;
      if (roll < 0) return o.kit;
    }
    return options[options.length - 1].kit;
  }
}
