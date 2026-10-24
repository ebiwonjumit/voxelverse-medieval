import { createDefaultRegistry } from '../../content/blocks';
import { TempestBlock as T } from '../../content/blocksTempest';
import { AIR_CELL, cellId } from '../../engine/cell';
import { Blueprint, NO_CELL } from '../../worldgen/structures/Blueprint';
import { StylePack } from '../../worldgen/structures/StylePack';

// What the kit tests ask of a finished blueprint: is anything floating, is a roof held up, can a person walk from the
// street through the door and up the stairs. Everything works on a dense copy of the blueprint so a building of twenty
// thousand blocks takes milliseconds.

export const registry = createDefaultRegistry();

/** A dense read-only copy of a blueprint's cells over its bounds plus a margin. */
export class Grid {
  readonly x0: number;
  readonly y0: number;
  readonly z0: number;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  private readonly data: Int32Array;

  /** `cover` widens the box to a lot's footprint (x 0 to frontage - 1, z 0 to depth - 1) when the building does not fill it. */
  constructor(readonly bp: Blueprint, margin = 2, cover?: { frontage: number; depth: number }) {
    const b = bp.bounds();
    if (!b) throw new Error('empty blueprint');
    const minX = Math.min(b.minX, 0);
    const minZ = Math.min(b.minZ, 0);
    const maxX = Math.max(b.maxX, cover ? cover.frontage - 1 : b.maxX);
    const maxZ = Math.max(b.maxZ, cover ? cover.depth - 1 : b.maxZ);
    this.x0 = minX - margin;
    this.y0 = b.minY - 1;
    this.z0 = minZ - margin;
    this.sx = maxX - minX + 1 + margin * 2;
    this.sy = b.maxY - b.minY + 4;
    this.sz = maxZ - minZ + 1 + margin * 2;
    this.data = new Int32Array(this.sx * this.sy * this.sz).fill(NO_CELL);
    bp.forEach((x, y, z, c) => { this.data[this.index(x, y, z)] = c; });
  }

  private index(x: number, y: number, z: number): number {
    return ((y - this.y0) * this.sz + (z - this.z0)) * this.sx + (x - this.x0);
  }

  inside(x: number, y: number, z: number): boolean {
    return x >= this.x0 && x < this.x0 + this.sx && y >= this.y0 && y < this.y0 + this.sy && z >= this.z0 && z < this.z0 + this.sz;
  }

  /** The cell, or NO_CELL for none (and for anything outside). */
  at(x: number, y: number, z: number): number {
    return this.inside(x, y, z) ? this.data[this.index(x, y, z)] : NO_CELL;
  }

  /** A set cell that is not air. */
  filled(x: number, y: number, z: number): boolean {
    const c = this.at(x, y, z);
    return c !== NO_CELL && c !== AIR_CELL;
  }
}

/** Blocks that are in a blueprint's cells but are not there to be a wall: they never carry weight, nor need any. */
const MAX_ROOF_REACH = 4;
const WATER = 5;

/** Cells that are not joined, through faces, edges and corners, to anything standing on the ground (y <= 1). */
export const floatingCells = (bp: Blueprint): Array<[number, number, number]> => {
  const g = new Grid(bp, 1);
  const seen = new Uint8Array(g.sx * g.sy * g.sz);
  const idx = (x: number, y: number, z: number): number => ((y - g.y0) * g.sz + (z - g.z0)) * g.sx + (x - g.x0);
  const stack: number[] = [];
  const all: Array<[number, number, number]> = [];
  bp.forEach((x, y, z, c) => {
    if (c === AIR_CELL) return;
    all.push([x, y, z]);
    if (y <= 1) { seen[idx(x, y, z)] = 1; stack.push(x, y, z); }
  });
  while (stack.length) {
    const z = stack.pop()!;
    const y = stack.pop()!;
    const x = stack.pop()!;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (!g.filled(nx, ny, nz)) continue;
      const i = idx(nx, ny, nz);
      if (seen[i]) continue;
      seen[i] = 1;
      stack.push(nx, ny, nz);
    }
  }
  return all.filter(([x, y, z]) => !seen[idx(x, y, z)]);
};

/** The ids of every roof block (tile, stairs, slab, ridge, horn) of every family of a pack. */
export const roofIds = (style: StylePack): Set<number> => {
  const ids = new Set<number>();
  for (const pack of [style, ...style.familyNames.map((n) => style.family(n))]) {
    for (const role of ['roofBlock', 'roofStairs', 'roofSlab', 'ridge', 'ridgeHorn'] as const) ids.add(pack.block(role));
  }
  return ids;
};

