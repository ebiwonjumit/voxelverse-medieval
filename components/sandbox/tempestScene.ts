import { BlockRegistry } from '../../engine/BlockRegistry';
import { SLAB_BOTTOM, SLAB_TOP, stairState } from '../../engine/models';
import { StageBlock } from './sandboxLayout';

// The pure half of ?sandbox=blocks&view=street: a small street of Tempest built only from the registry's blocks, so the
// set can be judged as a kit and not only as single cubes: a half-timber shop under a terracotta gable, a two-tier
// house under dark horned tile, a white hall with a teal hip roof, a green-tile inn, a market stall, a garden with a
// koi pond and a stone lantern, a plaza with a fountain and a line of bollards. It stands at the middle of the Tempest
// zone so the grass wears Tempest's colour. It is a fixed test of the blocks meeting each other (tests/tempestScene.test.ts),
// not the town: the town planner and the real buildings come after it.

export interface TempestStreet {
  blocks: StageBlock[];
  /** Footprint and height in blocks. */
  width: number;
  depth: number;
  height: number;
  /** Where the scene's west and north edge stand in the world, so the stage can be meshed on Tempest's own tint. */
  worldX: number;
  worldZ: number;
}

export const STREET_WIDTH = 38;
export const STREET_DEPTH = 32;
const WORLD_X = 1482;
const WORLD_Z = -15;

type Dir = 0 | 1 | 2 | 3; // north, east, south, west: the way a stair climbs

class Scene {
  private readonly cells = new Map<string, StageBlock>();
  constructor(private readonly registry: BlockRegistry) {}

  id(name: string): number {
    return this.registry.byName(`voxelverse:${name}`).id;
  }

  set(x: number, y: number, z: number, name: string, state = 0): void {
    this.cells.set(`${x},${y},${z}`, { id: this.id(name), x: WORLD_X + x, y, z: WORLD_Z + z, state });
  }

  clear(x: number, y: number, z: number): void {
    this.cells.delete(`${x},${y},${z}`);
  }

  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, name: string, state = 0): void {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.set(x, y, z, name, state);
  }

  /** The four walls of a box, from y0 to y1. */
  walls(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, name: string): void {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        this.set(x, y, z0, name);
        this.set(x, y, z1, name);
      }
      for (let z = z0; z <= z1; z++) {
        this.set(x0, y, z, name);
        this.set(x1, y, z, name);
      }
    }
  }

  stair(x: number, y: number, z: number, name: string, facing: Dir, upside = false): void {
    this.set(x, y, z, name, stairState(facing, upside));
  }

  all(): StageBlock[] {
    return [...this.cells.values()];
  }
}

interface RoofKit {
  roof: string;
  /** Stairs and slab names are `${roof}_stairs` and `${roof}_slab`. */
  ridge?: string;
  horn?: string;
  /** One block of rise per block of run (false) or half a block per block, alternating slab and stair (true). */
  gentle?: boolean;
}

/**
 * A gable roof over the walls x0..x1 by z0..z1, whose top course rests at height `y`: it hangs one block over every
 * edge, the ridge runs east to west, and the gable walls (`wall`) fill the triangles under it. The depth plus the two
 * eaves must be odd (and a multiple of four plus one when `gentle`), so a cube makes the crest and the ridge cap sits
 * on the middle of it.
 */
const gableRoof = (s: Scene, x0: number, x1: number, z0: number, z1: number, y: number, kit: RoofKit, wall: string): void => {
  const span = z1 - z0 + 3;
  const n = (span - 1) / 2;
  if (!Number.isInteger(n) || (kit.gentle && n % 2 !== 0)) throw new Error(`Roof span ${span} does not suit this roof`);
  const stairs = `${kit.roof}_stairs`;
  const slab = `${kit.roof}_slab`;
  const rise = (i: number): number => (kit.gentle ? i >> 1 : i);
  const isSlab = (i: number): boolean => !!kit.gentle && i % 2 === 0;
  const crest = kit.gentle ? n / 2 - 1 : n - 1;
  for (let x = x0 - 1; x <= x1 + 1; x++) {
    for (let i = 0; i < n; i++) {
      for (const [z, facing] of [[z1 + 1 - i, 0], [z0 - 1 + i, 2]] as const) {
        if (isSlab(i)) s.set(x, y + rise(i), z, slab, SLAB_BOTTOM);
        else s.stair(x, y + rise(i), z, stairs, facing);
      }
    }
    s.set(x, y + crest, z0 - 1 + n, kit.roof);
    if (kit.ridge) {
      const end = x === x0 - 1 ? 2 : x === x1 + 1 ? 0 : -1;
      if (end >= 0 && kit.horn) s.set(x, y + crest + 1, z0 - 1 + n, kit.horn, end);
      else s.set(x, y + crest + 1, z0 - 1 + n, kit.ridge);
    }
  }
  for (const x of [x0, x1]) {
    for (let z = z0; z <= z1; z++) {
      const i = Math.min(z - (z0 - 1), z1 + 1 - z);
      // The wall rises to the course the roof's own block stands on.
      const top = i >= n ? crest : rise(i);
      for (let k = 0; k < top; k++) s.set(x, y + k, z, wall);
    }
  }
};

