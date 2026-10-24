import { TempestBlock as T } from '../../../content/blocksTempest';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, EAST, NORTH, SOUTH, rect } from '../../structures/BlueprintBuilder';
import { FLARED_TIGHT, STEEP } from '../../structures/roofProfile';
import { StylePack } from '../../structures/StylePack';
import { LandmarkSpec } from './LandmarkSpec';
import { TOP } from './parts';
import { footprintOf } from './specs';

// Two small pieces of the roadside: the guard hut by the arena, and the stalls and stables either side of the west gate road.

/**
 * The arena's guard hut: six by six, a dark timber frame round plaster, a steep tile roof, a door on the south with a noren, a
 * lit screen beside it, a bench and a weapon rack outside, a lantern on a post, and inside a bed, a table and a hearth.
 */
const buildGuardHut = (style: StylePack, rng: Rng): Blueprint => {
  const pack = style.family('timber-terracotta');
  const b = new BlueprintBuilder(pack, rng, 'arena-guard-hut');
  const walls = rect(1, 1, 4, 4);
  b.floor(rect(0, 0, 5, 5), 0, 'wallBase');
  b.floor(walls, 1, 'wallBase');
  b.floor(rect(2, 2, 3, 3), 1, 'interiorFloor');
  b.frame(walls, 2, 3, { panel: 'wall', post: 'post', spacing: 3 });
  b.beamRing(walls, 4, 'beam');
  b.opening(walls, { side: SOUTH, at: 1, y: 2, kind: 'door', noren: true });
  b.opening(walls, { side: SOUTH, at: 2, y: 3, kind: 'shoji', lit: true });
  b.opening(walls, { side: EAST, at: 1, y: 3, kind: 'lattice' });
  b.opening(walls, { side: NORTH, at: 1, y: 3, kind: 'lattice' });
  b.hip(walls, 4, { profile: STEEP });
  // Inside: a futon, a hearth, a low table; the door stays clear.
  b.set(3, 2, 2, T.FUTON);
  b.set(3, 2, 3, T.HEARTH);
  // Outside: a bench, a weapon rack and a lantern.
  b.set(0, 1, 5, 'stoneSlab', TOP);
  b.set(5, 1, 5, T.BARREL);
  b.set(4, 1, 5, T.LOW_TABLE);
  b.set(5, 1, 4, 'rail');
  b.set(5, 2, 4, 'rail');
  b.stoneLantern(0, 1, 1);
  // The floor is a block above the ground: a step up to the door, which the opening cut at x 2.
  b.stair(2, 1, 5, NORTH, 'stoneStairs');
  b.mark({ kind: 'room', x: 2, y: 2, z: 2, tag: 'guard-hut' });
  return b.build();
};

export const arenaGuardHut = (): LandmarkSpec => ({
  id: 'arena-guard-hut', name: 'Guard hut', covers: ['arena-guard-hut'], facing: 2, footprint: footprintOf('arena-guard-hut'),
  frame: 'front-south', build: buildGuardHut,
});

// --- The stalls --------------------------------------------------------------------------------------------------------------

const STALL_W = 8;
const STALL_D = 8;

/** A stable: a back and two sides in plaster and timber, a half door of rails at the front, hay and a trough, a thatched gable. */
const stable = (b: BlueprintBuilder, x0: number, thatch: StylePack): void => {
  const body = rect(x0 + 1, 1, x0 + 6, 6);
  b.floor(rect(x0, 0, x0 + STALL_W - 1, STALL_D - 1), 0, 'wallBase');
  b.floor(body, 0, 'wallBase');
  b.floor(rect(body.x0 + 1, body.z0 + 1, body.x1 - 1, body.z1 - 1), 0, 'floor');
  // Walls: the back and the two sides, 3 high, in half timber; the front is posts, a lintel and a half door of rails.
  for (let y = 1; y <= 3; y++) {
    for (let z = body.z0; z <= body.z1; z++) { b.set(body.x0, y, z, y === 3 ? 'wallFrame' : 'wall'); b.set(body.x1, y, z, y === 3 ? 'wallFrame' : 'wall'); }
    for (let x = body.x0; x <= body.x1; x++) b.set(x, y, body.z0, y === 3 ? 'wallFrame' : 'wall');
  }
  for (const x of [body.x0, body.x1]) for (const z of [body.z0, body.z1]) b.column(x, z, 1, 3, 'post');
  b.beamRing(body, 4, 'beam');
  // The front: a gate of rails, half height, with a gap for the horse at the middle, and a lantern on the lintel.
  for (let x = body.x0 + 1; x <= body.x1 - 1; x++) { if (x !== x0 + 3 && x !== x0 + 4) b.set(x, 1, body.z1, 'rail'); }
  for (const x of [x0 + 3, x0 + 4]) b.carve(x, 1, body.z1);
  b.set(x0 + 3, 3, body.z1, 'light');
  // Hay and a trough inside.
  b.set(body.x0 + 1, 1, body.z0 + 1, T.RICE_BALE);
  b.set(body.x0 + 2, 1, body.z0 + 1, T.RICE_BALE);
  b.set(body.x1 - 1, 1, body.z0 + 1, T.BARREL);
  b.set(body.x1 - 1, 1, body.z0 + 2, T.BUCKET);
  // The roof: thatch, ridge across the depth so the gable faces the front.
  const roof = new BlueprintBuilder(thatch, b.rng, 'stable-roof');
  roof.gable(body, 4, { profile: FLARED_TIGHT, axis: 'z', endOverhang: 1, gableWall: 'wallFrame', tips: 1 });
  b.bp.merge(roof.build());
};

