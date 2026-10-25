import { TempestBlock as T } from '../../content/blocksTempest';
import { AIR_CELL, Cell, cellId, packCell } from '../../engine/cell';
import { AtmosphereSettings, LodLevel, Zone } from '../../zones/Zone';
import { BlockType } from '../../worldConstants';
import { Rng, hash2 } from '../noise';
import { Blueprint, Bounds, NO_CELL, Placement } from '../structures/Blueprint';
import { BoxHouseKit } from '../structures/BoxHouseKit';
import { BuildingKit, buildWithKit } from '../structures/BuildingKit';
import { KitRegistry } from '../structures/KitRegistry';
import { Lot } from '../structures/Lot';
import { StylePack } from '../structures/StylePack';
import { Countryside, Decor, FOREST_REACH, ForestTree, newDecor } from './countryside';
import { DistrictPlanner, PlannedLandmark, PlannedLot, PlannedProp } from './DistrictPlanner';
import { createFillerKits } from './fillers';
import { createTempestCityKits } from './cityKits';
import {
  Block, COMPOUND, LANDMARKS, TEMPEST_CENTER_X, TEMPEST_CENTER_Z, TEMPEST_GROUND, TEMPEST_RADIUS, inBlock, landmarkById, localX, localZ,
} from './layout';
import { LandmarkRegistry, LandmarkSpec, LANDMARK_SEED, createTempestLandmarks, frameSize, landmarkLot, placeBlueprint } from './landmarks';
import { Lru } from './lru';
import { apronBollard, apronCell, islandBollard, kerbBollard, ringZone, wedgeOf } from './roundabout';
import { roadBlock } from './streets';
import { TEMPEST_STYLE } from './style';
import { TempestTerrain, POND_WATER_Y } from './terrain';
import { TreeKind, TreeShape, VARIANTS, columnKey, forestTree, smallTree } from './trees';
import { BuildingChoice, Plan, chooseBuildings } from './variety';

// The Federation of Tempest as one zone: the district planner's streets and lots, the kits' buildings, the river, the
// farms, the pastures and the forest, answered a cell at a time. It extends the legacy `Zone` so it can stand where
// `TempestZone` stands today (the integration step swaps it in), but its natural question is `getCell`, because most of
// what it builds has a state (stairs, ridge caps, awnings), and `getBlock` is only that cell's id.
//
// A cell is decided in this order: a landmark's blueprint, then the blueprint of the lot the column is in, then the
// things that stand on the ground (lamp posts, trees, crops, fences), then the surface itself (street paving, grass, sand).
// Blueprints are built lazily, one per lot, in a bounded LRU cache; a lot's blueprint depends only on the seed and the lot,
// so every chunk that touches the lot builds the same building and a forgotten one is simply built again.

const FOREST_RADIUS = 200;
const CACHE_LOTS = 256;
const MAX_PROPS = 96;

export interface TempestCityOptions {
  /** The world seed: the lots, the buildings and the countryside all come from it. Default WORLD_SEED. */
  seed?: number;
  /** The kits for the building lots. Default `createTempestCityKits()`, the district kits. A kit named after a landmark's layout id builds that landmark. */
  kits?: KitRegistry;
  /**
   * The hand-built landmarks (compound and Town Hall, arena, gates, cave, cairn, bridge...) the zone stamps on the layout's places,
   * and the free set pieces it stands on the plan's lots. Default `createTempestLandmarks()`; `null` leaves the landmarks to the
   * kits registry (and the placeholder bridge), which is how the zone tests isolate the planner.
   */
  landmarks?: LandmarkRegistry | null;
  style?: StylePack;
  /** Blueprints kept at once (default 256). Only memory and time depend on it, never the world. */
  lotCache?: number;
}

/** What a column asks of a building: the cell at a world position, and how high it reaches. A `Placement` is one. */
interface Stand {
  cellAt(wx: number, wy: number, wz: number): number;
  bounds(): Bounds | null;
}