/**
 * A hip roof over x0..x1 by z0..z1 (one block of eave all round), in rings that climb inwards. Corners are cubes. The
 * short side plus the two eaves must be odd. The top row is a ridge, with a horn at each end when the kit has them.
 */
const hipRoof = (s: Scene, x0: number, x1: number, z0: number, z1: number, y: number, kit: RoofKit): number => {
  const stairs = `${kit.roof}_stairs`;
  let [a, b, c, d] = [x0 - 1, x1 + 1, z0 - 1, z1 + 1];
  let k = 0;
  while (a <= b && c <= d) {
    if (d - c === 0 || b - a === 0) {
      // The innermost row: cubes whose top is level with the backs of the stairs below, and a ridge on them.
      for (let x = a; x <= b; x++) for (let z = c; z <= d; z++) s.set(x, y + k - 1, z, kit.roof);
      if (kit.ridge) {
        for (let x = a; x <= b; x++) {
          if (kit.horn && (x === a || x === b)) s.set(x, y + k, c, kit.horn, x === a ? 2 : 0);
          else s.set(x, y + k, c, kit.ridge);
        }
      }
      return y + k;
    }
    for (let x = a; x <= b; x++) {
      for (let z = c; z <= d; z++) {
        if (x !== a && x !== b && z !== c && z !== d) continue;
        const cornerX = x === a || x === b;
        const cornerZ = z === c || z === d;
        if (cornerX && cornerZ) s.set(x, y + k, z, kit.roof);
        else if (z === c) s.stair(x, y + k, z, stairs, 2);
        else if (z === d) s.stair(x, y + k, z, stairs, 0);
        else if (x === a) s.stair(x, y + k, z, stairs, 1);
        else s.stair(x, y + k, z, stairs, 3);
      }
    }
    a++; b--; c++; d--; k++;
  }
  return y + k;
};

const TERRACOTTA: RoofKit = { roof: 'terracotta_roof', ridge: 'terracotta_ridge', horn: 'terracotta_ridge_horn' };
const DARK: RoofKit = { roof: 'dark_tile_roof', ridge: 'dark_ridge', horn: 'dark_ridge_horn' };
const GREEN: RoofKit = { roof: 'green_tile_roof', gentle: true };
const TEAL: RoofKit = { roof: 'teal_roof' };
const THATCH: RoofKit = { roof: 'thatch_roof' };

// --- The scene -------------------------------------------------------------------------------------------------

const STREET_Z0 = 13;
const STREET_Z1 = 18;

const ground = (s: Scene): void => {
  s.fill(0, 0, 0, STREET_WIDTH - 1, 0, STREET_DEPTH - 1, 'grass');
  // The street, with a curb on both sides except where the plaza opens across it.
  s.fill(0, 0, STREET_Z0, STREET_WIDTH - 1, 0, STREET_Z1, 'stone_paving');
  for (let x = 0; x < STREET_WIDTH; x++) {
    if (x >= 13 && x <= 22) continue;
    s.set(x, 1, 12, 'stone_curb');
    s.set(x, 1, 19, 'stone_curb');
  }
  // Paved fronts for the shops on both sides, the hall's forecourt, and the plaza in fan paving.
  s.fill(0, 0, 11, STREET_WIDTH - 1, 0, 12, 'stone_paving');
  s.fill(0, 0, 19, STREET_WIDTH - 1, 0, 21, 'stone_paving');
  s.fill(13, 0, 9, 22, 0, 10, 'stone_paving');
  s.fill(13, 0, 11, 22, 0, 20, 'fan_paving');
  s.fill(13, 0, 21, 22, 0, 21, 'stone_paving');
};

