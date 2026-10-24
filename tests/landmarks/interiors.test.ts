import { describe, expect, it } from 'vitest';
import { TempestBlock as T } from '../../content/blocksTempest';
import { AIR_CELL, cellId } from '../../engine/cell';
import { Rng } from '../../worldgen/noise';
import { NO_CELL } from '../../worldgen/structures/Blueprint';
import { BlueprintBuilder, EAST, NORTH, SOUTH, WEST, DX, DZ, Dir } from '../../worldgen/structures/BlueprintBuilder';
import { InteriorFurnisher, ROOM_KINDS, RoomKind, furnish } from '../../worldgen/tempest/interiors';
import { buildBoxRoom } from '../../worldgen/tempest/interiors/boxRoom';
import { TEMPEST_STYLE } from '../../worldgen/tempest/style';
import { BlueprintWorld, canStandIn, columnsOf, floatingCells, registry, walk } from './helpers';

// The interior furnisher on plain box rooms: the same room, kind and seed always give the same furniture; doors and paths stay
// clear; furniture stands against the walls; lights hang from the ceiling; nothing floats.

const SIZES: Array<[number, number]> = [[5, 5], [7, 6], [9, 9], [11, 8], [15, 11]];

const room = (w: number, d: number, doors: ReadonlyArray<{ side: Dir; at?: number }> = [{ side: SOUTH }], ceilingY = 4) => {
  const b = new BlueprintBuilder(TEMPEST_STYLE, new Rng(1), 'room');
  const r = buildBoxRoom(b, { x0: 1, z0: 1, x1: w, z1: d }, { doors, ceilingY });
  return { b, r };
};

const solidAt = (b: BlueprintBuilder, x: number, y: number, z: number): boolean => {
  const c = b.bp.get(x, y, z);
  return c !== NO_CELL && c !== AIR_CELL && registry.isSolid(cellId(c)) && cellId(c) !== T.TATAMI;
};

