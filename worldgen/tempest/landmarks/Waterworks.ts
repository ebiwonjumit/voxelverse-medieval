import { TempestBlock as T } from '../../../content/blocksTempest';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, EAST, WEST } from '../../structures/BlueprintBuilder';
import { StylePack } from '../../structures/StylePack';
import { LandmarkSpec } from './LandmarkSpec';
import { STONE, archCell, hash01 } from './parts';
import { footprintOf } from './specs';

// The two pieces of the town that cross water: the arched bridge where the east road meets the river, and the optional
// aqueduct north of the guest houses. Both are long, so they are drawn in the world frame (x east, z south, the corner of the
// footprint at 0, 0) and never turned.

// --- The east bridge -----------------------------------------------------------------------------------------------------------

export const BRIDGE_W = 23;
export const BRIDGE_D = 13;
/** The column of the crown of the arch, where the river runs: the layout's river crosses the road at x 340, 14 cells in. */
const CROWN_X = 14;
const CROWN_RISE = 4;
const ARCH_HALF = 3;
const SPRING_Y = -1;

/** The deck's top row at column x: a hump bridge, flat on the crown and at the foot of each ramp, a step a cell or two between. */
export const bridgeDeck = (x: number): number => {
  const t = Math.abs(x - CROWN_X);
  return Math.max(0, Math.min(CROWN_RISE, Math.round(CROWN_RISE - (t - 2) * 0.7)));
};

/**
 * The arched bridge, 23 long by 13 wide with the road running east: nine cells of paving between two low walls of dressed
 * stone, rising in steps to a crown over the river; under it a round arch of stone brick, solid abutments either side down to the
 * bed; lacquered posts with red lanterns every fourth cell along both walls, stone lanterns at each end, moss at the foot.
 * What is under the arch is left unset: the river is the zone's.
 */
const buildBridge = (style: StylePack, rng: Rng): Blueprint => {
  const b = new BlueprintBuilder(style.family('vermilion-dark'), rng, 'east-bridge');
  const z0 = 2;
  const z1 = BRIDGE_D - 3;
  for (let x = 0; x < BRIDGE_W; x++) {
    const d = bridgeDeck(x);
    // Under the deck: abutment fill from below the bed up to the deck, in dressed stone, with the round arch left open under the
    // crown: seven wide on the bed, narrowing a cell a row, the corners cut by stairs.
    for (let z = z0 - 1; z <= z1 + 1; z++) {
      for (let y = -4; y < d; y++) {
        const dx = x - CROWN_X;
        const shape = Math.abs(dx) <= ARCH_HALF + 1 ? archCell(dx, y - SPRING_Y, ARCH_HALF) : 'solid';
        if (shape === 'open') continue;
        if (shape === 'stair') { b.stair(x, y, z, dx < 0 ? WEST : EAST, 'stoneStairs', true); continue; }
        const ring = Math.abs(dx) <= ARCH_HALF + 1;
        b.set(x, y, z, ring ? STONE.brick : hash01(x, y + z * 7, 91) < 0.2 ? STONE.mossyCobble : 'wallBase');
      }
    }
    // The deck: paving, with a stair where it steps up from the column on the lower side.
    const prev = x > 0 ? bridgeDeck(x - 1) : d;
    const next = x < BRIDGE_W - 1 ? bridgeDeck(x + 1) : d;
    for (let z = z0; z <= z1; z++) {
      if (d > prev) b.stair(x, d, z, EAST, 'stoneStairs');
      else if (d > next) b.stair(x, d, z, WEST, 'stoneStairs');
      else b.set(x, d, z, (x + z) % 5 === 0 ? 'pathAlt' : 'path');
    }
    // The walls: a course of stone and a slab cap, stepping with the deck.
    for (const z of [z0 - 1, z1 + 1]) {
      b.set(x, d, z, STONE.brick);
      b.set(x, d + 1, z, STONE.brick);
      b.set(x, d + 2, z, 'stoneSlab', 0);
    }
  }
  // Posts with lanterns every fourth cell, a rail between the two neighbours at the crown.
  for (let x = 1; x < BRIDGE_W; x += 4) {
    const d = bridgeDeck(x);
    for (const z of [z0 - 1, z1 + 1]) {
      b.column(x, z, d + 3, d + 5, T.BAMBOO_POLE);
      b.set(x, d + 6, z, 'light');
    }
  }
  // Stone lanterns at the four corners, outside the walls.
  for (const x of [0, BRIDGE_W - 1]) for (const z of [0, BRIDGE_D - 1]) b.stoneLantern(x, 1, z);
  // Moss and wildflowers at the foot of the abutments.
  for (let x = 0; x < BRIDGE_W; x++) for (const z of [0, BRIDGE_D - 1]) {
    if (bridgeDeck(x) === 0 && hash01(x, z, 17) < 0.5 && x % 2 === 1) b.setIfEmpty(x, 0, z, STONE.moss);
  }
  // The ends of the road: an entrance marker at each foot.
  b.mark({ kind: 'gate', x: 0, y: 1, z: 6, facing: WEST });
  b.mark({ kind: 'gate', x: BRIDGE_W - 1, y: 1, z: 6, facing: EAST });
  return b.build();
};

