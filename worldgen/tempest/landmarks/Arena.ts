import { TempestBlock as T } from '../../../content/blocksTempest';
import { stairState } from '../../../engine/models/StairModel';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, Dir, EAST, NORTH, SOUTH, WEST, opposite, rect } from '../../structures/BlueprintBuilder';
import { FLARED_TIGHT, STEEP } from '../../structures/roofProfile';
import { StylePack } from '../../structures/StylePack';
import { InteriorFurnisher } from '../interiors';
import { LandmarkSpec } from './LandmarkSpec';
import { STONE, TOP, banner, cedar, disc, streetLamp, turnsOf } from './parts';
import { footprintOf } from './specs';

// The Arena, the Coliseum of the pictures: a ring of stone 57 across in the clearing north east of the town, its gate looking
// south. Round the sand floor stands a podium wall; behind it ten rows of seats climb outwards, each a block higher, built of
// stair blocks that face the way they climb (so every row is a step the player can walk up) with aisles of another stone;
// above the last row an upper walkway runs all the way round under a parapet with merlons, and the outer wall below it is
// ringed by pilasters with blind arches between them and banners flying from them. Four tunnels run under the stands to the
// floor, from the south gate, the main one, and from the other three sides; two chambers off the south tunnel (a guard post and
// an armoury) are furnished. Four towers with dark tile roofs stand at the diagonals.
//
// Outside the ring, in the corners of the footprint, are the training grounds (a fenced yard of straw dummies, targets and weapon
// racks), a barracks, and in front the paved apron the arena road reaches, with lamps and banners.
//
// Coordinates are the blueprint's own: x 0 to 68 west to east, z 0 to 68 north to south, the centre at 34, 34.

export const ARENA_SIZE = 69;
const C = 34;

// Radii (cells from the centre) of the rings, and the rows they stand at.
const R_FLOOR = 13;       // sand out to here
const R_PODIUM = 14;      // the wall round the floor
const R_SEAT0 = 15;       // first row of seats
const ROWS = 10;          // rows of seats, 15 to 24
const R_WALK0 = 25;       // upper walkway, 25 to 27
const R_WALL = 28;        // outer wall
const PODIUM_TOP = 3;     // the podium wall's last row
const WALK_Y = PODIUM_TOP + 1 + ROWS - 1; // 13: the level of the last row and of the walkway

const polar = (x: number, z: number): { dx: number; dz: number; d: number; r: number } => {
  const dx = x - C;
  const dz = z - C;
  const d = Math.hypot(dx, dz);
  return { dx, dz, d, r: Math.round(d) };
};

/** The way a cell climbs away from the centre, to the nearest of the four directions. */
const outward = (dx: number, dz: number): Dir => (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? EAST : WEST) : dz > 0 ? SOUTH : NORTH);

