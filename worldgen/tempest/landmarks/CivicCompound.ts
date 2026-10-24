import { TempestBlock as T } from '../../../content/blocksTempest';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, EAST, NORTH, SOUTH, WEST, rect } from '../../structures/BlueprintBuilder';
import { STEEP } from '../../structures/roofProfile';
import { StylePack } from '../../structures/StylePack';
import { COMPOUND } from '../layout';
import { LandmarkSpec } from './LandmarkSpec';
import { buildTownHall } from './TownHall';
import { TOP, banner, bollardLine, cedar, sakura, streetLamp, wallRun } from './parts';
import { footprintOf } from './specs';

// The civic compound: the walled yard at the head of the north-south avenue, 49 by 51, facing south. A gate in the middle of
// the south wall, where the avenue ends, between two gate towers; a forecourt of fan paving with a line of bollards along the
// inside of the wall, flagpoles and lamps, steps up to the Town Hall (TownHall.ts) behind it; gardens with a koi pond, sakura and
// cedar trees either side and behind; corner towers with pointed roofs; and the small lodge in the north east corner.
//
// Coordinates are the compound's own: x 0 to 48 west to east, z 0 to 50 north to south. The hall stands at x 9 to 39, z 8 to 32;
// the avenue's centre line, x = 24, runs through the gate, the forecourt and the hall's door.

export const COMPOUND_W = 49;
export const COMPOUND_D = 51;
const HALL_X = 9;
const HALL_Z = 8;
const CX = 24;

