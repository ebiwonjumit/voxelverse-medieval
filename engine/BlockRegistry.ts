import { MAX_BLOCK_ID } from './cell';

// Block definitions are data. Textures, models and lighting rules are looked up from them,
// so adding a block never means touching the renderer.
export interface BlockDef {
  id: number;       // 0..4095, stored in the low bits of a cell
  name: string;     // "namespace:block_name"
  color: string;    // flat colour as #rrggbb, used until blocks get textures
  solid: boolean;   // blocks the player
  opaque: boolean;  // hides the faces of neighbouring blocks
  emits: number;    // block light level 0..15
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export class BlockRegistry {
  private readonly defs = new Map<number, BlockDef>();
  private readonly names = new Map<string, BlockDef>();
  private readonly solidTable = new Uint8Array(MAX_BLOCK_ID + 1);
  private readonly opaqueTable = new Uint8Array(MAX_BLOCK_ID + 1);

  get size(): number {
    return this.defs.size;
  }

  register(def: BlockDef): BlockDef {
    if (!Number.isInteger(def.id) || def.id < 0 || def.id > MAX_BLOCK_ID) {
      throw new RangeError(`Block id ${def.id} is outside 0..${MAX_BLOCK_ID}`);
    }
    if (!def.name) throw new Error(`Block with id ${def.id} has no name`);
    if (!Number.isInteger(def.emits) || def.emits < 0 || def.emits > 15) {
      throw new RangeError(`Block ${def.name} emits ${def.emits}, expected 0..15`);
    }
    if (!HEX_COLOR.test(def.color)) {
      throw new Error(`Block ${def.name} has color ${def.color}, expected #rrggbb`);
    }
    if (this.defs.has(def.id)) {
      throw new Error(`Block id ${def.id} is already registered as ${this.defs.get(def.id)!.name}`);
    }
    if (this.names.has(def.name)) {
      throw new Error(`Block name ${def.name} is already registered with id ${this.names.get(def.name)!.id}`);
    }
    const frozen = Object.freeze({ ...def });
    this.defs.set(frozen.id, frozen);
    this.names.set(frozen.name, frozen);
    this.solidTable[frozen.id] = frozen.solid ? 1 : 0;
    this.opaqueTable[frozen.id] = frozen.opaque ? 1 : 0;
    return frozen;
  }

  has(id: number): boolean {
    return this.defs.has(id);
  }

  get(id: number): BlockDef {
    const def = this.defs.get(id);
    if (!def) throw new Error(`Unknown block id ${id}`);
    return def;
  }

  byName(name: string): BlockDef {
    const def = this.names.get(name);
    if (!def) throw new Error(`Unknown block name ${name}`);
    return def;
  }

  all(): BlockDef[] {
    return [...this.defs.values()].sort((a, b) => a.id - b.id);
  }

  // Hot paths (collision, meshing) use these. Unknown ids read as not solid and not opaque.
  isSolid(id: number): boolean {
    return this.solidTable[id] === 1;
  }

  isOpaque(id: number): boolean {
    return this.opaqueTable[id] === 1;
  }
}
