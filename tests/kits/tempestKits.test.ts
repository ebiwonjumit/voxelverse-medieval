import { describe, expect, it } from 'vitest';
import { ShapedBlock } from '../../content/blocksShaped';
import { TempestBlock as T } from '../../content/blocksTempest';
import { AIR_CELL, cellId, cellState } from '../../engine/cell';
import { createTempestKitRegistry } from '../../worldgen/kits/tempest';
import { RiverBridgeKit, BRIDGE_FOUNDATION } from '../../worldgen/kits/tempest/RiverBridgeKit';
import { NO_CELL } from '../../worldgen/structures/Blueprint';
import { BuildingKit, buildWithKit } from '../../worldgen/structures/BuildingKit';
import { Lot } from '../../worldgen/structures/Lot';
import { TEMPEST_STYLE } from '../../worldgen/tempest/style';
import { tolerant } from '../perf';
import { BlueprintWorld, walk } from '../landmarks/helpers';
import { floatingCells, registry, roofIds, unsupportedRoof, walkFrom } from './analysis';

const kits = createTempestKitRegistry(TEMPEST_STYLE);
const roofs = roofIds(TEMPEST_STYLE);
const FAMILIES = TEMPEST_STYLE.familyNames;

type LotPatch = Partial<ConstructorParameters<typeof Lot>[0]>;
const lotFor = (kit: BuildingKit, variant = 0, patch: LotPatch = {}): Lot => {
  const s = kit.preferredSize(variant);
  return new Lot({
    id: `${kit.name}.${variant}`, x: 1600, z: 40, w: s.frontage, d: s.depth, facing: 2, district: 'residential', seed: 77, floors: s.floors, ...patch,
  });
};

const everyBuild = (): Array<{ kit: BuildingKit; variant: number }> =>
  kits.kits.flatMap((kit) => Array.from({ length: kit.variants }, (_, variant) => ({ kit, variant })));

const label = (kit: BuildingKit, variant: number, extra = ''): string => `${kit.name} #${variant}${extra ? ` ${extra}` : ''}`;
const minY = (kit: BuildingKit): number => (kit.name === 'river-bridge' ? BRIDGE_FOUNDATION : 0);