const build = (style: StylePack, rng: Rng): Blueprint => {
  const b = new BlueprintBuilder(style.family('plaster-dark'), rng, 'arena');
  const furnisher = new InteriorFurnisher(b.bp, style.family('plaster-dark').with({ light: T.PAPER_LANTERN_RED }));

  // --- The ring: floor, podium, seats, walkway, outer wall -------------------------------------------------------------------
  for (let z = 0; z < ARENA_SIZE; z++) {
    for (let x = 0; x < ARENA_SIZE; x++) {
      const { dx, dz, d, r } = polar(x, z);
      const turn = turnsOf(C, C, x, z);
      if (r <= R_FLOOR) {
        // The floor: sand, with a darker ring of gravel and a stone disc at the middle.
        b.set(x, 0, z, r >= 11 && r <= 12 ? STONE.gravel : r <= 2 ? STONE.cobble : STONE.sand);
      } else if (r === R_PODIUM) {
        b.set(x, 0, z, STONE.cobble);
        for (let y = 1; y <= PODIUM_TOP; y++) b.set(x, y, z, y === 1 ? 'wallBase' : STONE.cobble);
        b.set(x, PODIUM_TOP + 1, z, STONE.cobbleSlab, 0);
      } else if (r >= R_SEAT0 && r < R_SEAT0 + ROWS) {
        const k = r - R_SEAT0;
        const y = PODIUM_TOP + 1 + k;
        // Aisles every eighth of a turn, offset from the four gates, in another stone.
        const aisle = Math.abs(((turn * 16 + 0.5) % 4 + 4) % 4 - 2) < 0.28 && Math.floor(turn * 16 + 0.5) % 2 === 1;
        const facing = outward(dx, dz);
        // Every third row is a white plaster stair, so the rows read as rows; the aisles are dark stone.
        const row = aisle ? STONE.brickStairs : k % 3 === 2 ? T.PLASTER_STAIRS : STONE.cobbleStairs;
        b.set(x, y, z, row, stairState(facing, false));
        b.set(x, 0, z, STONE.cobble);
        for (let yy = 1; yy < y; yy++) b.set(x, yy, z, STONE.cobble);
      } else if (r >= R_WALK0 && r < R_WALL) {
        // The walkway: paving on solid stone.
        b.set(x, 0, z, STONE.cobble);
        for (let yy = 1; yy < WALK_Y; yy++) b.set(x, yy, z, STONE.cobble);
        b.set(x, WALK_Y, z, 'path');
      } else if (r === R_WALL) {
        b.set(x, 0, z, STONE.cobble);
        for (let yy = 1; yy <= WALK_Y; yy++) b.set(x, yy, z, yy === 6 || yy === WALK_Y ? 'wallBase' : STONE.cobble);
        // The parapet: two rows, the upper one in merlons (every other cell by angle).
        b.set(x, WALK_Y + 1, z, STONE.cobble);
        if (Math.floor(turn * 96) % 2 === 0) b.set(x, WALK_Y + 2, z, STONE.cobble);
        else b.set(x, WALK_Y + 2, z, STONE.cobbleSlab, 0);
      }
    }
  }

  // --- Outer wall: pilasters, blind arches, banners ----------------------------------------------------------------------------
  const PILASTERS = 24;
  for (let z = 0; z < ARENA_SIZE; z++) {
    for (let x = 0; x < ARENA_SIZE; x++) {
      const { r } = polar(x, z);
      const turn = turnsOf(C, C, x, z);
      const slot = turn * PILASTERS;
      const frac = slot - Math.floor(slot);                 // 0 at a pilaster, 0.5 between two
      const nearPilaster = Math.min(frac, 1 - frac) < 0.13;
      if (r === R_WALL + 1 && nearPilaster) {
        for (let y = 1; y <= WALK_Y + 1; y++) b.set(x, y, z, y % 4 === 0 ? 'wallBase' : 'wall');
        b.set(x, WALK_Y + 2, z, STONE.cobbleSlab, 0);
      }
      if (r === R_WALL && !nearPilaster && Math.abs(frac - 0.5) < 0.24) {
        // A blind arch: the wall is hollowed one block deep and a lattice screen set in the opening.
        for (let y = 2; y <= 4; y++) b.carve(x, y, z);
        for (let y = 2; y <= 4; y++) b.set(x, y, z, y === 4 ? STONE.cobbleStairs : 'lattice', y === 4 ? stairState(opposite(outward(x - C, z - C)), true) : 0);
        // A second storey of narrow slits.
        for (let y = 8; y <= 10; y++) b.set(x, y, z, y === 10 ? 'wallBase' : 'lattice');
      }
    }
  }
  // Banners from the top of every other pilaster, hanging outwards down the wall.
  for (let i = 0; i < PILASTERS; i += 2) {
    const t = (i + 0) / PILASTERS;
    const x = Math.round(C + (R_WALL + 1) * Math.cos(t * 2 * Math.PI));
    const z = Math.round(C + (R_WALL + 1) * Math.sin(t * 2 * Math.PI));
    const o = outward(x - C, z - C);
    const bx = x + (o === EAST ? 1 : o === WEST ? -1 : 0);
    const bz = z + (o === SOUTH ? 1 : o === NORTH ? -1 : 0);
    const axis = o === EAST || o === WEST ? 'z' : 'x';
    // Only where the cell beside the pilaster is outside the ring.
    if (bx < 0 || bz < 0 || bx >= ARENA_SIZE || bz >= ARENA_SIZE) continue;
    banner(b, bx, WALK_Y, bz, 5, axis, i % 4 === 0 ? T.NOREN_RED : T.NOREN_WHITE);
  }

  // --- Lights: lanterns on the podium and the walkway --------------------------------------------------------------------------
  for (let i = 0; i < 40; i++) {
    const t = i / 40;
    const x = Math.round(C + R_PODIUM * Math.cos(t * 2 * Math.PI));
    const z = Math.round(C + R_PODIUM * Math.sin(t * 2 * Math.PI));
    if (b.bp.get(x, PODIUM_TOP + 2, z) === -1 && b.bp.solid(x, PODIUM_TOP + 1, z)) b.set(x, PODIUM_TOP + 2, z, T.STONE_LANTERN_LIGHT);
  }
  for (let i = 0; i < 16; i++) {
    const t = (i + 0.5) / 16;
    const x = Math.round(C + 26 * Math.cos(t * 2 * Math.PI));
    const z = Math.round(C + 26 * Math.sin(t * 2 * Math.PI));
    const o = outward(x - C, z - C);
    streetLamp(b, x, WALK_Y + 1, z, opposite(o), 4, 'lightAlt');
  }

  // --- The tunnels ---------------------------------------------------------------------------------------------------------------
  const tunnel = (dir: Dir, half: number): void => {
    for (let z = 0; z < ARENA_SIZE; z++) {
      for (let x = 0; x < ARENA_SIZE; x++) {
        const dx = x - C;
        const dz = z - C;
        const along = dir === SOUTH ? dz : dir === NORTH ? -dz : dir === EAST ? dx : -dx;
        const across = dir === SOUTH || dir === NORTH ? dx : dz;
        if (Math.abs(across) > half || along < R_PODIUM - 1 || along > R_WALL + 1) continue;
        // Under the first rows of seats the roof is low; further out it rises to four.
        const height = along < R_SEAT0 + 2 ? 3 : 4;
        b.set(x, 0, z, 'path');
        for (let y = 1; y <= height; y++) b.carve(x, y, z);
        // The ceiling beams, every four cells.
        if (along % 4 === 0 && Math.abs(across) <= half) b.set(x, height + 1, z, 'beam');
        // Lanterns hung between the beams.
        if (along % 4 === 2 && across === 0) b.set(x, height, z, 'light');
      }
    }
  };
  for (const dir of [SOUTH, NORTH, EAST, WEST] as const) tunnel(dir, 2);
  // The south tunnel's mouth is wider: a porch of two stone piers, a corbelled arch, a tile roof, banners and lamps.
  const gx = C;
  const gz0 = C + R_WALL - 1;
  for (const side of [-1, 1]) {
    for (let z = gz0; z <= gz0 + 4; z++) {
      for (let x = gx + side * 3; x <= gx + side * 5; x++) {
        for (let y = 0; y <= 9; y++) b.set(x, y, z, y === 0 || y % 4 === 0 ? 'wallBase' : STONE.cobble);
      }
    }
  }
  // The arch across the portal: the opening narrows by a block each side at each row, in upside-down stairs.
  for (let z = gz0; z <= gz0 + 4; z++) {
    for (let x = gx - 2; x <= gx + 2; x++) for (let y = 1; y <= 4; y++) b.carve(x, y, z);
    for (let x = gx - 2; x <= gx + 2; x++) { b.set(x, 5, z, STONE.cobble); b.carve(x, 5, z); }
    for (const side of [-1, 1]) {
      b.set(gx + side * 2, 4, z, STONE.cobbleStairs, stairState(side < 0 ? WEST : EAST, true));
      b.set(gx + side * 2, 5, z, STONE.cobble);
      b.set(gx + side * 1, 5, z, STONE.cobbleStairs, stairState(side < 0 ? WEST : EAST, true));
      b.set(gx + side * 3, 5, z, STONE.cobble);
    }
    for (let x = gx - 3; x <= gx + 3; x++) { b.set(x, 6, z, STONE.cobble); b.set(x, 7, z, 'wallBase'); }
    b.carve(gx, 5, z);
  }
  // The tile roof over the porch: a low gable with the eaves swept up.
  const porch = new BlueprintBuilder(style.family('timber-terracotta'), rng.fork(0x907c), 'porch-roof');
  porch.gable(rect(gx - 5, gz0 + 1, gx + 5, gz0 + 3), 9, { profile: FLARED_TIGHT, axis: 'x', tips: 2, gableWall: 'wallFrame', endOverhang: 1 });
  b.bp.merge(porch.build());
  // Banners and lamps at the porch.
  for (const side of [-1, 1]) {
    banner(b, gx + side * 6, 9, gz0 + 4, 5, 'x', T.NOREN_RED);
    streetLamp(b, gx + side * 8, 1, gz0 + 4, side < 0 ? EAST : WEST, 5, 'lightAlt');
  }
  b.mark({ kind: 'door', x: gx, y: 1, z: gz0 + 4, facing: SOUTH });

  // --- The chambers off the south tunnel --------------------------------------------------------------------------------------
  const chambers: Array<{ x0: number; kind: 'barracks' | 'storage'; west: boolean }> = [
    { x0: C + 5, kind: 'barracks', west: false },
    { x0: C - 9, kind: 'storage', west: true },
  ];
  for (const ch of chambers) {
    const room = rect(ch.x0, C + 20, ch.x0 + 4, C + 24);
    b.floor(rect(room.x0 - 1, room.z0 - 1, room.x1 + 1, room.z1 + 1), 0, 'interiorFloor');
    for (let y = 1; y <= 3; y++) for (let z = room.z0; z <= room.z1; z++) for (let x = room.x0; x <= room.x1; x++) b.carve(x, y, z);
    // The doorway through the tunnel's side wall, two cells thick, at the room's middle row.
    const doorZ = C + 22;
    const wallX = ch.west ? [C - 3, C - 4, C - 5] : [C + 3, C + 4, C + 5];
    for (const x of wallX) { if (x < room.x0 || x > room.x1) { b.carve(x, 1, doorZ); b.carve(x, 2, doorZ); } }
    const insideX = ch.west ? room.x1 : room.x0;
    furnisher.furnish(
      { rect: room, floorY: 0, ceilingY: 4, doors: [{ x: insideX, z: doorZ, inward: ch.west ? WEST : EAST }] },
      ch.kind, rng.fork(ch.x0),
    );
    b.mark({ kind: 'room', x: room.x0 + 2, y: 1, z: room.z0 + 2, tag: ch.kind === 'barracks' ? 'guard-post' : 'armoury' });
  }

  // --- Towers at the diagonals -------------------------------------------------------------------------------------------------
  const tower = (sx: number, sz: number): void => {
    const x0 = C + sx * 19 - 2;
    const z0 = C + sz * 19 - 2;
    const w = rect(x0, z0, x0 + 4, z0 + 4);
    b.floor(rect(x0 - 1, z0 - 1, x0 + 5, z0 + 5), 0, 'wallBase');
    for (let y = 1; y <= WALK_Y + 1; y++) for (let z = w.z0; z <= w.z1; z++) for (let x = w.x0; x <= w.x1; x++) b.set(x, y, z, STONE.cobble);
    // Above the walls, a timber lookout: posts, a lit screen on each side, and a dark tile hip roof.
    const up = rect(x0, z0, x0 + 4, z0 + 4);
    b.ring(up, WALK_Y + 2, WALK_Y + 5, 'wall');
    b.ring(up, WALK_Y + 3, WALK_Y + 3, 'wallBase');
    for (const [qx, qz] of [[up.x0, up.z0], [up.x1, up.z0], [up.x0, up.z1], [up.x1, up.z1]]) b.column(qx, qz, WALK_Y + 2, WALK_Y + 5, 'accent');
    for (const [qx, qz] of [[up.x0 + 2, up.z0], [up.x0 + 2, up.z1], [up.x0, up.z0 + 2], [up.x1, up.z0 + 2]]) { b.set(qx, WALK_Y + 4, qz, 'shojiLit'); }
    b.beamRing(up, WALK_Y + 6, 'beam');
    b.hip(up, WALK_Y + 6, { profile: STEEP });
    // A tie beam across the roof's plate carries the lamp.
    for (let x = up.x0; x <= up.x1; x++) b.set(x, WALK_Y + 6, z0 + 2, 'beam');
    b.set(x0 + 2, WALK_Y + 5, z0 + 2, 'light');
    // A banner pole at the foot of the tower, outside it.
    const bx = x0 + (sx > 0 ? 6 : -2);
    b.column(bx, z0 + 2, 1, 12, T.BAMBOO_POLE);
    for (let k = 0; k < 4; k++) b.set(bx + (sx > 0 ? -1 : 1), 12 - k, z0 + 2, k % 2 === 0 ? T.NOREN_RED : T.NOREN_WHITE, 1);
  };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) tower(sx, sz);

  // --- The apron in front of the south gate -----------------------------------------------------------------------------------
  for (let z = 61; z < ARENA_SIZE; z++) {
    for (let x = 16; x <= 52; x++) {
      const { r } = polar(x, z);
      if (r <= R_WALL + 1) continue;
      const edge = z === ARENA_SIZE - 1 || x === 16 || x === 52;
      b.set(x, 0, z, edge || z % 6 === 0 ? 'path' : 'pathAlt');
    }
  }
  for (let z = gz0 + 5; z < ARENA_SIZE; z++) for (let x = C - 3; x <= C + 3; x++) b.set(x, 0, z, 'path');

  // --- The training grounds, south west corner -----------------------------------------------------------------------------------
  const yard = rect(1, 55, 14, 67);
  b.floor(yard, 0, STONE.sand);
  b.fenceRect({ x0: yard.x0 - 0, z0: yard.z0, x1: yard.x1, z1: yard.z1 }, 1, [[yard.x1, 61], [yard.x1, 62]], 'fence');
  // Straw dummies on posts, in a row; archery targets at the far end; weapon racks along the north fence.
  for (const x of [3, 6, 9]) {
    b.column(x, 60, 1, 2, T.BAMBOO_POLE);
    b.set(x, 3, 60, T.RICE_BALE);
    b.set(x - 1, 2, 60, T.BAMBOO_POLE);
    b.set(x + 1, 2, 60, T.BAMBOO_POLE);
  }
  for (const x of [4, 8, 12]) {
    b.column(x, 65, 1, 2, T.BAMBOO_POLE);
    b.signboard(x, 3, 65, 'x');
  }
  for (const x of [3, 4, 5, 10, 11, 12]) b.set(x, 1, 56, x % 2 === 0 ? 'rail' : 'fence');
  b.set(7, 1, 56, T.BARREL);
  b.set(8, 1, 56, T.CRATE);
  b.set(2, 1, 64, 'stoneSlab', TOP);
  b.set(2, 1, 63, 'stoneSlab', TOP);
  b.set(2, 1, 62, 'stoneSlab', TOP);
  for (const [x, z] of [[2, 66], [13, 66]]) b.stoneLantern(x, 1, z);

  // --- The barracks, south east corner ---------------------------------------------------------------------------------------------
  {
    const walls = rect(54, 58, 66, 65);
    b.floor(rect(53, 57, 67, 66), 0, 'wallBase');
    b.floor(rect(walls.x0, walls.z0, walls.x1, walls.z1), 1, 'wallBase');
    b.frame(walls, 2, 4, { panel: 'wall', post: 'post', spacing: 3 });
    b.beamRing(walls, 5, 'beam');
    b.opening(walls, { side: WEST, at: 3, y: 2, kind: 'door', noren: true });
    for (const at of [2, 5, 8, 11]) b.opening(walls, { side: NORTH, at, y: 3, kind: 'shoji', lit: true });
    for (const at of [2, 5, 8, 11]) b.opening(walls, { side: SOUTH, at, y: 3, kind: 'lattice' });
    b.opening(walls, { side: EAST, at: 3, y: 3, kind: 'lattice' });
    const roof = new BlueprintBuilder(style.family('timber-terracotta'), rng.fork(0xba44), 'barracks-roof');
    roof.gable(walls, 5, { profile: FLARED_TIGHT, axis: 'x', tips: 1, gableWall: 'wallFrame', endOverhang: 1 });
    b.bp.merge(roof.build());
    const room = rect(walls.x0 + 1, walls.z0 + 1, walls.x1 - 1, walls.z1 - 1);
    b.floor(room, 1, 'interiorFloor');
    furnisher.furnish({ rect: room, floorY: 1, ceilingY: 5, doors: [{ x: room.x0, z: walls.z0 + 3, inward: EAST }] }, 'barracks', rng.fork(0xba45));
    b.mark({ kind: 'room', x: room.x0 + 4, y: 2, z: room.z0 + 2, tag: 'barracks' });
    for (let z = 61; z <= 65; z++) for (let x = 50; x <= 52; x++) b.set(x, 0, z, 'path');
    // A step up to the door: the barracks floor is a block above the ground.
    b.stair(53, 1, walls.z0 + 3, EAST, 'stoneStairs');
    b.stoneLantern(52, 1, 60);
    b.stoneLantern(52, 1, 66);
  }
  // Cedar groves in the north corners and flagpoles on the apron.
  for (const [x, z, h] of [[4, 5, 8], [8, 3, 7], [4, 9, 9], [64, 4, 8], [60, 7, 7], [62, 10, 9]] as const) cedar(b, x, z, 0, h);
  return b.build();
};

export const arena = (): LandmarkSpec => ({
  id: 'arena', name: 'Arena', covers: ['arena'], facing: 2, footprint: footprintOf('arena'), frame: 'front-south', build,
});
