import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { AIR_CELL, cellId, cellState } from '../../engine/cell';
import { TempestBlock as T } from '../../content/blocksTempest';
import { Rng } from '../../worldgen/noise';
import { NO_CELL } from '../../worldgen/structures/Blueprint';
import { BoxHouseKit } from '../../worldgen/structures/BoxHouseKit';
import { BuildingKit, buildWithKit, kitRng } from '../../worldgen/structures/BuildingKit';
import { KitRegistry } from '../../worldgen/structures/KitRegistry';
import { Lot } from '../../worldgen/structures/Lot';
import { STYLE_ROLES } from '../../worldgen/structures/StylePack';
import { createTempestKits } from '../../worldgen/tempest/kits';
import { TEMPEST_STYLE } from '../../worldgen/tempest/style';

const registry = createDefaultRegistry();
const kits = createTempestKits();

const lotFor = (kit: BuildingKit, variant = 0, patch: Partial<ConstructorParameters<typeof Lot>[0]> = {}): Lot => {
  const s = kit.preferredSize(variant);
  return new Lot({
    id: `${kit.name}.${variant}`, x: 1600, z: 40, w: s.frontage, d: s.depth, facing: 2, district: 'residential', seed: 77, floors: s.floors, ...patch,
  });
};

describe('Lot', () => {
  it('turns a south-facing building to every facing and keeps the footprint on the lot rectangle', () => {
    const kit = new BoxHouseKit();
    for (const facing of [0, 1, 2, 3] as const) {
      const lot = new Lot({ id: 'l', x: 200, z: -80, w: facing % 2 === 0 ? 15 : 11, d: facing % 2 === 0 ? 11 : 15, facing, district: 'residential', seed: 1 });
      expect(lot.frontage).toBe(15);
      expect(lot.depth).toBe(11);
      const bp = buildWithKit(kit, lot, TEMPEST_STYLE);
      const placed = lot.place(bp);
      const b = placed.bounds()!;
      expect(b.minX).toBeGreaterThanOrEqual(lot.x);
      expect(b.maxX).toBeLessThanOrEqual(lot.x + lot.w - 1);
      expect(b.minZ).toBeGreaterThanOrEqual(lot.z);
      expect(b.maxZ).toBeLessThanOrEqual(lot.z + lot.d - 1);
      // The door looks the way the lot faces.
      const doors = placed.markers().filter((m) => m.kind === 'door');
      expect(doors.length).toBeGreaterThan(0);
      expect(doors[0].facing).toBe(facing);
    }
  });

  it('refuses a lot with no area', () => {
    expect(() => new Lot({ id: 'x', x: 0, z: 0, w: 0, d: 4, facing: 2, district: 'a', seed: 1 })).toThrow(RangeError);
  });
});

describe('kit registry', () => {
  it('picks a kit by district weight, only among the kits that fit, the same one every time', () => {
    const reg = createTempestKits();
    const lot = new Lot({ id: 'a', x: 0, z: 0, w: 13, d: 12, facing: 2, district: 'commercial', seed: 5 });
    const pick = reg.pick(lot);
    expect(pick?.name).toBe('box-house');
    expect(reg.pick(lot)?.name).toBe(pick?.name);
    expect(reg.candidates(lot).map((c) => c.kit.name)).toEqual(['box-house']);
    // Too big or too small for every kit.
    expect(reg.pick(new Lot({ id: 'b', x: 0, z: 0, w: 90, d: 90, facing: 2, district: 'commercial', seed: 5 }))).toBeNull();
    expect(reg.pick(new Lot({ id: 'b', x: 0, z: 0, w: 3, d: 3, facing: 2, district: 'commercial', seed: 5 }))).toBeNull();
    // A district no kit lists gets nothing unless a kit has a fallback.
    expect(reg.pick(new Lot({ id: 'c', x: 0, z: 0, w: 13, d: 12, facing: 2, district: 'nowhere', seed: 5 }))).toBeNull();
  });

  it('weights by district and honours the floors a kit can build', () => {
    class A extends BoxHouseKit { readonly name = 'a'; readonly floors = { min: 1, max: 1 }; }
    class B extends BoxHouseKit { readonly name = 'b'; readonly floors = { min: 2, max: 3 }; }
    const reg = new KitRegistry().register(new A(), { x: 1 }).register(new B(), { x: 3 });
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 400; i++) {
      const lot = new Lot({ id: `${i}`, x: 0, z: 0, w: 10, d: 10, facing: 2, district: 'x', seed: i * 31 + 7, floors: 2 });
      const k = reg.pick(lot, new Rng(i));
      expect(k?.name).toBe('b');
      counts.b++;
      const one = reg.pick(new Lot({ id: `${i}`, x: 0, z: 0, w: 10, d: 10, facing: 2, district: 'x', seed: i, floors: 1 }), new Rng(i));
      expect(one?.name).toBe('a');
    }
    expect(counts.b).toBe(400);
    expect(() => reg.register(new A(), {})).toThrow();
    class C extends BoxHouseKit { readonly name = 'c'; }
    const two = new KitRegistry().register(new A(), { x: 1 }, 0).register(new C(), { x: 3 }, 0);
    const seen = { a: 0, c: 0 };
    for (let i = 0; i < 1000; i++) {
      const k = two.pick(new Lot({ id: 'z', x: 0, z: 0, w: 10, d: 10, facing: 2, district: 'x', seed: i, floors: 1 }), new Rng(i * 13 + 1))!;
      seen[k.name as 'a' | 'c']++;
    }
    expect(seen.c).toBeGreaterThan(seen.a * 2);
  });
});