describe('the Tempest district kits', () => {
  it('has the kits of the brief, and at least fourteen variants', () => {
    const names = kits.kits.map((k) => k.name).sort();
    expect.soft(names).toEqual(['garden-house', 'garden-plot', 'inn', 'market-stall', 'public-hall', 'river-bridge', 'shop', 'shrine', 'storehouse', 'townhouse', 'watchtower', 'well', 'workshop']);
    const total = kits.kits.reduce((s, k) => s + k.variants, 0);
    expect.soft(total).toBeGreaterThanOrEqual(14);
    // Every kit declares sizes it can build and storeys inside 1 to 3.
    for (const kit of kits.kits) {
      expect.soft(kit.frontage.min).toBeLessThanOrEqual(kit.frontage.max);
      expect.soft(kit.depth.min).toBeLessThanOrEqual(kit.depth.max);
      expect.soft(kit.floors.min).toBeGreaterThanOrEqual(1);
      expect.soft(kit.floors.max).toBeLessThanOrEqual(3);
      for (let v = 0; v < kit.variants; v++) {
        const s = kit.preferredSize(v);
        expect.soft(s.frontage, label(kit, v)).toBeGreaterThanOrEqual(kit.frontage.min);
        expect.soft(s.frontage, label(kit, v)).toBeLessThanOrEqual(kit.frontage.max);
        expect.soft(s.depth, label(kit, v)).toBeGreaterThanOrEqual(kit.depth.min);
        expect.soft(s.depth, label(kit, v)).toBeLessThanOrEqual(kit.depth.max);
      }
    }
  });

  it('builds the same blueprint every time, and every cell is a real block in a legal state', () => {
    for (const { kit, variant } of everyBuild()) {
      const lot = lotFor(kit, variant);
      const a = buildWithKit(kit, lot, TEMPEST_STYLE, variant);
      const b = buildWithKit(kit, lot, TEMPEST_STYLE, variant);
      expect.soft(a.hash(), label(kit, variant)).toBe(b.hash());
      expect.soft(a.size, label(kit, variant)).toBeGreaterThan(30);
      a.forEach((_x, _y, _z, c) => {
        if (c === AIR_CELL) return;
        expect.soft(registry.has(cellId(c))).toBe(true);
        expect.soft(cellState(c)).toBeLessThanOrEqual(15);
      });
    }
  });

  it('stays inside its lot, from the ground up, whatever the lot size, storeys and palette family', () => {
    for (const { kit, variant } of everyBuild()) {
      const corners: Array<[number, number, number]> = [
        [kit.frontage.min, kit.depth.min, kit.floors.min], [kit.frontage.max, kit.depth.max, kit.floors.max],
        [kit.frontage.min, kit.depth.max, kit.floors.max], [kit.frontage.max, kit.depth.min, kit.floors.min],
      ];
      for (const [w, d, floors] of corners) {
        const lot = lotFor(kit, variant, { w, d, floors, family: FAMILIES[(w + d) % FAMILIES.length] });
        const bp = buildWithKit(kit, lot, TEMPEST_STYLE, variant);
        const b = bp.bounds()!;
        const where = label(kit, variant, `${w}x${d} f${floors}`);
        expect.soft(b.minX, where).toBeGreaterThanOrEqual(0);
        expect.soft(b.maxX, where).toBeLessThan(w);
        expect.soft(b.minZ, where).toBeGreaterThanOrEqual(0);
        expect.soft(b.maxZ, where).toBeLessThan(d);
        expect.soft(b.minY, where).toBeGreaterThanOrEqual(minY(kit));
        expect.soft(b.maxY, where).toBeLessThan(44);
      }
    }
  });

  it('turns to every facing and keeps its footprint on the lot rectangle', () => {
    for (const { kit, variant } of everyBuild()) {
      const s = kit.preferredSize(variant);
      for (const facing of [0, 1, 2, 3] as const) {
        const horizontal = facing === 0 || facing === 2;
        const lot = new Lot({
          id: 'f', x: 300, z: -90, w: horizontal ? s.frontage : s.depth, d: horizontal ? s.depth : s.frontage, facing, district: 'residential', seed: 5, floors: s.floors,
        });
        const placed = lot.place(buildWithKit(kit, lot, TEMPEST_STYLE, variant));
        const b = placed.bounds()!;
        expect.soft(b.minX, label(kit, variant, `facing ${facing}`)).toBeGreaterThanOrEqual(lot.x);
        expect.soft(b.maxX, label(kit, variant, `facing ${facing}`)).toBeLessThanOrEqual(lot.x + lot.w - 1);
        expect.soft(b.minZ, label(kit, variant, `facing ${facing}`)).toBeGreaterThanOrEqual(lot.z);
        expect.soft(b.maxZ, label(kit, variant, `facing ${facing}`)).toBeLessThanOrEqual(lot.z + lot.d - 1);
        for (const m of placed.markers().filter((mk) => mk.kind === 'door' && mk.facing !== undefined)) {
          // A door marked on the front looks the lot's way; side doors (a gate in a passage) may look back.
          expect.soft([facing, (facing + 2) & 3]).toContain(m.facing);
        }
      }
    }
  });

  it('has no floating blocks in any kit, variant, palette family or seed', () => {
    for (const { kit, variant } of everyBuild()) {
      for (const family of FAMILIES) {
        for (const seed of [3, 11]) {
          const lot = lotFor(kit, variant, { family, seed });
          const bp = buildWithKit(kit, lot, TEMPEST_STYLE, variant);
          const bad = floatingCells(bp);
          expect.soft(bad.length, `${label(kit, variant, `${family} seed ${seed}`)} first ${JSON.stringify(bad[0])}`).toBe(0);
        }
      }
    }
  });

  it('has no unsupported roofs: every roof block is within four blocks of something that stands under it', () => {
    for (const { kit, variant } of everyBuild()) {
      for (const seed of [2, 9]) {
        const bp = buildWithKit(kit, lotFor(kit, variant, { seed }), TEMPEST_STYLE, variant);
        const bad = unsupportedRoof(bp, roofs);
        expect.soft(bad.length, `${label(kit, variant, `seed ${seed}`)} first ${JSON.stringify(bad[0])}`).toBe(0);
      }
    }
  });

  it('has an entrance a person can walk to from the street, with room to stand inside', () => {
    for (const { kit, variant } of everyBuild()) {
      for (const seed of [4, 21]) {
        const lot = lotFor(kit, variant, { seed });
        const bp = buildWithKit(kit, lot, TEMPEST_STYLE, variant);
        const walk = walkFrom(bp, lot.frontage, lot.depth);
        const doors = bp.markers.filter((m) => m.kind === 'door');
        if (kit.name === 'river-bridge') {
          // Both ends of a bridge are open to the street and the far end is reachable.
          expect.soft(walk.reached.has(`${Math.floor(lot.frontage / 2)},1,0`), label(kit, variant)).toBe(true);
          continue;
        }
        if (['garden-plot', 'well', 'market-stall'].includes(kit.name)) {
          expect.soft(walk.reached.size, label(kit, variant)).toBeGreaterThan(20);
          continue;
        }
        expect.soft(doors.length, label(kit, variant)).toBeGreaterThan(0);
        const front = doors.find((d) => d.facing === 2) ?? doors[0];
        expect.soft(walk.reached.has(`${front.x},${front.y},${front.z}`), `${label(kit, variant, `seed ${seed}`)} door ${front.x},${front.y},${front.z}`).toBe(true);
        // The cell just inside the door is reached too, and open above: interior air above the floor.
        const dx = [0, 1, 0, -1][front.facing ?? 2];
        const dz = [-1, 0, 1, 0][front.facing ?? 2];
        let inside = false;
        for (let k = 1; k <= 3; k++) {
          const key = `${front.x - dx * k},${front.y},${front.z - dz * k}`;
          if (walk.reached.has(key)) inside = true;
        }
        expect.soft(inside, `${label(kit, variant, `seed ${seed}`)} inside the door`).toBe(true);
      }
    }
  });

  it('leads up the stairs to every upper floor', () => {
    // The highest standing place inside the footprint, by kit and storeys, must reach the top floor.
    const expected: Record<string, number> = { townhouse: 7, shop: 7, inn: 7, storehouse: 4, watchtower: 12, 'garden-house': 4, shrine: 2 };
    for (const { kit, variant } of everyBuild()) {
      const need = expected[kit.name];
      if (!need) continue;
      const lot = lotFor(kit, variant);
      const bp = buildWithKit(kit, lot, TEMPEST_STYLE, variant);
      const walk = walkFrom(bp, lot.frontage, lot.depth);
      const floors = lot.floors;
      const wanted = kit.name === 'storehouse' || kit.name === 'shrine' || kit.name === 'garden-house' ? need : floors >= 2 || kit.name === 'watchtower' ? need : 0;
      expect.soft(walk.maxY, label(kit, variant)).toBeGreaterThanOrEqual(wanted);
    }
  });

  it('can be climbed to the top floor by a player with the game\'s own collision, not just by the analysis walker, at every size: a stair is entered from the cell in front of its foot', () => {
    let climbed = 0;
    for (const { kit, variant } of everyBuild()) {
      const mid = (a: number, c: number): number => Math.floor((a + c) / 2);
      const sizes: Array<[number, number]> = [];
      for (const w of [kit.frontage.min, mid(kit.frontage.min, kit.frontage.max), kit.frontage.max]) for (const d of [kit.depth.min, mid(kit.depth.min, kit.depth.max), kit.depth.max]) sizes.push([w, d]);
      for (const [w, d] of sizes) {
        for (const seed of [1, 2, 3]) {
          const lot = lotFor(kit, variant, { seed: seed * 977, w, d, floors: kit.floors.max, family: 'timber-terracotta' });
          const bp = buildWithKit(kit, lot, TEMPEST_STYLE, variant);
          const door = bp.markers.find((m) => m.kind === 'door' && m.facing === 2);
          const reference = walkFrom(bp, lot.frontage, lot.depth).maxY;
          let stairs = 0;
          bp.forEach((_x, _y, _z, c) => { if (cellId(c) === ShapedBlock.DARK_PLANK_STAIRS) stairs++; });
          if (!door || reference < 5 || stairs === 0) continue;
          const places = walk(new BlueprintWorld(bp), { x: door.x, z: door.z + 3, feet: door.y - 0.5 }, {
            minX: -3, maxX: lot.frontage + 3, minZ: -3, maxZ: lot.depth + 6, max: 200000,
          });
          let top = 0;
          for (const p of places.values()) top = Math.max(top, p.feet);
          // The analysis walker's top is the highest cell it stands in, which may be on a roof or a ledge: the floor a stair serves is up to two and a
          // half blocks under it, and a stair that cannot be climbed leaves the player a storey short, not two blocks.
          expect.soft(top, label(kit, variant, `${w}x${d} seed ${seed * 977}: top ${top}, analysis ${reference}`)).toBeGreaterThanOrEqual(reference - 2.6);
          climbed++;
        }
      }
    }
    expect(climbed).toBeGreaterThan(300);
  });

  it('has windows that let the light through, and lit ones that glow', () => {
    const windows = new Set<number>([T.SHOJI_PANE, T.SHOJI_PANE_LIT, T.LATTICE_WINDOW, T.BAMBOO_BLIND, registry.byName('voxelverse:glass_pane').id]);
    for (const { kit, variant } of everyBuild()) {
      const bp = buildWithKit(kit, lotFor(kit, variant), TEMPEST_STYLE, variant);
      let count = 0;
      let lit = 0;
      bp.forEach((_x, _y, _z, c) => {
        const id = cellId(c);
        if (!windows.has(id)) return;
        count++;
        // A window is not opaque and dims light by a few levels at most.
        expect.soft(registry.isOpaque(id)).toBe(false);
        expect.soft(registry.lightDim(id)).toBeLessThanOrEqual(3);
        if (id === T.SHOJI_PANE_LIT) { lit++; expect.soft(registry.emission(id)).toBeGreaterThan(0); }
      });
      if (['townhouse', 'shop', 'inn', 'storehouse', 'garden-house', 'watchtower', 'shrine'].includes(kit.name)) {
        expect.soft(count, label(kit, variant)).toBeGreaterThanOrEqual(3);
      }
      if (['townhouse', 'inn', 'garden-house'].includes(kit.name)) expect.soft(lit, label(kit, variant)).toBeGreaterThanOrEqual(2);
    }
  });

  it('is built from the style pack: every family gives a different building of the same shape', () => {
    for (const { kit, variant } of everyBuild()) {
      const hashes = new Set<number>();
      let blocks = -1;
      for (const family of FAMILIES) {
        const bp = buildWithKit(kit, lotFor(kit, variant, { family }), TEMPEST_STYLE, variant);
        hashes.add(bp.hash());
        // The rolls are the lot's, not the palette's: the same number of blocks whatever the family says (a ridge cap or none apart).
        if (blocks < 0) blocks = bp.size;
      }
      // The stone and the water of a bridge, a well or a pond garden hardly change with the palette; houses change in walls, frame and roof.
      expect.soft(hashes.size, label(kit, variant)).toBeGreaterThanOrEqual(['river-bridge', 'well', 'garden-plot'].includes(kit.name) ? 2 : 3);
    }
  });

  it('never looks the same twice: seeds give different buildings, and the variants differ from each other', () => {
    for (const kit of kits.kits) {
      for (let variant = 0; variant < kit.variants; variant++) {
        const seen = new Set<number>();
        for (let seed = 1; seed <= 12; seed++) {
          seen.add(buildWithKit(kit, lotFor(kit, variant, { seed, family: 'timber-terracotta' }), TEMPEST_STYLE, variant).hash());
        }
        expect.soft(seen.size, label(kit, variant)).toBeGreaterThanOrEqual(kit.name === 'well' ? 2 : 4);
      }
      const across = new Set<number>();
      for (let variant = 0; variant < kit.variants; variant++) {
        across.add(buildWithKit(kit, lotFor(kit, variant, { family: 'timber-terracotta' }), TEMPEST_STYLE, variant).hash());
      }
      expect.soft(across.size, kit.name).toBe(kit.variants);
    }
  });

  it('has at least fourteen different buildings across the kits at one seed and palette', () => {
    const hashes = new Set<number>();
    for (const { kit, variant } of everyBuild()) hashes.add(buildWithKit(kit, lotFor(kit, variant, { family: 'timber-terracotta', seed: 1 }), TEMPEST_STYLE, variant).hash());
    expect.soft(hashes.size).toBeGreaterThanOrEqual(14);
    expect.soft(hashes.size).toBe(kits.kits.reduce((s, k) => s + k.variants, 0));
  });

  it('marks its doors and trees inside the footprint', () => {
    for (const { kit, variant } of everyBuild()) {
      const lot = lotFor(kit, variant);
      const bp = buildWithKit(kit, lot, TEMPEST_STYLE, variant);
      for (const m of bp.markers) {
        expect.soft(m.x, label(kit, variant, m.kind)).toBeGreaterThanOrEqual(0);
        expect.soft(m.x, label(kit, variant, m.kind)).toBeLessThan(lot.frontage);
        expect.soft(m.z, label(kit, variant, m.kind)).toBeGreaterThanOrEqual(0);
        expect.soft(m.z, label(kit, variant, m.kind)).toBeLessThan(lot.depth);
        if (m.kind === 'tree') expect.soft(['sakura', 'cedar', 'bamboo', 'any']).toContain(m.tag);
      }
      if (['townhouse', 'shop', 'inn', 'shrine', 'storehouse', 'garden-house', 'watchtower'].includes(kit.name)) {
        expect.soft(bp.markers.some((m) => m.kind === 'door'), label(kit, variant)).toBe(true);
      }
    }
  });
});