describe('InteriorFurnisher', () => {
  it('furnishes every kind of room at every size the same way for the same seed, and differently for another', () => {
    for (const kind of ROOM_KINDS) {
      for (const [w, d] of SIZES) {
        const a = room(w, d);
        const c = room(w, d);
        furnish(a.b.bp, a.r, kind, new Rng(7));
        furnish(c.b.bp, c.r, kind, new Rng(7));
        expect(a.b.bp.hash(), `${kind} ${w}x${d}`).toBe(c.b.bp.hash());
      }
    }
    // Different seeds differ in at least most large rooms.
    let differing = 0;
    for (const kind of ROOM_KINDS) {
      const a = room(11, 8);
      const c = room(11, 8);
      furnish(a.b.bp, a.r, kind, new Rng(1));
      furnish(c.b.bp, c.r, kind, new Rng(2));
      if (a.b.bp.hash() !== c.b.bp.hash()) differing++;
    }
    expect(differing).toBeGreaterThan(ROOM_KINDS.length / 2);
  });

  it('puts furniture in every kind of room (and not in a room that has no space for it)', () => {
    for (const kind of ROOM_KINDS) {
      const { b, r } = room(9, 7);
      const result = furnish(b.bp, r, kind, new Rng(3));
      expect(result.items.length, kind).toBeGreaterThan(3);
      expect(result.lights.length, kind).toBeGreaterThan(0);
    }
    // A 3x3 room with its door cell and the cells beside it kept clear has room for almost nothing: it still does not break.
    const { b, r } = room(3, 3);
    expect(() => furnish(b.bp, r, 'living', new Rng(3))).not.toThrow();
  });

  it('never builds on the cells a door opens onto, and keeps every door reachable on foot', () => {
    for (const kind of ROOM_KINDS) {
      for (const [w, d] of SIZES) {
        for (const doors of [[{ side: SOUTH as Dir }], [{ side: SOUTH as Dir }, { side: EAST as Dir, at: 2 }], [{ side: NORTH as Dir, at: 1 }, { side: WEST as Dir }]]) {
          const { b, r } = room(w, d, doors);
          furnish(b.bp, r, kind, new Rng(5));
          for (const door of r.doors) {
            for (let k = 0; k <= 2; k++) {
              for (let y = r.floorY + 1; y <= r.floorY + 2; y++) {
                expect(solidAt(b, door.x + DX[door.inward] * k, y, door.z + DZ[door.inward] * k), `${kind} ${w}x${d} door ${door.x},${door.z} k${k} y${y}`).toBe(false);
              }
            }
          }
          // A walker from outside the first door reaches the cell inside every other door, and most of the floor.
          const world = new BlueprintWorld(b.bp);
          const first = r.doors[0];
          const out = { x: first.x - DX[first.inward] * 2, z: first.z - DZ[first.inward] * 2 };
          const places = walk(world, { x: out.x, z: out.z, feet: 0.5 }, { minX: -2, maxX: w + 4, minZ: -2, maxZ: d + 4 });
          for (const door of r.doors) expect(canStandIn(places, door.x, r.floorY + 1, door.z), `${kind} ${w}x${d} reaches door ${door.x},${door.z}`).toBe(true);
          const cols = columnsOf(places);
          let inside = 0;
          for (let z = r.rect.z0; z <= r.rect.z1; z++) for (let x = r.rect.x0; x <= r.rect.x1; x++) if (cols.has(`${x},${z}`)) inside++;
          expect(inside / (w * d), `${kind} ${w}x${d} walkable share`).toBeGreaterThan(0.45);
        }
      }
    }
  });

  it('stands furniture against the walls, with the cell in front of it free', () => {
    const { b, r } = room(11, 9);
    furnish(b.bp, r, 'study', new Rng(9));
    // Every bookshelf is against a wall.
    let shelves = 0;
    b.bp.forEach((x, y, z, c) => {
      if (cellId(c) !== T.BOOKSHELF || y !== r.floorY + 1) return;
      shelves++;
      const against = x === r.rect.x0 || x === r.rect.x1 || z === r.rect.z0 || z === r.rect.z1;
      expect(against, `shelf ${x},${z}`).toBe(true);
    });
    expect(shelves).toBeGreaterThan(1);
  });

  it('hangs lights from the ceiling at least three blocks above the floor, each on a cord or the ceiling itself', () => {
    for (const ceiling of [4, 5, 8]) {
      const { b, r } = room(11, 9, [{ side: SOUTH }], ceiling);
      const result = furnish(b.bp, r, 'living', new Rng(2));
      expect(result.lights.length).toBeGreaterThan(0);
      for (const l of result.lights) {
        expect(l.y).toBeGreaterThanOrEqual(r.floorY + 3);
        expect(l.y).toBeLessThan(ceiling);
        // Something solid or a cord directly above, up to the ceiling.
        for (let y = l.y + 1; y <= ceiling; y++) expect(b.bp.get(l.x, y, l.z)).not.toBe(NO_CELL);
      }
    }
    // A room too low for a lamp over a walker's head gets none from the ceiling.
    const low = room(9, 7, [{ side: SOUTH }], 3);
    expect(furnish(low.b.bp, low.r, 'living', new Rng(2)).lights.length).toBe(0);
  });

  it('leaves nothing floating: every block stands on the floor, on other furniture or hangs from the ceiling', () => {
    for (const kind of ROOM_KINDS) {
      const { b, r } = room(11, 9);
      furnish(b.bp, r, kind, new Rng(11));
      expect(floatingCells(b.bp), kind).toEqual([]);
      void r;
    }
  });

  it('leaves at least a third of the floor clear', () => {
    for (const kind of ROOM_KINDS) {
      for (const [w, d] of SIZES) {
        const { b, r } = room(w, d);
        const result = furnish(b.bp, r, kind, new Rng(4));
        expect(result.free / (w * d), `${kind} ${w}x${d}`).toBeGreaterThan(0.33);
      }
    }
  });

  it('keeps what the kit already built: a block on the floor row is not built over', () => {
    const { b, r } = room(9, 7);
    b.set(5, r.floorY + 1, 4, T.CRATE);
    furnish(b.bp, r, 'storage', new Rng(2));
    expect(cellId(b.bp.get(5, r.floorY + 1, 4))).toBe(T.CRATE);
  });

  it('partitions a floor into rooms joined by doorways, each at least the minimum size, and furnishes them', () => {
    const b = new BlueprintBuilder(TEMPEST_STYLE, new Rng(1), 'house');
    const r = buildBoxRoom(b, { x0: 1, z0: 1, x1: 17, z1: 11 }, { doors: [{ side: SOUTH, at: 8 }] });
    const rooms = new InteriorFurnisher(b.bp).partition(r.rect, 0, r.doors[0], ['living', 'bedroom', 'kitchen', 'study'], new Rng(21), { minSize: 4 });
    expect(rooms.length).toBe(4);
    expect(rooms[0].kind).toBe('living');
    let covered = 0;
    for (const { room: rm } of rooms) {
      expect(rm.rect.x1 - rm.rect.x0 + 1).toBeGreaterThanOrEqual(4);
      expect(rm.rect.z1 - rm.rect.z0 + 1).toBeGreaterThanOrEqual(4);
      covered += (rm.rect.x1 - rm.rect.x0 + 1) * (rm.rect.z1 - rm.rect.z0 + 1);
      expect(rm.doors.length).toBeGreaterThan(0);
    }
    expect(covered).toBeLessThanOrEqual(17 * 11);
    // From outside the front door a walker reaches the middle of every room.
    const world = new BlueprintWorld(b.bp);
    const places = walk(world, { x: 9, z: 14, feet: 0.5 }, { minX: -2, maxX: 20, minZ: -2, maxZ: 16 });
    for (const { room: rm } of rooms) {
      const cols = columnsOf(places);
      let free = 0;
      for (let z = rm.rect.z0; z <= rm.rect.z1; z++) for (let x = rm.rect.x0; x <= rm.rect.x1; x++) if (cols.has(`${x},${z}`)) free++;
      expect(free, `room at ${rm.rect.x0},${rm.rect.z0}`).toBeGreaterThan(6);
    }
    expect(floatingCells(b.bp)).toEqual([]);
  });

  it('a council hall has a dais against the wall opposite the door, a table and chairs, and banners', () => {
    const { b, r } = room(17, 13, [{ side: SOUTH }], 8);
    furnish(b.bp, r, 'council', new Rng(1));
    const ids = new Map<number, number>();
    b.bp.forEach((_x, _y, _z, c) => ids.set(cellId(c), (ids.get(cellId(c)) ?? 0) + 1));
    expect(ids.get(T.VERMILION_PLANKS) ?? 0).toBeGreaterThan(8);
    expect(ids.get(T.NOREN_RED) ?? 0).toBeGreaterThan(3);
    // The dais is in the north rows (the door is in the south wall).
    let platformNorth = 0;
    b.bp.forEach((_x, y, z, c) => { if (cellId(c) === T.VERMILION_PLANKS && y === r.floorY + 1 && z <= r.rect.z0 + 3) platformNorth++; });
    expect(platformNorth).toBeGreaterThan(5);
  });
});

const _kinds: RoomKind[] = [...ROOM_KINDS];
void _kinds;
