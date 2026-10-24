import { TempestBlock as T } from '../../../content/blocksTempest';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import {
  BlueprintBuilder, Dir, EAST, NORTH, Rect, SOUTH, WEST, rect,
} from '../../structures/BlueprintBuilder';
import { GENTLE } from '../../structures/roofProfile';
import { StylePack } from '../../structures/StylePack';
import { InteriorFurnisher, RoomDoor } from '../interiors';
import { LandmarkSpec } from './LandmarkSpec';
import { WOOD } from './parts';
import { footprintOf } from './specs';

// The Town Hall, the white neoclassical building of Tempest-3: a plinth, three bays (two wings that stand forward, a
// recessed centre), white plaster with string courses and quoins, arched windows below and square ones with little
// pediments above, a portico of four columns with a balcony over it, a low teal hip roof, a taller centre block with a
// pediment of its own, steps and flagpoles. 31 by 25 blocks, roofs included, front towards south.
//
// Inside: a lobby behind the door, a council hall two storeys high with columns, a dais against the far wall with a window
// of red curtains behind it, a long table and a warm light of red lanterns; a gallery over the lobby that looks into the
// hall; and in each wing a stair hall and rooms for the clerks, on both floors. Everything is reached on foot.
//
// Coordinates here are the hall's own: x 0 to 30 west to east, z 0 to 24 north to south. Rows: 0 the ground, 1 the plinth top
// and the ground floor, 7 the upper floor, 13 the ceiling of the upper floor, then the roofs.

export const HALL_W = 31;
export const HALL_D = 25;

const L_WING = rect(2, 2, 9, 22);
const R_WING = rect(21, 2, 28, 22);
const CENTRE = rect(10, 2, 20, 20);
const PLINTH = rect(1, 1, 29, 23);
const F1 = 1;
const F2 = 7;
const TOP = 13;
const ATTIC_TOP = 19;
const MID = 15;

const inner = (r: Rect): Rect => ({ x0: r.x0 + 1, z0: r.z0 + 1, x1: r.x1 - 1, z1: r.z1 - 1 });

/** A window two cells wide in a wall along x (z fixed) or along z (x fixed), glazed, with an arched or a square head. */
const bay = (b: BlueprintBuilder, along: 'x' | 'z', fixed: number, from: number, y: number, height: number, arch: boolean, outward: Dir): void => {
  for (let i = 0; i < 2; i++) {
    const x = along === 'x' ? from + i : fixed;
    const z = along === 'x' ? fixed : from + i;
    const top = y + height - 1;
    for (let k = 0; k < height; k++) {
      if (arch && k === height - 1) {
        // The head of the arch: an upside-down stair at each corner whose tall side is towards the wall, so the opening's
        // corners are cut off.
        const back: Dir = along === 'x' ? (i === 0 ? WEST : EAST) : (i === 0 ? NORTH : SOUTH);
        b.stair(x, top, z, back, 'stoneStairs', true);
      } else {
        b.set(x, y + k, z, 'glassPane');
      }
    }
    if (!arch) {
      // A lintel above the opening, and over it a little pediment of two stairs facing away from each other.
      b.set(x, top + 1, z, 'wallBase');
      const facing: Dir = along === 'x' ? (i === 0 ? EAST : WEST) : (i === 0 ? SOUTH : NORTH);
      b.stair(x, top + 2, z, facing, 'stoneStairs');
    }
  }
};

/**
 * A pediment standing on a wall: a triangle over x0..x1, `z0..z1` deep, from `baseY`. Steep rises a block a cell; the
 * other rises a block every two cells (a stair then a cube), the flatter pediment of a portico.
 */
const pediment = (b: BlueprintBuilder, x0: number, x1: number, z0: number, z1: number, baseY: number, steep: boolean): number => {
  const w = x1 - x0 + 1;
  const half = Math.ceil(w / 2);
  let apex = baseY;
  for (let i = 0; i < half; i++) {
    const level = steep ? baseY + i : baseY + Math.floor(i / 2);
    const centre = w % 2 === 1 && i === half - 1;
    const asStair = steep ? !centre : (i % 2 === 0 && !centre);
    for (const [x, face] of [[x0 + i, EAST], [x1 - i, WEST]] as const) {
      if (centre && x !== x0 + i) continue;
      for (let z = z0; z <= z1; z++) {
        for (let y = baseY; y < level; y++) b.set(x, y, z, 'wall');
        if (asStair) b.stair(x, level, z, face, 'stoneStairs');
        else b.set(x, level, z, 'wall');
      }
      apex = Math.max(apex, level + (asStair ? 0 : 1));
    }
  }
  return apex;
};

