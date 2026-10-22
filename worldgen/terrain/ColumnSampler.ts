import { NatureBlock } from '../../content/blocksNature';
import { TERRAIN_MAX_Y, TERRAIN_MIN_Y } from '../../engine/coords';
import { BlockType, WATER_LEVEL } from '../../worldConstants';
import { Zone } from '../../zones/Zone';
import { Biome } from '../biomes/Biome';
import { BiomeMap } from '../biomes/BiomeMap';
import { SimplexNoise, hash2 } from '../noise';
import { RiverField } from '../water/RiverField';
import { WILDERNESS_NAME } from '../zones/ZoneInfo';
import { TerrainField } from './TerrainField';
import { WildernessTerrain, WildSample, newWildSample } from './WildernessTerrain';
import { ZoneBlender } from './ZoneBlender';

// Everything the generator needs to know about one column, computed once and shared by terrain, surface and
// features. In a zone only zone, wild (false) and ground are filled in; the zone places its own blocks.
export interface Column {
  zone: Zone;
  wild: boolean;          // the wilderness owns this column (not a legacy zone)
  ground: number;         // height of the surface block
  biome: Biome;
  density: number;        // how thickly trees stand here (1 is the plain forest rate)
  surface: number;        // block id at y = ground
  subsoil: number;        // block id under the surface, for `depth` blocks, then stone
  depth: number;
  soil: boolean;          // land with soil a plant can root in
  shore: boolean;         // land at or just above the water line, where reeds grow
  river: number;          // 0..1 river valley weight
  edge: number;           // blocks from the nearest river channel edge, negative inside
  pond: number;           // 0..1 pond weight
}

export const newColumn = (zone: Zone): Column => ({
  zone, wild: false, ground: 0, biome: Biome.MEADOW, density: 1, surface: BlockType.GRASS,
  subsoil: BlockType.DIRT, depth: 0, soil: false, shore: false, river: 0, edge: 1e9, pond: 0,
});

const clampGround = (h: number): number => {
  const g = Math.floor(h);
  return g < TERRAIN_MIN_Y ? TERRAIN_MIN_Y : g > TERRAIN_MAX_Y ? TERRAIN_MAX_Y : g;
};

const SOIL = new Set<number>([BlockType.GRASS, BlockType.DIRT, NatureBlock.MOSS, NatureBlock.PODZOL, NatureBlock.MUD]);
const HARD = new Set<number>([BlockType.STONE, NatureBlock.GRANITE, BlockType.SNOW]);

// Turns a position into a Column: which zone owns it, how high the ground is, and for the wilderness which biome
// it is and what its surface is made of. Both generateChunk and sampleBlock go through here, so they cannot
// disagree about any of it.
export class ColumnSampler {
  readonly field: TerrainField;
  readonly biomes: BiomeMap;
  readonly rivers: RiverField;
  readonly terrain: WildernessTerrain;
  readonly blender: ZoneBlender;
  private readonly patchA: SimplexNoise;
  private readonly patchB: SimplexNoise;
  private readonly wild = newWildSample();

  constructor(readonly seed: number) {
    this.field = new TerrainField(seed);
    this.biomes = new BiomeMap(seed, this.field);
    this.rivers = new RiverField(seed);
    this.terrain = new WildernessTerrain(this.field, this.biomes, this.rivers, seed);
    this.blender = new ZoneBlender(this.field);
    this.patchA = new SimplexNoise(hash2(61, 0x5f1c, seed) | 0);
    this.patchB = new SimplexNoise(hash2(62, 0x5f1c, seed) | 0);
  }

  // Ground height only, the cheap path for terrainHeight().
  height(x: number, z: number): number {
    const zone = this.blender.zoneAt(x, z);
    if (zone.name !== WILDERNESS_NAME) return this.blender.height(x, z, zone);
    return clampGround(this.terrain.sample(x, z, this.wild).height);
  }

  sample(x: number, z: number, out: Column): Column {
    const zone = this.blender.zoneAt(x, z);
    out.zone = zone;
    if (zone.name !== WILDERNESS_NAME) {
      out.wild = false;
      out.ground = this.blender.height(x, z, zone);
      return out;
    }
    const s = this.terrain.sample(x, z, this.wild);
    const ground = clampGround(s.height);
    out.wild = true;
    out.ground = ground;
    out.biome = this.terrain.biome(x, z, s);
    out.density = s.climate.density;
    out.river = s.river;
    out.edge = s.edge;
    out.pond = s.pond;
    this.surface(x, z, out, s);
    return out;
  }

  // Surface block by biome, then the special cases: river banks and beds, ponds, beaches.
  private surface(x: number, z: number, c: Column, s: WildSample): void {
    const ground = c.ground;
    const p = this.patchA.noise2(x * 0.035, z * 0.035);
    const q = this.patchB.noise2(x * 0.11 + 9, z * 0.11);
    let block: number = BlockType.GRASS;

    if (ground < WATER_LEVEL) {
      // Under water: mud in ponds, sand and gravel in rivers, sand in the sea.
      if (s.pond > 0.2) block = NatureBlock.MUD;
      else if (s.river > 0.1) block = q > 0.2 ? NatureBlock.GRAVEL : BlockType.SAND;
      else block = BlockType.SAND;
    } else if (s.river > 0.12 && ground <= WATER_LEVEL + 2) {
      block = q > 0.5 ? NatureBlock.GRAVEL : BlockType.SAND;
    } else {
      switch (c.biome) {
        case Biome.BEACH:
          block = ground <= WATER_LEVEL + 3 || p > 0.3 ? BlockType.SAND : BlockType.GRASS;
          break;
        case Biome.ALPINE:
          if (ground > 62 + 10 * p) block = BlockType.SNOW;
          else block = q > 0.2 ? NatureBlock.GRAVEL : BlockType.STONE;
          break;
        case Biome.ROCKY_HILLS: {
          const v = p + 0.3 * q;
          if (v > 0.35) block = NatureBlock.GRAVEL;
          else if (v < -0.4) block = NatureBlock.GRANITE;
          else if (v < 0.1 || ground > 50) block = BlockType.STONE;
          else block = BlockType.GRASS;
          break;
        }
        case Biome.WETLAND:
          block = p > 0.2 || s.pond > 0.1 ? NatureBlock.MUD : p < -0.15 ? NatureBlock.MOSS : BlockType.GRASS;
          break;
        case Biome.CEDAR_FOREST:
          block = q > 0.35 ? NatureBlock.MOSS : p < -0.4 ? NatureBlock.PODZOL : BlockType.GRASS;
          break;
        case Biome.PINE_FOREST:
          block = p < -0.2 ? NatureBlock.PODZOL : q > 0.45 ? NatureBlock.GRAVEL : BlockType.GRASS;
          break;
        case Biome.MEADOW:
          block = q > 0.62 ? NatureBlock.GRAVEL : BlockType.GRASS;
          break;
        default:
          break;
      }
    }

    c.surface = block;
    if (block === BlockType.SAND) { c.subsoil = BlockType.SAND; c.depth = 3; }
    else if (block === NatureBlock.GRAVEL) { c.subsoil = NatureBlock.GRAVEL; c.depth = 2; }
    else if (HARD.has(block)) { c.subsoil = BlockType.STONE; c.depth = 0; }
    else { c.subsoil = BlockType.DIRT; c.depth = 3; }
    c.soil = ground > WATER_LEVEL && SOIL.has(block);
    c.shore = ground >= WATER_LEVEL && ground <= WATER_LEVEL + 2 && !HARD.has(block);
  }
}
