import { Blueprint, Placement } from './Blueprint';

// A lot is a plot of ground a building is built on: a rectangle in world coordinates, the side its front faces, the
// district it is in, and what stands next to it. The zone planner makes lots; a kit builds one blueprint for a lot.
//
// A kit always builds with the front towards south and the footprint's north west corner at (0, 0), whatever the lot's
// facing is: `lot.frontage` is the footprint's width along the front and `lot.depth` its depth, and `lot.place(blueprint)`
// turns the finished building to face the street. So a kit never has to think about the four directions.

/** What stands beside a lot, as far as a kit needs to match it. */
export interface NeighbourInfo {
  /** The district or kit name of the building there, or null for a wall, a street or an empty lot. */
  kind: string | null;
  /** Its height in blocks above the ground, or 0. */
  height: number;
  /** Its style family, so a street can alternate. */
  family?: string;
}

export interface Neighbours {
  /** Left and right as seen from the street, looking at the front. */
  left: NeighbourInfo;
  right: NeighbourInfo;
  back: NeighbourInfo;
}

export const NO_NEIGHBOUR: NeighbourInfo = { kind: null, height: 0 };

export interface LotData {
  /** A name that is stable between runs: 'c-2r3.4', or a landmark's id. */
  id: string;
  /** World rectangle of the footprint, inclusive. */
  x: number;
  z: number;
  /** Size along world x and world z. */
  w: number;
  d: number;
  /** The side the front faces: 0 north, 1 east, 2 south, 3 west. */
  facing: 0 | 1 | 2 | 3;
  district: string;
  seed: number;
  /** How many storeys the planner would like, 1 to 3. */
  floors?: number;
  neighbours?: Partial<Neighbours>;
  /** A palette family the planner chose, so neighbours differ. */
  family?: string;
  /** World y of the ground surface on the lot (the row blueprint y = 0 stands on). */
  groundY?: number;
}

// Quarter turns clockwise that carry a front facing south to each facing.
const TURNS_FOR_FACING = [2, 3, 0, 1] as const;

export class Lot {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly facing: 0 | 1 | 2 | 3;
  readonly district: string;
  readonly seed: number;
  readonly floors: number;
  readonly neighbours: Neighbours;
  readonly family?: string;
  readonly groundY: number;

  constructor(data: LotData) {
    if (!Number.isInteger(data.w) || !Number.isInteger(data.d) || data.w < 1 || data.d < 1) throw new RangeError(`Lot ${data.id} has size ${data.w} by ${data.d}`);
    this.id = data.id;
    this.x = data.x;
    this.z = data.z;
    this.w = data.w;
    this.d = data.d;
    this.facing = data.facing;
    this.district = data.district;
    this.seed = data.seed;
    this.floors = Math.max(1, Math.min(3, data.floors ?? 1));
    this.neighbours = {
      left: data.neighbours?.left ?? NO_NEIGHBOUR,
      right: data.neighbours?.right ?? NO_NEIGHBOUR,
      back: data.neighbours?.back ?? NO_NEIGHBOUR,
    };
    this.family = data.family;
    this.groundY = data.groundY ?? 0;
  }

  /** Quarter turns clockwise a south-facing blueprint needs to face this lot's street. */
  get turns(): number {
    return TURNS_FOR_FACING[this.facing];
  }

  /** The footprint's width along the front, in the kit's own frame (x). */
  get frontage(): number {
    return this.facing === 0 || this.facing === 2 ? this.w : this.d;
  }

  /** The footprint's depth from front to back, in the kit's own frame (z). */
  get depth(): number {
    return this.facing === 0 || this.facing === 2 ? this.d : this.w;
  }

  /** Stands a finished blueprint (front south, corner at 0, 0) on this lot: turned to the street, the footprint on the rectangle. */
  place(blueprint: Blueprint): Placement {
    const turns = this.turns;
    // Where the kit's footprint corners land after the turn about the origin, to find the new minimum corner.
    const corners: Array<[number, number]> = [[0, 0], [this.frontage - 1, this.depth - 1]];
    let minX = Infinity;
    let minZ = Infinity;
    for (const [cx, cz] of corners) {
      const [rx, rz] = turnPoint(cx, cz, turns);
      minX = Math.min(minX, rx);
      minZ = Math.min(minZ, rz);
    }
    return new Placement(blueprint, { x: this.x - minX, y: this.groundY, z: this.z - minZ, turns });
  }
}

const turnPoint = (x: number, z: number, turns: number): [number, number] => {
  switch (turns & 3) {
    case 1: return [0 - z, x];
    case 2: return [0 - x, 0 - z];
    case 3: return [z, 0 - x];
    default: return [x, z];
  }
};
