import { Chunk } from '../../engine/Chunk';
import { cellId, packCell } from '../../engine/cell';
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from '../../engine/coords';
import { WATER_LEVEL } from '../../worldConstants';
import { Rng, hash2, hash3 } from '../noise';
import { Column } from '../terrain/ColumnSampler';
import { clearanceFromZones } from '../zones/ZoneClearance';
import { BlockList, Place } from './BlockList';
import { Feature } from './Feature';
import { RoadField } from './RoadField';
import { LAYERS, LayerDef } from './Vegetation';
import { canReplace } from './blockClass';

// One placed feature: where it is and the blocks it is made of.
export interface Placed {
  readonly layer: number;
  readonly feature: Feature;
  readonly ox: number;
  readonly oz: number;
  readonly ground: number;
  readonly blocks: BlockList;
}

// Features reach at most this far above the ground at their origin (a tall cedar is about 23).
const MAX_UP = 48;
const CACHE_LIMIT = 16384;
const BIAS = 1 << 20;

// Finds and places features. Each layer has a jittered grid: one candidate per cell, at a position and with a
// decision that depend only on the cell, the layer and the seed. A chunk asks for the cells within the layer's
// maximum feature radius of its edges, so a tree that crosses a chunk border is found, built and clipped
// identically by both chunks, and sampleBlock finds the same trees for a single position.
// Candidates are visited in the same order everywhere (layer, then z, then x), so when features overlap the same
// one wins in every chunk.
export class FeaturePlacer {
  private readonly cache = new Map<number, Placed | null>();
  private readonly column: Column;

  constructor(
    private readonly seed: number,
    private readonly sample: (x: number, z: number, out: Column) => Column,
    private readonly roads: RoadField,
    column: Column,
  ) {
    this.column = column;
  }

  private placeAt(layerIndex: number, layer: LayerDef, i: number, j: number): Placed | null {
    const key = ((layerIndex * 2097152 + (i + BIAS)) * 2097152) + (j + BIAS);
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const placed = this.build(layerIndex, layer, i, j);
    if (this.cache.size >= CACHE_LIMIT) this.cache.clear(); // the answers never depend on what is cached
    this.cache.set(key, placed);
    return placed;
  }

  private build(layerIndex: number, layer: LayerDef, i: number, j: number): Placed | null {
    const rng = new Rng(hash3(i, j, layer.salt, this.seed));
    const ox = i * layer.cell + rng.int(layer.cell);
    const oz = j * layer.cell + rng.int(layer.cell);
    const u = rng.next();
    if (u >= layer.maxChance) return null;

    const col = this.sample(ox, oz, this.column);
    if (!col.wild) return null;
    // Whole features stay out of zones and off roads, so nothing is ever cut by a footprint or a road edge.
    if (clearanceFromZones(ox, oz) <= layer.radius + 2) return null;
    if (this.roads.isRoad(ox, oz, layer.radius + 1)) return null;

    const feature = layer.pick(col, u, rng);
    if (!feature) return null;
    const blocks = new BlockList();
    feature.build({ x: ox, z: oz, ground: col.ground, biome: col.biome }, rng.fork(hash2(i, j, 7)), blocks);
    return { layer: layerIndex, feature, ox, oz, ground: col.ground, blocks };
  }

  // Every feature that can touch the box x0..x1, z0..z1 (inclusive), in placement order.
  collect(x0: number, z0: number, x1: number, z1: number, lod0: boolean, out: Placed[] = []): Placed[] {
    for (let l = 0; l < LAYERS.length; l++) {
      const layer = LAYERS[l];
      if (lod0 && layer.detail) continue;
      const r = layer.radius;
      const i0 = Math.floor((x0 - r) / layer.cell);
      const i1 = Math.floor((x1 + r) / layer.cell);
      const j0 = Math.floor((z0 - r) / layer.cell);
      const j1 = Math.floor((z1 + r) / layer.cell);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const p = this.placeAt(l, layer, i, j);
          if (p) out.push(p);
        }
      }
    }
    return out;
  }

  // The y a block lands on, or null if its column does not allow it.
  private static targetY(p: Placed, n: number, col: Column): number | null {
    const b = p.blocks;
    switch (b.place[n]) {
      case Place.ORIGIN: return p.ground + b.dy[n];
      case Place.SOIL: return col.soil ? col.ground + b.dy[n] : null;
      case Place.LAND: return col.ground > WATER_LEVEL ? col.ground + b.dy[n] : null;
      default: return col.shore ? col.ground + b.dy[n] : null;
    }
  }

  // Writes the features into a chunk whose terrain is already in place. `cols` holds the chunk's columns, indexed
  // lz * CHUNK_SIZE + lx.
  paint(chunk: Chunk, placed: readonly Placed[], cols: readonly Column[]): void {
    const x0 = chunk.cx * CHUNK_SIZE;
    const z0 = chunk.cz * CHUNK_SIZE;
    for (const p of placed) {
      const b = p.blocks;
      for (let n = 0; n < b.length; n++) {
        const lx = p.ox + b.dx[n] - x0;
        const lz = p.oz + b.dz[n] - z0;
        if (lx < 0 || lz < 0 || lx >= CHUNK_SIZE || lz >= CHUNK_SIZE) continue;
        const col = cols[lz * CHUNK_SIZE + lx];
        if (!col.wild) continue;
        const y = FeaturePlacer.targetY(p, n, col);
        if (y === null || y < WORLD_MIN_Y || y > WORLD_MAX_Y) continue;
        if (canReplace(cellId(chunk.getCell(lx, y, lz)), b.id[n])) chunk.setCell(lx, y, lz, packCell(b.id[n]));
      }
    }
  }

  // What a feature leaves at one position, given the terrain block there.
  blockAt(x: number, y: number, z: number, col: Column, terrain: number): number {
    if (!col.wild || y <= WATER_LEVEL || y <= col.ground || y > col.ground + MAX_UP) return terrain;
    let cur = terrain;
    const placed = this.collect(x, z, x, z, false);
    for (const p of placed) {
      const b = p.blocks;
      for (let n = 0; n < b.length; n++) {
        if (p.ox + b.dx[n] !== x || p.oz + b.dz[n] !== z) continue;
        if (FeaturePlacer.targetY(p, n, col) !== y) continue;
        if (canReplace(cur, b.id[n])) cur = b.id[n];
      }
    }
    return cur;
  }
}
