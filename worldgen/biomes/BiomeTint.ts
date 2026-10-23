import { Biome, BIOME_COUNT } from './Biome';

// The natural colour of grass and leaves over each wilderness biome, as #rrggbb. The mesher multiplies the grass tile by
// it, so it reads as a lighter or deeper green, not as a paint: SAO's vivid #4ade80 is the zone look these sit beside.
// meshing/biomeTint.ts turns the table into a smooth field (createLatticeTint) and blends it into the zone colours near
// each zone. Indexed by the Biome enum.
const GRASS: Readonly<Record<Biome, string>> = {
  [Biome.MEADOW]: '#63c94b',        // bright meadow green
  [Biome.BIRCH_WOOD]: '#a2cd4a',    // yellow-green, light under birch
  [Biome.OAK_WOOD]: '#4fb347',      // a shade deeper than the meadow
  [Biome.CEDAR_FOREST]: '#2e9d68',  // deep blue-green
  [Biome.PINE_FOREST]: '#2a8f68',   // deep blue-green, a little cooler
  [Biome.BAMBOO_GROVE]: '#79dc50',  // fresh bamboo green
  [Biome.SAKURA_GROVE]: '#76d478',  // lush, with a soft cool note
  [Biome.WETLAND]: '#8ea83f',       // olive
  [Biome.ROCKY_HILLS]: '#86b668',   // thin, dry grass between the stones
  [Biome.ALPINE]: '#b9d3b0',        // pale, frosted
  [Biome.BEACH]: '#9ccc5c',         // sun-bleached dune grass
};

export const BIOME_GRASS_HEX: readonly string[] = Array.from({ length: BIOME_COUNT }, (_, i) => GRASS[i as Biome]);
