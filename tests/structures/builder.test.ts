import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { TempestBlock as T } from '../../content/blocksTempest';
import { AIR_CELL, cellId, cellState } from '../../engine/cell';
import { Rng } from '../../worldgen/noise';
import { Blueprint, NO_CELL } from '../../worldgen/structures/Blueprint';
import {
  BlueprintBuilder, EAST, NORTH, SOUTH, WEST, rect,
} from '../../worldgen/structures/BlueprintBuilder';
import { FLARED, FLARED_DEEP, FLARED_TIGHT, GENTLE, STEEP, RoofProfile, ringAt } from '../../worldgen/structures/roofProfile';
import { Rect } from '../../worldgen/structures/roofs';
import { STYLE_ROLES } from '../../worldgen/structures/StylePack';
import { TEMPEST_STYLE } from '../../worldgen/tempest/style';

const registry = createDefaultRegistry();
const roleId = (r: Parameters<typeof TEMPEST_STYLE.block>[0]) => TEMPEST_STYLE.block(r);
const newBuilder = (seed = 1) => new BlueprintBuilder(TEMPEST_STYLE, new Rng(seed), 'test');

const ROOF_IDS = new Set([
  roleId('roofBlock'), roleId('roofStairs'), roleId('roofSlab'), roleId('ridge'), roleId('ridgeHorn'),
]);

/** Cells not reachable (through faces, edges and corners) from anything standing on the ground (y <= 1). */
const floating = (bp: Blueprint): number => {
  const solid = new Set<string>();
  const queue: Array<[number, number, number]> = [];
  const seen = new Set<string>();
  bp.forEach((x, y, z, c) => {
    if (c === AIR_CELL) return;
    solid.add(`${x},${y},${z}`);
    if (y <= 1) { queue.push([x, y, z]); seen.add(`${x},${y},${z}`); }
  });
  while (queue.length) {
    const [x, y, z] = queue.pop()!;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const k = `${x + dx},${y + dy},${z + dz}`;
      if (solid.has(k) && !seen.has(k)) { seen.add(k); queue.push([x + dx, y + dy, z + dz]); }
    }
  }
  return solid.size - seen.size;
};