export const eastBridge = (): LandmarkSpec => ({
  id: 'east-bridge', name: 'East bridge', covers: ['east-bridge'], facing: 1, footprint: footprintOf('east-bridge'), frame: 'world', build: buildBridge,
});

// --- The aqueduct ------------------------------------------------------------------------------------------------------------------

export const AQUEDUCT_W = 97;
export const AQUEDUCT_D = 9;
const PITCH = 8;
const DECK_Y = 15;

/**
 * The aqueduct of the picture, two tiers of round arches in cream plaster stone carrying a water channel, 97 long and 9 wide:
 * piers three cells thick every eight, tall arches below and shorter ones above on the same piers, string courses between the
 * tiers, and on top a stone-lined channel of running water between two walkways with a low parapet and, over every pier, a post
 * with a lantern. The ground under the arches is left to the terrain: a stream of the zone's can run through.
 */
const buildAqueduct = (style: StylePack, rng: Rng): Blueprint => {
  const b = new BlueprintBuilder(style.family('civic-teal'), rng, 'aqueduct');
  const piers: number[] = [];
  for (let x = 1; x + 1 < AQUEDUCT_W; x += PITCH) piers.push(x + 1);
  const isPier = (x: number): boolean => piers.some((p) => Math.abs(p - x) <= 1);
  const spanCentre = (x: number): number => {
    let best = piers[0];
    for (let i = 0; i + 1 < piers.length; i++) if (x >= piers[i] && x <= piers[i + 1]) best = (piers[i] + piers[i + 1]) / 2;
    return best;
  };
  const SPRING = [4, 11];
  for (let x = 0; x < AQUEDUCT_W; x++) {
    const afterLast = x > piers[piers.length - 1] + 1;
    const beforeFirst = x < piers[0] - 1;
    const cx = spanCentre(x);
    // A bay's body: wall of cream stone between the piers with two round arches, one over the other; the ends are solid piers.
    for (let z = 2; z <= 6; z++) {
      for (let y = 0; y < DECK_Y; y++) {
        if (!isPier(x) && !afterLast && !beforeFirst) {
          const tier = y < 8 ? 0 : 1;
          const shape = archCell(x - cx, y - SPRING[tier], 2);
          if (shape === 'open') continue;
          if (shape === 'stair') { b.stair(x, y, z, x < cx ? WEST : EAST, 'stoneStairs', true); continue; }
        }
        const stringCourse = y === 7 || y === DECK_Y - 1;
        b.set(x, y, z, stringCourse ? 'wallBase' : hash01(x + z, y, 33) < 0.07 ? 'stone' : 'wall');
      }
    }
  }
  // The deck: walkways either side of a channel, stone with a little moss; the channel's walls a block high, and the water in it.
  for (let x = 0; x < AQUEDUCT_W; x++) {
    for (let z = 1; z <= 7; z++) b.set(x, DECK_Y, z, z >= 3 && z <= 5 ? 'wallBase' : 'path');
    for (const z of [2, 6]) b.set(x, DECK_Y, z, 'wallBase');
    for (const z of [2, 6]) b.set(x, DECK_Y + 1, z, 'wallBase');
    for (let z = 3; z <= 5; z++) b.set(x, DECK_Y + 1, z, STONE.water);
    for (const z of [0, 8]) { b.set(x, DECK_Y - 1, z, 'wallBase'); b.set(x, DECK_Y, z, 'wallBase'); b.set(x, DECK_Y + 1, z, 'wallBase'); }
    for (const z of [0, 8]) b.set(x, DECK_Y + 2, z, 'stoneSlab', 0);
  }
  // A post and lantern over every pier, on the outer parapet of both sides.
  for (const p of piers) for (const z of [0, 8]) {
    b.column(p, z, DECK_Y + 2, DECK_Y + 4, 'column');
    b.set(p, DECK_Y + 5, z, 'lightAlt');
  }
  // The foot of the walls: a plinth under the first tier, a course of stone brick.
  for (let x = 0; x < AQUEDUCT_W; x++) for (const z of [2, 6]) if (isPier(x)) b.set(x, 0, z, STONE.brick);
  return b.build();
};

export const aqueduct = (): LandmarkSpec => ({
  id: 'aqueduct', name: 'Aqueduct', covers: ['aqueduct'], facing: 1, footprint: footprintOf('aqueduct'), frame: 'world', optional: true, build: buildAqueduct,
});
