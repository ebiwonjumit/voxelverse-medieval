import { FX_ALL } from './blockFx';
import { MAX_BLOCK_ID } from './cell';
import { BlockModel } from './models/BlockModel';
import { CUBE_MODEL } from './models/CubeModel';

// Texture names for the three kinds of face of a block. Names refer to the texture catalog; the engine only
// carries them, it never looks them up.
export interface BlockFaces {
  top: string;
  bottom: string;
  side: string;
}

// Which biome colour multiplies the block's tintable faces: 'grass' is the zone's grass colour, 'foliage' the
// same colour darkened for leaves. Only faces whose texture can take a tint are affected (see TextureLayout).
export type BlockTint = 'grass' | 'foliage';

// Block definitions are data. Textures, models and lighting rules are looked up from them,
// so adding a block never means touching the renderer.
export interface BlockDef {
  id: number;       // 0..4095, stored in the low bits of a cell
  name: string;     // "namespace:block_name"
  color: string;    // flat colour as #rrggbb, drawn as a flat tile when the block has no faces
  solid: boolean;   // blocks the player
  opaque: boolean;  // a solid material that hides the faces of neighbours it covers (a stair covers only its back and base)
  emits: number;    // block light level 0..15
  // How much light the block soaks up passing through it, 0..15 (default 0). A block that is not opaque lets light
  // through at the usual cost of 1 per block; a block with a dim above 0 also stops sky light from falling through
  // it for free, and one above 1 costs that much per block. Leaves use 1, so a canopy shades what is under it.
  lightDim?: number;
  faces?: BlockFaces; // texture names; a block without them is drawn in its flat colour
  tint?: BlockTint;
  // What the block looks like and where it can be bumped into. Blocks without one are plain cubes. What the 4-bit
  // state of a cell means is up to the model (see engine/models and docs/models.md).
  model?: BlockModel;
  // The cell also holds a cube of water, so water beside it is not drawn against it (a lily pad sits in water).
  holdsWater?: boolean;
  // How far the wind moves the block, 0 (never) to 1 (a blade of grass). Purely visual: the mesher writes a per-vertex
  // weight from it and the chunk material displaces by that weight (see docs/effects.md). Collision, light and culling
  // never see it. A full cube (leaves) sways by the same amount everywhere; any other shape sways more toward its top and
  // not at all at its base, and a stack of the same block (bamboo, reeds) sways as one stalk.
  sway?: number;
  // Which living-world effects start from this block: a bit set of BlockFx (see engine/blockFx.ts). Purely visual, like sway.
  fx?: number;
  // How strongly the block's own glow flickers, 0 (steady) to 1 (a fire). The mesher writes it per vertex and the chunk
  // shader modulates the block's brightness by a time-based pattern (docs/effects.md): the baked light is not touched, so
  // nothing is re-meshed. Only blocks that emit light make sense here.
  flicker?: number;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export class BlockRegistry {
  private readonly defs = new Map<number, BlockDef>();
  private readonly names = new Map<string, BlockDef>();
  private readonly solidTable = new Uint8Array(MAX_BLOCK_ID + 1);
  private readonly opaqueTable = new Uint8Array(MAX_BLOCK_ID + 1);
  private readonly emitTable = new Uint8Array(MAX_BLOCK_ID + 1);
  private readonly dimTable = new Uint8Array(MAX_BLOCK_ID + 1);
  private readonly swayTable = new Float32Array(MAX_BLOCK_ID + 1);
  private readonly fxTable = new Uint8Array(MAX_BLOCK_ID + 1);
  private readonly flickerTable = new Float32Array(MAX_BLOCK_ID + 1);
  private readonly modelTable: BlockModel[] = new Array(MAX_BLOCK_ID + 1).fill(CUBE_MODEL);

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
    if (def.lightDim !== undefined && (!Number.isInteger(def.lightDim) || def.lightDim < 0 || def.lightDim > 15)) {
      throw new RangeError(`Block ${def.name} has lightDim ${def.lightDim}, expected 0..15`);
    }
    if (def.sway !== undefined && !(def.sway >= 0 && def.sway <= 1)) {
      throw new RangeError(`Block ${def.name} has sway ${def.sway}, expected 0..1`);
    }
    if (def.fx !== undefined && (!Number.isInteger(def.fx) || def.fx < 0 || def.fx > FX_ALL)) {
      throw new RangeError(`Block ${def.name} has fx ${def.fx}, expected a set of BlockFx bits (0..${FX_ALL})`);
    }
    if (def.flicker !== undefined && !(def.flicker >= 0 && def.flicker <= 1)) {
      throw new RangeError(`Block ${def.name} has flicker ${def.flicker}, expected 0..1`);
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
    if (def.faces) {
      for (const key of ['top', 'bottom', 'side'] as const) {
        if (typeof def.faces[key] !== 'string' || !def.faces[key]) {
          throw new Error(`Block ${def.name} has no texture name for its ${key} face`);
        }
      }
    }
    if (def.tint !== undefined && def.tint !== 'grass' && def.tint !== 'foliage') {
      throw new Error(`Block ${def.name} has tint ${String(def.tint)}, expected grass or foliage`);
    }
    if (def.model !== undefined && typeof def.model.quads !== 'function') {
      throw new Error(`Block ${def.name} has a model that is not a BlockModel`);
    }
    const frozen = Object.freeze({ ...def, faces: def.faces ? Object.freeze({ ...def.faces }) : undefined });
    this.defs.set(frozen.id, frozen);
    this.names.set(frozen.name, frozen);
    this.solidTable[frozen.id] = frozen.solid ? 1 : 0;
    this.opaqueTable[frozen.id] = frozen.opaque ? 1 : 0;
    this.emitTable[frozen.id] = frozen.emits;
    this.dimTable[frozen.id] = frozen.lightDim ?? 0;
    this.swayTable[frozen.id] = frozen.sway ?? 0;
    this.fxTable[frozen.id] = frozen.fx ?? 0;
    this.flickerTable[frozen.id] = frozen.flicker ?? 0;
    this.modelTable[frozen.id] = frozen.model ?? CUBE_MODEL;
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

  // Light rules, read by the light engine. Unknown ids emit nothing and let light through.
  emission(id: number): number {
    return this.emitTable[id];
  }

  lightDim(id: number): number {
    return this.dimTable[id];
  }

  // How far the wind moves the block, 0 to 1. Unknown ids do not sway.
  sway(id: number): number {
    return this.swayTable[id];
  }

  // The living-world effects that start from the block, as a set of BlockFx bits. Unknown ids have none.
  fx(id: number): number {
    return this.fxTable[id];
  }

  // How strongly the block's glow flickers, 0 to 1. Unknown ids do not flicker.
  flicker(id: number): number {
    return this.flickerTable[id];
  }

  // The model of a block. Unknown ids read as plain cubes, which is how the mesher draws them (as magenta cubes).
  model(id: number): BlockModel {
    return this.modelTable[id] ?? CUBE_MODEL;
  }
}
