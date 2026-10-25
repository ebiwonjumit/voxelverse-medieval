import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { ShapedBlock } from '../../content/blocksShaped';
import { TempestBlock as T } from '../../content/blocksTempest';
import { AIR_CELL, cellId, cellState, packCell } from '../../engine/cell';
import { OrientedBoxModel, StairModel, stairState } from '../../engine/models';
import { Rng } from '../../worldgen/noise';
import { Blueprint, NO_CELL, Placement } from '../../worldgen/structures/Blueprint';
import { mirrorCell, orientKind, orientedBlockIds, turnCell } from '../../worldgen/structures/orientation';
import { PERF_TOLERANCE, tolerant } from '../perf';

const stone = 3;
const randomBlueprint = (seed: number): Blueprint => {
  const rng = new Rng(seed);
  const bp = new Blueprint('random');
  for (let i = 0; i < 300; i++) {
    const id = rng.chance(0.3) ? T.TERRACOTTA_ROOF_STAIRS : rng.chance(0.2) ? T.TERRACOTTA_RIDGE_HORN : rng.chance(0.2) ? T.AWNING_RED : stone;
    const kind = orientKind(id);
    const state = kind === 'stair' ? rng.int(8) : kind ? rng.int(4) : 0;
    bp.setBlock(rng.int(17) - 5, rng.int(9) - 2, rng.int(15) - 6, id, state);
  }
  bp.addMarker({ kind: 'door', x: 2, y: 1, z: 3, facing: 2 });
  bp.addMarker({ kind: 'tree', x: -3, y: 1, z: 1, tag: 'sakura' });
  return bp;
};

describe('Blueprint cells', () => {
  it('stores set cells, reports unset ones as NO_CELL, and tells air carving from nothing', () => {
    const bp = new Blueprint();
    expect(bp.get(0, 0, 0)).toBe(NO_CELL);
    expect(bp.empty).toBe(true);
    bp.setBlock(2, 3, 4, stone, 0);
    bp.carve(1, 1, 1);
    expect(bp.get(2, 3, 4)).toBe(packCell(stone));
    expect(bp.get(1, 1, 1)).toBe(AIR_CELL);
    expect(bp.has(1, 1, 1)).toBe(true);
    expect(bp.solid(1, 1, 1)).toBe(false);
    expect(bp.solid(2, 3, 4)).toBe(true);
    expect(bp.get(9, 9, 9)).toBe(NO_CELL);
    expect(bp.size).toBe(2);
    bp.setBlock(2, 3, 4, stone + 1);
    expect(bp.size).toBe(2);
  });

  it('takes negative coordinates and grows in any direction without losing cells', () => {
    const bp = new Blueprint();
    const placed = new Map<string, number>();
    const rng = new Rng(9);
    for (let i = 0; i < 400; i++) {
      const x = rng.int(80) - 40, y = rng.int(30) - 10, z = rng.int(80) - 40;
      const id = 3 + rng.int(40);
      bp.setBlock(x, y, z, id);
      placed.set(`${x},${y},${z}`, id);
    }
    expect(bp.size).toBe(placed.size);
    for (const [k, id] of placed) {
      const [x, y, z] = k.split(',').map(Number);
      expect(cellId(bp.get(x, y, z))).toBe(id);
    }
  });

  it('keeps tight bounds, also after cells are unset', () => {
    const bp = new Blueprint();
    expect(bp.bounds()).toBeNull();
    bp.setBlock(0, 0, 0, stone);
    bp.setBlock(5, 2, -3, stone);
    bp.setBlock(-2, 7, 4, stone);
    expect(bp.bounds()).toEqual({ minX: -2, minY: 0, minZ: -3, maxX: 5, maxY: 7, maxZ: 4 });
    bp.unset(-2, 7, 4);
    expect(bp.bounds()).toEqual({ minX: 0, minY: 0, minZ: -3, maxX: 5, maxY: 2, maxZ: 0 });
    expect(bp.size).toBe(2);
  });

  it('refuses a cell that is the unset marker, non-integers and non-integer coordinates', () => {
    const bp = new Blueprint();
    expect(() => bp.set(0, 0, 0, 0xffff)).toThrow();
    expect(() => bp.set(0, 0, 0, -1)).toThrow();
    expect(() => bp.set(0.5, 0, 0, 1)).toThrow();
  });

  it('lists cells in a fixed order whatever order they were set in', () => {
    const a = new Blueprint();
    const b = new Blueprint();
    const cells: Array<[number, number, number]> = [[3, 0, 1], [0, 2, 2], [1, 1, 0], [-1, 0, 5], [2, 2, 2]];
    cells.forEach(([x, y, z], i) => a.setBlock(x, y, z, 10 + i));
    [...cells].reverse().forEach(([x, y, z]) => b.setBlock(x, y, z, 10 + cells.findIndex((c) => c[0] === x && c[1] === y && c[2] === z)));
    expect(a.cells()).toEqual(b.cells());
    expect(a.hash()).toBe(b.hash());
  });
});