const plaza = (s: Scene): void => {
  // The fountain: a ring of water round a pedestal, curbs round the water, a basin and a jet on the pedestal, and a line
  // of bollards before the hall and the inn.
  s.fill(15, 0, 13, 19, 0, 17, 'water');
  s.set(17, 0, 15, 'stone_paving');
  s.set(15, 0, 17, 'koi_pond');
  for (let x = 14; x <= 20; x++) for (let z = 12; z <= 18; z++) {
    if (x === 14 || x === 20 || z === 12 || z === 18) s.set(x, 1, z, 'stone_curb');
  }
  s.set(17, 1, 15, 'stone_basin');
  s.set(17, 2, 15, 'water_jet');
  s.set(17, 3, 15, 'water_jet');
  for (const [x, z] of [[13, 12], [22, 12], [13, 19], [22, 19]]) s.set(x, 1, z, 'stone_bollard');
  for (const x of [13, 15, 20, 22]) s.set(x, 1, 11, 'stone_bollard');
  for (const x of [13, 15, 17, 19, 22]) s.set(x, 1, 21, 'stone_bollard');
};

/** Lamp posts along both curbs: a dark timber post under a lump of glowing ore, blue and green by turns. */
const lamps = (s: Scene): void => {
  const posts: Array<[number, number, string]> = [
    [1, 12, 'blue_ore_lamp'], [12, 12, 'green_ore_lamp'], [23, 12, 'blue_ore_lamp'], [36, 12, 'green_ore_lamp'],
    [1, 19, 'green_ore_lamp'], [12, 19, 'blue_ore_lamp'], [23, 19, 'green_ore_lamp'], [36, 19, 'blue_ore_lamp'],
  ];
  for (const [x, z, lamp] of posts) {
    s.set(x, 1, z, 'timber_post');
    s.set(x, 2, z, 'timber_post');
    s.set(x, 3, z, lamp);
  }
};

/** The two-storey shop on the north side: stone footing, timber frame, a terracotta gable with horned ends. */
const shop = (s: Scene): void => {
  const [x0, x1, z0, z1] = [2, 11, 4, 10];
  s.walls(x0, x1, z0, z1, 1, 3, 'plaster_white');
  s.walls(x0, x1, z0, z1, 1, 1, 'plaster_base');
  s.walls(x0, x1, z0, z1, 4, 6, 'plaster_timber');
  for (const x of [x0, 5, 8, x1]) for (const z of [z0, z1]) s.fill(x, 1, z, x, 6, z, 'timber_post');
  for (const z of [z0 + 3, z1]) { s.fill(x0, 1, z, x0, 6, z, 'timber_post'); s.fill(x1, 1, z, x1, 6, z, 'timber_post'); }
  // A beam between the storeys on every side.
  s.walls(x0, x1, z0, z1, 3, 3, 'timber_beam');
  for (const x of [x0, 5, 8, x1]) for (const z of [z0, z1]) s.set(x, 3, z, 'timber_post');
  // The shop front: two screens, a doorway with a noren, a shuttered blind.
  for (const x of [3, 4]) { s.set(x, 2, z1, 'shoji_pane'); s.set(x, 1, z1, 'plaster_base'); }
  for (const x of [9, 10]) { s.set(x, 2, z1, 'bamboo_blind'); }
  for (const y of [1, 2]) { s.clear(6, y, z1); s.clear(7, y, z1); }
  s.set(6, 2, z1, 'noren_indigo');
  s.set(7, 2, z1, 'noren_indigo');
  // Lit paper screens above, lanterns under the awning.
  for (const x of [3, 4, 6, 7, 9, 10]) s.set(x, 5, z1, 'shoji_pane_lit');
  for (const x of [3, 4, 5, 6]) s.set(x, 3, z1 + 1, 'awning_red', 0);
  for (const x of [7, 8, 9, 10]) s.set(x, 3, z1 + 1, 'awning_indigo', 0);
  for (const x of [3, 6, 9]) s.set(x, 2, z1 + 1, 'paper_lantern_red');
  // Hung over the street from the beam.
  s.set(11, 4, z1 + 1, 'signboard', 1);
  // Barrels, a crate and a rice bale by the door; laundry on a pole at the side.
  s.set(5, 1, z1 + 1, 'barrel');
  s.set(8, 1, z1 + 1, 'crate');
  s.set(9, 1, z1 + 1, 'rice_bale');
  s.set(2, 1, z1 + 1, 'bucket');
  // A side window and a plank at the back.
  for (const z of [z0 + 2, z0 + 4]) s.set(x0, 5, z, 'shoji_pane');
  gableRoof(s, x0, x1, z0, z1, 7, TERRACOTTA, 'plaster_timber');
};