describe('builder primitives', () => {
  it('fills boxes, shells and floors exactly', () => {
    const b = newBuilder();
    b.box(0, 0, 0, 2, 1, 3, 'wall');
    expect(b.bp.size).toBe(3 * 2 * 4);
    const h = newBuilder();
    h.hollowBox(0, 0, 0, 4, 2, 4, 'wall');
    // 5x5 footprint ring is 16 cells, three high.
    expect(h.bp.size).toBe(16 * 3);
    const capped = newBuilder();
    capped.hollowBox(0, 0, 0, 4, 2, 4, 'wall', { top: 'roofBlock', bottom: 'floor' });
    expect(capped.bp.size).toBe(16 * 3 + 9 + 9);
    expect(cellId(capped.bp.get(2, 2, 2))).toBe(roleId('roofBlock'));
    expect(cellId(capped.bp.get(2, 0, 2))).toBe(roleId('floor'));
    expect(capped.bp.get(2, 1, 2)).toBe(NO_CELL);
    const f = newBuilder();
    f.floor(rect(0, 0, 3, 5), 2, 'path');
    expect(f.bp.size).toBe(4 * 6);
  });

  it('takes roles, ids and specs for a block, and puts the state in the cell', () => {
    const b = newBuilder();
    b.set(0, 0, 0, 'wall');
    b.set(1, 0, 0, T.TATAMI);
    b.set(2, 0, 0, { id: T.TERRACOTTA_ROOF_STAIRS, state: 5 });
    b.set(3, 0, 0, 'roofSlab', 1);
    expect(cellId(b.bp.get(0, 0, 0))).toBe(T.PLASTER_WHITE);
    expect(cellId(b.bp.get(1, 0, 0))).toBe(T.TATAMI);
    expect(cellState(b.bp.get(2, 0, 0))).toBe(5);
    expect(cellState(b.bp.get(3, 0, 0))).toBe(1);
  });

  it('cuts door openings clear and marks the door, and fills windows with their panes', () => {
    const b = newBuilder();
    const r = rect(0, 0, 8, 6);
    b.walls(r, 1, 3, 'wall', [
      { side: SOUTH, at: 4, y: 1, kind: 'door', noren: true },
      { side: SOUTH, at: 1, y: 2, width: 2, kind: 'shoji', lit: true },
      { side: EAST, at: 3, y: 2, kind: 'lattice' },
      { side: NORTH, at: 2, y: 2, width: 3, kind: 'glass', sill: 'wallBase' },
      { side: WEST, at: 2, y: 1, kind: 'arch' },
    ]);
    // A door is two cells high: the lower is air, the upper holds the curtain.
    expect(b.bp.get(4, 1, 6)).toBe(AIR_CELL);
    expect(cellId(b.bp.get(4, 2, 6))).toBe(T.NOREN_INDIGO);
    expect(cellState(b.bp.get(4, 2, 6))).toBe(0);
    expect(cellId(b.bp.get(1, 2, 6))).toBe(T.SHOJI_PANE_LIT);
    expect(cellId(b.bp.get(2, 2, 6))).toBe(T.SHOJI_PANE_LIT);
    expect(cellId(b.bp.get(8, 2, 3))).toBe(T.LATTICE_WINDOW);
    expect(cellId(b.bp.get(3, 2, 0))).toBe(roleId('glassPane'));
    expect(cellId(b.bp.get(3, 1, 0))).toBe(roleId('wallBase'));
    expect(b.bp.get(0, 1, 2)).toBe(AIR_CELL);
    expect(b.bp.get(0, 2, 2)).toBe(AIR_CELL);
    expect(b.bp.markers.filter((m) => m.kind === 'door')).toEqual([{ kind: 'door', x: 4, y: 1, z: 6, facing: SOUTH }, { kind: 'door', x: 0, y: 1, z: 2, facing: WEST }].slice(0, 1));
    expect(() => b.opening(r, { side: SOUTH, at: 8, width: 2, y: 1, kind: 'door' })).toThrow(RangeError);
  });

  it('builds a frame of posts with panels between and beams at the levels asked for', () => {
    const b = newBuilder();
    const r = rect(0, 0, 10, 8);
    b.frame(r, 1, 3, { panel: 'wall', post: 'post', spacing: 4, beams: [2] });
    for (const [x, z] of [[0, 0], [10, 0], [0, 8], [10, 8]]) expect(cellId(b.bp.get(x, 1, z))).toBe(roleId('post'));
    // Posts at 0, 4 (or 5), 10 along the front: spacing is never more than 4.
    const posts: number[] = [];
    for (let x = 0; x <= 10; x++) if (cellId(b.bp.get(x, 3, 0)) === roleId('post')) posts.push(x);
    expect(posts[0]).toBe(0);
    expect(posts[posts.length - 1]).toBe(10);
    for (let i = 1; i < posts.length; i++) expect(posts[i] - posts[i - 1]).toBeLessThanOrEqual(4);
    expect(cellId(b.bp.get(2, 2, 0))).toBe(roleId('beam'));
    expect(cellId(b.bp.get(2, 3, 0))).toBe(roleId('wall'));
  });

  it('puts steps down and out with stairs that climb back towards the building', () => {
    const b = newBuilder();
    b.steps(5, 3, 8, SOUTH, 3, 2);
    for (let k = 0; k < 3; k++) {
      for (const x of [5, 6]) {
        const c = b.bp.get(x, 3 - k, 8 + k);
        expect(cellId(c)).toBe(roleId('stoneStairs'));
        expect(cellState(c) & 3).toBe(NORTH);
      }
    }
    const e = newBuilder();
    e.steps(5, 2, 4, EAST, 2, 1);
    expect(cellState(e.bp.get(6, 1, 4)) & 3).toBe(WEST);
  });

  it('turns an awning to fall towards the street, and a sign and a curtain along their wall', () => {
    const b = newBuilder();
    b.awning(6, 2, 5, 3, SOUTH, { alt: true });
    for (let x = 2; x <= 5; x++) expect(cellState(b.bp.get(x, 3, 7)) & 3).toBe(0);
    const ids = [2, 3, 4, 5].map((x) => cellId(b.bp.get(x, 3, 7)));
    expect(new Set(ids).size).toBe(2);
    const w = newBuilder();
    w.awning(0, 1, 3, 3, WEST);
    expect(cellState(w.bp.get(-1, 3, 1)) & 3).toBe(1);
    const s = newBuilder();
    s.signboard(0, 4, 0, 'z');
    s.noren(1, 2, 0, 'x', 2);
    expect(cellState(s.bp.get(0, 4, 0))).toBe(1);
    expect(cellId(s.bp.get(2, 2, 0))).toBe(roleId('noren'));
  });

  it('makes a pond of water with a rim and koi, a stone lantern of three blocks, and tree markers', () => {
    const b = newBuilder(3);
    b.pond(rect(2, 2, 5, 4), 0, 3);
    let water = 0, koi = 0, rim = 0;
    b.bp.forEach((_x, y, _z, c) => {
      if (y !== 0) return;
      if (cellId(c) === 5) water++; else if (cellId(c) === T.KOI_POND) koi++; else rim++;
    });
    expect(water + koi).toBe(12);
    expect(koi).toBe(3);
    expect(rim).toBe(6 * 5 - 12);
    b.stoneLantern(0, 1, 0);
    expect([1, 2, 3].map((y) => cellId(b.bp.get(0, y, 0)))).toEqual([T.STONE_LANTERN_BASE, T.STONE_LANTERN_LIGHT, T.STONE_LANTERN_CAP]);
    b.treeSpot(9, 9, 'sakura');
    expect(b.bp.markers).toEqual([{ kind: 'tree', x: 9, y: 1, z: 9, tag: 'sakura' }]);
    // The same seed gives the same pond.
    const again = newBuilder(3);
    again.pond(rect(2, 2, 5, 4), 0, 3);
    const same = new Blueprint();
    b.bp.forEach((x, y, z, c) => { if (y === 0) same.set(x, y, z, c); });
    expect(again.bp.hash()).toBe(same.hash());
  });

  it('builds an engawa with posts to the eave, a rail between and a gap for the steps', () => {
    const b = newBuilder();
    const wall = rect(2, 2, 10, 8);
    b.engawa(wall, 1, SOUTH, 2, { from: 2, to: 10, gap: [6], posts: 4, postTop: 5 });
    // Even where a post would fall in the gap, there is none.
    for (let x = 2; x <= 10; x++) for (const z of [9, 10]) expect(cellId(b.bp.get(x, 1, z))).toBe(roleId('floor'));
    expect(cellId(b.bp.get(2, 5, 10))).toBe(roleId('post'));
    expect(cellId(b.bp.get(10, 3, 10))).toBe(roleId('post'));
    expect(b.bp.get(6, 2, 10)).toBe(NO_CELL);
    expect(cellId(b.bp.get(3, 2, 10))).toBe(roleId('rail'));
  });
});

