import { TempestBlock as T } from '../../../content/blocksTempest';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, EAST, NORTH, SOUTH, WEST, rect } from '../../structures/BlueprintBuilder';
import { FLARED, FLARED_DEEP, FLARED_TIGHT } from '../../structures/roofProfile';
import { StylePack } from '../../structures/StylePack';
import { InteriorFurnisher, RoomDoor } from '../interiors';
import { LandmarkSpec, freeFootprint } from './LandmarkSpec';
import { FLOWERS, STONE, TOP, WOOD, hash01, markRoom, ringCells } from './parts';

// Three set pieces the plan lists for the tourism and civic quarters but gives no plot: a bell tower, a market hall and a bath
// house with a hot spring. They are `free` landmarks (LandmarkSpec.free): a district planner stands each on a lot of its own
// (`placeOnLot`), and a test walks each one from its door.

// --- The bell tower ----------------------------------------------------------------------------------------------------------------

export const BELL_TOWER_SIZE = 17;

/**
 * The bell tower, 17 by 17: a stone plinth with steps, a stone storey with a door and slit windows, a skirt roof, a timber
 * storey of lit paper screens, and over it an open belfry of posts and a rail under a flared hip roof, in it a bell of blue magic
 * ore on a beam that glows at night. Two flights of stairs inside climb to the timber room and on to the belfry; the roof
 * carries a finial.
 */
