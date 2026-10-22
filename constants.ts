import { Vector3 } from 'three';
import { MILE } from './worldConstants';

export * from './worldConstants';

// Zone Test Locations
export const ZONE_LOCATIONS = {
  SAO: new Vector3(0, 15, 0),                    // Town of Beginnings (center)
  GREENSOM: new Vector3(0, 15, 300),             // Greensom Village (south of SAO)
  TEMPEST: new Vector3(3 * MILE, 15, 0),         // Federation of Tempest (east, 1500 blocks)
  AMESTRIS: new Vector3(-3 * MILE, 15, 0),       // Amestris District (west, -1500 blocks)
  BOSSE: new Vector3(0, 40, -3 * MILE),          // Kingdom of Bosse (north, -1500 blocks, elevated)
  FREMMEVILLA: new Vector3(1600, 15, -1600),     // Kingdom of Fremmevilla (northeast)
  MAGNOLIA: new Vector3(-1600, 15, 1600),        // Magnolia Town (southwest)
  WILDERNESS: new Vector3(500, 15, 500),         // Wilderness area
  WILDERNESS_MOUNTAINS: new Vector3(20 * MILE, 15, 0),  // Mountains (east)
  WILDERNESS_COAST: new Vector3(-4 * MILE, 15, 0),      // Coast (west)
  WILDERNESS_FOREST: new Vector3(0, 15, 10 * MILE),     // Forest (south)
};

// Start at Greensom (South of SAO)
export const INITIAL_SPAWN = ZONE_LOCATIONS.GREENSOM;
