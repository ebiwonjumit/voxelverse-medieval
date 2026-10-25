import { describe, expect, it } from 'vitest';
import { WORLD_SEED } from '../../worldConstants';
import { TempestCityZone } from '../../worldgen/tempest/TempestCityZone';
import { DistrictPlanner } from '../../worldgen/tempest/DistrictPlanner';
import { NEAR, QUOTAS, chooseBuildings, gapBetween, pairKeyOf } from '../../worldgen/tempest/variety';
import { createTempestCityKits } from '../../worldgen/tempest/cityKits';

// Which building stands on which lot, as the game builds the town: a street of different houses, every kit the plan calls for in its place.

const zone = new TempestCityZone({ seed: WORLD_SEED });
const buildings = zone.planner.lots.filter((p) => p.kind === 'building');
/** The buildings proper: a plot the garden kit lays out has no house on it. */
const houses = buildings.filter((p) => zone.choiceOf(p)!.kit.name !== 'garden-plot');
const choice = (id: string) => zone.choiceOf(zone.planner.lotById(id)!)!;

describe('a street of different houses', () => {
  it('gives every building lot a kit and a variant', () => {
    expect(buildings.length).toBeGreaterThan(200);
    for (const p of buildings) expect(zone.choiceOf(p), p.lot.id).toBeDefined();
    // And only building lots have one.
    for (const p of zone.planner.lots.filter((o) => o.kind !== 'building')) expect(zone.choiceOf(p), p.lot.id).toBeUndefined();
  });

  it('never puts the same kit, variant, palette family and facing within four cells of itself', () => {
    const repeats: string[] = [];
    for (let i = 0; i < buildings.length; i++) {
      for (let j = i + 1; j < buildings.length; j++) {
        const a = buildings[i], b = buildings[j];
        if (gapBetween(a.lot, b.lot) > NEAR) continue;
        const ca = zone.choiceOf(a)!, cb = zone.choiceOf(b)!;
        if (ca.kit === cb.kit && ca.variant === cb.variant && a.lot.family === b.lot.family && a.lot.facing === b.lot.facing) repeats.push(`${a.lot.id} and ${b.lot.id}: ${pairKeyOf(ca)}`);
      }
    }
    expect(repeats).toEqual([]);
  });

  it('goes further: no kit and variant at all repeats within four cells, whatever the palette and the way it faces (mirroring apart, that is the same house)', () => {
    const repeats: string[] = [];
    for (let i = 0; i < buildings.length; i++) {
      for (let j = i + 1; j < buildings.length; j++) {
        if (gapBetween(buildings[i].lot, buildings[j].lot) > NEAR) continue;
        const ca = zone.choiceOf(buildings[i])!, cb = zone.choiceOf(buildings[j])!;
        if (pairKeyOf(ca) === pairKeyOf(cb)) repeats.push(`${buildings[i].lot.id} and ${buildings[j].lot.id}: ${pairKeyOf(ca)}`);
      }
    }
    expect(repeats).toEqual([]);
  });

  it('builds at least fourteen different buildings in the town itself, gardens and fillers not counted, and uses every kit it has', () => {
    const pairs = new Set(houses.map((p) => pairKeyOf(zone.choiceOf(p)!)));
    expect(pairs.size).toBeGreaterThanOrEqual(14);
    expect(houses.length).toBeGreaterThanOrEqual(200);
    // A kit that is registered is built somewhere in the town (the plain gardens and the bridge are fillers; the market stalls stand on the boundary road).
    const used = new Set(buildings.map((p) => zone.choiceOf(p)!.kit.name));
    for (const kit of zone.kits.kits) {
      if (['river-bridge', 'market-stall', 'well'].includes(kit.name)) continue;
      expect(used.has(kit.name) || kit.name === 'garden-plot', kit.name).toBe(true);
    }
    // Several variants of the common kits, not one.
    const variantsOf = (name: string): number => new Set(buildings.filter((p) => zone.choiceOf(p)!.kit.name === name).map((p) => zone.choiceOf(p)!.variant)).size;
    expect(variantsOf('townhouse')).toBe(4);
    expect(variantsOf('shop')).toBe(3);
    expect(variantsOf('inn')).toBe(2);
  });

  it('is the same choice every time, for the same seed, and another for another seed', () => {
    const kits = createTempestCityKits();
    const a = chooseBuildings(new DistrictPlanner({ seed: WORLD_SEED }), kits);
    const b = chooseBuildings(new DistrictPlanner({ seed: WORLD_SEED }), kits);
    expect([...a.entries()].map(([i, c]) => `${i}:${pairKeyOf(c)}:${c.fitted}`)).toEqual([...b.entries()].map(([i, c]) => `${i}:${pairKeyOf(c)}:${c.fitted}`));
    const other = chooseBuildings(new DistrictPlanner({ seed: 99 }), kits);
    expect([...other.values()].map(pairKeyOf).join()).not.toBe([...a.values()].map(pairKeyOf).join());
  });
});