/** Removes what stands in a box (it was never built): the blueprint says nothing there. */
const clearBox = (b: BlueprintBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void => {
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) b.clear(x, y, z);
};

/** A doorway with an arched head, `width` odd, cut through a wall at z (a wall along x) or x. */
const archway = (b: BlueprintBuilder, along: 'x' | 'z', fixed: number, centre: number, y: number, height: number, thickness = 1): void => {
  for (let t = 0; t < thickness; t++) {
    for (let d = -1; d <= 1; d++) {
      const x = along === 'x' ? centre + d : fixed + t;
      const z = along === 'x' ? fixed + t : centre + d;
      for (let k = 0; k < height; k++) b.carve(x, y + k, z);
      if (d !== 0) {
        const back: Dir = along === 'x' ? (d < 0 ? WEST : EAST) : (d < 0 ? NORTH : SOUTH);
        b.stair(x, y + height, z, back, 'stoneStairs', true);
      } else {
        b.carve(x, y + height, z);
      }
    }
  }
};

/** Marks a room by a standing cell near its middle that nothing stands in, so a test can walk there. */
const markRoom = (b: BlueprintBuilder, r: Rect, floorY: number, tag: string): void => {
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (let z = r.z0; z <= r.z1; z++) {
    for (let x = r.x0; x <= r.x1; x++) {
      if (b.bp.solid(x, floorY + 1, z) || b.bp.solid(x, floorY + 2, z)) continue;
      const d = Math.hypot(x - cx, z - cz);
      if (d < bestD) { bestD = d; best = [x, z]; }
    }
  }
  if (best) b.mark({ kind: 'room', x: best[0], y: floorY + 1, z: best[1], tag });
};