describe('the Tempest style pack', () => {
  it('has the families of the pictures, with terracotta the base and the heaviest weight in every ordinary district', () => {
    expect(TEMPEST_STYLE.familyNames).toEqual(expect.arrayContaining(['timber-terracotta', 'plaster-dark', 'half-timber-green', 'vermilion-dark', 'thatch', 'civic-teal']));
    expect(TEMPEST_STYLE.block('roofBlock')).toBe(registry.byName('voxelverse:terracotta_roof').id);
    for (const district of ['residential', 'commercial', 'production', 'storage']) {
      const rng = new Rng(11);
      const count = new Map<string, number>();
      for (let i = 0; i < 2000; i++) {
        const f = TEMPEST_STYLE.pickFamily(rng, district);
        count.set(f, (count.get(f) ?? 0) + 1);
      }
      const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
      expect(best[0], district).toBe('timber-terracotta');
      expect(count.get('timber-terracotta')! / 2000, district).toBeGreaterThan(0.3);
      // No roof role of any family is blue slate: the pack never offers one.
      expect(count.has('civic-teal') ? count.get('civic-teal')! : 0).toBe(0);
    }
    // The civic hall district is teal.
    expect(TEMPEST_STYLE.pickFamily(new Rng(1), 'civic')).toBe('civic-teal');
  });

  it('only changes what a family says, so every family is a complete pack', () => {
    for (const name of TEMPEST_STYLE.familyNames) {
      const pack = TEMPEST_STYLE.family(name);
      for (const role of STYLE_ROLES) expect(Number.isInteger(pack.block(role)), `${name}.${role}`).toBe(true);
      expect(TEMPEST_STYLE.family(name)).toBe(pack);
    }
    expect(TEMPEST_STYLE.family('plaster-dark').block('wall')).toBe(TEMPEST_STYLE.block('wall'));
    expect(TEMPEST_STYLE.family('plaster-dark').block('roofBlock')).not.toBe(TEMPEST_STYLE.block('roofBlock'));
    expect(() => TEMPEST_STYLE.family('nothing')).toThrow();
  });

  it('gives each family a matching stair, slab and block of one roof, and a ridge from the same tile or none', () => {
    for (const name of TEMPEST_STYLE.familyNames) {
      const p = TEMPEST_STYLE.family(name);
      const roof = registry.get(p.block('roofBlock')).name;
      expect(registry.get(p.block('roofStairs')).name).toBe(`${roof}_stairs`);
      expect(registry.get(p.block('roofSlab')).name).toBe(`${roof}_slab`);
      const ridge = registry.get(p.block('ridge')).name;
      expect(ridge === roof || ridge.endsWith('_ridge')).toBe(true);
    }
  });
});