/**
 * Roof cells that nothing carries: more than `MAX_ROOF_REACH` blocks (sideways) from any structure that is not roof and
 * stands on the ground, in the columns below them. An eave may hang out three or four blocks; more is a floating tile.
 */
export const unsupportedRoof = (bp: Blueprint, roofs: Set<number>, reach = MAX_ROOF_REACH): Array<[number, number, number]> => {
  const g = new Grid(bp, reach + 1);
  const floating = new Set(floatingCells(bp).map(([x, y, z]) => `${x},${y},${z}`));
  const bad: Array<[number, number, number]> = [];
  bp.forEach((x, y, z, c) => {
    if (c === AIR_CELL || !roofs.has(cellId(c))) return;
    let held = false;
    for (let dz = -reach; dz <= reach && !held; dz++) {
      for (let dx = -reach; dx <= reach && !held; dx++) {
        for (let yy = y - 1; yy >= Math.max(0, y - 16); yy--) {
          const cc = g.at(x + dx, yy, z + dz);
          if (cc === NO_CELL || cc === AIR_CELL || roofs.has(cellId(cc))) continue;
          if (floating.has(`${x + dx},${yy},${z + dz}`)) continue;
          // Something that is not roof, stands on the ground, and is below this cell. Plants and curtains do not carry weight.
          if (!registry.isSolid(cellId(cc)) || cellId(cc) === T.TATAMI) continue;
          held = true;
          break;
        }
      }
    }
    if (!held) bad.push([x, y, z]);
  });
  return bad;
};

// --- Walking --------------------------------------------------------------------------------------------------------

/** A cell is open to a body when it is empty, or holds something that is not solid (or a tatami mat, four sixteenths high). */
const open = (g: Grid, x: number, y: number, z: number): boolean => {
  const c = g.at(x, y, z);
  if (c === NO_CELL) return y >= 1; // beyond the blueprint the ground row (y = 0) is solid and above it is air
  if (c === AIR_CELL) return true;
  const id = cellId(c);
  return id === T.TATAMI || !registry.isSolid(id);
};

/** A cell is firm under a foot: solid, or below the ground row, or the ground row where the blueprint says nothing. */
const firm = (g: Grid, x: number, y: number, z: number): boolean => {
  const c = g.at(x, y, z);
  if (c === NO_CELL) return y <= 0;
  if (c === AIR_CELL) return false;
  const id = cellId(c);
  // Water, plants, curtains and a tatami mat (a floor four sixteenths thick, walked on from the cell above its base) are not firm.
  return registry.isSolid(id) && id !== WATER && id !== T.TATAMI;
};

export interface Walk {
  /** Standing cells reached, keyed `x,y,z`. */
  reached: Set<string>;
  maxY: number;
}

const stands = (g: Grid, x: number, y: number, z: number): boolean => open(g, x, y, z) && open(g, x, y + 1, z) && firm(g, x, y - 1, z);

/**
 * Walks the building the way a player can: one step at a time along the four directions, up one block or down three, over
 * solid ground and floors, with room for a body two blocks high. Starts from the street (every standing cell of the row
 * of ground just outside the front, `z = frontZ`) and returns everything reached inside the margin.
 */
export const walkFrom = (bp: Blueprint, frontage: number, depth: number): Walk => {
  const g = new Grid(bp, 3, { frontage, depth });
  const reached = new Set<string>();
  const stack: Array<[number, number, number]> = [];
  const push = (x: number, y: number, z: number): void => {
    const k = `${x},${y},${z}`;
    if (reached.has(k) || !g.inside(x, y, z)) return;
    reached.add(k);
    stack.push([x, y, z]);
  };
  for (let x = -2; x < frontage + 2; x++) if (stands(g, x, 1, depth + 1)) push(x, 1, depth + 1);
  let maxY = 1;
  while (stack.length) {
    const [x, y, z] = stack.pop()!;
    maxY = Math.max(maxY, y);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      // Room for the body to move sideways at the current height, then step up or down.
      for (const ny of [y + 1, y, y - 1, y - 2, y - 3]) {
        if (ny < 1 && ny !== y) continue;
        if (!stands(g, nx, ny, nz)) continue;
        // Going up needs the block above the head clear at the starting cell; going down needs clear air at the head of the new cell, already part of `stands`.
        if (ny === y + 1 && !open(g, x, y + 2, z)) continue;
        // The way across: the cell beside, at the higher of the two heights, must be open.
        const top = Math.max(y, ny);
        if (!open(g, nx, top, nz) || !open(g, nx, top + 1, nz)) continue;
        push(nx, ny, nz);
        break;
      }
    }
  }
  return { reached, maxY };
};
