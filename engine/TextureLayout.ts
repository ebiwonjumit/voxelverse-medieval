import { BlockRegistry } from './BlockRegistry';
import { MAX_BLOCK_ID } from './cell';

// Which layer of the texture array each face of each block samples. The mesher writes these numbers into
// its vertices and the atlas builder fills the array in the same order, so both sides build a layout from
// the same two inputs and get the same answer. It is plain data (no Three.js), so a worker can build it.

/** What the layout needs to know about one catalog tile, without importing the catalog. */
export interface TileDescriptor {
  name: string;
  /** The tile is neutral grey and takes a biome colour. */
  tint: boolean;
  /** Only part of the tile is tinted (a grass side): the tint mask gets a layer of its own. */
  overlay: boolean;
}

export const FACE_TOP = 0;
export const FACE_BOTTOM = 1;
export const FACE_SIDE = 2;
export type FaceKind = typeof FACE_TOP | typeof FACE_BOTTOM | typeof FACE_SIDE;

export const TINT_NONE = 0;
export const TINT_GRASS = 1;
export const TINT_FOLIAGE = 2;

export const OVERLAY_SUFFIX = '#tint';
export const FLAT_PREFIX = 'flat:';
const UNKNOWN_COLOR = '#ff00ff';

export class TextureLayout {
  /** Layer to name. A tint overlay is `<name>#tint`, a flat colour tile is `flat:#rrggbb`. */
  readonly layerNames: string[] = [];
  /** Name to its (base) layer. */
  readonly layerOf = new Map<string, number>();
  /** Layer holding the tint mask of a partly tinted tile, or -1. Indexed by base layer. */
  overlayOf = new Int16Array(0);
  /** 1 for layers whose tile takes a biome tint. */
  tintable = new Uint8Array(0);
  /** Layer for each (id, top | bottom | side): index id * 3 + face. Unregistered ids read as the magenta tile. */
  readonly faceLayers = new Uint16Array((MAX_BLOCK_ID + 1) * 3);
  /** TINT_NONE, TINT_GRASS or TINT_FOLIAGE for each (id, face), already false for faces that cannot be tinted. */
  readonly faceTint = new Uint8Array((MAX_BLOCK_ID + 1) * 3);
  /** The layer unregistered ids draw with. */
  unknownLayer = 0;
  /** Texture names that blocks asked for and the catalog did not have. Those faces draw flat. */
  readonly missing: string[] = [];
  /** Number of blocks the registry held when the layout was built. */
  readonly registrySize: number;

  constructor(tiles: readonly TileDescriptor[], registry: BlockRegistry) {
    this.registrySize = registry.size;
    const overlay: number[] = [];
    const tintable: number[] = [];

    const add = (name: string, tint: boolean): number => {
      const layer = this.layerNames.length;
      this.layerNames.push(name);
      overlay.push(-1);
      tintable.push(tint ? 1 : 0);
      return layer;
    };

    for (const tile of tiles) {
      if (this.layerOf.has(tile.name)) throw new Error(`Texture "${tile.name}" appears twice in the layout`);
      const base = add(tile.name, tile.tint);
      this.layerOf.set(tile.name, base);
      if (tile.tint && tile.overlay) overlay[base] = add(tile.name + OVERLAY_SUFFIX, false);
    }

    // Flat tiles follow the catalog, in block id order, one per distinct colour.
    const flat = (color: string): number => {
      const name = FLAT_PREFIX + color.toLowerCase();
      let layer = this.layerOf.get(name);
      if (layer === undefined) {
        layer = add(name, false);
        this.layerOf.set(name, layer);
      }
      return layer;
    };

    const defs = registry.all();
    const layerFor = (def: (typeof defs)[number], key: 'top' | 'bottom' | 'side'): number => {
      const wanted = def.faces?.[key];
      if (wanted === undefined) return flat(def.color);
      const layer = this.layerOf.get(wanted);
      if (layer !== undefined && !wanted.startsWith(FLAT_PREFIX)) return layer;
      if (!this.missing.includes(wanted)) this.missing.push(wanted);
      return flat(def.color);
    };

    const unknown = flat(UNKNOWN_COLOR);
    this.unknownLayer = unknown;
    for (let i = 0; i < this.faceLayers.length; i += 3) {
      this.faceLayers[i] = this.faceLayers[i + 1] = this.faceLayers[i + 2] = unknown;
    }

    for (const def of defs) {
      const keys = ['top', 'bottom', 'side'] as const;
      for (let k = 0; k < 3; k++) {
        const layer = layerFor(def, keys[k]);
        this.faceLayers[def.id * 3 + k] = layer;
        if (def.tint && tintable[layer]) this.faceTint[def.id * 3 + k] = def.tint === 'grass' ? TINT_GRASS : TINT_FOLIAGE;
      }
    }

    this.overlayOf = Int16Array.from(overlay);
    this.tintable = Uint8Array.from(tintable);
  }

  get layerCount(): number {
    return this.layerNames.length;
  }

  /** Layer of a catalog tile or flat tile by name; throws for names the layout does not hold. */
  layer(name: string): number {
    const layer = this.layerOf.get(name);
    if (layer === undefined) throw new Error(`Texture "${name}" is not in the layout`);
    return layer;
  }

  /** The layer for one face kind of a block (FACE_TOP, FACE_BOTTOM or FACE_SIDE). */
  faceLayer(id: number, face: FaceKind): number {
    return this.faceLayers[id * 3 + face];
  }
}

export const createTextureLayout = (tiles: readonly TileDescriptor[], registry: BlockRegistry): TextureLayout =>
  new TextureLayout(tiles, registry);