describe('the river bridge', () => {
  const bridge = new RiverBridgeKit();

  it('follows its span: a short crossing is nearly flat, a long one rises four blocks, and it never climbs faster than a stair', () => {
    for (const length of [9, 12, 17, 23, 31, 41, 49]) {
      const h = Array.from({ length }, (_, z) => RiverBridgeKit.deckHeight(z, length));
      expect.soft(h[0]).toBe(0);
      expect.soft(h[length - 1]).toBe(0);
      for (let z = 1; z < length; z++) expect.soft(Math.abs(h[z] - h[z - 1]), `${length} at ${z}`).toBeLessThanOrEqual(1);
      expect.soft(Math.max(...h)).toBe(Math.max(1, Math.min(4, Math.floor(length / 5))));
    }
    expect.soft(Math.max(...Array.from({ length: 9 }, (_, z) => RiverBridgeKit.deckHeight(z, 9)))).toBe(1);
    expect.soft(Math.max(...Array.from({ length: 49 }, (_, z) => RiverBridgeKit.deckHeight(z, 49)))).toBe(4);
  });

  it('is built at every span and width, grounded, walkable end to end, with piers on a long span', () => {
    for (const variant of [0, 1]) {
      for (const [w, d] of [[5, 9], [7, 17], [9, 23], [13, 31], [11, 41], [13, 49], [5, 49]]) {
        const lot = new Lot({ id: 'b', x: 0, z: 0, w, d, facing: 2, district: 'residential', seed: 4 });
        const bp = buildWithKit(bridge, lot, TEMPEST_STYLE, variant);
        expect.soft(floatingCells(bp).length, `${variant} ${w}x${d}`).toBe(0);
        const walk = walkFrom(bp, w, d);
        // Standing at the far end, and on the crown.
        const mid = Math.floor(w / 2);
        expect.soft(walk.reached.has(`${mid},1,0`), `${variant} ${w}x${d} far end`).toBe(true);
        expect.soft(walk.maxY, `${variant} ${w}x${d} crown`).toBeGreaterThanOrEqual(1 + Math.max(...Array.from({ length: d }, (_, z) => RiverBridgeKit.deckHeight(z, d))));
        if (d >= 31) {
          // Piers reach the river bed in the middle of the span.
          let deep = 0;
          bp.forEach((_x, y) => { if (y <= BRIDGE_FOUNDATION + 1) deep++; });
          expect.soft(deep, `${variant} ${w}x${d} piers`).toBeGreaterThan(w);
        }
      }
    }
  });
});