const build = (style: StylePack, rng: Rng): Blueprint => {
  // The wall and towers wear the dark tile of the heavy Japanese roofs; the gate towers and the hall are civic white and teal.
  const dark = style.family('plaster-dark');
  const civic = style.family('civic-teal').with({ light: T.PAPER_LANTERN_RED, lightAlt: T.PAPER_LANTERN_STRIPED });
  const b = new BlueprintBuilder(dark, rng, 'civic-compound');

  // --- Ground ------------------------------------------------------------------------------------------------------------
  // The forecourt: fan paving with a border of plain paving, running from the hall's steps to the south wall.
  const court = rect(2, 34, 46, 49);
  for (let z = court.z0; z <= court.z1; z++) {
    for (let x = court.x0; x <= court.x1; x++) {
      const edge = x === court.x0 || x === court.x1 || z === court.z0 || z === court.z1;
      const avenue = x >= 19 && x <= 29;
      // Bands of plain paving across the fan every eight cells give the plaza its stone-by-stone look.
      const band = (z - court.z0) % 8 === 0;
      b.set(x, 0, z, edge || band || avenue ? 'path' : 'pathAlt');
    }
  }
  // The avenue carries on across the whole yard to the hall's steps.
  for (let z = 33; z <= 50; z++) for (let x = 19; x <= 29; x++) b.set(x, 0, z, (x === 19 || x === 29 || (z + x) % 6 === 0) ? 'path' : 'pathAlt');
  for (let x = 19; x <= 29; x++) b.set(x, 0, 33, 'path');
  // A path round the hall's front corners to the side gardens.
  for (let z = 30; z <= 36; z++) for (const x of [7, 8, 40, 41]) b.set(x, 0, z, 'path');

  // --- The wall and the corner towers -----------------------------------------------------------------------------------------
  const H = 4;
  wallRun(b, 0, 0, 48, 0, 0, H, { spacing: 6 });
  wallRun(b, 0, 0, 0, 50, 0, H, { spacing: 6 });
  wallRun(b, 48, 0, 48, 50, 0, H, { spacing: 6 });
  // The front is open to the avenue: a low plastered footing with a lacquered rail between timber posts, a lantern on every other post,
  // so the hall stands in view from the street and the gate towers frame the way in.
  for (let x = 0; x <= 48; x++) {
    b.set(x, 1, 50, 'wallBase');
    const post = x % 6 === 0 || x === 48;
    if (post) {
      b.column(x, 50, 2, 3, 'post');
      b.set(x, 4, 50, 'roofSlab', 0);
      if (x % 12 === 0) b.set(x, 5, 50, 'lightAlt');
    } else {
      b.set(x, 2, 50, 'rail');
    }
  }
  // The gate: the wall is opened between the towers, nine wide, the avenue's width less a block each side.
  for (let x = 20; x <= 28; x++) for (let y = 1; y <= H + 1; y++) b.carve(x, y, 50);
  b.floor(rect(20, 50, 28, 50), 0, 'path');
  // Corner towers at the south west, south east and north west corners (the lodge has the north east one).
  const tower = (x0: number, z0: number): void => {
    const w = rect(x0 + 1, z0 + 1, x0 + 5, z0 + 5);
    b.floor(rect(x0, z0, x0 + 6, z0 + 6), 0, 'wallBase');
    b.floor(rect(x0, z0, x0 + 6, z0 + 6), 1, 'wallBase');
    b.ring(w, 2, 9, 'wall');
    b.ring(w, 6, 6, 'wallBase');
    b.ring(w, 10, 10, 'wallBase');
    for (const [qx, qz] of [[w.x0, w.z0], [w.x1, w.z0], [w.x0, w.z1], [w.x1, w.z1]]) b.column(qx, qz, 2, 10, 'post');
    // Two small windows each side, lit from within.
    for (const [qx, qz] of [[w.x0 + 2, w.z0], [w.x0 + 2, w.z1], [w.x0, w.z0 + 2], [w.x1, w.z0 + 2]]) {
      b.set(qx, 4, qz, 'shojiLit');
      b.set(qx, 8, qz, 'shojiLit');
    }
    b.hip(w, 10, { profile: STEEP, ridgeCap: false });
  };
  tower(0, 0);
  tower(0, 44);
  tower(42, 44);
  // The lodge's corner.

  // --- The gate towers ---------------------------------------------------------------------------------------------------------
  const civicB = new BlueprintBuilder(civic, rng, 'gate');
  const gateTower = (x0: number): void => {
    // The roof overhangs the walls by a block, so the walls stop one cell short of the compound's edge. The towers are low, so the hall
    // behind them is seen over their roofs.
    const w = rect(x0, 45, x0 + 4, 49);
    civicB.floor(rect(x0, 45, x0 + 4, 50), 0, 'wallBase');
    civicB.floor(rect(x0, 45, x0 + 4, 50), 1, 'wallBase');
    civicB.ring(w, 2, 7, 'wall');
    civicB.ring(w, 5, 5, 'wallBase');
    civicB.ring(w, 8, 8, 'wallBase');
    for (const [qx, qz] of [[w.x0, w.z0], [w.x1, w.z0], [w.x0, w.z1], [w.x1, w.z1]]) civicB.column(qx, qz, 2, 8, 'column');
    for (const [qx, qz] of [[w.x0 + 2, w.z0], [w.x0 + 2, w.z1]]) { civicB.set(qx, 3, qz, 'glassPane'); civicB.set(qx, 4, qz, 'glassPane'); civicB.set(qx, 6, qz, 'shojiLit'); civicB.set(qx, 7, qz, 'shojiLit'); }
    civicB.hip(w, 8, { profile: STEEP, ridgeCap: false });
  };
  gateTower(15);
  gateTower(30);
  b.bp.merge(civicB.build(), 0, 0, 0);
  // A lintel across the gate at the height of the towers' string course, with banners and lanterns hanging from it.
  for (let x = 20; x <= 28; x++) {
    b.set(x, 6, 50, 'beam');
    b.set(x, 6, 49, 'beam');
    b.set(x, 7, 50, 'wall');
    b.set(x, 8, 50, 'roofSlab', 0);
  }
  for (const x of [21, 27]) banner(b, x, 5, 49, 3, 'x', T.NOREN_RED);
  for (const x of [22, 24, 26]) b.set(x, 5, 49, 'lightAlt');
  b.mark({ kind: 'door', x: CX, y: 1, z: 50, facing: SOUTH });

  // --- Forecourt furniture -----------------------------------------------------------------------------------------------------
  // The line of bollards along the inside of the south wall, with a gap for the avenue.
  bollardLine(b, 3, 48, 45, 48, 1, 2, Array.from({ length: 11 }, (_, i) => 19 + i));
  // Two flagpoles flank the way to the hall, tall bamboo masts with red and white banners.
  for (const x of [15, 33]) {
    b.set(x, 0, 38, 'wallBase');
    b.column(x, 38, 1, 11, T.BAMBOO_POLE);
    for (let k = 0; k < 4; k++) b.set(x + (x < CX ? 1 : -1), 11 - k, 38, k % 2 === 0 ? T.NOREN_RED : T.NOREN_WHITE, 1);
  }
  // Lamps along the avenue's edges.
  for (const z of [36, 42, 46]) for (const x of [18, 30]) streetLamp(b, x, 1, z, x < CX ? EAST : WEST, 4, 'lightAlt');
  // Stone lanterns on both sides of the steps.
  for (const x of [17, 31]) b.stoneLantern(x, 1, 33);
  // Benches on the court's edges.
  for (const [x, z] of [[5, 40], [5, 44], [43, 40], [43, 44]]) {
    for (let k = 0; k < 3; k++) b.set(x, 1, z + k, 'stoneSlab', TOP);
  }
  // Sakura in the court's corners, each in a ring of stone.
  for (const [x, z] of [[5, 36], [43, 36]]) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) b.set(x + dx, 0, z + dz, 'stone');
    sakura(b, x, z, 0, 4);
  }

  // --- Gardens -------------------------------------------------------------------------------------------------------------------
  // The west garden: a koi pond with stepping stones, sakura and a cedar, lanterns and a bamboo fence along the hall.
  b.pond(rect(3, 14, 6, 21), 0, 3, 'stone');
  b.steppingPath(2, 26, 8, 26, 1, 2);
  sakura(b, 3, 10, 0, 4);
  sakura(b, 6, 28, 0, 5);
  cedar(b, 3, 31, 0, 7);
  b.stoneLantern(7, 1, 18);
  b.stoneLantern(2, 1, 24);
  // The east garden mirrors it, with its own trees.
  b.pond(rect(42, 14, 45, 21), 0, 3, 'stone');
  b.steppingPath(40, 26, 46, 26, 1, 2);
  sakura(b, 45, 10, 0, 5);
  sakura(b, 42, 28, 0, 4);
  cedar(b, 45, 31, 0, 8);
  b.stoneLantern(41, 1, 18);
  b.stoneLantern(46, 1, 24);
  // Behind the hall: a long pond with a bridge, cedars along the wall and lanterns on the path round it.
  b.pond(rect(14, 3, 34, 5), 0, 4, 'stone');
  for (let x = 22; x <= 26; x++) { b.set(x, 1, 3, 'floor'); b.set(x, 1, 4, 'floor'); b.set(x, 1, 5, 'floor'); }
  for (let x = 22; x <= 26; x++) { b.set(x, 2, 2, 'rail'); b.set(x, 2, 6, 'rail'); }
  for (const z of [3, 4, 5]) { b.set(21, 0, z, 'stone'); b.set(27, 0, z, 'stone'); }
  b.stoneLantern(13, 1, 2);
  b.stoneLantern(35, 1, 2);
  cedar(b, 10, 3, 0, 8);
  cedar(b, 38, 3, 0, 8);
  sakura(b, 20, 6, 0, 4);
  sakura(b, 29, 6, 0, 4);

  // --- The Town Hall and the lodge --------------------------------------------------------------------------------------------
  b.bp.merge(buildTownHall(style, rng.fork(0x7011)), HALL_X, 0, HALL_Z);
  b.bp.merge(buildLodge(style, rng.fork(0x10d6e)), 39, 0, 1);
  return b.build();
};