/** The two-tier house with dark tile, horns and vermilion: a skirt roof round the ground floor, a second floor above it. */
const pagoda = (s: Scene): void => {
  const [x0, x1, z0, z1] = [25, 34, 3, 9];
  s.walls(x0, x1, z0, z1, 1, 3, 'plaster_white');
  s.walls(x0, x1, z0, z1, 1, 1, 'plaster_base');
  for (const x of [x0, 28, 31, x1]) for (const z of [z0, z1]) s.fill(x, 1, z, x, 3, z, 'vermilion_log');
  for (const z of [z0, z1]) { s.set(x0, 2, z, 'vermilion_log'); s.set(x1, 2, z, 'vermilion_log'); }
  s.walls(x0, x1, z0, z1, 3, 3, 'timber_beam');
  // The door under a noren, shoji either side.
  for (const y of [1, 2]) { s.clear(29, y, z1); s.clear(30, y, z1); }
  s.set(29, 2, z1, 'noren_red');
  s.set(30, 2, z1, 'noren_red');
  for (const x of [26, 27, 32, 33]) s.set(x, 2, z1, 'shoji_pane_lit');
  for (const x of [26, 27, 32, 33]) s.set(x, 1, z1, 'plaster_base');
  // The skirt roof: two rings of dark tile round the second floor, which stands inside them.
  for (let x = x0 - 1; x <= x1 + 1; x++) {
    for (let z = z0 - 1; z <= z1 + 1; z++) {
      const outer = x === x0 - 1 || x === x1 + 1 || z === z0 - 1 || z === z1 + 1;
      const ring = outer ? 0 : x === x0 || x === x1 || z === z0 || z === z1 ? 1 : -1;
      if (ring < 0) continue;
      const cornerX = x === x0 - 1 + ring || x === x1 + 1 - ring;
      const cornerZ = z === z0 - 1 + ring || z === z1 + 1 - ring;
      if (cornerX && cornerZ) s.set(x, 3 + ring, z, 'dark_tile_roof');
      else if (z === z0 - 1 + ring) s.stair(x, 3 + ring, z, 'dark_tile_roof_stairs', 2);
      else if (z === z1 + 1 - ring) s.stair(x, 3 + ring, z, 'dark_tile_roof_stairs', 0);
      else if (x === x0 - 1 + ring) s.stair(x, 3 + ring, z, 'dark_tile_roof_stairs', 1);
      else s.stair(x, 3 + ring, z, 'dark_tile_roof_stairs', 3);
    }
  }
  // The second floor.
  const [ux0, ux1, uz0, uz1] = [26, 33, 4, 8];
  s.walls(ux0, ux1, uz0, uz1, 4, 6, 'plaster_white');
  for (const x of [ux0, 29, 30, ux1]) for (const z of [uz0, uz1]) s.fill(x, 4, z, x, 6, z, 'vermilion_log');
  for (const x of [27, 28, 31, 32]) { s.set(x, 5, uz1, 'shoji_pane_lit'); s.set(x, 5, uz0, 'shoji_pane'); }
  for (const z of [5, 6, 7]) { s.set(ux0, 5, z, 'lattice_window'); s.set(ux1, 5, z, 'lattice_window'); }
  s.walls(ux0, ux1, uz0, uz1, 7, 7, 'timber_beam');
  // The upper roof: a hip with horns on the ridge.
  hipRoof(s, ux0, ux1, uz0, uz1, 8, DARK);
  // Lanterns under the lower eave and a stone lantern in the yard.
  for (const x of [x0 - 1, x1 + 1]) s.set(x, 2, z1 + 1, 'paper_lantern_striped');
  for (const x of [28, 31]) s.set(x, 2, z1 + 1, 'paper_lantern_red');
  s.set(24, 1, 11, 'stone_lantern_base');
  s.set(24, 2, 11, 'stone_lantern_light');
  s.set(24, 3, 11, 'stone_lantern_cap');
};