const buildBellTower = (style: StylePack, rng: Rng): Blueprint => {
  const b = new BlueprintBuilder(style.family('plaster-dark'), rng, 'bell-tower');
  const N = BELL_TOWER_SIZE;
  const plinth = rect(1, 1, N - 2, N - 2);
  b.floor(plinth, 0, 'wallBase');
  b.floor(plinth, 1, 'wallBase');
  for (const x of [7, 8, 9]) b.stair(x, 1, N - 1, NORTH, 'stoneStairs');
  for (const x of [1, N - 2]) b.stoneLantern(x, 2, N - 2);
  for (const x of [1, N - 2]) b.stoneLantern(x, 2, 1);

  // The stone storey: mossy stone in bands of plaster stone, the door on the south, slits on the other sides.
  const walls = rect(3, 3, 13, 13);
  for (let y = 2; y <= 6; y++) b.ring(walls, y, y, y === 2 || y === 6 ? 'wallBase' : 'stone');
  for (const [x, z] of [[3, 3], [13, 3], [3, 13], [13, 13]]) b.column(x, z, 2, 6, 'wallBase');
  b.opening(walls, { side: SOUTH, at: 5, y: 2, height: 3, kind: 'door', noren: true });
  for (const side of [EAST, WEST, NORTH] as const) b.opening(walls, { side, at: 5, y: 4, height: 2, kind: 'lattice' });
  b.opening(walls, { side: SOUTH, at: 2, y: 4, height: 2, kind: 'lattice' });
  b.opening(walls, { side: SOUTH, at: 8, y: 4, height: 2, kind: 'lattice' });
  // The floor of the timber room; the stair climbs along x = 6 from a landing by the south wall, and the floor is left open over it.
  const floor1 = rect(4, 4, 12, 12);
  b.floor(floor1, 7, 'floor');
  for (let k = 0; k < 6; k++) b.stair(6, 2 + k, 11 - k, NORTH, 'stoneStairs');
  for (let z = 7; z <= 11; z++) b.clear(6, 7, z);
  // Lamps in the stone storey, hung from the floor over it.
  for (const [x, z] of [[9, 6], [11, 9], [9, 11]]) b.set(x, 6, z, 'light');
  // A skirt roof round the top of the stone storey, and the timber storey standing inside it.
  const inner = b.eaves(rect(1, 1, 15, 15), 7, FLARED_TIGHT.overhang + 3, FLARED_TIGHT, 2) ?? rect(5, 5, 11, 11);
  const room = rect(inner.x0, inner.z0, inner.x1, inner.z1);
  b.floor(room, 7, 'floor');
  for (let z = 7; z <= 11; z++) b.clear(6, 7, z);
  b.stair(6, 7, 6, NORTH, 'stoneStairs');
  b.frame(room, 8, 10, { panel: 'wall', post: 'accent', spacing: 3 });
  b.beamRing(room, 11, 'beam');
  for (const side of [SOUTH, NORTH, EAST, WEST] as const) b.opening(room, { side, at: 2, y: 9, width: 3, height: 1, kind: 'shoji', lit: true });
  // The timber room's floor above the belfry's stair, the belfry's own floor: the beam ring, boards inside, a hole over the stair.
  const belfry = rect(room.x0 + 1, room.z0 + 1, room.x1 - 1, room.z1 - 1);
  b.floor(belfry, 11, 'floor');
  // The stair up to the belfry runs along the east side, from a landing at the south, four steps: its top is the belfry's floor.
  const sx = belfry.x1 - 1;
  for (let k = 0; k < 4; k++) b.stair(sx, 8 + k, belfry.z1 - 1 - k, NORTH, 'stoneStairs');
  for (let z = belfry.z0 + 1; z <= belfry.z1 - 1; z++) b.clear(sx, 11, z);
  b.set(belfry.x0 + 1, 10, belfry.z0 + 1, 'light');
  b.set(belfry.x1 - 2, 10, belfry.z0 + 1, 'lightAlt');
  b.set(belfry.x0 + 1, 8, belfry.z1 - 1, T.BOOKSHELF);
  b.set(belfry.x0 + 1, 8, belfry.z1 - 2, T.BOOKSHELF);
  b.set(belfry.x0 + 2, 8, belfry.z0 + 1, T.LOW_TABLE);
  b.set(belfry.x0 + 3, 8, belfry.z0 + 1, T.CUSHION);

  // The belfry: posts at the corners and the middle of each side, a rail round it, the bell on its beam, a flared hip over all.
  const open = rect(room.x0, room.z0, room.x1, room.z1);
  const mid = (open.x0 + open.x1) >> 1;
  const midz = (open.z0 + open.z1) >> 1;
  for (const [x, z] of [[open.x0, open.z0], [open.x1, open.z0], [open.x0, open.z1], [open.x1, open.z1], [mid, open.z1], [open.x0, midz], [open.x1, midz]]) b.column(x, z, 12, 15, 'accent');
  for (const side of [NORTH, SOUTH, EAST, WEST] as const) {
    for (let t = 1; t < open.x1 - open.x0; t++) {
      const x = side === NORTH || side === SOUTH ? open.x0 + t : side === WEST ? open.x0 : open.x1;
      const z = side === WEST || side === EAST ? open.z0 + t : side === NORTH ? open.z0 : open.z1;
      if (b.bp.has(x, 12, z)) continue;
      // The stair comes out at the north edge: the rail stops short of it.
      if (side === NORTH && x >= mid) continue;
      b.set(x, 12, z, 'rail');
    }
  }
  // The climb's opening at the north end of the stair: the rail stays off the cells above the stair.
  b.beamRing(open, 16, 'beam');
  for (let x = open.x0; x <= open.x1; x++) b.set(x, 16, midz, 'beam');
  b.set(mid, 15, midz, T.STONE_LANTERN_CAP);
  b.set(mid, 14, midz, T.BLUE_ORE_LAMP);
  b.set(mid, 13, midz, T.BLUE_ORE_LAMP);
  b.set(mid, 12, midz, 'lightAlt');
  const roof = b.hip(open, 16, { profile: FLARED, tips: 2 });
  b.column(mid, midz, roof.crestTop, roof.crestTop + 2, T.BAMBOO_POLE);
  b.set(mid, roof.crestTop + 3, midz, T.STONE_LANTERN_CAP);
  // Banners from the skirt roof's four corners.
  for (const [x, z] of [[2, 2], [N - 3, 2], [2, N - 3], [N - 3, N - 3]]) b.set(x, 5, z, T.NOREN_RED, 1);
  b.treeSpot(1, 14, 'sakura');
  b.treeSpot(15, 14, 'cedar');
  b.mark({ kind: 'room', x: 6, y: 8, z: 7, tag: 'timber-room' });
  b.mark({ kind: 'room', x: open.x0 + 1, y: 12, z: open.z0 + 1, tag: 'belfry' });
  return b.build();
};

