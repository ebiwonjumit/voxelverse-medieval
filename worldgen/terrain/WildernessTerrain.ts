import { Biome } from '../biomes/Biome';
import { BiomeMap, Climate, newClimate } from '../biomes/BiomeMap';
import { SimplexNoise, fbm, hash2 } from '../noise';
import { RIVER_FLOOR, RiverField, RiverSample } from '../water/RiverField';
import { clearanceFromZones } from '../zones/ZoneClearance';
import { WATER_LEVEL } from '../../worldConstants';
import { TerrainField } from './TerrainField';

const smoothstep = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// Wetland ground sits just above the water line with a little relief, so puddles and ponds stand in it.
const WET_BASE = WATER_LEVEL + 1;
const WET_RELIEF = 1.7;
const POND_FLOOR = WATER_LEVEL - 1.8;

// Rivers, ponds and marsh flattening fade out over this many blocks before a zone footprint, so the zone's own
// terrain and the blend into the wilderness (ZoneBlender) meet the unshaped height W exactly at the border.
const ZONE_FADE = 140;

export interface WildSample {
  height: number;          // ground height in blocks, a float
  base: number;            // the wilderness height W before rivers, ponds and marsh shaped it
  river: number;           // 0..1 valley weight (channel and banks) after the zone fade
  edge: number;            // blocks from the nearest channel edge, negative in the channel
  pond: number;            // 0..1 how pond-like the column is
  climate: Climate;
}

export const newWildSample = (): WildSample => ({
  height: 0, base: 0, river: 0, edge: 1e9, pond: 0, climate: newClimate(),
});

// The wilderness as it is actually shaped: W from TerrainField, then marsh flattening and ponds in wetland pockets,
// then river valleys, all faded out near legacy zones. This is the height the generator uses wherever no zone owns
// the column, and what ZoneBlender blends towards at a zone's rim (the fade makes the two the same there).
export class WildernessTerrain {
  private readonly micro: SimplexNoise;
  private readonly pondNoise: SimplexNoise;
  private readonly riverScratch: RiverSample = { carve: 0, edge: 1e9 };

  constructor(
    readonly field: TerrainField,
    readonly biomes: BiomeMap,
    readonly rivers: RiverField,
    seed: number,
  ) {
    this.micro = new SimplexNoise(hash2(51, 0x7e77, seed) | 0);
    this.pondNoise = new SimplexNoise(hash2(52, 0x7e77, seed) | 0);
  }

  sample(x: number, z: number, out: WildSample): WildSample {
    const base = this.field.height(x, z);
    const c = this.biomes.climate(x, z, base, out.climate);
    out.base = base;
    out.pond = 0;
    let h = base;

    // The weights below never depend on the height itself. A weight that did would multiply the height difference
    // by its own slope and make cliffs wherever the ground is rough.
    const wet = c.wetness;
    if (wet > 0) {
      const target = WET_BASE + WET_RELIEF * this.micro.noise2(x / 45, z / 45);
      // Pull the ground towards the marsh level, by at most 14 blocks down and 3 up, so a hill a marsh happens to
      // overlap is lowered a good way but not dug out of the mountains.
      const delta = h - target;
      h -= wet * (delta > 14 ? 14 : delta < -3 ? -3 : delta);
      // Wide ramps again: a pond's rim must be a slope a player can walk.
      const pondShape = smoothstep((fbm(this.pondNoise, x / 70, z / 70, { octaves: 2 }) - 0.1) / 0.8);
      out.pond = pondShape * smoothstep((wet - 0.55) / 0.35);
      // At most 4 blocks deep, so a pond dug into ground the marsh has not flattened yet is still a gentle bowl.
      if (out.pond > 0) h += Math.max(-4, POND_FLOOR - h) * out.pond;
    }

    const river = this.rivers.sample(x, z, h, this.riverScratch);
    if (river.carve > 0 && h > RIVER_FLOOR) h = RIVER_FLOOR + (h - RIVER_FLOOR) * (1 - river.carve);
    out.edge = river.edge;
    out.river = river.carve;

    if (h !== base) {
      const fade = smoothstep(clearanceFromZones(x, z) / ZONE_FADE);
      if (fade < 1) {
        h = base + (h - base) * fade;
        out.river *= fade;
        out.pond *= fade;
      }
    }
    out.height = h;
    return out;
  }

  biome(x: number, z: number, s: WildSample): Biome {
    return this.biomes.classify(x, z, s.base, s.climate);
  }
}