// A placement with a hole in it: the surround of a free set piece (a park) has nothing inside the piece's own footprint.
class MaskedStand implements Stand {
  constructor(private readonly base: Placement, private readonly x0: number, private readonly z0: number, private readonly x1: number, private readonly z1: number) {}
  cellAt(wx: number, wy: number, wz: number): number {
    return wx >= this.x0 && wx <= this.x1 && wz >= this.z0 && wz <= this.z1 ? NO_CELL : this.base.cellAt(wx, wy, wz);
  }
  bounds(): Bounds | null { return this.base.bounds(); }
}

interface ColumnCache {
  valid: boolean;
  x: number; z: number; ground: number; high: boolean;
  surface: Cell;
  maxY: number;
  placements: Stand[];
  nProps: number;
  propY: Int32Array;
  propCell: Uint16Array;
}

const DX = [0, 1, 0, -1];
const DZ = [-1, 0, 1, 0];
const PAVED_VERGE = new Set(['commercial', 'public', 'tourism', 'government', 'production', 'civic']);

const forecourt = LANDMARKS.find((l) => l.id === 'town-hall-forecourt')!.shape as { x0: number; z0: number; x1: number; z1: number };
const SQUARE = landmarkById('central-square')!.shape as { cx: number; cz: number; r: number };

export class TempestCityZone extends Zone {
  name = 'Federation of Tempest';
  readonly centerX = TEMPEST_CENTER_X;
  readonly centerZ = TEMPEST_CENTER_Z;
  readonly seed: number;
  readonly terrain: TempestTerrain;
  readonly planner: DistrictPlanner;
  readonly style: StylePack;
  readonly kits: KitRegistry;
  /** Which kit and variant stands on each building lot (`variety.ts`), by the lot's index in the planner. */
  readonly plan: Plan;
  private readonly fillers = createFillerKits();
  private readonly fallbackKit: BuildingKit = new BoxHouseKit();
  private readonly countryside: Countryside;
  private readonly lotCache: Lru<number, Placement | null>;
  private readonly landmarkKits: Array<{ planned: PlannedLandmark; kit: BuildingKit }> = [];
  private readonly landmarkCache = new Map<number, Placement | null>();
  // The hand-built landmarks: one entry per spec (the compound covers the Town Hall, the forecourt and the lodge), with the rectangle to test a column against.
  private readonly specLandmarks: Array<{ spec: LandmarkSpec; x0: number; z0: number; x1: number; z1: number; groundY: number; index: number }> = [];
  private readonly specCache = new Map<number, Placement | null>();
  private readonly freePieces = new Map<string, LandmarkSpec>();
  private readonly pieceCache = new Map<number, Stand[]>();
  private readonly propCache = new Map<number, Placement | null>();
  private readonly col: ColumnCache = {
    valid: false, x: 0, z: 0, ground: 0, high: true, surface: 0, maxY: 0, placements: [], nProps: 0,
    propY: new Int32Array(MAX_PROPS), propCell: new Uint16Array(MAX_PROPS),
  };
  private readonly decor: Decor = newDecor();
  private readonly forestList: ForestTree[] = [];

