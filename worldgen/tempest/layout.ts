import { MILE } from '../../worldConstants';
import { GATES } from '../roads/layout';

// The layout of the Federation of Tempest: where the streets, blocks, districts and landmarks are. This is the contract
// the building kits, the landmark builders and the zone share (docs/tempest.md describes it in prose). It is the owner's
// plan, Tempest-6.png, measured and written down: the TOWN PLAN (binding) section of reference/tempest/NOTES.md.
//
// Everything is in WORLD coordinates and whole cells. The picture's origin is the Central Square, local (0, 0), which stands
// at world (1500, 0); `local` below is the position relative to it, x east and z south (north is -z). A rectangle is the
// cells x0..x1 by z0..z1 inclusive. The town is built from three kinds of thing:
//   roads      avenues, a regular grid of streets, diagonals that cut through blocks, a boundary road, the roads out
//   blocks     the 38 by 38 cell plots between the streets, each with a district; the lot planner subdivides these
//   landmarks  named rectangles and circles with a facing: the compound, the Town Hall, the arena, the gates...

export const TEMPEST_CENTER_X = 3 * MILE;
export const TEMPEST_CENTER_Z = 0;
/** The zone's footprint (worldgen/zones/ZoneInfo.ts): a circle of this radius about the centre. */
export const TEMPEST_RADIUS = 700;
/** Inside this radius the zone is exactly what the zone code builds; beyond it the ground blends into the wilderness. */
export const TEMPEST_CORE = 550;
/** The ground height of the town (zones/TempestZone.ts). */
export const TEMPEST_GROUND = 8;

export interface Rect { x0: number; z0: number; x1: number; z1: number }
export type Facing = 0 | 1 | 2 | 3; // the way the front looks: north, east, south, west

/** A point or rectangle of the picture's local frame, as world coordinates. */
export const worldX = (lx: number): number => TEMPEST_CENTER_X + lx;
export const worldZ = (lz: number): number => TEMPEST_CENTER_Z + lz;
export const localX = (x: number): number => x - TEMPEST_CENTER_X;
export const localZ = (z: number): number => z - TEMPEST_CENTER_Z;