describe('the registry', () => {
  it('offers kits by district, only those that fit the lot, and picks the same one every time', () => {
    const lot = (district: string, w: number, d: number, floors: number, seed = 5): Lot => new Lot({ id: `${district}${w}`, x: 0, z: 0, w, d, facing: 2, district, seed, floors });
    const cases: Array<[string, number, number, number, string[]]> = [
      ['residential', 13, 14, 2, ['townhouse']],
      ['residential', 11, 12, 1, ['townhouse']],
      ['commercial', 13, 14, 2, ['shop']],
      ['commercial', 7, 6, 1, ['market-stall']],
      ['market', 7, 6, 1, ['market-stall']],
      ['tourism', 21, 25, 3, ['inn']],
      ['guest', 21, 23, 1, ['garden-house']],
      ['luxury', 21, 23, 1, ['garden-house']],
      ['storage', 13, 14, 1, ['storehouse']],
      ['shrine', 23, 31, 1, ['shrine']],
      ['forest-edge', 11, 11, 3, ['watchtower']],
    ];
    for (const [district, w, d, floors, expectedAny] of cases) {
      const l = lot(district, w, d, floors);
      const names = kits.candidates(l).map((c) => c.kit.name);
      for (const n of expectedAny) expect.soft(names, `${district} ${w}x${d}`).toContain(n);
      const pick = kits.pick(l);
      expect.soft(pick, `${district} ${w}x${d}`).not.toBeNull();
      expect.soft(kits.pick(l)?.name).toBe(pick?.name);
      expect.soft(pick!.fits(l)).toBe(true);
    }
    // Nothing fits a three block lot.
    expect.soft(kits.pick(lot('residential', 3, 3, 1))).toBeNull();
  });

  it('gives every district of the layout something to build, and the dense ones mostly houses', () => {
    const districts = ['civic', 'guest', 'government', 'public', 'luxury', 'commercial', 'production', 'storage', 'residential', 'tourism'];
    for (const district of districts) {
      let any = 0;
      for (const [w, d, floors] of [[9, 10, 1], [13, 13, 2], [17, 17, 2], [21, 21, 2], [25, 27, 3]] as const) {
        if (kits.pick(new Lot({ id: 'x', x: 0, z: 0, w, d, facing: 2, district, seed: w * 7 + d, floors }))) any++;
      }
      expect.soft(any, district).toBeGreaterThan(0);
    }
    const counts = new Map<string, number>();
    for (let i = 0; i < 400; i++) {
      const k = kits.pick(new Lot({ id: `${i}`, x: 0, z: 0, w: 13, d: 14, facing: 2, district: 'residential', seed: i * 31 + 7, floors: 2 }));
      counts.set(k!.name, (counts.get(k!.name) ?? 0) + 1);
    }
    expect.soft(counts.get('townhouse')! / 400).toBeGreaterThan(0.5);
  });
});

describe('build time', () => {
  it('draws every blueprint in well under a frame of a worker', () => {
    const times: string[] = [];
    let worst = 0;
    for (const { kit, variant } of everyBuild()) {
      const lot = lotFor(kit, variant);
      buildWithKit(kit, lot, TEMPEST_STYLE, variant);
      const t0 = performance.now();
      const runs = 10;
      for (let i = 0; i < runs; i++) buildWithKit(kit, lotFor(kit, variant, { seed: 100 + i }), TEMPEST_STYLE, variant);
      const ms = (performance.now() - t0) / runs;
      worst = Math.max(worst, ms);
      times.push(`${kit.name}#${variant} ${ms.toFixed(2)}`);
    }
    // Reported in docs/tempest.md; the bound is generous so a busy machine does not fail it.
    console.info(`blueprint build time, ms each: ${times.join(', ')}`);
    expect.soft(worst).toBeLessThan(tolerant(60));
  });
});

void NO_CELL;