  constructor(options: TempestCityOptions = {}) {
    super();
    this.seed = (options.seed ?? 20251122) | 0;
    this.style = options.style ?? TEMPEST_STYLE;
    this.kits = options.kits ?? createTempestCityKits(this.style);
    this.lotCache = new Lru(options.lotCache ?? CACHE_LOTS);
    this.terrain = new TempestTerrain(this.seed);
    this.planner = new DistrictPlanner({ seed: this.seed, style: this.style, groundAt: (x, z) => this.terrain.ground(x, z) });
    this.countryside = new Countryside(this.seed, this.terrain);
    this.plan = chooseBuildings(this.planner, this.kits);
    // A landmark is built by the kit registered under its layout id, else by the hand-built spec that covers it (the compound covers
    // the Town Hall), else by nothing, except the east bridge, which has a placeholder.
    const landmarks = options.landmarks === undefined ? createTempestLandmarks() : options.landmarks;
    const seen = new Set<string>();
    for (const planned of this.planner.landmarkLots) {
      const id = planned.landmark.id;
      const kit = this.kits.get(id);
      const spec = kit || !landmarks ? undefined : landmarks.covering(id) ?? landmarks.get(id);
      if (kit) this.landmarkKits.push({ planned, kit });
      else if (spec && !spec.free && !spec.partOf) {
        if (seen.has(spec.id)) continue;
        seen.add(spec.id);
        const own = this.planner.landmarkLots.find((l) => l.landmark.id === spec.id) ?? planned;
        const f = spec.footprint;
        this.specLandmarks.push({ spec, x0: f.x0, z0: f.z0, x1: f.x1, z1: f.z1, groundY: own.lot.groundY, index: this.specLandmarks.length });
      } else if (!spec && id === 'east-bridge') this.landmarkKits.push({ planned, kit: this.fillers.get('placeholder-bridge')! });
    }
    if (landmarks) for (const spec of landmarks.specs) if (spec.free) this.freePieces.set(spec.id, spec);
  }

  // --- Zone ------------------------------------------------------------------------------------------------------------

  isInside(x: number, z: number): boolean {
    const dx = x - this.centerX;
    const dz = z - this.centerZ;
    return Math.sqrt(dx * dx + dz * dz) < TEMPEST_RADIUS;
  }

  // Lush and green like the old Tempest, a little warmer: more gold in the fog and the sky.
  getAtmosphere(): AtmosphereSettings {
    return { fogColor: '#b5d89e', skyTint: '#f1f6e0', fogDensity: 0.02 };
  }

  getHeight(x: number, z: number, baseH: number): number {
    return this.terrain.height(x, z, baseH);
  }

  /** The id of the cell: what the legacy zone interface can say. Use `getCell` where the state matters (stairs, ridges, awnings). */
  getBlock(x: number, y: number, z: number, groundH: number, lod: LodLevel): BlockType {
    return cellId(this.getCell(x, y, z, groundH, lod));
  }

  /** The cell (block id and state) at a world position; `groundH` is this column's ground row, as getHeight gives it, floored. */
  getCell(x: number, y: number, z: number, groundH: number, lod: LodLevel = LodLevel.HIGH): Cell {
    if (y < groundH) return AIR_CELL;
    const c = this.column(x, z, groundH, lod !== LodLevel.LOW);
    if (y > c.maxY) return AIR_CELL;
    for (let i = c.placements.length - 1; i >= 0; i--) {
      const cell = c.placements[i].cellAt(x, y, z);
      if (cell !== NO_CELL) return cell;
    }
    for (let i = 0; i < c.nProps; i++) if (c.propY[i] === y) return c.propCell[i];
    return y === groundH ? c.surface : AIR_CELL;
  }

  /** The ground row of a column (what the generator would floor `getHeight` to). */
  groundAt(x: number, z: number): number {
    return this.terrain.ground(x, z);
  }

  /** Convenience for tests and tools: the cell at (x, y, z), with the column's ground looked up. */
  sample(x: number, y: number, z: number): Cell {
    return this.getCell(x, y, z, this.terrain.ground(x, z));
  }

  // --- Lots and landmarks ----------------------------------------------------------------------------------------------

  /** The building chosen for a building lot (the kit, its variant and the lot it stands on), or undefined for any other kind of lot. */
  choiceOf(p: PlannedLot): BuildingChoice | undefined {
    return p.kind === 'building' ? this.plan.get(p.index) : undefined;
  }