export const buildTownHall = (style: StylePack, rng: Rng): Blueprint => {
  const civic = style.family('civic-teal');
  // Indoors the lamps are paper lanterns, red and striped, not the stone lanterns of the civic palette.
  const lit = civic.with({ light: T.PAPER_LANTERN_RED, lightAlt: T.PAPER_LANTERN_STRIPED, interiorFloor: WOOD.plank });
  const b = new BlueprintBuilder(lit, rng, 'town-hall');
  const furnisher = new InteriorFurnisher(b.bp, lit);

  // --- Plinth and walls ------------------------------------------------------------------------------------------------
  b.floor(PLINTH, 0, 'wallBase');
  b.floor(PLINTH, 1, 'wallBase');
  for (const r of [L_WING, R_WING, CENTRE]) {
    b.ring(r, 2, TOP - 1, 'wall');
    // The string courses: the floor of the upper storey and the top of the wall show as a darker band.
    b.ring(r, F2, F2, 'wallBase');
    b.ring(r, TOP, TOP, 'wallBase');
  }
  // Quoins at the corners of the wings: stone and plaster by turns.
  for (const [x, z] of [[2, 2], [9, 2], [2, 22], [9, 22], [21, 2], [28, 2], [21, 22], [28, 22], [10, 2], [20, 2]]) {
    for (let y = 2; y < TOP; y++) if ((y + x + z) % 2 === 0 && y !== F2) b.set(x, y, z, 'wallBase');
  }
  // --- Floors and ceilings ---------------------------------------------------------------------------------------------
  for (const r of [L_WING, R_WING, CENTRE]) {
    b.floor(inner(r), F1, 'interiorFloor');
    b.floor(inner(r), TOP, 'wall');
  }
  // The upper floor: both wings except the stairwell, and the gallery over the lobby. The council hall stays open to the roof.
  const stairX = (wing: Rect): number => (wing === L_WING ? 3 : 27);
  for (const wing of [L_WING, R_WING]) {
    b.floor(inner(wing), F2, 'interiorFloor');
    for (let z = 4; z <= 9; z++) b.clear(stairX(wing), F2, z);
  }
  b.floor(rect(11, 16, 19, 19), F2, 'interiorFloor');
  b.floor(inner(CENTRE), TOP, 'wall');
  // The partition between the lobby and the council hall, its whole height.
  for (let y = 2; y < TOP; y++) for (let x = 11; x <= 19; x++) b.set(x, y, MID, 'wall');
  // The attic's own floor is the ceiling above; its ceiling is the cornice row.
  b.floor(inner(CENTRE), ATTIC_TOP, 'wall');

  // --- The main roof and the roof of the centre block ----------------------------------------------------------------------
  b.hip(rect(2, 2, 28, 22), TOP, { profile: GENTLE });
  // The centre block rises through it, an attic storey with its own cornice: windows only, no way up. Clear the roof cells
  // inside its footprint (and, above its cornice, where its eaves go), then build it.
  clearBox(b, CENTRE.x0, TOP + 1, 0, CENTRE.x1, TOP + 16, 22);
  clearBox(b, 8, ATTIC_TOP, 0, 22, TOP + 16, 22);
  b.ring(CENTRE, TOP + 1, ATTIC_TOP - 1, 'wall');
  b.ring(CENTRE, ATTIC_TOP, ATTIC_TOP, 'wallBase');
  b.floor(inner(CENTRE), ATTIC_TOP, 'wall');
  const crown = b.hip(CENTRE, ATTIC_TOP, { profile: GENTLE });
  // The front of the centre block carries a pediment: the roof is cut back to it.
  clearBox(b, 8, ATTIC_TOP + 1, 21, 22, ATTIC_TOP + 8, 22);
  clearBox(b, 10, ATTIC_TOP + 1, 19, 20, ATTIC_TOP + 8, 20);
  const apex = pediment(b, 10, 20, 19, 20, ATTIC_TOP + 1, false);
  // A lit round window in the middle of the tympanum.
  b.set(15, ATTIC_TOP + 2, 20, 'shojiLit');
  b.set(15, ATTIC_TOP + 2, 19, 'shojiLit');
  // The pediments of the wings.
  for (const wing of [L_WING, R_WING]) pediment(b, wing.x0, wing.x1, 21, 22, TOP + 1, true);
  // Between the two, the cornice of the attic stays: a flagpole on the crest.
  const poleTop = crown.crestTop + 6;
  b.column(15, 11, crown.crestTop, poleTop, T.BAMBOO_POLE);
  for (let k = 0; k < 3; k++) b.set(15, poleTop - k, 12, T.NOREN_RED, 1);

  // --- Windows --------------------------------------------------------------------------------------------------------
  // The wings, front: an arched pair on each side of the pier, below; square pairs with pediments above.
  for (const wing of [L_WING, R_WING]) {
    for (const from of [wing.x0 + 1, wing.x0 + 5]) {
      bay(b, 'x', wing.z1, from, 3, 3, true, SOUTH);
      bay(b, 'x', wing.z1, from, 9, 2, false, SOUTH);
      bay(b, 'x', wing.z0, from, 3, 3, true, NORTH);
      bay(b, 'x', wing.z0, from, 9, 2, false, NORTH);
    }
  }
  // The wings' outer sides: windows along z.
  for (const [x, out] of [[L_WING.x0, WEST], [R_WING.x1, EAST]] as const) {
    for (const from of [4, 8, 14, 18]) {
      bay(b, 'z', x, from, 3, 3, true, out);
      bay(b, 'z', x, from, 9, 2, false, out);
    }
  }
  // The centre's front wall, under the portico: the door, and arched pairs either side. Above: the balcony door and pairs.
  bay(b, 'x', CENTRE.z1, 11, 3, 3, true, SOUTH);
  bay(b, 'x', CENTRE.z1, 18, 3, 3, true, SOUTH);
  bay(b, 'x', CENTRE.z1, 11, 9, 2, false, SOUTH);
  bay(b, 'x', CENTRE.z1, 18, 9, 2, false, SOUTH);
  // The centre's back wall: tall arched windows behind the dais, three wide, with red curtains.
  for (let y = 4; y <= 9; y++) for (const x of [14, 15, 16]) b.set(x, y, CENTRE.z0, y === 9 && x !== 15 ? 'wall' : 'glassPane');
  for (const x of [14, 16]) { b.stair(x, 9, CENTRE.z0, x === 14 ? WEST : EAST, 'stoneStairs', true); }
  for (const x of [13, 17]) for (let y = 4; y <= 8; y++) b.set(x, y, CENTRE.z0 + 1, T.NOREN_RED, 0);
  // The attic's windows, four small pairs in the front and back, lit from inside.
  for (const z of [CENTRE.z0, CENTRE.z1]) for (const x of [11, 13, 17, 19]) {
    b.set(x, 16, z, 'glassPane');
    b.set(x, 17, z, 'glassPane');
  }
  for (const x of [11, 13, 17, 19]) { b.set(x, 18, CENTRE.z1, 'wallBase'); }
  // The attic's lamps, hung from its ceiling so the windows glow after dark.
  for (const z of [5, 11, 17]) for (const x of [13, 17]) b.set(x, ATTIC_TOP - 1, z, 'light');

  // --- The portico, the balcony, the steps --------------------------------------------------------------------------------------
  for (const x of [11, 13, 17, 19]) b.column(x, 22, 2, F2 - 1, 'column');
  // The balcony floor and its cornice, projecting a block past the columns, with a row of balusters round its front and ends.
  b.floor(rect(10, 21, 20, 23), F2, 'wallBase');
  for (let x = 10; x <= 20; x++) b.set(x, F2, 23, 'trim');
  for (let x = 10; x <= 20; x++) b.set(x, F2 + 1, 23, 'column');
  for (const x of [10, 20]) for (let z = 21; z <= 22; z++) b.set(x, F2 + 1, z, 'column');
  // The door leaf: the entrance, three wide with an arched head; the balcony door above, three wide and glazed at the sides.
  archway(b, 'x', CENTRE.z1, 15, 2, 3);
  b.mark({ kind: 'door', x: 15, y: F1 + 1, z: CENTRE.z1, facing: SOUTH });
  for (let y = 8; y <= 10; y++) { b.carve(15, y, CENTRE.z1); b.carve(14, y, CENTRE.z1); b.carve(16, y, CENTRE.z1); }
  b.stair(14, 11, CENTRE.z1, WEST, 'stoneStairs', true);
  b.stair(16, 11, CENTRE.z1, EAST, 'stoneStairs', true);
  // Steps up to the plinth across the whole portico.
  for (let x = 10; x <= 20; x++) b.stair(x, 1, 24, NORTH, 'stoneStairs');
  // Lanterns on the columns' faces and by the steps.
  for (const x of [11, 13, 17, 19]) b.set(x, F2 - 2, 23, 'lightAlt');
  for (const x of [9, 21]) b.stoneLantern(x, 1, 24);

  // --- Doors inside ---------------------------------------------------------------------------------------------------------
  // Lobby to council hall, three wide, with an arch. Wings to the lobby and to the gallery, two high.
  archway(b, 'x', MID, 15, 2, 3);
  for (const y of [2, 3, F2 + 1, F2 + 2]) for (const x of [9, 10, 20, 21]) { b.carve(x, y, 18); }
  // The gallery looks into the council hall through a wide opening, with balusters along its edge.
  for (let x = 13; x <= 17; x++) for (let y = F2 + 1; y <= F2 + 3; y++) b.carve(x, y, MID);
  for (let x = 12; x <= 18; x++) b.set(x, F2 + 1, 16, 'column');
  b.carve(15, F2 + 1, 16);
  // The gallery door onto the balcony was carved above; the gallery has a rail along the open edge.

  // --- The council hall --------------------------------------------------------------------------------------------------------
  const hallRect = rect(11, 3, 19, MID - 1);
  for (const z of [5, 8, 11]) for (const x of [12, 18]) b.column(x, z, 2, TOP - 1, 'column');
  // A runner of dark boards down the aisle, from the lobby door to the dais steps.
  for (let z = 7; z <= MID - 1; z++) { b.set(15, F1, z, WOOD.dark); }
  const hallDoor: RoomDoor = { x: 15, z: MID - 1, inward: NORTH };
  furnisher.furnish({ rect: hallRect, floorY: F1, ceilingY: TOP, doors: [hallDoor] }, 'council', rng.fork(1));
  markRoom(b, hallRect, F1, 'council-hall');
  markRoom(b, rect(14, 4, 16, 6), F1 + 1, 'dais');

  // --- The lobby and the gallery ---------------------------------------------------------------------------------------------
  const lobby = rect(11, 16, 19, 19);
  furnisher.furnish({
    rect: lobby, floorY: F1, ceilingY: F2,
    doors: [{ x: 15, z: 19, inward: NORTH }, { x: 15, z: 16, inward: SOUTH }, { x: 11, z: 18, inward: EAST }, { x: 19, z: 18, inward: WEST }],
  }, 'lobby', rng.fork(2));
  markRoom(b, lobby, F1, 'lobby');
  furnisher.furnish({
    rect: lobby, floorY: F2, ceilingY: TOP,
    doors: [{ x: 11, z: 18, inward: EAST }, { x: 19, z: 18, inward: WEST }, { x: 15, z: 19, inward: NORTH }],
    keepClear: [rect(12, 16, 18, 16), rect(14, 19, 16, 19)],
  }, 'lobby', rng.fork(3));
  markRoom(b, lobby, F2, 'gallery');

  // --- The wings ---------------------------------------------------------------------------------------------------------------
  for (const wing of [L_WING, R_WING]) {
    const west = wing === L_WING;
    const sx = stairX(wing);
    const room = inner(wing);
    const sideDoorX = west ? room.x1 : room.x0;
    const into: Dir = west ? WEST : EAST;
    for (const [floorY, ceilingY, kinds] of [
      [F1, F2, ['study', 'study']],
      [F2, TOP, ['study', 'storage']],
    ] as const) {
      // The stair hall at the back, the rooms in front, a wall between them with a door.
      const hall = rect(room.x0, room.z0, room.x1, 10);
      const front = rect(room.x0, 12, room.x1, room.z1);
      // The wall: shoji screens on timber posts, a doorway in it.
      for (let x = room.x0; x <= room.x1; x++) {
        for (let y = floorY + 1; y < ceilingY; y++) b.set(x, y, 11, y === floorY + 1 || y === ceilingY - 1 ? 'beam' : 'shoji');
      }
      const doorX = west ? room.x0 + 2 : room.x1 - 2;
      b.carve(doorX, floorY + 1, 11); b.carve(doorX, floorY + 2, 11);
      // The stair: six steps climbing north along the outer wall. Its foot is at z 9, so a walker climbs it from the south, from the
      // cell in front of it (a stair cannot be climbed from its side).
      if (floorY === F1) for (let k = 0; k < 6; k++) b.stair(sx, F1 + 1 + k, 9 - k, NORTH, 'stoneStairs');
      // The balusters along the stairwell's edge upstairs.
      if (floorY === F2) for (let z = 4; z <= 9; z++) b.set(sx + (west ? 1 : -1), F2 + 1, z, 'column');
      const stairBay = rect(sx, 4, sx, 9);
      furnisher.furnish({
        rect: hall, floorY, ceilingY, doors: [{ x: doorX, z: 10, inward: NORTH }], keepClear: [stairBay, rect(sx, 3, sx, 3), rect(sx, 10, sx, 10)],
      }, 'lobby', rng.fork(10 + floorY + (west ? 0 : 50)));
      markRoom(b, hall, floorY, `${west ? 'west' : 'east'}-stair-hall-${floorY === F1 ? 'ground' : 'upper'}`);
      // The door from the lobby (and gallery) into the wing, at z 18.
      const entrance: RoomDoor = { x: sideDoorX, z: 18, inward: into };
      const rooms = furnisher.partition(front, floorY, entrance, kinds, rng.fork(20 + floorY + (west ? 0 : 50)), {
        ceilingY, minSize: 4, extraDoors: [{ x: doorX, z: 12, inward: SOUTH }],
      });
      for (const { room: rm, kind } of rooms) markRoom(b, rm.rect, floorY, `${west ? 'west' : 'east'}-${kind}-${floorY === F1 ? 'ground' : 'upper'}`);
    }
  }
  return b.build();
};

/** The Town Hall alone, for the viewer and the tests; the compound draws it in place. */
export const townHall = (): LandmarkSpec => ({
  id: 'town-hall', name: 'Town Hall', covers: ['town-hall'], facing: 2, footprint: footprintOf('town-hall'), frame: 'front-south',
  partOf: 'civic-compound', build: buildTownHall,
});