export const bellTower = (): LandmarkSpec => ({
  id: 'bell-tower', name: 'Bell tower', covers: [], facing: 2, footprint: freeFootprint(BELL_TOWER_SIZE, BELL_TOWER_SIZE), frame: 'front-south',
  optional: true, free: true, build: buildBellTower,
});

// --- The market hall -----------------------------------------------------------------------------------------------------------------

export const MARKET_W = 31;
export const MARKET_D = 17;

/**
 * The market hall, 31 by 17: a long open hall on lacquered posts under one great flared roof with horned ridge ends, its two
 * long sides an arcade of counters between the posts with awnings of red and indigo cloth, goods on every counter, and a
 * gap at the middle of the south side and at both ends where the aisle runs through. Red and striped lanterns hang over
 * the aisle from tie beams, which at night make it the brightest place of the town; a well stands under the roof at one end.
 */
const buildMarketHall = (style: StylePack, rng: Rng): Blueprint => {
  const b = new BlueprintBuilder(style.family('timber-terracotta'), rng, 'market-hall');
  const hall = rect(3, 3, 27, 13);
  // Ground: a plinth of paving under the whole hall and a fan of cobbles down the aisle.
  b.floor(rect(1, 1, 29, 15), 0, 'path');
  for (let x = 3; x <= 27; x++) for (let z = 6; z <= 10; z++) b.set(x, 0, z, ((x >> 1) + z) % 3 === 0 ? 'pathAlt' : 'path');
  // Posts along both long sides every four cells, tie beams along them and across the hall over each pair, and one along its length.
  const postsX = [3, 7, 11, 15, 19, 23, 27];
  for (const x of postsX) for (const z of [hall.z0, hall.z1]) b.column(x, z, 1, 5, 'accent');
  for (const z of [hall.z0, hall.z1]) b.beam(hall.x0, z, hall.x1, z, 6, 'beam');
  for (const x of postsX) b.beam(x, hall.z0, x, hall.z1, 6, 'beam');
  b.beam(hall.x0, 8, hall.x1, 8, 6, 'beam');
  // Brackets: a short timber from each post under the tie beams.
  for (const x of postsX) for (const z of [hall.z0 + 1, hall.z1 - 1]) b.set(x, 5, z, 'beam');
  // The roof: one great gable, ridge along the hall, the gable ends filled with half-timber.
  b.beamRing(hall, 7, 'beam');
  b.gable(hall, 7, { profile: FLARED_DEEP, axis: 'x', tips: 3, gableWall: 'wallFrame', endOverhang: 1 });
  // Counters between the posts on both long sides, with a gap where the aisle meets the south side; goods, awnings, signs.
  const goods = [T.CRATE, T.BARREL, T.RICE_BALE, T.VASE, T.CRATE, T.BARREL, T.VASE, T.RICE_BALE] as const;
  const gaps = new Set([16, 17, 18]);
  for (const [z, out, awn] of [[hall.z0, SOUTH, 'awning'], [hall.z1, NORTH, 'awningAlt']] as const) {
    for (let x = hall.x0 + 1; x <= hall.x1 - 1; x++) {
      if (postsX.includes(x)) continue;
      if (z === hall.z1 && gaps.has(x)) continue;
      b.set(x, 1, z, 'accent');
      const g = goods[(x * 3 + z) % goods.length];
      if (hash01(x, z, 5) < 0.75) b.set(x, 2, z, g);
    }
    for (let i = 0; i + 1 < postsX.length; i++) {
      const a = postsX[i] + 1;
      const c = postsX[i + 1] - 1;
      if (z === hall.z1 && a === 16) continue;
      b.awning(z, a, c, 4, out, { alt: true, ref: awn, refAlt: awn === 'awning' ? 'awningAlt' : 'awning' });
      b.signboard((a + c) >> 1, 5, z + (out === SOUTH ? 1 : -1), 'x');
    }
  }
  // Lanterns over the aisle: from the centre beam, one every other cell, red and striped by turns.
  for (let x = 4; x <= 26; x += 2) b.set(x, 5, 8, x % 4 === 0 ? 'light' : 'lightAlt');
  for (const x of postsX) b.set(x, 4, hall.z0 + 1, 'light');
  // A well under the roof at the west end: a ring of stone with water and a bucket on a post.
  b.floor(rect(5, 7, 7, 9), 0, 'path');
  for (const [x, z] of ringCells(6, 8, 1)) b.set(x, 1, z, STONE.mossyCobble);
  b.set(6, 0, 8, STONE.water);
  b.set(6, 1, 8, STONE.water);
  // Benches on the aisle's edge and barrels stacked at the east end.
  for (const x of [13, 14, 17, 18]) b.set(x, 1, 5, 'stoneSlab', TOP);
  for (const [x, z] of [[25, 7], [25, 9], [26, 8]]) { b.set(x, 1, z, T.BARREL); b.set(x, 2, z, T.CRATE); }
  for (const [x, z] of [[1, 1], [29, 1], [1, 15], [29, 15]]) b.stoneLantern(x, 1, z);
  b.mark({ kind: 'door', x: 17, y: 1, z: hall.z1, facing: SOUTH });
  b.mark({ kind: 'room', x: 17, y: 1, z: 8, tag: 'aisle' });
  return b.build();
};