  /** The kit that builds a planned lot. */
  kitFor(p: PlannedLot): BuildingKit {
    if (p.kind === 'building') return this.choiceOf(p)?.kit ?? this.fallbackKit;
    const name = p.kind === 'garden' ? 'garden-lot' : p.kind === 'park' ? 'park-lot' : p.kind === 'meadow' ? 'meadow-lot' : 'construction-site';
    return this.kits.get(name) ?? this.fillers.get(name)!;
  }

  /** The blueprint of a lot, built the standard way and with its trees grown, standing on the lot: cached. */
  lotPlacement(p: PlannedLot): Placement | null {
    let pl = this.lotCache.get(p.index);
    if (pl === undefined) {
      const choice = this.choiceOf(p);
      pl = this.place(choice?.lot ?? p.lot, this.kitFor(p), true, choice?.variant);
      this.lotCache.set(p.index, pl);
    }
    return pl;
  }

  /** What stands on a lot, bottom to top: the lot's kit, and on the plan's three set piece lots the piece itself over a park. */
  private lotStands(p: PlannedLot): Stand[] {
    const spec = p.piece ? this.freePieces.get(p.piece) : undefined;
    // A building lot bigger than any kit of its district takes is built on part of it, with a lawn round.
    const choice = this.choiceOf(p);
    const fitted = !spec && choice?.fitted ? choice : null;
    if (!spec && !fitted) {
      const pl = this.lotPlacement(p);
      return pl ? [pl] : [];
    }
    let stands = this.pieceCache.get(p.index);
    if (!stands) {
      stands = spec ? this.pieceStands(p, spec) : this.fittedStands(p, fitted!.kit, fitted!.lot, fitted!.variant);
      this.pieceCache.set(p.index, stands);
    }
    return stands;
  }

  // The lot's whole rectangle is a lawn (the park kit) with a hole where the building or piece stands.
  private lawnWithHole(lot: Lot, hole: Lot): Stand[] {
    const park = this.place(lot, this.kits.get('park-lot') ?? this.fillers.get('park-lot')!);
    return park ? [new MaskedStand(park, hole.x, hole.z, hole.x + hole.w - 1, hole.z + hole.d - 1)] : [];
  }

  private fittedStands(p: PlannedLot, kit: BuildingKit, sub: Lot, variant: number): Stand[] {
    const out = this.lawnWithHole(p.lot, sub);
    const pl = this.place(sub, kit, true, variant);
    if (pl) out.push(pl);
    return out;
  }

  // A free set piece stands in the middle of its lot, on a lawn: the park kit fills the lot (a hole in the piece's footprint) and
  // the piece is drawn into the hole. A lot too small for it keeps the kit's own building.
  private pieceStands(p: PlannedLot, spec: LandmarkSpec): Stand[] {
    const lot = p.lot;
    const { frontage, depth } = frameSize(spec);
    if (lot.frontage < frontage || lot.depth < depth) {
      const pl = this.lotPlacement({ ...p, piece: undefined });
      return pl ? [pl] : [];
    }
    const along = lot.facing === 0 || lot.facing === 2;
    const w = along ? frontage : depth;
    const d = along ? depth : frontage;
    const x = lot.x + ((lot.w - w) >> 1);
    const z = lot.z + ((lot.d - d) >> 1);
    const sub = new Lot({ id: `${lot.id}.${spec.id}`, x, z, w, d, facing: lot.facing, district: lot.district, seed: lot.seed, floors: lot.floors, groundY: lot.groundY });
    const out = this.lawnWithHole(lot, sub);
    try {
      const bp = spec.build(this.style, landmarkRngFor(spec, this.seed));
      growMarkedTrees(bp, sub);
      out.push(sub.place(bp));
    } catch { /* a piece that throws leaves its lawn */ }
    return out;
  }

  private specPlacement(entry: { spec: LandmarkSpec; groundY: number; index: number }): Placement | null {
    let pl = this.specCache.get(entry.index);
    if (pl === undefined) {
      try {
        const bp = entry.spec.build(this.style, landmarkRngFor(entry.spec, this.seed));
        const lot = landmarkLot(entry.spec, entry.groundY);
        growMarkedTrees(bp, lot);
        pl = placeBlueprint(entry.spec, bp, entry.groundY);
      } catch {
        pl = null;
      }
      this.specCache.set(entry.index, pl);
    }
    return pl;
  }