describe('Blueprint hash', () => {
  it('changes with a position, a block, a state, a marker, and not with set order', () => {
    const base = randomBlueprint(1);
    const h = base.hash();
    expect(randomBlueprint(1).hash()).toBe(h);
    expect(randomBlueprint(2).hash()).not.toBe(h);
    const moved = base.translated(1, 0, 0);
    expect(moved.hash()).not.toBe(h);
    const changed = base.clone();
    changed.setBlock(0, 0, 0, 40);
    expect(changed.hash()).not.toBe(h);
    const stateChanged = base.clone();
    const [x, y, z, c] = base.cells().find(([, , , cell]) => orientKind(cellId(cell)) === 'stair')!;
    stateChanged.set(x, y, z, packCell(cellId(c), (cellState(c) + 1) & 7));
    expect(stateChanged.hash()).not.toBe(h);
    const marked = base.clone();
    marked.addMarker({ kind: 'lamp', x: 0, y: 1, z: 0 });
    expect(marked.hash()).not.toBe(h);
    expect(base.clone().hash()).toBe(h);
  });
});

describe('Blueprint turning and mirroring', () => {
  it('four turns are the identity, two turns are one half turn, and a turn moves east to south', () => {
    const bp = randomBlueprint(3);
    let r = bp;
    for (let i = 0; i < 4; i++) r = r.rotated(1);
    expect(r.hash()).toBe(bp.hash());
    expect(bp.rotated(2).hash()).toBe(bp.rotated(1).rotated(1).hash());
    expect(bp.rotated(-1).hash()).toBe(bp.rotated(3).hash());
    const one = new Blueprint();
    one.setBlock(3, 0, 0, stone);
    const turned = one.rotated(1);
    expect(turned.cells()).toEqual([[0, 0, 3, packCell(stone)]]);
    // North (-z) goes to east (+x).
    const north = new Blueprint();
    north.setBlock(0, 0, -2, stone);
    expect(north.rotated(1).cells()).toEqual([[2, 0, 0, packCell(stone)]]);
  });

  it('turns the state of stairs, ridge horns and awnings with the building', () => {
    const stair = packCell(T.TERRACOTTA_ROOF_STAIRS, stairState(0, true));
    expect(turnCell(stair, 1)).toBe(packCell(T.TERRACOTTA_ROOF_STAIRS, stairState(1, true)));
    expect(turnCell(stair, 3)).toBe(packCell(T.TERRACOTTA_ROOF_STAIRS, stairState(3, true)));
    // Horn written at the east end: one turn puts it south.
    expect(turnCell(packCell(T.DARK_RIDGE_HORN, 0), 1)).toBe(packCell(T.DARK_RIDGE_HORN, 1));
    expect(turnCell(packCell(T.AWNING_RED, 2), 3)).toBe(packCell(T.AWNING_RED, 1));
    // Cubes and unoriented blocks are untouched.
    expect(turnCell(packCell(stone, 0), 1)).toBe(packCell(stone, 0));
  });

  it('turns a stair so it still climbs the same way relative to the building', () => {
    // A stair on the north edge climbing south (facing 2) belongs to a roof sloping up to the south.
    const bp = new Blueprint();
    bp.setBlock(2, 1, 0, T.TERRACOTTA_ROOF_STAIRS, stairState(2));
    const east = bp.rotated(1); // north edge becomes the east edge, climbing west
    const [x, , z, c] = east.cells()[0];
    expect([x, z]).toEqual([0, 2]);
    expect(cellState(c) & 3).toBe(3);
  });

  it('mirrors across x and z, twice is the identity, and swaps stairs, horns and awnings the right way', () => {
    const bp = randomBlueprint(4);
    expect(bp.mirrored('x').mirrored('x').hash()).toBe(bp.hash());
    expect(bp.mirrored('z').mirrored('z').hash()).toBe(bp.hash());
    expect(bp.mirrored('x').hash()).not.toBe(bp.hash());
    // Facings: east and west swap under x, north and south under z.
    const s = (f: number) => packCell(ShapedBlock.STONE_BRICK_STAIRS, stairState(f));
    expect(mirrorCell(s(1), 'x')).toBe(s(3));
    expect(mirrorCell(s(0), 'x')).toBe(s(0));
    expect(mirrorCell(s(0), 'z')).toBe(s(2));
    // The horn at the east end of a ridge goes to the west end under x and stays under z.
    expect(mirrorCell(packCell(T.TERRACOTTA_RIDGE_HORN, 0), 'x')).toBe(packCell(T.TERRACOTTA_RIDGE_HORN, 2));
    expect(mirrorCell(packCell(T.TERRACOTTA_RIDGE_HORN, 0), 'z')).toBe(packCell(T.TERRACOTTA_RIDGE_HORN, 0));
    // An awning against the east wall (turn 1) goes against the west wall (turn 3) under x.
    expect(mirrorCell(packCell(T.AWNING_INDIGO, 1), 'x')).toBe(packCell(T.AWNING_INDIGO, 3));
    // Things the same at both ends do not change.
    expect(mirrorCell(packCell(T.NOREN_RED, 1), 'x')).toBe(packCell(T.NOREN_RED, 1));
    expect(mirrorCell(packCell(stone, 0), 'x')).toBe(packCell(stone, 0));
  });

  it('turns and mirrors markers with the cells', () => {
    const bp = new Blueprint();
    bp.setBlock(0, 0, 0, stone);
    bp.addMarker({ kind: 'door', x: 4, y: 1, z: 0, facing: 2 });
    const r = bp.rotated(1).markers[0];
    expect([r.x, r.z, r.facing]).toEqual([0, 4, 3]);
    const m = bp.mirrored('x').markers[0];
    expect([m.x, m.z, m.facing]).toEqual([-4, 0, 2]);
    const mz = bp.mirrored('z').markers[0];
    expect(mz.facing).toBe(0);
  });

  it('merges over or under, and translates', () => {
    const a = new Blueprint();
    a.setBlock(0, 0, 0, 10);
    a.setBlock(1, 0, 0, 11);
    const b = new Blueprint();
    b.setBlock(0, 0, 0, 20);
    b.setBlock(5, 0, 0, 21);
    const over = a.clone().merge(b);
    expect(cellId(over.get(0, 0, 0))).toBe(20);
    expect(over.size).toBe(3);
    const under = a.clone().merge(b, 0, 0, 0, 'under');
    expect(cellId(under.get(0, 0, 0))).toBe(10);
    expect(cellId(under.get(5, 0, 0))).toBe(21);
    const shifted = a.clone().merge(b, 10, 2, -1);
    expect(cellId(shifted.get(10, 2, -1))).toBe(20);
    expect(a.translated(3, 1, 2).get(4, 1, 2)).toBe(packCell(11));
  });
});