/** The white hall: white walls and fluted columns under a teal hip roof, a pediment over the portico, a doorway between. */
const hall = (s: Scene): void => {
  const [x0, x1, z0, z1] = [13, 22, 2, 8];
  s.walls(x0, x1, z0, z1, 1, 6, 'plaster_white');
  s.walls(x0, x1, z0, z1, 1, 1, 'plaster_base');
  s.walls(x0, x1, z0, z1, 4, 4, 'timber_beam');
  // Windows: tall panes two blocks high on the ground floor, lit paper above.
  for (const x of [14, 15, 20, 21]) for (const y of [2, 3]) s.set(x, y, z1, 'glass_pane');
  for (const x of [14, 15, 17, 18, 20, 21]) for (const y of [5, 6]) s.set(x, y, z1, x === 17 || x === 18 ? 'shoji_pane_lit' : 'glass_pane');
  for (const y of [1, 2]) { s.clear(17, y, z1); s.clear(18, y, z1); }
  s.set(17, 2, z1, 'noren_white', 0);
  s.set(18, 2, z1, 'noren_white', 0);
  // The portico: four columns, a lintel, a ceiling and a pediment of plaster with stepped ends.
  for (const x of [14, 16, 19, 21]) s.fill(x, 1, 10, x, 4, 10, 'white_column');
  s.fill(14, 5, 10, 21, 5, 10, 'plaster_white');
  s.fill(14, 5, 9, 21, 5, 9, 'plaster_white');
  for (let r = 0; r < 4; r++) {
    for (let x = 14 + r; x <= 21 - r; x++) {
      const edge = x === 14 + r ? 1 : x === 21 - r ? 3 : -1;
      if (edge >= 0 && r < 3) s.stair(x, 6 + r, 10, 'plaster_stairs', edge as Dir);
      else s.set(x, 6 + r, 10, 'plaster_white');
    }
  }
  s.fill(14, 6, 9, 21, 6, 9, 'plaster_white');
  hipRoof(s, x0, x1, z0, z1, 7, TEAL);
  // Steps up to the doorway.
  for (const x of [17, 18]) s.stair(x, 1, 11, 'plaster_stairs', 0);
};

/** The inn on the south side, under green glaze: lower and wider, with timber posts and shoji. */
const inn = (s: Scene): void => {
  const [x0, x1, z0, z1] = [2, 12, 22, 28];
  s.walls(x0, x1, z0, z1, 1, 3, 'plaster_white');
  s.walls(x0, x1, z0, z1, 1, 1, 'plaster_base');
  for (const x of [x0, 4, 7, 10, x1]) for (const z of [z0, z1]) s.fill(x, 1, z, x, 3, z, 'timber_post');
  s.walls(x0, x1, z0, z1, 3, 3, 'timber_beam');
  for (const x of [x0, 4, 7, 10, x1]) for (const z of [z0, z1]) s.set(x, 3, z, 'timber_post');
  // The front looks north on the street: a door with a red noren, screens, a blind.
  for (const y of [1, 2]) { s.clear(7, y, z0); s.clear(8, y, z0); }
  s.set(7, 2, z0, 'noren_red');
  s.set(8, 2, z0, 'noren_red');
  for (const x of [5, 6]) { s.set(x, 2, z0, 'shoji_pane_lit'); s.set(x, 1, z0, 'plaster_base'); }
  for (const x of [9, 10]) { s.set(x, 2, z0, 'shoji_pane'); s.set(x, 1, z0, 'plaster_base'); }
  for (const x of [3, 11]) s.set(x, 2, z0, 'lattice_window');
  // An engawa along the front: the dark joists and boards, a rail, and the awning over the door seen from the street.
  for (let x = x0; x <= x1; x++) {
    s.set(x, 0, z0 - 1, 'engawa_floor');
    if (x !== 7 && x !== 8) s.set(x, 1, z0 - 1, 'vermilion_rail');
  }
  for (const x of [4, 10]) s.set(x, 3, z0 - 1, 'paper_lantern_red');
  for (const x of [7, 8]) s.set(x, 3, z0 - 1, 'awning_indigo', 2);
  gableRoof(s, x0, x1, z0, z1, 4, GREEN, 'plaster_white');
};

/** The market stall: four poles, two striped awnings meeting at a ridge, crates and a barrel, a low table of goods. */
const stall = (s: Scene): void => {
  for (const [x, z] of [[24, 21], [27, 21], [24, 22], [27, 22]]) for (let y = 1; y <= 3; y++) s.set(x, y, z, 'bamboo_pole');
  for (let x = 24; x <= 27; x++) {
    s.set(x, 4, 21, 'awning_red', 2);
    s.set(x, 4, 22, 'awning_indigo', 0);
  }
  s.set(25, 3, 21, 'paper_lantern_striped');
  s.set(26, 3, 22, 'paper_lantern_red');
  s.set(25, 1, 21, 'crate');
  s.set(26, 1, 21, 'barrel');
  s.set(25, 1, 22, 'low_table');
  s.set(25, 2, 22, 'vase');
  s.set(26, 1, 22, 'rice_bale');
  s.set(28, 1, 22, 'cushion');
};