  private landmarkPlacement(index: number, planned: PlannedLandmark, kit: BuildingKit): Placement | null {
    let pl = this.landmarkCache.get(index);
    if (pl === undefined) {
      pl = this.place(planned.lot, kit, false);
      this.landmarkCache.set(index, pl);
    }
    return pl;
  }

  private propPlacement(p: PlannedProp): Placement | null {
    let pl = this.propCache.get(p.index);
    if (pl === undefined) {
      const kit = this.kits.get(p.kit) ?? this.fillers.get(p.kit);
      pl = kit ? this.place(p.lot, kit, true, p.variant) : null;
      this.propCache.set(p.index, pl);
    }
    return pl;
  }

  // A kit that throws is not allowed to take a chunk down: the box house stands in for a building (a landmark just stays empty).
  private place(lot: Lot, kit: BuildingKit, fallback = true, chosen?: number): Placement | null {
    const variant = chosen ?? (kit.variants > 1 ? hash2(lot.seed, 0x7a41, 1) % kit.variants : 0);
    let bp: Blueprint;
    try {
      bp = buildWithKit(kit, lot, this.style, variant);
    } catch {
      if (!fallback) return null;
      bp = buildWithKit(this.fallbackKit, lot, this.style, 0);
    }
    growMarkedTrees(bp, lot);
    return lot.place(bp);
  }

  // --- A column --------------------------------------------------------------------------------------------------------

  private addProp(c: ColumnCache, y: number, id: number, state = 0): void {
    if (c.nProps >= MAX_PROPS) return;
    c.propY[c.nProps] = y;
    c.propCell[c.nProps++] = packCell(id, state);
    if (y > c.maxY) c.maxY = y;
  }

  // Everything that does not depend on the height of the query: computed once per column and kept for the next y.
  private column(x: number, z: number, ground: number, high: boolean): ColumnCache {
    const c = this.col;
    if (c.valid && c.x === x && c.z === z && c.ground === ground && c.high === high) return c;
    c.valid = true;
    c.x = x; c.z = z; c.ground = ground; c.high = high;
    c.maxY = ground;
    c.nProps = 0;
    c.placements.length = 0;
    c.surface = packCell(BlockType.GRASS);
    const planner = this.planner;

    // Landmarks that have a kit, and the lot the column is in.
    for (const { planned, kit } of this.landmarkKits) {
      const l = planned.lot;
      if (x < l.x || z < l.z || x >= l.x + l.w || z >= l.z + l.d) continue;
      const pl = this.landmarkPlacement(planned.index, planned, kit);
      if (pl) { c.placements.push(pl); this.reach(c, pl); }
    }
    for (const prop of planner.props) {
      const l = prop.lot;
      if (x < l.x || z < l.z || x >= l.x + l.w || z >= l.z + l.d) continue;
      const pl = this.propPlacement(prop);
      if (pl) { c.placements.push(pl); this.reach(c, pl); }
    }
    for (const entry of this.specLandmarks) {
      if (x < entry.x0 || z < entry.z0 || x > entry.x1 || z > entry.z1) continue;
      const pl = this.specPlacement(entry);
      if (pl) { c.placements.push(pl); this.reach(c, pl); }
    }
    const lot = planner.lotAt(x, z);
    if (lot) for (const st of this.lotStands(lot)) { c.placements.push(st); this.reach(c, st); }

    // The surface and what stands on it.
    const road = planner.roadOf(x, z);
    if (this.square(c, x, z, ground)) {
      // the Central Square placeholder drew itself
    } else if (road) {
      c.surface = packCell(roadBlock(road, x, z));
    } else if (lot) {
      // a lot's blueprint draws on the grass
    } else {
      const block = planner.blockOf(x, z);
      if (block) this.free(c, block, x, z, ground, high);
      else if (apronCell(x - SQUARE.cx, z - SQUARE.cz)) {
        const dx = x - SQUARE.cx, dz = z - SQUARE.cz;
        c.surface = packCell((wedgeOf(dx, dz) & 1) === 0 ? T.FAN_PAVING : T.STONE_PAVING);
        if (apronBollard(dx, dz)) this.addProp(c, ground + 1, T.STONE_BOLLARD);
      } else if (x >= COMPOUND.x0 && x <= COMPOUND.x1 && z >= COMPOUND.z0 && z <= COMPOUND.z1) {
        const court = x >= forecourt.x0 && x <= forecourt.x1 && z >= forecourt.z0 && z <= forecourt.z1;
        c.surface = packCell(court ? T.STONE_PAVING : BlockType.GRASS);
      } else this.open(c, x, z, ground, high);
    }

    this.lamps(c, x, z, ground);
    this.streetTrees(c, x, z, !!lot);
    if (Math.hypot(localX(x), localZ(z)) > FOREST_RADIUS - FOREST_REACH) this.forestTrees(c, x, z, ground, !!lot);
    return c;
  }

