import { Rng } from '../noise';

// A style pack says which block plays which part in a building. Kits never name a block: they ask for the wall, the
// beam, the roof stairs, and the pack answers. That is what lets one kit build a terracotta timber house, a house under
// dark ridged tile and a green-glazed inn, and lets a zone for another city reuse the same kits with other blocks.
//
// A pack has base roles and palette families, each family a handful of overrides (a roof, a frame, an accent), so
// neighbouring buildings can differ while the street still reads as one town.

export const STYLE_ROLES = [
  // Walls and frame
  'wall',         // the plain wall
  'wallFrame',    // wall with a timber frame and brace drawn on it (the half-timber panel)
  'wallBase',     // the footing under a wall
  'trim',         // eave boards, lintels, string courses
  'beam',         // horizontal timbers
  'post',         // vertical timbers
  'accent',       // the lacquered column, gate post or rail colour
  'column',       // a tall decorative column (civic, gates)
  // Roof
  'roofBlock',
  'roofStairs',
  'roofSlab',
  'ridge',        // the cap along the crest; equal to roofBlock when the roof has none
  'ridgeHorn',    // the cap with a horned end; equal to ridge when the roof has none
  // Openings
  'glassPane',
  'shoji',
  'shojiLit',
  'lattice',
  'blind',
  // Floors and ground
  'floor',        // porch and engawa boards
  'interiorFloor',
  'path',
  'pathAlt',
  'curb',
  'stone',
  'stoneSlab',
  'stoneStairs',
  // Light, fences and soft furnishings
  'light',
  'lightAlt',
  'fence',
  'rail',
  'awning',
  'awningAlt',
  'noren',
  'norenAlt',
  'sign',
] as const;

export type Role = (typeof STYLE_ROLES)[number];

/** A block with a state, for the places a role is not enough. */
export interface BlockSpec {
  id: number;
  state?: number;
}

export type RoleMap = Readonly<Record<Role, number>>;

/** What a family changes: any subset of the roles. */
export type RoleOverrides = Partial<Record<Role, number>>;

export interface FamilyDef {
  name: string;
  overrides: RoleOverrides;
  /** Relative chance of the family in a district; a district not listed gets `fallback`. */
  weights?: Readonly<Record<string, number>>;
  fallback?: number;
}

export class StylePack {
  readonly name: string;
  readonly roles: RoleMap;
  private readonly defs: readonly FamilyDef[];
  private readonly cache = new Map<string, StylePack>();

  constructor(name: string, roles: RoleMap, families: readonly FamilyDef[] = []) {
    for (const role of STYLE_ROLES) {
      if (!Number.isInteger(roles[role])) throw new Error(`Style pack ${name} has no block for the role ${role}`);
    }
    this.name = name;
    this.roles = roles;
    this.defs = families;
  }

  /** The block for a role. */
  block(role: Role): number {
    return this.roles[role];
  }

  /** The same pack with some roles swapped. */
  with(overrides: RoleOverrides, name = this.name): StylePack {
    return new StylePack(name, { ...this.roles, ...overrides } as RoleMap);
  }

  get familyNames(): string[] {
    return this.defs.map((d) => d.name);
  }

  /** The pack with a family's palette applied: complete, so a kit can use it as it is. Cached. */
  family(name: string): StylePack {
    let pack = this.cache.get(name);
    if (!pack) {
      const def = this.defs.find((d) => d.name === name);
      if (!def) throw new Error(`Style pack ${this.name} has no family ${name}`);
      pack = this.with(def.overrides, `${this.name}/${name}`);
      this.cache.set(name, pack);
    }
    return pack;
  }

  /** A family picked by weight for a district, so a street of one district mixes palettes the way the town does. */
  pickFamily(rng: Rng, district?: string): string {
    if (this.defs.length === 0) throw new Error(`Style pack ${this.name} has no families`);
    const weights = this.defs.map((d) => (district && d.weights?.[district] !== undefined ? d.weights[district] : d.fallback ?? 1));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return this.defs[0].name;
    let roll = rng.next() * total;
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll < 0) return this.defs[i].name;
    }
    return this.defs[this.defs.length - 1].name;
  }
}