describe('the demonstration kits', () => {
  /** Cells not joined to the ground (y <= 1) through faces, edges or corners. */
  const floating = (bp: ReturnType<typeof buildWithKit>): number => {
    const solid = new Set<string>();
    const stack: Array<[number, number, number]> = [];
    const seen = new Set<string>();
    bp.forEach((x, y, z, c) => {
      if (c === AIR_CELL) return;
      solid.add(`${x},${y},${z}`);
      if (y <= 1) { stack.push([x, y, z]); seen.add(`${x},${y},${z}`); }
    });
    while (stack.length) {
      const [x, y, z] = stack.pop()!;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const k = `${x + dx},${y + dy},${z + dz}`;
        if (solid.has(k) && !seen.has(k)) { seen.add(k); stack.push([x + dx, y + dy, z + dz]); }
      }
    }
    return solid.size - seen.size;
  };

  const everyBuild = (): Array<{ kit: BuildingKit; variant: number }> =>
    kits.kits.flatMap((kit) => Array.from({ length: kit.variants }, (_, variant) => ({ kit, variant })));

  it('is built the same way every time, differs by variant and by seed, and every cell is a real block in a legal state', () => {
    for (const { kit, variant } of everyBuild()) {
      const lot = lotFor(kit, variant);
      const a = buildWithKit(kit, lot, TEMPEST_STYLE, variant);
      const b = buildWithKit(kit, lot, TEMPEST_STYLE, variant);
      expect(a.hash(), `${kit.name} ${variant}`).toBe(b.hash());
      expect(a.size).toBeGreaterThan(8);
      a.forEach((_x, _y, _z, c) => {
        if (c === AIR_CELL) return;
        expect(registry.has(cellId(c))).toBe(true);
        expect(cellState(c)).toBeLessThanOrEqual(15);
      });
    }
    const house = kits.get('timber-house')!;
    const hashes = new Set([0, 1, 2].map((v) => buildWithKit(house, lotFor(house, v), TEMPEST_STYLE, v).hash()));
    expect(hashes.size).toBe(3);
    expect(kitRng(lotFor(house), house, 0).next()).not.toBe(kitRng(lotFor(house), house, 1).next());
  });

  it('stays inside its lot: the frontage along x, the depth along z, nothing under the ground but the footing', () => {
    for (const { kit, variant } of everyBuild()) {
      const lot = lotFor(kit, variant);
      const bp = buildWithKit(kit, lot, TEMPEST_STYLE, variant);
      const b = bp.bounds()!;
      expect(b.minX, `${kit.name} ${variant}`).toBeGreaterThanOrEqual(0);
      expect(b.maxX, `${kit.name} ${variant}`).toBeLessThan(lot.frontage);
      expect(b.minZ, `${kit.name} ${variant}`).toBeGreaterThanOrEqual(0);
      expect(b.maxZ, `${kit.name} ${variant}`).toBeLessThan(lot.depth);
      expect(b.minY, `${kit.name} ${variant}`).toBeGreaterThanOrEqual(0);
      expect(b.maxY, `${kit.name} ${variant}`).toBeLessThan(40);
    }
  });

  it('has no floating blocks in any kit, variant or palette family', () => {
    for (const { kit, variant } of everyBuild()) {
      for (const family of TEMPEST_STYLE.familyNames) {
        const lot = lotFor(kit, variant, { family });
        const bp = buildWithKit(kit, lot, TEMPEST_STYLE, variant);
        expect(floating(bp), `${kit.name} ${variant} ${family}`).toBe(0);
      }
    }
  });

  it('keeps every door clear: two air or curtain cells high, nothing solid inside or outside the doorway', () => {
    for (const { kit, variant } of everyBuild()) {
      const bp = buildWithKit(kit, lotFor(kit, variant), TEMPEST_STYLE, variant);
      const doors = bp.markers.filter((m) => m.kind === 'door');
      if (kit.name === 'lantern-post' || kit.name === 'roof-study') continue;
      expect(doors.length, kit.name).toBeGreaterThan(0);
      for (const d of doors) {
        for (let k = 0; k < 2; k++) {
          const c = bp.get(d.x, d.y + k, d.z);
          const free = c === NO_CELL || c === AIR_CELL || [194, 195, 196].includes(cellId(c));
          expect(free, `${kit.name} ${variant} door ${d.x},${d.z} y ${d.y + k}`).toBe(true);
        }
        // The cell just inside the door and the one just outside stand clear at body height.
        const f = d.facing as number;
        const dx = [0, 1, 0, -1][f];
        const dz = [-1, 0, 1, 0][f];
        for (const s of [-1, 1]) {
          for (let k = 0; k < 2; k++) {
            const c = bp.get(d.x + dx * s, d.y + k, d.z + dz * s);
            const solid = c !== NO_CELL && c !== AIR_CELL && !registryNonSolid(cellId(c));
            expect(solid, `${kit.name} ${variant} beside door ${d.x},${d.z} (${s})`).toBe(false);
          }
        }
      }
    }
  });

  it('builds the box house for every district size and facing without a gap in the roof', () => {
    const kit = new BoxHouseKit();
    for (const floors of [1, 2, 3]) {
      for (const [w, d] of [[7, 7], [11, 9], [15, 13], [9, 12]]) {
        const lot = new Lot({ id: 'b', x: 0, z: 0, w, d, facing: 2, district: 'residential', seed: 3, floors });
        const bp = buildWithKit(kit, lot, TEMPEST_STYLE);
        expect(floating(bp)).toBe(0);
        const b = bp.bounds()!;
        expect(b.maxX).toBeLessThan(w);
        expect(b.maxZ).toBeLessThan(d);
        // Every column of the walls' rectangle is covered from above.
        for (let x = 1; x <= w - 2; x++) for (let z = 1; z <= d - 2; z++) {
          let top = false;
          for (let y = 0; y <= b.maxY; y++) if (bp.solid(x, y, z)) top = true;
          expect(top).toBe(true);
        }
      }
    }
  });
});

// A tatami mat is a floor, four sixteenths high: walking onto it is a step, not a wall.
const registryNonSolid = (id: number): boolean => !registry.isSolid(id) || id === T.TATAMI;