  private reach(c: ColumnCache, pl: Stand): void {
    const b = pl.bounds();
    if (b && b.maxY > c.maxY) c.maxY = b.maxY;
  }

  // The Central Square, ring by ring (roundabout.ts): a basin round a water jet, the island of fan cobbles with its bollards, the raised
  // kerbs, the ring road in dark cobbles. The landmark's own spec, when there is one, draws the same rings with the pillar of ore and the
  // lamps over this.
  private square(c: ColumnCache, x: number, z: number, ground: number): boolean {
    const dx = x - SQUARE.cx, dz = z - SQUARE.cz;
    if (ringZone(dx, dz) === 'outside') return false;
    switch (ringZone(dx, dz)) {
      case 'water': case 'rim':
        c.surface = packCell(T.STONE_PAVING);
        this.addProp(c, ground + 1, T.STONE_BASIN);
        if (dx === 0 && dz === 0) { this.addProp(c, ground + 2, T.WATER_JET); this.addProp(c, ground + 3, T.WATER_JET); }
        break;
      case 'island':
        c.surface = packCell((wedgeOf(dx, dz) & 1) === 0 ? T.FAN_PAVING : T.STONE_PAVING);
        if (islandBollard(dx, dz)) this.addProp(c, ground + 1, T.STONE_BOLLARD);
        break;
      case 'kerbIn':
        c.surface = packCell(BlockType.COBBLESTONE);
        this.addProp(c, ground + 1, T.STONE_CURB);
        break;
      case 'splitter':
        c.surface = packCell(BlockType.COBBLESTONE);
        this.addProp(c, ground + 1, BlockType.COBBLESTONE);
        break;
      case 'road':
        c.surface = packCell(BlockType.STONE_BRICK);
        break;
      case 'entry':
        c.surface = packCell(T.FAN_PAVING);
        break;
      default: // the outer kerb, a block high, with a bollard on it beside each mouth
        c.surface = packCell(BlockType.COBBLESTONE);
        this.addProp(c, ground + 1, BlockType.COBBLESTONE);
        if (kerbBollard(dx, dz)) this.addProp(c, ground + 2, T.STONE_BOLLARD);
    }
    return true;
  }