/** A market stall: a back wall, two posts, a counter with goods, a striped awning and a sign, a lantern at each corner. */
const marketStall = (b: BlueprintBuilder, x0: number, alt: boolean): void => {
  const x1 = x0 + STALL_W - 1;
  b.floor(rect(x0, 0, x1, STALL_D - 1), 0, 'path');
  b.floor(rect(x0 + 1, 1, x1 - 1, 5), 0, 'wallBase');
  // Back wall and two end walls, low, in plaster with a tile cap.
  for (let x = x0 + 1; x <= x1 - 1; x++) for (let y = 1; y <= 3; y++) b.set(x, y, 1, y === 1 ? 'wallBase' : 'wall');
  for (const x of [x0 + 1, x1 - 1]) for (let z = 1; z <= 4; z++) for (let y = 1; y <= 2; y++) b.set(x, y, z, y === 1 ? 'wallBase' : 'wall');
  for (const x of [x0 + 1, x1 - 1]) b.column(x, 5, 1, 4, 'post');
  for (const x of [x0 + 1, x1 - 1]) b.column(x, 1, 4, 4, 'post');
  b.beam(x0 + 1, 5, x1 - 1, 5, 5, 'beam');
  b.beam(x0 + 1, 1, x1 - 1, 1, 5, 'beam');
  for (let x = x0 + 1; x <= x1 - 1; x++) for (let z = 2; z <= 4; z++) b.set(x, 5, z, 'beam');
  // The awning, falling to the front, and a sign on the lintel; stripes alternate red and indigo.
  b.awning(5, x0 + 1, x1 - 1, 4, SOUTH, { alt: true, ref: alt ? 'awningAlt' : 'awning', refAlt: alt ? 'awning' : 'awningAlt' });
  b.signboard(x0 + 3, 4, 6, 'x');
  b.signboard(x0 + 4, 4, 6, 'x');
  // The counter in front, goods on and behind it.
  for (let x = x0 + 2; x <= x1 - 2; x++) b.set(x, 1, 4, 'accent');
  for (const [x, block] of [[x0 + 2, T.CRATE], [x0 + 3, T.BARREL], [x0 + 4, T.RICE_BALE], [x0 + 5, T.CRATE], [x0 + 6, T.BARREL]] as const) {
    b.set(x, 1, 2, block);
  }
  for (const x of [x0 + 2, x0 + 4, x0 + 6]) b.set(x, 2, 4, T.VASE);
  b.set(x0 + 3, 2, 2, T.CRATE);
  b.set(x0 + 5, 2, 2, T.VASE);
  b.set(x0 + 3, 4, 2, 'light');
  b.set(x0 + 5, 4, 2, 'lightAlt');
  for (const x of [x0 + 1, x1 - 1]) b.set(x, 3, 5, 'light');
};

const buildStalls = (style: StylePack, rng: Rng): Blueprint => {
  const b = new BlueprintBuilder(style.family('timber-terracotta'), rng, 'west-stalls');
  const thatch = style.family('thatch');
  // Three units along the road, a stable, a market stall and a stable or a stall; the pattern follows the generator.
  const units: Array<'stable' | 'stall'> = rng.chance(0.5) ? ['stable', 'stall', 'stable'] : ['stall', 'stable', 'stall'];
  units.forEach((u, i) => {
    const x0 = i * STALL_W;
    if (u === 'stable') stable(b, x0, thatch);
    else marketStall(b, x0, i % 2 === 0);
  });
  // The 25th cell is a post with a lantern, and between the units the path is paving.
  b.floor(rect(24, 0, 24, STALL_D - 1), 0, 'path');
  b.column(24, 6, 1, 3, T.BAMBOO_POLE);
  b.set(24, 4, 6, 'light');
  b.set(23, 4, 6, 'rail');
  b.set(24, 4, 6, 'rail');
  b.set(23, 3, 6, 'lightAlt');
  b.stoneLantern(0, 1, 7);
  b.mark({ kind: 'door', x: 12, y: 1, z: STALL_D - 1, facing: SOUTH });
  return b.build();
};

const stalls = (id: 'west-stalls-north' | 'west-stalls-south', name: string): LandmarkSpec => ({
  id, name, covers: [id], facing: 1, footprint: footprintOf(id), frame: 'front-south',
  // The two sides are mirror images either side of the road: the north stalls are the south ones seen in a mirror.
  build: (style) => {
    // The same stalls drawn for both sides, from one fixed generator, so the north row is exactly the south row in a mirror.
    const bp = buildStalls(style, new Rng(0x57a115));
    return id === 'west-stalls-north' ? bp.mirrored('x').translated(24, 0, 0) : bp;
  },
});

export const westStallsNorth = (): LandmarkSpec => stalls('west-stalls-north', 'West stalls, north side');
export const westStallsSouth = (): LandmarkSpec => stalls('west-stalls-south', 'West stalls, south side');