const R = (lx0: number, lz0: number, lx1: number, lz1: number): Rect => ({ x0: worldX(lx0), z0: worldZ(lz0), x1: worldX(lx1), z1: worldZ(lz1) });
const inRect = (r: Rect, x: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

// --- The grid -------------------------------------------------------------------------------------------------------
// Measured from the plan: an avenue 11 cells wide each way through the Central Square, then blocks 38 cells square
// separated by streets 6 wide, four blocks out each way (44 cells pitch), so the built town reaches 181 cells from the
// centre: 363 by 363, the plan's "about 380 by 360".

export const AVENUE_HALF = 5;          // cells -5..5: 11 wide
export const BLOCK = 38;
export const STREET = 6;
export const PITCH = BLOCK + STREET;
export const GRID_FIRST = AVENUE_HALF + 1;                   // 6: where the first block starts
export const GRID_REACH = AVENUE_HALF + 4 * PITCH;           // 181: outer edge of the outermost street
export const BLOCKS_OUT = 4;

/** The north and west edge of the road at the outer end of the avenues: their width outside the town, 9 cells (the gates' half width 4.5). */
export const OUTER_ROAD_HALF = 4;

export type District =
  | 'civic' | 'guest' | 'government' | 'public' | 'luxury' | 'commercial' | 'production' | 'storage' | 'residential' | 'tourism';

export type Density = 'dense' | 'normal' | 'sparse' | 'empty';

export interface Block {
  /** `c-2r3` style id: column then row, negative to the west and north. */
  id: string;
  col: number;
  row: number;
  rect: Rect;
  district: District;
  density: Density;
  /** The plan marks these as under construction: scaffolds, foundations, bare plots. */
  underConstruction: boolean;
  /** How big the lots should be: small plots for dense streets, large ones for villas, halls and the tourism sector. */
  lotSize: 'small' | 'medium' | 'large';
  /** Chamfer of each corner (nw, ne, se, sw) in cells: the clipped corners of the plan. The four blocks round the Central Square have 9. */
  corners: [number, number, number, number];
}

/** The district of each block, by [row][col]: rows -4..-1 then 1..4 (north to south), columns -4..-1 then 1..4. See the plan. */
const DISTRICTS: Record<number, Record<number, District>> = {
  [-4]: { [-4]: 'guest', [-3]: 'guest', [-2]: 'government', [-1]: 'government', 1: 'public', 2: 'public', 3: 'public', 4: 'public' },
  [-3]: { [-4]: 'luxury', [-3]: 'luxury', [-2]: 'luxury', [-1]: 'residential', 1: 'residential', 2: 'residential', 3: 'residential', 4: 'residential' },
  [-2]: { [-4]: 'luxury', [-3]: 'residential', [-2]: 'residential', [-1]: 'residential', 1: 'residential', 2: 'residential', 3: 'residential', 4: 'residential' },
  [-1]: { [-4]: 'commercial', [-3]: 'commercial', [-2]: 'commercial', [-1]: 'commercial', 1: 'residential', 2: 'residential', 3: 'residential', 4: 'residential' },
  1: { [-4]: 'commercial', [-3]: 'commercial', [-2]: 'commercial', [-1]: 'commercial', 1: 'tourism', 2: 'tourism', 3: 'tourism', 4: 'tourism' },
  2: { [-4]: 'production', [-3]: 'production', [-2]: 'residential', [-1]: 'residential', 1: 'tourism', 2: 'tourism', 3: 'tourism', 4: 'tourism' },
  3: { [-4]: 'storage', [-3]: 'storage', [-2]: 'residential', [-1]: 'residential', 1: 'tourism', 2: 'tourism', 3: 'tourism', 4: 'tourism' },
  4: { [-4]: 'storage', [-3]: 'storage', [-2]: 'residential', [-1]: 'residential', 1: 'tourism', 2: 'tourism', 3: 'tourism', 4: 'tourism' },
};

/** Blocks the plan marks "under construction" or leaves empty: some of the public strip, the luxury quarter's bare plots, part of the tourism sector. */
const UNDER_CONSTRUCTION = new Set(['c3r-4', 'c4r-4', 'c2r-4', 'c-4r-3', 'c-3r-3', 'c-2r-3', 'c-4r-2', 'c3r3', 'c4r3', 'c3r4', 'c4r4', 'c2r4']);
const EMPTY = new Set(['c-4r-3', 'c-3r-3', 'c-4r-2', 'c4r4', 'c3r4']);

/** Cells where a block starts and ends along one axis: column or row index k (1..4 outwards) on the positive side. */
const span = (k: number): [number, number] => [GRID_FIRST + (k - 1) * PITCH, GRID_FIRST + (k - 1) * PITCH + BLOCK - 1];
const spanSigned = (k: number): [number, number] => {
  const [a, b] = span(Math.abs(k));
  return k > 0 ? [a, b] : [-b, -a];
};

const density = (district: District, empty: boolean): Density =>
  empty ? 'empty' : district === 'residential' || district === 'commercial' ? 'dense' : district === 'production' ? 'normal' : 'sparse';

const lotSizeOf = (district: District): Block['lotSize'] =>
  district === 'residential' || district === 'commercial' || district === 'production' ? 'small'
    : district === 'storage' || district === 'government' ? 'medium' : 'large';

/** The Town Hall's compound: the walled rectangle at the head of the north-south avenue. */
export const COMPOUND: Rect = R(-24, -190, 24, -140);
/** The lanes on its two flanks, joining the north service road to the town's north edge street. */
const LANE_WEST = R(-31, -201, -25, -176);
const LANE_EAST = R(25, -201, 31, -176);

const buildBlocks = (): Block[] => {
  const blocks: Block[] = [];
  for (const row of [-4, -3, -2, -1, 1, 2, 3, 4]) {
    for (const col of [-4, -3, -2, -1, 1, 2, 3, 4]) {
      const [lx0, lx1] = spanSigned(col);
      const [lz0, lz1] = spanSigned(row);
      let rect = R(lx0, lz0, lx1, lz1);
      const id = `c${col}r${row}`;
      // The two blocks beside the compound give up the strip it and its lanes take: they are annexes, 12 cells wide.
      if (row === -4 && col === -1) rect = R(lx0, lz0, -32, lz1);
      if (row === -4 && col === 1) rect = R(32, lz0, lx1, lz1);
      const district = DISTRICTS[row][col];
      const empty = EMPTY.has(id);
      const central = Math.abs(col) === 1 && Math.abs(row) === 1;
      const small = 2;
      // The corner nearest the centre of the four blocks round the square is clipped hard, the rest a little.
      const corners: [number, number, number, number] = [small, small, small, small];
      // The corner nearest the centre (nw, ne, se, sw as 0..3) of the four blocks round the square is clipped hard.
      if (central) corners[col > 0 ? (row > 0 ? 0 : 3) : (row > 0 ? 1 : 2)] = 9;
      blocks.push({
        id, col, row, rect, district, density: density(district, empty), underConstruction: UNDER_CONSTRUCTION.has(id),
        lotSize: lotSizeOf(district), corners,
      });
    }
  }
  return blocks;
};

export const BLOCKS: readonly Block[] = buildBlocks();
const BLOCK_BY_ID = new Map(BLOCKS.map((b) => [b.id, b]));
export const blockById = (id: string): Block | undefined => BLOCK_BY_ID.get(id);

/** True when (x, z) is in the block's rectangle and outside its clipped corners. */
export const inBlock = (b: Block, x: number, z: number): boolean => {
  if (!inRect(b.rect, x, z)) return false;
  const [nw, ne, se, sw] = b.corners;
  const dx0 = x - b.rect.x0, dx1 = b.rect.x1 - x, dz0 = z - b.rect.z0, dz1 = b.rect.z1 - z;
  if (dx0 + dz0 < nw) return false;
  if (dx1 + dz0 < ne) return false;
  if (dx1 + dz1 < se) return false;
  if (dx0 + dz1 < sw) return false;
  return true;
};

// --- Sectors ---------------------------------------------------------------------------------------------------------
// The named sectors of the plan: the blocks that make each, and the rectangle round them. A planner that wants "the
// guest houses" or "the production sector" asks for one of these.

export interface Sector {
  id: string;
  name: string;
  district: District | 'farm' | 'pasture';
  /** Ids of the blocks that make the sector (none for the compound, the farms and the pastures). */
  blocks: readonly string[];
  /** The smallest rectangle holding it. */
  bounds: Rect;
}

const unionBounds = (rects: readonly Rect[]): Rect => ({
  x0: Math.min(...rects.map((r) => r.x0)), z0: Math.min(...rects.map((r) => r.z0)),
  x1: Math.max(...rects.map((r) => r.x1)), z1: Math.max(...rects.map((r) => r.z1)),
});

const sectorOf = (id: string, name: string, district: Sector['district'], ids: readonly string[]): Sector => ({
  id, name, district, blocks: ids, bounds: unionBounds(ids.map((b) => BLOCK_BY_ID.get(b)!.rect)),
});

const idsWhere = (test: (b: Block) => boolean): string[] => BLOCKS.filter(test).map((b) => b.id);

export const SECTORS: readonly Sector[] = [
  { id: 'civic-compound', name: 'Civic compound', district: 'civic', blocks: [], bounds: COMPOUND },
  sectorOf('guest-houses', 'Guest houses', 'guest', idsWhere((b) => b.district === 'guest')),
  sectorOf('government-residences', 'Government residences', 'government', idsWhere((b) => b.district === 'government')),
  sectorOf('public-facilities', 'Public facilities strip', 'public', idsWhere((b) => b.district === 'public')),
  sectorOf('luxury-villas', 'Luxury residential sector', 'luxury', idsWhere((b) => b.district === 'luxury')),
  sectorOf('commercial', 'Commercial sector', 'commercial', idsWhere((b) => b.district === 'commercial')),
  sectorOf('production', 'Production sector', 'production', idsWhere((b) => b.district === 'production')),
  sectorOf('storage', 'Storage sector', 'storage', idsWhere((b) => b.district === 'storage')),
  sectorOf('residences-north-west', 'Residences, north west', 'residential', idsWhere((b) => b.district === 'residential' && b.col < 0 && b.row < 0)),
  sectorOf('residences-north-east', 'Residences, centre east', 'residential', idsWhere((b) => b.district === 'residential' && b.col > 0 && b.row < 0)),
  sectorOf('residences-south-west', 'Residences, south west', 'residential', idsWhere((b) => b.district === 'residential' && b.row > 0)),
  sectorOf('tourism', 'Tourism and entertainment sector', 'tourism', idsWhere((b) => b.district === 'tourism')),
];

/** The sector a block belongs to. Every block belongs to exactly one. */
export const sectorOfBlock = (b: Block): Sector => SECTORS.find((s) => s.blocks.includes(b.id))!;

// --- Roads ----------------------------------------------------------------------------------------------------------

export type RoadKind = 'avenue' | 'street' | 'boundary' | 'diagonal' | 'road' | 'lane' | 'link';

export interface RoadSegment {
  id: string;
  kind: RoadKind;
  /** Width in cells (across the road). */
  width: number;
  /** Axis-aligned roads are rectangles; diagonals are a centreline between two points (cells) with the width across it. */
  rect?: Rect;
  line?: { x0: number; z0: number; x1: number; z1: number };
}

const DIAG_HALF = 2.5;

const buildRoads = (): RoadSegment[] => {
  const roads: RoadSegment[] = [];
  const add = (r: RoadSegment): void => { roads.push(r); };
  // The two avenues through the Central Square, 11 wide, to the edge of the town. The north one ends at the compound's gate.
  add({ id: 'avenue-ns-south', kind: 'avenue', width: 11, rect: R(-5, 0, 5, GRID_REACH) });
  add({ id: 'avenue-ns-north', kind: 'avenue', width: 11, rect: R(-5, -139, 5, -1) });
  add({ id: 'avenue-ew-west', kind: 'avenue', width: 11, rect: R(-GRID_REACH, -5, -1, 5) });
  add({ id: 'avenue-ew-east', kind: 'avenue', width: 11, rect: R(0, -5, GRID_REACH, 5) });
  // The grid streets, 6 wide, between the blocks and round the edge.
  for (let k = 1; k <= 4; k++) {
    const [a] = span(k);
    const lo = a + BLOCK;            // the street after block k
    const hi = lo + STREET - 1;
    for (const s of [1, -1]) {
      const [x0, x1] = s > 0 ? [lo, hi] : [-hi, -lo];
      // North-south streets run the town's whole depth except where the compound stands; east-west ones its width.
      add({ id: `street-ns-${s > 0 ? 'e' : 'w'}${k}`, kind: 'street', width: STREET, rect: R(x0, -GRID_REACH, x1, GRID_REACH) });
      add({ id: `street-ew-${s > 0 ? 's' : 'n'}${k}`, kind: 'street', width: STREET, rect: R(-GRID_REACH, x0, GRID_REACH, x1) });
    }
  }
  // The compound's lanes and the service road behind it, where the north road arrives.
  add({ id: 'lane-compound-west', kind: 'lane', width: 7, rect: LANE_WEST });
  add({ id: 'lane-compound-east', kind: 'lane', width: 7, rect: LANE_EAST });
  add({ id: 'north-service', kind: 'lane', width: 7, rect: R(-31, -201, 31, -195) });
  // The boundary road along the east edge of the grid, lined with lamp posts and small stalls.
  add({ id: 'boundary-east', kind: 'boundary', width: 7, rect: R(183, -GRID_REACH, 189, GRID_REACH) });
  // The roads out, 9 wide (the RoadNetwork's gates are 4.5 half width): west and east along the avenue, north and south along it.
  add({ id: 'road-west', kind: 'road', width: 9, rect: R(-TEMPEST_CORE - 50, -OUTER_ROAD_HALF, -GRID_REACH - 1, OUTER_ROAD_HALF) });
  add({ id: 'road-east', kind: 'road', width: 9, rect: R(GRID_REACH + 1, -OUTER_ROAD_HALF, TEMPEST_RADIUS, OUTER_ROAD_HALF) });
  add({ id: 'road-south', kind: 'road', width: 9, rect: R(-OUTER_ROAD_HALF, GRID_REACH + 1, OUTER_ROAD_HALF, TEMPEST_RADIUS) });
  add({ id: 'road-north', kind: 'road', width: 9, rect: R(-OUTER_ROAD_HALF, -TEMPEST_CORE - 50, OUTER_ROAD_HALF, -202) });
  // A link from the north end of the boundary road to the arena clearing.
  add({ id: 'arena-road', kind: 'link', width: 7, rect: R(181, -214, 187, -182) });
  // The diagonals, 5 wide, each cutting the blocks it crosses corner to corner. Two parallel ones in the north west quadrant,
  // from the south west to the north east; the north east's one runs north west to south east in four pieces, one per block.
  add({ id: 'diag-nw-a', kind: 'diagonal', width: 5, line: { x0: worldX(-176), z0: worldZ(-5), x1: worldX(-28), z1: worldZ(-153) } });
  add({ id: 'diag-nw-b', kind: 'diagonal', width: 5, line: { x0: worldX(-131), z0: worldZ(-6), x1: worldX(-6), z1: worldZ(-131) } });
  add({ id: 'diag-ne', kind: 'diagonal', width: 5, line: { x0: worldX(28), z0: worldZ(-153), x1: worldX(176), z1: worldZ(-5) } });
  return roads;
};

export const ROADS: readonly RoadSegment[] = buildRoads();

const onSegment = (r: RoadSegment, x: number, z: number): boolean => {
  if (r.rect) return inRect(r.rect, x, z);
  const l = r.line!;
  const dx = l.x1 - l.x0;
  const dz = l.z1 - l.z0;
  const len2 = dx * dx + dz * dz;
  const t = ((x - l.x0) * dx + (z - l.z0) * dz) / len2;
  if (t < 0 || t > 1) return false;
  const px = l.x0 + dx * t - x;
  const pz = l.z0 + dz * t - z;
  return px * px + pz * pz <= DIAG_HALF * DIAG_HALF;
};

/** The road covering the cell, or null. Nothing runs through the compound: the grid streets stop at its walls. */
export const roadAt = (x: number, z: number): RoadSegment | null => {
  if (inRect(COMPOUND, x, z)) return null;
  for (const r of ROADS) if (onSegment(r, x, z)) return r;
  return null;
};

// --- Landmarks ------------------------------------------------------------------------------------------------------

export type Shape =
  | { kind: 'rect'; x0: number; z0: number; x1: number; z1: number }
  | { kind: 'circle'; cx: number; cz: number; r: number };

export interface Landmark {
  id: string;
  /** Generic name: the picture's canon names are not used. */
  name: string;
  kind: string;
  shape: Shape;
  /** The side the front or entrance looks, null for something with none (a plaza, a pond). */
  facing: Facing | null;
  /** The landmark this one stands inside (the Town Hall in the compound); such landmarks may overlap their parent. */
  parent?: string;
  /** Stands on or across a road (a gate, the bridge): allowed to overlap one. */
  onRoad?: boolean;
  /** A set piece the plan lists as optional. */
  optional?: boolean;
  district?: District | 'farm' | 'pasture' | 'wild';
  notes?: string;
}

const rectShape = (lx0: number, lz0: number, lx1: number, lz1: number): Shape => ({ kind: 'rect', ...R(lx0, lz0, lx1, lz1) });
const circleShape = (lx: number, lz: number, r: number): Shape => ({ kind: 'circle', cx: worldX(lx), cz: worldZ(lz), r });

export const LANDMARKS: readonly Landmark[] = [
  { id: 'central-square', name: 'Central Square', kind: 'roundabout', shape: circleShape(0, 0, 7), facing: null, onRoad: true,
    notes: 'A circular roundabout with a fountain at its middle (radius 2.5), fan paving, bollards at the arms of the avenues.' },
  { id: 'civic-compound', name: 'Civic compound', kind: 'compound', shape: { kind: 'rect', ...COMPOUND }, facing: 2, district: 'civic',
    notes: 'A walled rectangle 49 by 51 at the head of the avenue, gate in the middle of its south wall.' },
  { id: 'town-hall', name: 'Town Hall', kind: 'hall', shape: rectShape(-15, -182, 15, -158), facing: 2, parent: 'civic-compound', district: 'civic',
    notes: 'White neoclassical hall, teal hip roof, pediment gables, behind the forecourt.' },
  { id: 'town-hall-forecourt', name: 'Town Hall forecourt', kind: 'plaza', shape: rectShape(-22, -156, 22, -141), facing: 2, parent: 'civic-compound', district: 'civic',
    notes: 'The wide stone plaza of the pictures: fan paving, a bollard line along the south wall, steps up to the hall.' },
  { id: 'compound-lodge', name: 'Compound lodge', kind: 'hut', shape: rectShape(15, -189, 21, -184), facing: 2, parent: 'civic-compound', district: 'civic',
    notes: 'The small hut at the compound\'s north east corner.' },
  { id: 'west-gate', name: 'West gate', kind: 'gate', shape: rectShape(-190, -9, -184, 9), facing: 3, onRoad: true,
    notes: 'The gatehouse at the west end of the avenue; the road beyond runs to the RoadNetwork gate at world x 900.' },
  { id: 'north-gate', name: 'North gate', kind: 'gate', shape: rectShape(-9, -212, 9, -206), facing: 0, onRoad: true,
    notes: 'A gate on the north road behind the compound; the road beyond runs to the RoadNetwork gate at world z -600.' },
  { id: 'east-gatehouse', name: 'East gatehouse', kind: 'gate', shape: rectShape(192, -9, 198, 9), facing: 1, onRoad: true,
    notes: 'A modest gatehouse over the plain road east, which fades out into the wilderness.' },
  { id: 'south-gatehouse', name: 'South gatehouse', kind: 'gate', shape: rectShape(-9, 184, 9, 190), facing: 2, onRoad: true,
    notes: 'A modest gatehouse over the plain road south.' },
  { id: 'west-stalls-north', name: 'West stalls, north side', kind: 'stalls', shape: rectShape(-198, -33, -191, -9), facing: 1, district: 'pasture',
    notes: 'A row of small stalls and stables flanking the west gate road.' },
  { id: 'west-stalls-south', name: 'West stalls, south side', kind: 'stalls', shape: rectShape(-198, 9, -191, 33), facing: 1, district: 'pasture' },
  { id: 'horse-pasture', name: 'Horse pasture', kind: 'pasture', shape: circleShape(-228, 64, 34), facing: null, district: 'pasture', notes: 'Fenced.' },
  { id: 'paddock', name: 'Paddock', kind: 'pasture', shape: circleShape(-228, -56, 28), facing: null, district: 'pasture', notes: 'A second fenced paddock.' },
  { id: 'arena', name: 'Arena', kind: 'arena', shape: circleShape(176, -250, 34), facing: 2, district: 'wild',
    notes: 'The circular arena with training grounds, in a clearing north east of the town; its gate looks south, on the arena road.' },
  { id: 'arena-guard-hut', name: 'Guard hut', kind: 'hut', shape: rectShape(134, -243, 139, -238), facing: 2, district: 'wild' },
  { id: 'north-cave', name: 'Sealed cave', kind: 'portal', shape: circleShape(-34, -642, 9), facing: 1, district: 'wild',
    notes: 'A decorated, sealed stone portal in a rock face beside the north road, in the blend band of the zone.' },
  { id: 'cave-pools', name: 'Cave pools', kind: 'pools', shape: circleShape(-64, -622, 16), facing: null, optional: true, district: 'wild',
    notes: 'Optional: terraced pools with glowing water below the cave.' },
  { id: 'south-cairn', name: 'Memorial cairn', kind: 'cairn', shape: circleShape(66, 210, 12), facing: 3, district: 'wild',
    notes: 'A small cairn on a grassy hill beside the south road.' },
  { id: 'east-bridge', name: 'East bridge', kind: 'bridge', shape: rectShape(326, -6, 348, 6), facing: 1, onRoad: true,
    notes: 'The arched bridge where the east road crosses the river.' },
  { id: 'pond-east', name: 'Pond (east)', kind: 'pond', shape: circleShape(199, -38, 8), facing: null, district: 'farm' },
  { id: 'pond-southeast', name: 'Pond (south east)', kind: 'pond', shape: circleShape(214, 148, 11), facing: null, district: 'farm' },
  { id: 'aqueduct', name: 'Aqueduct', kind: 'aqueduct', shape: rectShape(-176, -226, -80, -218), facing: 1, optional: true, district: 'wild',
    notes: 'Optional: an arched aqueduct 96 long running east to west north of the guest houses.' },
  { id: 'lumber-clearing', name: 'Lumber clearing', kind: 'clearing', shape: circleShape(-262, -196, 30), facing: null, optional: true, district: 'wild',
    notes: 'Optional: a clearing in the forest with felled logs and stumps.' },
];

const LANDMARK_BY_ID = new Map(LANDMARKS.map((l) => [l.id, l]));
export const landmarkById = (id: string): Landmark | undefined => LANDMARK_BY_ID.get(id);

export const inShape = (s: Shape, x: number, z: number): boolean => {
  if (s.kind === 'rect') return x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1;
  const dx = x - s.cx;
  const dz = z - s.cz;
  return dx * dx + dz * dz <= s.r * s.r;
};

/** The shape's bounding rectangle. */
export const shapeBounds = (s: Shape): Rect =>
  s.kind === 'rect' ? { x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1 } : { x0: Math.floor(s.cx - s.r), z0: Math.floor(s.cz - s.r), x1: Math.ceil(s.cx + s.r), z1: Math.ceil(s.cz + s.r) };

/** The smallest landmark containing the cell: a child before its parent. */
export const landmarkAt = (x: number, z: number): Landmark | null => {
  let found: Landmark | null = null;
  for (const l of LANDMARKS) {
    if (!inShape(l.shape, x, z)) continue;
    // A child wins over its parent.
    if (!found || (l.parent && l.parent === found.id)) found = l;
  }
  return found;
};

// --- The land beyond the grid -----------------------------------------------------------------------------------------

/** Farmland east of the boundary road and the horse pastures to the west, as the plan has them. */
export const FARMS_EAST: Rect = R(191, -GRID_REACH - 60, 330, GRID_REACH + 60);

/**
 * The curved, radial field pattern of the farms: rings of 26 cells about the town's centre and sectors of 3 degrees,
 * from the boundary road to the river. Returns the field's ring and sector, or null outside the farmland.
 */
export const farmField = (x: number, z: number): { ring: number; sector: number } | null => {
  const lx = localX(x);
  const lz = localZ(z);
  if (!inRect(FARMS_EAST, x, z)) return null;
  const d = Math.hypot(lx, lz);
  if (d < 191) return null;
  const angle = Math.atan2(lz, lx); // 0 east, positive towards the south
  if (Math.abs(angle) > (80 * Math.PI) / 180) return null;
  return { ring: Math.floor((d - 191) / 26), sector: Math.floor(angle / ((3 * Math.PI) / 180)) };
};

/** The river down the east side, as a centre-line of local points (cell units), with its width in cells. */
export const RIVER = {
  width: 7,
  path: [
    [140, -430], [185, -330], [226, -255], [262, -205], [305, -135], [333, -50], [340, 0], [334, 70], [318, 150], [290, 230], [245, 320], [180, 420],
  ].map(([lx, lz]) => ({ x: worldX(lx), z: worldZ(lz) })),
} as const;

/** Distance in cells from a point to the river's centre-line. */
export const riverDistance = (x: number, z: number): number => {
  let best = Infinity;
  for (let i = 0; i + 1 < RIVER.path.length; i++) {
    const a = RIVER.path[i];
    const b = RIVER.path[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
    if (d < best) best = d;
  }
  return best;
};

/**
 * Radius of the cleared land round the town at an angle: the forest hugs the edge of the farms and pastures with an
 * irregular outline, 270 to 340 cells from the centre. Clearings (the arena's, the lumber one, the cave's) are holes in it.
 */
export const openLandRadius = (angle: number): number =>
  305 + 26 * Math.sin(2 * angle + 0.7) + 17 * Math.sin(5 * angle + 2.1) + 9 * Math.sin(11 * angle + 0.3);

export const isClearing = (x: number, z: number): boolean => {
  for (const l of LANDMARKS) {
    if (l.kind === 'arena' && inShape({ kind: 'circle', cx: (l.shape as { cx: number }).cx, cz: (l.shape as { cz: number }).cz, r: 46 }, x, z)) return true;
    if (l.kind === 'clearing' && inShape(l.shape, x, z)) return true;
    if (l.kind === 'portal' && inShape({ kind: 'circle', cx: (l.shape as { cx: number }).cx, cz: (l.shape as { cz: number }).cz, r: 22 }, x, z)) return true;
  }
  return false;
};

/** True where the forest stands: beyond the cleared land, outside the clearings, not on a road. */
export const isWooded = (x: number, z: number): boolean => {
  const lx = localX(x);
  const lz = localZ(z);
  const d = Math.hypot(lx, lz);
  if (d < 140) return false;
  if (Math.abs(lx) <= GRID_REACH + 12 && Math.abs(lz) <= GRID_REACH + 12) return false;
  if (d <= openLandRadius(Math.atan2(lz, lx))) return false;
  if (isClearing(x, z)) return false;
  return roadAt(x, z) === null;
};

// --- Lookups --------------------------------------------------------------------------------------------------------

/** The block containing the cell, or null on a street, in the compound or outside the grid. Constant time. */
export const blockAt = (x: number, z: number): Block | null => {
  const lx = localX(x);
  const lz = localZ(z);
  const ax = Math.abs(lx);
  const az = Math.abs(lz);
  if (ax < GRID_FIRST || az < GRID_FIRST || ax > GRID_REACH || az > GRID_REACH) return null;
  const kx = Math.floor((ax - GRID_FIRST) / PITCH);
  const kz = Math.floor((az - GRID_FIRST) / PITCH);
  if ((ax - GRID_FIRST) % PITCH >= BLOCK || (az - GRID_FIRST) % PITCH >= BLOCK) return null;
  if (kx > 3 || kz > 3) return null;
  const col = (lx < 0 ? -1 : 1) * (kx + 1);
  const row = (lz < 0 ? -1 : 1) * (kz + 1);
  const b = BLOCK_BY_ID.get(`c${col}r${row}`);
  return b && inBlock(b, x, z) ? b : null;
};

export type TempestDistrict = District | 'farm' | 'pasture' | 'forest' | 'wild' | 'open';

/** What the cell is for: its block's district, the landmark's, farmland, pasture, forest or open land. Roads have none. */
export const districtAt = (x: number, z: number): TempestDistrict => {
  const b = blockAt(x, z);
  if (b) return b.district;
  if (inRect(COMPOUND, x, z)) return 'civic';
  const l = landmarkAt(x, z);
  if (l?.district) return l.district;
  if (farmField(x, z)) return 'farm';
  if (isWooded(x, z)) return 'forest';
  return 'open';
};

// --- Gates ----------------------------------------------------------------------------------------------------------

/**
 * Where the two roads of the RoadNetwork meet the town: these are exactly the gates in worldgen/roads/layout.ts, and the
 * avenues are laid to them (9 cells wide, centred on the line z = 0 and x = 1500). Between the grid and the gate the road is
 * a straight 9 wide strip (`road-west`, `road-north`).
 */
export const ROAD_GATES = {
  west: { x: GATES.tempestWest.x, z: GATES.tempestWest.z, dx: GATES.tempestWest.dx, dz: GATES.tempestWest.dz, half: GATES.tempestWest.half },
  north: { x: GATES.tempestNorth.x, z: GATES.tempestNorth.z, dx: GATES.tempestNorth.dx, dz: GATES.tempestNorth.dz, half: GATES.tempestNorth.half },
} as const;