/** The lodge: a small thatched hut, 7 by 6 with its eaves, a veranda on the south, a hearth, a bed and a lantern. */
const buildLodge = (style: StylePack, rng: Rng): Blueprint => {
  const thatch = style.family('thatch');
  const b = new BlueprintBuilder(thatch, rng, 'compound-lodge');
  const walls = rect(1, 1, 5, 4);
  b.floor(rect(0, 0, 6, 5), 0, 'wallBase');
  b.floor(walls, 1, 'wallBase');
  b.floor(rect(2, 2, 4, 3), 1, 'interiorFloor');
  b.frame(walls, 2, 3, { panel: 'wall', post: 'post', spacing: 2 });
  b.walls(walls, 4, 4, 'wallFrame');
  b.beamRing(walls, 5, 'beam');
  b.opening(walls, { side: SOUTH, at: 2, y: 2, kind: 'door', noren: true });
  b.opening(walls, { side: SOUTH, at: 0, y: 3, kind: 'shoji', lit: true });
  b.opening(walls, { side: SOUTH, at: 4, y: 3, kind: 'shoji', lit: true });
  b.opening(walls, { side: EAST, at: 1, y: 3, kind: 'lattice' });
  b.gable(walls, 5, { profile: STEEP, axis: 'x', endOverhang: 1, gableWall: 'wallFrame' });
  b.stair(3, 1, 5, NORTH, 'stoneStairs');
  b.set(5, 1, 3, T.HEARTH);
  b.set(2, 2, 3, T.FUTON);
  b.set(2, 2, 2, T.FUTON);
  b.stoneLantern(0, 1, 5);
  return b.build();
};

export const civicCompound = (): LandmarkSpec => ({
  id: 'civic-compound', name: 'Civic compound',
  covers: ['civic-compound', 'town-hall-forecourt', 'compound-lodge', 'town-hall'],
  facing: 2, footprint: footprintOf('civic-compound'), frame: 'front-south', build,
});

// Where the compound's own landmarks stand, for the tests: the hall's rectangle and the compound's, in world cells.
export const COMPOUND_ORIGIN = { x: COMPOUND.x0, z: COMPOUND.z0 };
