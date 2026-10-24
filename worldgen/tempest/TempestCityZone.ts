import { TempestBlock as T } from '../../content/blocksTempest';
import { AIR_CELL, Cell, cellId, packCell } from '../../engine/cell';
import { AtmosphereSettings, LodLevel, Zone } from '../../zones/Zone';
import { BlockType } from '../../worldConstants';
import { Rng, hash2 } from '../noise';
import { Blueprint, NO_CELL, Placement } from '../structures/Blueprint';
import { BoxHouseKit } from '../structures/BoxHouseKit';
import { BuildingKit, buildWithKit } from '../structures/BuildingKit';
import { KitRegistry } from '../structures/KitRegistry';
import { Lot } from '../structures/Lot';
import { StylePack } from '../structures/StylePack';
import { Countryside, Decor, FOREST_REACH, ForestTree, newDecor } from './countryside';
import { DistrictPlanner, PlannedLandmark, PlannedLot, PlannedProp } from './DistrictPlanner';
import { createFillerKits } from './fillers';
import { createTempestKits } from './kits';
import {
  Block, COMPOUND, LANDMARKS, TEMPEST_CENTER_X, TEMPEST_CENTER_Z, TEMPEST_GROUND, TEMPEST_RADIUS, inBlock, landmarkById, localX, localZ,
} from './layout';
import { Lru } from './lru';
import { roadBlock } from './streets';
import { TEMPEST_STYLE } from './style';
import { TempestTerrain, POND_WATER_Y } from './terrain';
import { TreeKind, TreeShape, VARIANTS, columnKey, forestTree, smallTree } from './trees';

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
  /** The kits for the building lots. Default `createTempestKits()`. A kit named after a landmark's layout id builds that landmark. */
  kits?: KitRegistry;
  style?: StylePack;
  /** Blueprints kept at once (default 256). Only memory and time depend on it, never the world. */
  lotCache?: number;
}

interface ColumnCache {
  valid: boolean;
  x: number; z: number; ground: number; high: boolean;
  surface: Cell;
  maxY: number;
  placements: Placement[];
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
  private readonly fillers = createFillerKits();
  private readonly fallbackKit: BuildingKit = new BoxHouseKit();
  private readonly countryside: Countryside;
  private readonly lotCache: Lru<number, Placement | null>;
  private readonly landmarkKits: Array<{ planned: PlannedLandmark; kit: BuildingKit }> = [];
  private readonly landmarkCache = new Map<number, Placement | null>();
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
    this.kits = options.kits ?? createTempestKits();
    this.lotCache = new Lru(options.lotCache ?? CACHE_LOTS);
    this.terrain = new TempestTerrain(this.seed);
    this.planner = new DistrictPlanner({ seed: this.seed, style: this.style, groundAt: (x, z) => this.terrain.ground(x, z) });
    this.countryside = new Countryside(this.seed, this.terrain);
    // A landmark is built by the kit registered under its layout id; the east bridge has a placeholder until its own kit exists.
    for (const planned of this.planner.landmarkLots) {
      const kit = this.kits.get(planned.landmark.id) ?? (planned.landmark.id === 'east-bridge' ? this.fillers.get('placeholder-bridge') : undefined);
      if (kit) this.landmarkKits.push({ planned, kit });
    }
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

  /** The kit that builds a planned lot. */
  kitFor(p: PlannedLot): BuildingKit {
    if (p.kind === 'building') return this.kits.pick(p.lot) ?? this.fallbackKit;
    const name = p.kind === 'garden' ? 'garden-lot' : p.kind === 'park' ? 'park-lot' : p.kind === 'meadow' ? 'meadow-lot' : 'construction-site';
    return this.kits.get(name) ?? this.fillers.get(name)!;
  }

  /** The blueprint of a lot, built the standard way and with its trees grown, standing on the lot: cached. */
  lotPlacement(p: PlannedLot): Placement | null {
    let pl = this.lotCache.get(p.index);
    if (pl === undefined) {
      pl = this.place(p.lot, this.kitFor(p));
      this.lotCache.set(p.index, pl);
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
      pl = kit ? this.place(p.lot, kit) : null;
      this.propCache.set(p.index, pl);
    }
    return pl;
  }