describe('orientation table', () => {
  const registry = createDefaultRegistry();

  it('lists every stair and every oriented-box block the registry has, and nothing else', () => {
    const expected = registry.all()
      .filter((d) => d.model instanceof StairModel || d.model instanceof OrientedBoxModel)
      .map((d) => d.id)
      .sort((a, b) => a - b);
    expect(orientedBlockIds()).toEqual(expected);
  });

  it('calls stairs stairs and the others by what they are', () => {
    for (const d of registry.all()) {
      const kind = orientKind(d.id);
      if (d.model instanceof StairModel) expect(kind).toBe('stair');
      else if (d.model instanceof OrientedBoxModel) expect(['ridge', 'ridgeHorn', 'awning', 'plane']).toContain(kind);
      else expect(kind).toBeUndefined();
    }
  });
});

describe('Placement', () => {
  it('answers cellAt in world coordinates for every turn and mirror, matching the turned blueprint', () => {
    const bp = randomBlueprint(5);
    for (const turns of [0, 1, 2, 3]) {
      for (const mirror of [false, true]) {
        const p = new Placement(bp, { x: 1500, y: 8, z: -40, turns, mirror });
        let expected = mirror ? bp.mirrored('x') : bp;
        expected = expected.rotated(turns);
        let count = 0;
        p.stamp((x, y, z, cell) => {
          expect(expected.get(x - 1500, y - 8, z + 40)).toBe(cell);
          expect(p.cellAt(x, y, z)).toBe(cell);
          count++;
        });
        expect(count).toBe(bp.size);
        expect(p.cellAt(0, 0, 0)).toBe(NO_CELL);
        const b = p.bounds()!;
        expect(p.cellAt(b.minX - 1, b.minY, b.minZ)).toBe(NO_CELL);
        expect(p.touches(b.minX, b.minZ, b.minX, b.minZ)).toBe(true);
        expect(p.touches(b.maxX + 1, b.minZ, b.maxX + 5, b.maxZ)).toBe(false);
      }
    }
  });

  it('carries the markers into world coordinates', () => {
    const bp = new Blueprint();
    bp.setBlock(0, 0, 0, stone);
    bp.addMarker({ kind: 'tree', x: 2, y: 1, z: 3, tag: 'cedar' });
    const p = new Placement(bp, { x: 100, y: 10, z: 200, turns: 1 });
    expect(p.markers()).toEqual([{ kind: 'tree', x: 100 - 3, y: 11, z: 202, tag: 'cedar' }]);
  });

  it(`looks up a million cells in well under a second (${PERF_TOLERANCE}x allowance)`, () => {
    const bp = randomBlueprint(6);
    const p = new Placement(bp, { x: 0, y: 0, z: 0, turns: 1 });
    let hit = 0;
    const t0 = performance.now();
    for (let i = 0; i < 1_000_000; i++) if (p.cellAt((i % 41) - 20, (i >> 6) % 14, ((i * 7) % 37) - 18) !== NO_CELL) hit++;
    const ms = performance.now() - t0;
    expect(hit).toBeGreaterThan(0);
    expect(ms).toBeLessThan(tolerant(1500));
  });
});
