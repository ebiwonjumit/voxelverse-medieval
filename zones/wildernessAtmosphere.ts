import { Biome } from '../worldgen/biomes/Biome';
import { AtmosphereSettings } from './Zone';

// The wilderness has no single look: it is clear blue country with a light touch of the biome it is over. The base is
// the open sky of the Town of Beginnings (fog #87ceeb, a plain white tint), so walking out of a clear zone into
// meadow changes nothing, and each biome nudges it only a little: a green haze under dense woods, a pale mist over
// wetland, crisp and pale over the mountains and the coast. Densities stay at or under the 0.02 reference so the fog
// never closes in on the horizon (see docs/sky.md). Colours are hex strings like every zone's.
export const WILDERNESS_BASE: AtmosphereSettings = { fogColor: '#87ceeb', skyTint: '#f4f9ff', fogDensity: 0.015 };

const BIOME_ATMOSPHERE: Readonly<Record<Biome, AtmosphereSettings>> = {
  [Biome.MEADOW]: WILDERNESS_BASE,
  [Biome.BIRCH_WOOD]: { fogColor: '#8dcfdc', skyTint: '#f1f9fa', fogDensity: 0.016 },
  [Biome.OAK_WOOD]: { fogColor: '#8ccfd4', skyTint: '#f0f9f8', fogDensity: 0.016 },
  [Biome.CEDAR_FOREST]: { fogColor: '#86cbcc', skyTint: '#ecf7f6', fogDensity: 0.018 },
  [Biome.PINE_FOREST]: { fogColor: '#88cad0', skyTint: '#edf6f8', fogDensity: 0.018 },
  [Biome.BAMBOO_GROVE]: { fogColor: '#92d4c8', skyTint: '#eff9f5', fogDensity: 0.018 },
  [Biome.SAKURA_GROVE]: { fogColor: '#9ccfee', skyTint: '#f6f6ff', fogDensity: 0.015 },
  [Biome.WETLAND]: { fogColor: '#aed6e0', skyTint: '#f4f9fb', fogDensity: 0.02 },
  [Biome.ROCKY_HILLS]: { fogColor: '#98cbe9', skyTint: '#f4f9ff', fogDensity: 0.014 },
  [Biome.ALPINE]: { fogColor: '#addaf3', skyTint: '#f2f8ff', fogDensity: 0.012 },
  [Biome.BEACH]: { fogColor: '#a6d9ef', skyTint: '#f6fbff', fogDensity: 0.014 },
};

// The wilderness atmosphere over a biome, or the plain base where the biome is unknown.
export const wildernessAtmosphere = (biome: number | null | undefined): AtmosphereSettings =>
  (biome === null || biome === undefined ? undefined : BIOME_ATMOSPHERE[biome as Biome]) ?? WILDERNESS_BASE;