  // A cell in a block that no lot covers: the verge along its edge (paved where the street is busy, grass elsewhere) and the
  // courtyard in the middle.
  private free(c: ColumnCache, b: Block, x: number, z: number, ground: number, high: boolean): void {
    const edge = Math.min(x - b.rect.x0, b.rect.x1 - x, z - b.rect.z0, b.rect.z1 - z);
    const nearCorner = !inBlock(b, x - 1, z - 1) || !inBlock(b, x + 1, z - 1) || !inBlock(b, x - 1, z + 1) || !inBlock(b, x + 1, z + 1);
    if ((edge < 1 || nearCorner) && PAVED_VERGE.has(b.district)) c.surface = packCell(T.STONE_PAVING);
    const q = (hash2(x, z, this.seed ^ 0xc07) >>> 8) / 16777216;
    if (edge < 1) {
      // Street furniture in the verge: crates and barrels outside the working districts, a stone lantern in the quiet ones.
      if (q < 0.022) this.verge(c, b.district, ground, hash2(x, z, this.seed ^ 0xfa));
      return;
    }
    if (high) {
      if (q < 0.05) this.addProp(c, ground + 1, BlockType.FLOWER_YELLOW + (hash2(x, z, 9) % 2));
      else if (q < 0.12) this.addProp(c, ground + 1, BlockType.TALL_GRASS);
    }
  }

  private verge(c: ColumnCache, district: string, ground: number, h: number): void {
    if (district === 'commercial' || district === 'production' || district === 'storage') {
      const pick = h % 4;
      this.addProp(c, ground + 1, pick === 0 ? T.BARREL : pick === 1 ? T.CRATE : pick === 2 ? T.BUCKET : T.RICE_BALE);
      if (pick === 1 && (h >>> 3) % 2 === 0) this.addProp(c, ground + 2, T.CRATE);
    } else if (district === 'public' || district === 'government' || district === 'civic') {
      this.addProp(c, ground + 1, T.STONE_BOLLARD);
    } else if (district === 'tourism') {
      this.addProp(c, ground + 1, T.STONE_LANTERN_BASE);
      this.addProp(c, ground + 2, T.STONE_LANTERN_LIGHT);
      this.addProp(c, ground + 3, T.STONE_LANTERN_CAP);
    } else if ((h >>> 2) % 3 === 0) {
      this.addProp(c, ground + 1, T.STONE_LANTERN_BASE);
      this.addProp(c, ground + 2, T.STONE_LANTERN_LIGHT);
      this.addProp(c, ground + 3, T.STONE_LANTERN_CAP);
    } else {
      this.addProp(c, ground + 1, T.BUCKET);
    }
  }

  // Outside the grid: the countryside answers.
  private open(c: ColumnCache, x: number, z: number, ground: number, high: boolean): void {
    const d = this.decor;
    this.countryside.surface(x, z, ground, high, d);
    c.surface = packCell(d.surface);
    if (d.prop) this.addProp(c, ground + 1, d.prop);
    if (d.fluid) {
      this.addProp(c, POND_WATER_Y, d.fluid);
      if (d.lily) this.addProp(c, POND_WATER_Y + 1, d.lily);
    }
  }

  // A lamp post: four rails up from the street's edge with an arm out over the street and a paper lantern hanging from its end.
  private lamps(c: ColumnCache, x: number, z: number, ground: number): void {
    const own = this.planner.lampAt(x, z);
    if (own) for (let y = 1; y <= 4; y++) this.addProp(c, ground + y, T.VERMILION_RAIL);
    for (let d = 0; d < 4; d++) {
      const lamp = this.planner.lampAt(x - DX[d], z - DZ[d]);
      if (lamp && lamp.toward === d) {
        this.addProp(c, ground + 4, T.VERMILION_RAIL);
        this.addProp(c, ground + 3, lamp.striped ? T.PAPER_LANTERN_STRIPED : T.PAPER_LANTERN_RED);
      }
    }
  }

  // Street and courtyard trees: planted by the planner, their crowns clipped where a lot begins (a lot's cells are its own).
  private streetTrees(c: ColumnCache, x: number, z: number, inLot: boolean): void {
    const tx = x >> 4, tz = z >> 4;
    for (let a = tx - 1; a <= tx + 1; a++) {
      for (let b = tz - 1; b <= tz + 1; b++) {
        const list = this.planner.treesInTile(a, b);
        if (!list) continue;
        for (const t of list) this.stamp(c, x, z, t, smallTree(t.kind, t.variant, t.lean), TEMPEST_GROUND, inLot);
      }
    }
  }