describe('what the plan puts where', () => {
  const inSector = (sector: string) => buildings.filter((p) => p.sector === sector);

  it('puts a forge, a smithy, a weaving hall and a lumber yard in the production sector', () => {
    const variants = new Set(inSector('production').filter((p) => zone.choiceOf(p)!.kit.name === 'workshop').map((p) => zone.choiceOf(p)!.variant));
    expect([...variants].sort()).toEqual([0, 1, 2, 3]);
    // Mostly workshops: it is the quarter where the town makes things.
    const shops = inSector('production').filter((p) => zone.choiceOf(p)!.kit.name === 'workshop').length;
    expect(shops / inSector('production').length).toBeGreaterThan(0.6);
  });

  it('puts a school, a clinic and the barracks in the public strip, with halls round them', () => {
    const halls = inSector('public-facilities').filter((p) => zone.choiceOf(p)!.kit.name === 'public-hall');
    expect([...new Set(halls.map((p) => zone.choiceOf(p)!.variant))].sort()).toEqual([0, 1, 2]);
    expect(halls.length).toBeGreaterThanOrEqual(6);
    // Some plots are still building sites: the plan's "under construction".
    expect(zone.planner.lots.filter((p) => p.sector === 'public-facilities' && p.kind === 'construction').length).toBeGreaterThan(1);
  });

  it('stands the shrines in their parks, a watchtower beside the compound and each gate, and a well in the courtyard of the residential rings', () => {
    const shrines = buildings.filter((p) => zone.choiceOf(p)!.kit.name === 'shrine');
    expect(shrines.map((p) => p.block).sort()).toEqual(['c-4r-4', 'c4r4']);
    expect(shrines.map((p) => zone.choiceOf(p)!.variant).sort()).toEqual([0, 1]);
    const towers = buildings.filter((p) => zone.choiceOf(p)!.kit.name === 'watchtower');
    expect(towers.length).toBeGreaterThanOrEqual(5);
    expect(new Set(towers.map((p) => zone.choiceOf(p)!.variant)).size).toBe(2);
    // A tower has at least two storeys, and the ones the plan stands by the compound and the gates are three, whatever the district builds.
    for (const p of towers) expect(zone.choiceOf(p)!.lot.floors).toBeGreaterThanOrEqual(2);
    expect(towers.filter((p) => zone.choiceOf(p)!.lot.floors === 3).length).toBeGreaterThanOrEqual(5);
    const wells = zone.planner.props.filter((p) => p.kit === 'well');
    expect(wells.length).toBeGreaterThanOrEqual(10);
    expect(new Set(wells.map((w) => w.variant)).size).toBe(2);
    // Each well stands clear of every lot and street.
    for (const w of wells) {
      for (let z = w.lot.z; z < w.lot.z + w.lot.d; z++) for (let x = w.lot.x; x < w.lot.x + w.lot.w; x++) {
        expect(zone.planner.lotAt(x, z), `${w.lot.id} on a lot`).toBeNull();
        expect(zone.planner.roadOf(x, z), `${w.lot.id} on a road`).toBeNull();
      }
    }
  });

  it('lists the quotas it keeps: every one names a kit of the registry', () => {
    for (const q of QUOTAS) {
      const kit = zone.kits.get(q.kit);
      expect(kit, q.kit).toBeDefined();
      for (const v of q.variants) expect(v).toBeLessThan(kit!.variants);
    }
  });

  it('keeps the ordinary blocks of the town dense with small houses, the avenue lined with fronts', () => {
    // The blocks beside the north-south avenue are rings of houses whose fronts look at it.
    for (const id of ['c-1r2', 'c-1r3', 'c1r-2']) {
      const facing = zone.planner.lots.filter((p) => p.block === id).map((p) => p.lot.facing);
      expect(facing.includes(id.startsWith('c-1') ? 1 : 3), id).toBe(true);
    }
  });
});