  // A kit that throws is not allowed to take a chunk down: the box house stands in for a building (a landmark just stays empty).
  private place(lot: Lot, kit: BuildingKit, fallback = true): Placement | null {
    const variant = kit.variants > 1 ? hash2(lot.seed, 0x7a41, 1) % kit.variants : 0;
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
    const lot = planner.lotAt(x, z);
    if (lot) {
      const pl = this.lotPlacement(lot);
      if (pl) { c.placements.push(pl); this.reach(c, pl); }
    }

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
      else if (x >= COMPOUND.x0 && x <= COMPOUND.x1 && z >= COMPOUND.z0 && z <= COMPOUND.z1) {
        const court = x >= forecourt.x0 && x <= forecourt.x1 && z >= forecourt.z0 && z <= forecourt.z1;
        c.surface = packCell(court ? T.STONE_PAVING : BlockType.GRASS);
      } else this.open(c, x, z, ground, high);
    }

    this.lamps(c, x, z, ground);
    this.streetTrees(c, x, z, !!lot);
    if (Math.hypot(localX(x), localZ(z)) > FOREST_RADIUS - FOREST_REACH) this.forestTrees(c, x, z, ground);
    return c;
  }

  private reach(c: ColumnCache, pl: Placement): void {
    const b = pl.bounds();
    if (b && b.maxY > c.maxY) c.maxY = b.maxY;
  }

  // The Central Square: a disc of fan paving with a fountain (a ring of basins round a water jet) and bollards in the corners of the crossing.
  // The landmark's own kit, when there is one, is drawn over this.
  private square(c: ColumnCache, x: number, z: number, ground: number): boolean {
    const dx = x - SQUARE.cx, dz = z - SQUARE.cz;
    const d = Math.hypot(dx, dz);
    if (d > SQUARE.r) return false;
    c.surface = packCell(d < 3 ? T.STONE_PAVING : T.FAN_PAVING);
    if (d < 2.7) {
      this.addProp(c, ground + 1, T.STONE_BASIN);
      if (dx === 0 && dz === 0) { this.addProp(c, ground + 2, T.WATER_JET); this.addProp(c, ground + 3, T.WATER_JET); }
    } else if (d >= 5.6 && Math.min(Math.abs(dx), Math.abs(dz)) >= 3 && ((dx + dz) & 1) === 0) {
      // Bollards in the four corners of the crossing, an arc round the fountain that the avenues leave open.
      this.addProp(c, ground + 1, T.STONE_BOLLARD);
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

  private forestTrees(c: ColumnCache, x: number, z: number, ground: number): void {
    const list = this.forestList;
    this.countryside.forestTrees(x, z, list);
    for (const t of list) this.stamp(c, x, z, t, forestTree(t.kind, t.variant), t.ground, false, ground);
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
  bp.markers.filter((m) => m.kind === 'tree').forEach((m, i) => {
    const room = Math.min(m.x, W - 1 - m.x, m.z, D - 1 - m.z);
    if (room < 2 || bp.has(m.x, m.y, m.z)) return;
    const rng = new Rng(hash2(lot.seed, i, 0x7ee));
    const kind: TreeKind = m.tag === 'cedar' ? 'cedar' : m.tag === 'sakura' ? 'sakura' : rng.chance(0.6) ? 'sakura' : 'cedar';
    const shape = smallTree(kind, rng.int(VARIANTS), 4, room >= 3 ? 1 : 0.7);
    if (shape.reach > room) return;
    for (let k = 0; k < shape.length; k++) {
      const x = m.x + shape.dx[k], z = m.z + shape.dz[k], y = m.y - 1 + shape.dy[k];
      if (x < 0 || z < 0 || x >= W || z >= D || y < 1 || bp.has(x, y, z)) continue;
      bp.set(x, y, z, packCell(shape.id[k]));
    }
  });
};