  private forestTrees(c: ColumnCache, x: number, z: number, ground: number, inLot: boolean): void {
    const list = this.forestList;
    this.countryside.forestTrees(x, z, list);
    for (const t of list) this.stamp(c, x, z, t, forestTree(t.kind, t.variant), t.ground, inLot, ground);
  }

  // The blocks of a tree at this column.
  private stamp(c: ColumnCache, x: number, z: number, t: { x: number; z: number }, shape: TreeShape, originGround: number, inLot: boolean, columnGround = originGround): void {
    const dx = x - t.x, dz = z - t.z;
    if (dx > shape.reach || dx < -shape.reach || dz > shape.reach || dz < -shape.reach) return;
    const idx = shape.columns.get(columnKey(dx, dz));
    if (!idx) return;
    if (inLot) return;
    for (const i of idx) {
      // Blocks placed at the trunk's ground row keep their shape on a slope; undergrowth follows its own column.
      this.addProp(c, (shape.place[i] === 0 ? originGround : columnGround) + shape.dy[i], shape.id[i]);
    }
  }
}

/**
 * Grows the trees a kit marked, inside the lot. A crown is only drawn where it fits within the footprint, so a lot never
 * has leaves in its neighbour: a marker too near an edge for a full crown gets a smaller tree, and one with no room none.
 */
export const growMarkedTrees = (bp: Blueprint, lot: Lot): void => {
  const W = lot.frontage, D = lot.depth;
  const markers = bp.markers.filter((m) => m.kind === 'tree');
  if (markers.length === 0) return;
  // A crown never grows through anything the kit built: a column that holds a floor, a wall, a roof or a prop above the ground row
  // keeps its leaves out (otherwise a tree beside a house would fill its rooms: the interior is air the blueprint does not carve).
  const taken = new Set<number>();
  bp.forEach((x, y, _z, c) => { if (y >= 1 && c !== AIR_CELL) taken.add(x * 4096 + _z); });
  const key = (x: number, z: number): number => x * 4096 + z;
  markers.forEach((m, i) => {
    const room = Math.min(m.x, W - 1 - m.x, m.z, D - 1 - m.z);
    if (room < 2 || bp.has(m.x, m.y, m.z) || taken.has(key(m.x, m.z))) return;
    const rng = new Rng(hash2(lot.seed, i, 0x7ee));
    const kind: TreeKind = m.tag === 'cedar' ? 'cedar' : m.tag === 'sakura' ? 'sakura' : rng.chance(0.6) ? 'sakura' : 'cedar';
    const shape = smallTree(kind, rng.int(VARIANTS), 4, room >= 3 ? 1 : 0.7);
    if (shape.reach > room) return;
    for (let k = 0; k < shape.length; k++) {
      const x = m.x + shape.dx[k], z = m.z + shape.dz[k], y = m.y - 1 + shape.dy[k];
      if (x < 0 || z < 0 || x >= W || z >= D || y < 1 || bp.has(x, y, z)) continue;
      if ((shape.dx[k] !== 0 || shape.dz[k] !== 0) && taken.has(key(x, z))) continue;
      bp.set(x, y, z, packCell(shape.id[k]));
    }
  });
};

/** A generator for a landmark that is the same on every thread and differs with the world's seed (but not with the order anything is built in). */
const landmarkRngFor = (spec: LandmarkSpec, seed: number): Rng => {
  let h = 0x811c9dc5;
  for (let i = 0; i < spec.id.length; i++) h = Math.imul(h ^ spec.id.charCodeAt(i), 0x01000193);
  return new Rng((LANDMARK_SEED ^ seed) | 0).fork(h | 0);
};