export const marketHall = (): LandmarkSpec => ({
  id: 'market-hall', name: 'Market hall', covers: [], facing: 2, footprint: freeFootprint(MARKET_W, MARKET_D), frame: 'front-south',
  optional: true, free: true, build: buildMarketHall,
});

// --- The bath house ----------------------------------------------------------------------------------------------------------------------

export const BATH_W = 25;
export const BATH_D = 21;

/**
 * The bath house, 25 by 21: a long building of half-timber and plaster under a green glazed hip and gable roof, with a veranda
 * and lit screens on the south and a noren in the door; inside, a lobby and rooms for changing and resting, furnished, and a door
 * at the back onto a walled garden where the hot spring lies, a pool of rocks and steaming water edged by a plank deck, with
 * wash stools and buckets, a bamboo spout, stone lanterns, a bamboo fence all round and a sakura and a cedar behind it.
 */
const buildBathHouse = (style: StylePack, rng: Rng): Blueprint => {
  const green = style.family('half-timber-green').with({ interiorFloor: WOOD.plank });
  const b = new BlueprintBuilder(green, rng, 'bath-house');
  const furnisher = new InteriorFurnisher(b.bp, green);
  const walls = rect(3, 10, 21, 18);
  // Ground and plinth; the building's floor is a block up.
  b.floor(rect(2, 9, 22, 19), 0, 'wallBase');
  b.floor(walls, 1, 'wallBase');
  b.frame(walls, 2, 5, { panel: 'wall', post: 'post', spacing: 4, beams: [3], footing: 'wallBase' });
  b.beamRing(walls, 6, 'beam');
  b.opening(walls, { side: SOUTH, at: 9, y: 2, width: 1, height: 2, kind: 'door', noren: T.NOREN_INDIGO });
  for (const at of [2, 4, 12, 14]) b.opening(walls, { side: SOUTH, at, y: 3, width: 2, height: 2, kind: 'shoji', lit: true });
  for (const at of [1, 4, 7]) { b.opening(walls, { side: EAST, at, y: 3, width: 2, height: 2, kind: 'lattice' }); b.opening(walls, { side: WEST, at, y: 3, width: 2, height: 2, kind: 'lattice' }); }
  // The back door onto the garden, at the middle of the north wall.
  b.opening(walls, { side: NORTH, at: 9, y: 2, width: 1, height: 2, kind: 'door', noren: T.NOREN_INDIGO });
  // Hip and gable, flared and swept up, with the green glaze.
  b.hipGable(walls, 6, { profile: FLARED, tips: 3, gableWall: 'wallFrame' });
  // The veranda: boards along the south, posts to the eaves, steps up in the middle, lanterns hung under the eave.
  b.engawa(walls, 1, SOUTH, 2, { posts: 4, gap: [12], postTop: 5, post: 'accent' });
  b.stair(12, 1, 20, NORTH, 'stoneStairs');
  // Lanterns hang from a tie beam along the veranda's edge, between the posts.
  b.beam(3, 20, 21, 20, 5, 'beam');
  for (const x of [5, 9, 15, 19]) b.set(x, 4, 20, 'light');
  b.set(12, 4, 20, 'lightAlt');
  for (const x of [1, 23]) b.stoneLantern(x, 1, 20);
  // Inside: a lobby at the front with the counter, and rooms for changing and resting, partitioned from one doorway.
  const interior = rect(walls.x0 + 1, walls.z0 + 1, walls.x1 - 1, walls.z1 - 1);
  b.floor(interior, 1, 'interiorFloor');
  b.floor(interior, 6, 'wall');
  const entrance: RoomDoor = { x: walls.x0 + 9, z: walls.z1 - 1, inward: NORTH };
  const back: RoomDoor = { x: walls.x0 + 9, z: walls.z0 + 1, inward: SOUTH };
  const rooms = furnisher.partition(interior, 1, entrance, ['lobby', 'living', 'living', 'storage'], rng.fork(1), { ceilingY: 6, minSize: 4, extraDoors: [back] });
  for (const { room: rm, kind } of rooms) markRoom(b, rm.rect, 1, kind);

  // The garden behind: a deck, the pool, the fence.
  b.floor(rect(4, 2, 20, 8), 0, 'floor');
  b.stair(12, 1, 9, SOUTH, 'stoneStairs');
  // The spring: an ellipse of water edged with rocks, one block lower than the deck.
  const cx = 12;
  const cz = 4;
  for (let z = 1; z <= 9; z++) {
    for (let x = 3; x <= 21; x++) {
      const e = ((x - cx) / 6.2) ** 2 + ((z - cz) / 2.4) ** 2;
      if (e <= 1) { b.set(x, 0, z, STONE.water); b.set(x, -1, z, STONE.stone); }
      else if (e <= 1.55) {
        const h = hash01(x, z, 7);
        b.set(x, 0, z, h < 0.4 ? STONE.mossyCobble : h < 0.7 ? STONE.granite : STONE.cobble);
        if (h < 0.35) b.set(x, 1, z, STONE.mossyCobble);
      }
    }
  }
  // A bamboo spout over the pool's edge and a waterfall of one cell, wash stools and buckets along the deck, lanterns.
  b.column(cx + 3, cz - 3, 1, 2, T.BAMBOO_POLE);
  b.set(cx + 3, 3, cz - 3, T.BAMBOO_POLE);
  b.set(cx + 3, 2, cz - 2, STONE.water);
  for (const x of [5, 7, 9, 15, 17, 19]) { b.set(x, 1, 8, 'stoneSlab', TOP); b.set(x + (x < 12 ? 1 : -1), 1, 8, T.BUCKET); }
  b.stoneLantern(4, 1, 3);
  b.stoneLantern(20, 1, 3);
  b.stoneLantern(11, 1, 8);
  // The fence round the garden, with a gap at the back where a path leaves.
  b.fence(2, 0, 22, 0, 1);
  b.fence(2, 0, 2, 9, 1);
  b.fence(22, 0, 22, 9, 1);
  for (const [x, z] of [[2, 0], [22, 0], [2, 9], [22, 9]]) b.column(x, z, 1, 3, 'post');
  for (let i = 0; i < 12; i++) {
    const x = 3 + Math.floor(hash01(i, 1, 9) * 19);
    const z = 1 + Math.floor(hash01(i, 2, 9) * 2);
    b.setIfEmpty(x, 1, z, FLOWERS[i % FLOWERS.length]);
  }
  b.treeSpot(5, 0, 'sakura');
  b.treeSpot(19, 0, 'cedar');
  b.treeSpot(1, 14, 'sakura');
  b.treeSpot(23, 14, 'cedar');
  b.mark({ kind: 'room', x: cx, y: 1, z: 8, tag: 'spring-deck' });
  return b.build();
};

export const bathHouse = (): LandmarkSpec => ({
  id: 'bath-house', name: 'Bath house', covers: [], facing: 2, footprint: freeFootprint(BATH_W, BATH_D), frame: 'front-south',
  optional: true, free: true, build: buildBathHouse,
});