describe('roof profiles', () => {
  it('extend past their data: steep tails climb a block a ring, gentle ones alternate slab and stair', () => {
    expect(ringAt(STEEP, 5)).toEqual({ shape: 'stair', y: 4 });
    const g = [3, 4, 5, 6, 7].map((i) => ringAt(GENTLE, i));
    expect(g.map((r) => r.shape)).toEqual(['stair', 'slab', 'stair', 'slab', 'stair']);
    for (let i = 1; i < 8; i++) {
      // The surface never goes down from the outside in, except at the lifted lip of the eave.
      expect(ringAt(FLARED, i).y).toBeGreaterThanOrEqual(ringAt(FLARED, i - 1).y);
    }
    expect(FLARED.rings[0].shape).toBe('slabTop');
    for (const p of [STEEP, GENTLE, FLARED, FLARED_TIGHT, FLARED_DEEP] as RoofProfile[]) {
      expect(p.overhang).toBeGreaterThanOrEqual(1);
      // The ring over the wall can stand on it: not below the wall's top.
      expect(ringAt(p, p.overhang).y).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('roofs', () => {
  const wallsFor = (w: number, d: number, o: number): Rect => rect(o, o, o + w - 1, o + d - 1);

  /** Builds walls and a roof of a kind over them. */
  const build = (kind: 'gable-x' | 'gable-z' | 'hip' | 'hipGable', w: number, d: number, profile: RoofProfile, tips = 0): { b: BlueprintBuilder; walls: Rect; outer: Rect } => {
    const b = newBuilder();
    const walls = wallsFor(w, d, profile.overhang + 1);
    b.floor(walls, 0, 'wallBase');
    b.frame(walls, 1, 3, { panel: 'wall', post: 'post', spacing: 4 });
    b.beamRing(walls, 4, 'beam');
    const info = kind === 'gable-x' ? b.gable(walls, 4, { profile, axis: 'x', tips })
      : kind === 'gable-z' ? b.gable(walls, 4, { profile, axis: 'z', tips })
      : kind === 'hip' ? b.hip(walls, 4, { profile, tips }) : b.hipGable(walls, 4, { profile, tips });
    return { b, walls, outer: info.outer };
  };

  const kinds = ['gable-x', 'gable-z', 'hip', 'hipGable'] as const;
  const profiles = [STEEP, GENTLE, FLARED, FLARED_TIGHT, FLARED_DEEP];

  it('is closed: every column of the eaves and the roof has a roof block, whatever the size, shape or profile', () => {
    for (const kind of kinds) {
      for (const profile of profiles) {
        for (const [w, d] of [[7, 5], [9, 7], [11, 9], [8, 6], [13, 11], [9, 9]]) {
          const { b, outer } = build(kind, w, d, profile);
          for (let x = outer.x0; x <= outer.x1; x++) {
            for (let z = outer.z0; z <= outer.z1; z++) {
              let has = false;
              for (let y = 5 - 2; y <= 5 + 30 && !has; y++) has = ROOF_IDS.has(cellId(b.bp.get(x, y, z))) && b.bp.get(x, y, z) !== NO_CELL;
              expect(has, `${kind} ${profile.name} ${w}x${d} column ${x},${z}`).toBe(true);
            }
          }
        }
      }
    }
  });

  it('has no floating blocks: everything is joined to the ground through the walls', () => {
    for (const kind of kinds) {
      for (const profile of profiles) {
        for (const [w, d, tips] of [[9, 7, 0], [11, 9, 2], [8, 6, 3], [13, 11, 1]]) {
          const { b } = build(kind, w, d, profile, tips);
          expect(floating(b.bp), `${kind} ${profile.name} ${w}x${d} tips ${tips}`).toBe(0);
        }
      }
    }
  });

  it('keeps the eaves outside the walls and the roof over them, and never inside the wall volume', () => {
    for (const kind of kinds) {
      const { b, walls } = build(kind, 9, 7, FLARED);
      for (let y = 1; y <= 4; y++) {
        for (let x = walls.x0; x <= walls.x1; x++) for (let z = walls.z0; z <= walls.z1; z++) {
          const c = b.bp.get(x, y, z);
          if (c !== NO_CELL) expect(ROOF_IDS.has(cellId(c)), `${kind} roof inside walls at ${x},${y},${z}`).toBe(false);
        }
      }
    }
  });

  it('is symmetric: the left and right halves of a gable match, mirrored, and the ridge is centred', () => {
    const { b, walls, outer } = build('gable-x', 9, 7, FLARED);
    const mid = (outer.z0 + outer.z1) / 2;
    expect(Number.isInteger(mid)).toBe(true);
    for (let x = outer.x0; x <= outer.x1; x++) {
      for (let y = 4; y <= 14; y++) {
        for (let dz = 0; dz <= outer.z1 - mid; dz++) {
          const a = b.bp.get(x, y, mid - dz);
          const c = b.bp.get(x, y, mid + dz);
          expect(a === NO_CELL, `${x},${y} ${dz}`).toBe(c === NO_CELL);
          if (a !== NO_CELL) expect(cellId(a)).toBe(cellId(c));
        }
      }
    }
    // The ridge cap runs the length of the roof with horned ends, and the wall's gable ends are filled.
    const ridgeY = Math.max(...b.bp.cells().filter(([, , , c]) => cellId(c) === roleId('ridge') || cellId(c) === roleId('ridgeHorn')).map(([, y]) => y));
    expect(cellId(b.bp.get(outer.x0, ridgeY, mid))).toBe(roleId('ridgeHorn'));
    expect(cellId(b.bp.get(outer.x1, ridgeY, mid))).toBe(roleId('ridgeHorn'));
    expect(cellState(b.bp.get(outer.x1, ridgeY, mid))).toBe(0); // the horn points east at the east end
    expect(cellState(b.bp.get(outer.x0, ridgeY, mid))).toBe(2); // and west at the west end
    expect(cellId(b.bp.get(outer.x0 + 2, ridgeY, mid))).toBe(roleId('ridge'));
    expect(cellId(b.bp.get(walls.x0, 5, mid))).toBe(roleId('wall'));
    expect(cellId(b.bp.get(walls.x1, 6, mid))).toBe(roleId('wall'));
  });

  it('turns the ridge a quarter when the ridge runs along z', () => {
    const { b, outer } = build('gable-z', 9, 7, FLARED);
    const mid = (outer.x0 + outer.x1) / 2;
    const cells = b.bp.cells().filter(([x, , , c]) => x === mid && (cellId(c) === roleId('ridgeHorn') || cellId(c) === roleId('ridge')));
    expect(cells.length).toBeGreaterThan(3);
    const ys = new Set(cells.map(([, y]) => y));
    expect(ys.size).toBe(1);
    const south = cells.find(([, , z]) => z === outer.z1)!;
    const north = cells.find(([, , z]) => z === outer.z0)!;
    expect(cellState(south[3])).toBe(1);
    expect(cellState(north[3])).toBe(3);
  });

  it('raises the eave corners when asked, and only there', () => {
    const plain = build('hip', 11, 9, FLARED, 0);
    const tipped = build('hip', 11, 9, FLARED, 2);
    const o = tipped.outer;
    const topAt = (b: BlueprintBuilder, x: number, z: number): number => {
      let top = -99;
      for (let y = 0; y < 30; y++) if (b.bp.get(x, y, z) !== NO_CELL) top = y;
      return top;
    };
    for (const [x, z] of [[o.x0, o.z0], [o.x1, o.z0], [o.x0, o.z1], [o.x1, o.z1]]) {
      expect(topAt(tipped.b, x, z)).toBeGreaterThan(topAt(plain.b, x, z));
    }
    // The middle of an eave is untouched.
    const midX = Math.floor((o.x0 + o.x1) / 2);
    expect(topAt(tipped.b, midX, o.z0)).toBe(topAt(plain.b, midX, o.z0));
  });

  it('puts a hip roof together with a crest of cubes and no hole, for odd and even spans', () => {
    for (const [w, d] of [[9, 7], [10, 8], [11, 11]]) {
      const { b, outer } = build('hip', w, d, STEEP);
      const tops: number[] = [];
      for (let x = outer.x0; x <= outer.x1; x++) for (let z = outer.z0; z <= outer.z1; z++) {
        let top = -1;
        for (let y = 3; y < 30; y++) if (b.bp.get(x, y, z) !== NO_CELL) top = y;
        tops.push(top);
      }
      expect(Math.min(...tops)).toBeGreaterThanOrEqual(4);
    }
  });

  it('builds an eave skirt with room left inside it for the next storey', () => {
    const b = newBuilder();
    const outer = rect(0, 0, 16, 14);
    const inner = b.eaves(outer, 5, FLARED.overhang + 1, FLARED);
    expect(inner).toEqual(rect(3, 3, 13, 11));
    // Nothing inside the rectangle returned.
    for (let y = 0; y < 20; y++) for (let x = 3; x <= 13; x++) for (let z = 3; z <= 11; z++) expect(b.bp.get(x, y, z)).toBe(NO_CELL);
  });
});

describe('furniture and rooms', () => {
  it('lays the floor, covers it with tatami one block up, and never puts anything on or beside the door path', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const b = new BlueprintBuilder(TEMPEST_STYLE, new Rng(seed), 'room');
      const interior = rect(1, 1, 7, 5);
      const room = b.room(interior, 1, { doors: [{ x: 4, z: 5, inward: NORTH }, { x: 1, z: 3, inward: EAST }] });
      b.tatami(room);
      const placed = b.furnish(room, [
        { block: T.LOW_TABLE, count: 2, where: 'center' },
        { block: T.CUSHION, count: 4, where: 'any' },
        { block: T.BOOKSHELF, count: 2, where: 'wall', tall: 1 },
        { block: T.HEARTH, count: 1, where: 'corner' },
      ]);
      expect(placed.length).toBeGreaterThan(0);
      // The door cells and the two behind each stay as tatami: the furniture never replaced them.
      for (const [dx, dz, ix, iz] of [[4, 5, 0, -1], [1, 3, 1, 0]]) {
        for (let k = 0; k <= 2; k++) {
          for (const side of [-1, 0, 1]) {
            const x = dx + ix * k + (iz !== 0 ? side : 0);
            const z = dz + iz * k + (ix !== 0 ? side : 0);
            if (x < interior.x0 || x > interior.x1 || z < interior.z0 || z > interior.z1) continue;
            expect(cellId(b.bp.get(x, 2, z)), `seed ${seed} ${x},${z}`).toBe(T.TATAMI);
            expect(b.bp.get(x, 3, z)).toBe(NO_CELL);
          }
        }
      }
      // Furniture stands on the floor row: its lowest cell is at y 2, the cell above the floor.
      for (const p of placed) expect(p.y).toBeGreaterThanOrEqual(2);
    }
  });

  it('is deterministic for a seed and varies between seeds', () => {
    const make = (seed: number): number => {
      const b = new BlueprintBuilder(TEMPEST_STYLE, new Rng(seed), 'room');
      const room = b.room(rect(0, 0, 8, 6), 1, { doors: [{ x: 4, z: 6, inward: NORTH }] });
      b.furnish(room, [{ block: T.CUSHION, count: 5, where: 'any' }, { block: T.LOW_TABLE, count: 1, where: 'center' }]);
      return b.bp.hash();
    };
    expect(make(4)).toBe(make(4));
    expect(new Set([1, 2, 3, 4, 5, 6].map(make)).size).toBeGreaterThan(2);
  });
});

describe('style roles', () => {
  it('maps every role of every family to a block the registry has', () => {
    for (const role of STYLE_ROLES) expect(registry.has(TEMPEST_STYLE.block(role)), role).toBe(true);
    for (const name of TEMPEST_STYLE.familyNames) {
      const pack = TEMPEST_STYLE.family(name);
      for (const role of STYLE_ROLES) expect(registry.has(pack.block(role)), `${name}.${role}`).toBe(true);
    }
  });
});
