import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, Dir, Rect, SOUTH, NORTH, EAST, WEST } from '../../structures/BlueprintBuilder';
import { InteriorRoom, RoomDoor } from './InteriorFurnisher';

// A plain box room: a floor, four walls with doorways, a flat ceiling. It is what the furnisher is built and tested on, and
// what a kit can use to try a kind of room before its building exists. `interior` is the rectangle of free cells inside.

export interface BoxRoomOptions {
  floorY?: number;
  /** The row of the ceiling blocks. Default floorY + 4. */
  ceilingY?: number;
  /** Which walls get a door, each at the middle of its wall unless `at` says otherwise. Default one door in the south wall. */
  doors?: ReadonlyArray<{ side: Dir; at?: number }>;
}

/** Builds the box room's walls, floor and ceiling into the builder and returns the room, ready to furnish. */
export const buildBoxRoom = (b: BlueprintBuilder, interior: Rect, options: BoxRoomOptions = {}): InteriorRoom => {
  const floorY = options.floorY ?? 0;
  const ceilingY = options.ceilingY ?? floorY + 4;
  const outer: Rect = { x0: interior.x0 - 1, z0: interior.z0 - 1, x1: interior.x1 + 1, z1: interior.z1 + 1 };
  b.floor(outer, floorY, 'interiorFloor');
  b.ring(outer, floorY + 1, ceilingY - 1, 'wall');
  b.floor(outer, ceilingY, 'trim');
  const doors: RoomDoor[] = [];
  for (const d of options.doors ?? [{ side: SOUTH as Dir }]) {
    const len = d.side === NORTH || d.side === SOUTH ? interior.x1 - interior.x0 + 1 : interior.z1 - interior.z0 + 1;
    const at = d.at ?? Math.floor(len / 2);
    // `opening` counts from the outer rectangle's west or north end, which is one cell before the interior.
    b.opening(outer, { side: d.side, at: at + 1, y: floorY + 1, kind: 'door' });
    const x = d.side === NORTH || d.side === SOUTH ? interior.x0 + at : d.side === WEST ? interior.x0 : interior.x1;
    const z = d.side === WEST || d.side === EAST ? interior.z0 + at : d.side === NORTH ? interior.z0 : interior.z1;
    doors.push({ x, z, inward: ((d.side + 2) & 3) as Dir });
  }
  return { rect: interior, floorY, ceilingY, doors };
};

/** The same, on a bare blueprint with no style: the walls are a plain stone brick. For a test that wants nothing but the room. */
export const boxRoomBlueprint = (b: BlueprintBuilder, interior: Rect, options: BoxRoomOptions = {}): { blueprint: Blueprint; room: InteriorRoom } => {
  const room = buildBoxRoom(b, interior, options);
  return { blueprint: b.build(), room };
};