/** The thatched hut at the back: a plaster box under a steep thatch gable, with washing on a pole at the front. */
const hut = (s: Scene): void => {
  const [x0, x1, z0, z1] = [29, 35, 24, 28];
  s.walls(x0, x1, z0, z1, 1, 2, 'plaster_white');
  s.walls(x0, x1, z0, z1, 1, 1, 'plaster_base');
  for (const x of [x0, x1]) for (const z of [z0, z1]) s.fill(x, 1, z, x, 2, z, 'timber_post');
  for (const y of [1, 2]) s.clear(32, y, z0);
  s.set(32, 2, z0, 'noren_indigo', 0);
  for (const x of [30, 34]) s.set(x, 2, z0, 'shoji_pane_lit');
  for (let x = 30; x <= 34; x++) s.set(x, 2, z0 - 1, 'laundry_pole', 0);
  for (const x of [29, 35]) for (const y of [1, 2]) s.set(x, y, z0 - 1, 'bamboo_pole');
  gableRoof(s, x0, x1, z0, z1, 3, THATCH, 'plaster_white');
};

/** A garden between the inn and the stall, set back from the street: a koi pond ringed with stones, stepping stones, a sakura tree and a stone lantern. */
const garden = (s: Scene): void => {
  // Pond: water sunk into the ground, koi on it, a rim of mossy stone round it.
  s.fill(15, 0, 25, 20, 0, 28, 'mossy_stone');
  s.fill(16, 0, 26, 19, 0, 27, 'water');
  s.set(17, 0, 26, 'koi_pond');
  s.set(19, 0, 27, 'koi_pond');
  s.set(15, 1, 25, 'mossy_stone_slab');
  s.set(20, 1, 28, 'mossy_stone_slab');
  s.set(15, 1, 28, 'mossy_stone_stairs', stairState(2));
  s.set(20, 1, 25, 'mossy_stone_stairs', stairState(0));
  for (const [x, z] of [[17, 22], [17, 23], [16, 24], [14, 25]]) s.set(x, 1, z, 'stepping_stones');
  // A sakura tree, a bamboo fence round the plot and a stone lantern at the water.
  for (let y = 1; y <= 4; y++) s.set(20, y, 29, 'sakura_log');
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy <= 2; dy++) {
    if (Math.abs(dx) + Math.abs(dz) + dy <= 3 && !(dx === 0 && dz === 0 && dy === 0)) s.set(20 + dx, 4 + dy, 29 + dz, 'sakura_leaves');
  }
  for (let x = 13; x <= 22; x++) s.set(x, 1, 31, 'bamboo_fence');
  for (let z = 23; z <= 31; z++) { s.set(13, 1, z, 'bamboo_fence'); s.set(22, 1, z, 'bamboo_fence'); }
  s.set(19, 1, 24, 'stone_lantern_base');
  s.set(19, 2, 24, 'stone_lantern_light');
  s.set(19, 3, 24, 'stone_lantern_cap');
};

/** A few bamboo and cedar to frame the street at its ends, and flowers along the curb. */
const frame = (s: Scene): void => {
  for (const x of [0, STREET_WIDTH - 1]) for (const z of [8, 25]) for (let y = 1; y <= 5; y++) s.set(x, y, z, 'cedar_log');
  for (const x of [0, STREET_WIDTH - 1]) for (const z of [8, 25]) {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 0; dy < 3; dy++) {
      if (Math.abs(dx) + Math.abs(dz) + dy <= 2) s.set(Math.max(0, Math.min(STREET_WIDTH - 1, x + dx)), 5 + dy, z + dz, 'cedar_leaves');
    }
  }
  for (let x = 0; x < 12; x += 2) s.set(x, 1, 20, 'wildflower_white');
};

/** Builds the street. Everything is placed through the registry by name, so a renamed block breaks the build loudly. */
export const buildTempestStreet = (registry: BlockRegistry): TempestStreet => {
  const s = new Scene(registry);
  ground(s);
  plaza(s);
  lamps(s);
  shop(s);
  pagoda(s);
  hall(s);
  inn(s);
  stall(s);
  hut(s);
  garden(s);
  frame(s);
  return { blocks: s.all(), width: STREET_WIDTH, depth: STREET_DEPTH, height: 16, worldX: WORLD_X, worldZ: WORLD_Z };
};
