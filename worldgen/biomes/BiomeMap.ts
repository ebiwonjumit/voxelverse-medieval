import { MILE } from '../../worldConstants';
import { SimplexNoise, domainWarp, fbm, hash2 } from '../noise';
import { FOREST_START, SHORE_X, TerrainField } from '../terrain/TerrainField';
import { Biome } from './Biome';

// Where the land has character. Positions are in blocks; the legacy zones sit at the Town (0, 0), Tempest
// (1500, 0), Amestris (-1500, 0), Bosse (0, -1500), Fremmevilla (1600, -1600) and Magnolia (-1600, 1600).
const TEMPEST_X = 3 * MILE;
const HOME_Z = 150;           // the Town of Beginnings and Greensom, the centre of the old gentle country
const MAGNOLIA = { x: -1600, z: 1600 };
const FREMMEVILLA = { x: 1600, z: -1600 };

const smoothstep = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// Everything the biome choice and the vegetation read, as numbers, so one pass over the noise serves both.
export interface Climate {
  temperature: number;   // -1 cold .. 1 warm
  moisture: number;      // -1 dry .. 1 wet
  woodiness: number;     // above 0 the land carries woods, below it meadow
  wetness: number;       // 0..1, how much of a wetland pocket this place is (before the elevation check)
  belt: number;          // 0..1, the lush cedar, bamboo and sakura belt around Tempest
  home: number;          // 0..1, the gentle meadow and oak country around the Town and Greensom
  density: number;       // multiplier for how thickly trees stand here
}

export const newClimate = (): Climate => ({
  temperature: 0, moisture: 0, woodiness: 0, wetness: 0, belt: 0, home: 0, density: 1,
});

// Temperature, moisture and elevation fields with a regional bias on top, and the biome they add up to.
//  - Tempest belt: the land within about a mile of Tempest is lush cedar forest with bamboo groves and sakura groves.
//  - Home country: meadow with scattered oaks and a few woods around the Town and Greensom, like the old world.
//  - South of z = 4000 the woods are denser; the far east mountains turn rocky and then alpine with height.
//  - West: beaches along the coast. Wetland pockets and the odd sakura or bamboo grove turn up anywhere else.
// Every field is read at a wandering position and every threshold gets a little noise added, so biome borders are
// ragged at two scales and never straight.
export class BiomeMap {
  private readonly warp: SimplexNoise;
  private readonly temp: SimplexNoise;
  private readonly moist: SimplexNoise;
  private readonly woods: SimplexNoise;
  private readonly kind: SimplexNoise;
  private readonly patch: SimplexNoise;
  private readonly wet: SimplexNoise;
  private readonly rock: SimplexNoise;
  private readonly jitter: SimplexNoise;
  private readonly sakura: SimplexNoise;
  private readonly bamboo: SimplexNoise;
  private readonly beltEdge: SimplexNoise;
  private readonly scratch = { x: 0, z: 0 };
  private readonly climateScratch = newClimate();

  constructor(readonly seed: number, readonly field: TerrainField = new TerrainField(seed)) {
    const make = (salt: number) => new SimplexNoise(hash2(salt, 0xb10e, seed) | 0);
    this.warp = make(21);
    this.temp = make(22);
    this.moist = make(23);
    this.woods = make(24);
    this.kind = make(25);
    this.patch = make(26);
    this.wet = make(27);
    this.rock = make(28);
    this.jitter = make(29);
    this.sakura = make(30);
    this.bamboo = make(31);
    this.beltEdge = make(32);
  }

  // Unwarped wilderness height, the elevation input of the biome choice.
  elevation(x: number, z: number): number {
    return this.field.height(x, z);
  }

  temperature(x: number, z: number): number {
    return this.climate(x, z, this.elevation(x, z), this.climateScratch).temperature;
  }

  moisture(x: number, z: number): number {
    return this.climate(x, z, this.elevation(x, z), this.climateScratch).moisture;
  }

  // Fills `out` with the climate at a column. `elev` is the wilderness height there (it cools the air up high).
  climate(x: number, z: number, elev: number, out: Climate): Climate {
    const w = domainWarp(this.warp, x, z, 70, 0.006, this.scratch);
    const wx = w.x, wz = w.z;

    // The belt's radius wanders by a few hundred blocks so it is a lobed shape, not a circle.
    const dTempest = Math.hypot(wx - TEMPEST_X, wz) + 330 * this.beltEdge.noise2(wx / 750, wz / 750);
    // Full strength out to 900 blocks, gone by 1600: Tempest's radius is 700, so a belt about 200 blocks wide
    // always hugs the zone and then thins out across the land towards the Town.
    const belt = 1 - smoothstep((dTempest - 900) / 700);
    const home = 1 - smoothstep((Math.hypot(wx, wz - HOME_Z) - 380) / 450);
    const magnolia = 1 - smoothstep((Math.hypot(wx - MAGNOLIA.x, wz - MAGNOLIA.z) - 450) / 650);
    const north = smoothstep((-wz - 600) / 2400);
    const south = smoothstep((wz - (FOREST_START - 800)) / 1000);

    const lapse = elev > 20 ? (elev - 20) / 55 : 0;
    out.temperature = 0.7 * fbm(this.temp, wx / 1800, wz / 1800, { octaves: 3 }) - 0.35 * north + 0.1 * south - lapse;
    out.moisture = 0.8 * fbm(this.moist, wx / 1300, wz / 1300, { octaves: 3 }) + 0.3 * south + 0.5 * belt + 0.15 * magnolia;

    // Woods are patchy at about 500 blocks. The belt and the south push towards forest, the home country away.
    // A broad component makes whole regions woodland or open country; the finer ones make it patchy inside them.
    out.woodiness = 0.55 * fbm(this.woods, wx / 800, wz / 800, { octaves: 3 }) + 0.5 * this.woods.noise2(wx / 2600 + 13, wz / 2600) +
      0.55 * belt + 0.4 * south - 0.3 * home + 0.05;

    // Pockets of marsh: rare and small, never near the Town. The elevation check happens in classify().
    const wetNoise = fbm(this.wet, wx / 420, wz / 420, { octaves: 2 }) + 0.12 * out.moisture + 0.04 * south;
    // The ramp is wide on purpose: the terrain is flattened by this weight, and a narrow ramp on a noise that is
    // steep in places would turn into a cliff.
    out.wetness = smoothstep((wetNoise - 0.1) / 0.7) * (1 - home) * (1 - 0.8 * belt) * (1 - smoothstep((wx - 6500) / 3000));

    out.belt = belt;
    out.home = home;
    // Tree density multiplier: the belt and the south are thick, the home country sparse.
    out.density = 1 + 0.5 * belt + 0.8 * south - 0.55 * home;
    return out;
  }

  // The biome for a column. `elev` is the wilderness height there, `c` the climate from climate().
  classify(x: number, z: number, elev: number, c: Climate): Biome {
    // Edge jitter, so thresholds are never crossed along a smooth line.
    const j = this.jitter.noise2(x * 0.03, z * 0.03);
    const w = domainWarp(this.warp, x, z, 70, 0.006, this.scratch);
    const wx = w.x, wz = w.z;

    // Coast: low ground west of the shore line is beach, including the shallows.
    if (wx < SHORE_X + 900 && elev < 5.5 + 2.2 * j) return Biome.BEACH;

    // Mountains: height decides, with rock noise so the snow line and the rock line wander.
    const rockNoise = this.rock.noise2(wx / 300, wz / 300);
    const frem = 1 - smoothstep((Math.hypot(wx - FREMMEVILLA.x, wz - FREMMEVILLA.z) - 400) / 700);
    const high = elev + 7 * rockNoise + 14 * frem + 3 * j;
    if (high > 86 - 4 * Math.min(1.5, Math.max(0, -c.temperature))) return Biome.ALPINE;
    if (high > 31) return Biome.ROCKY_HILLS;

    if (c.wetness + 0.05 * j > 0.55 && elev < 14) return Biome.WETLAND;

    // The belt, with its own patches of cedar, bamboo and sakura.
    if (c.belt * (1 - 0.8 * c.home) + 0.12 * j > 0.5) {
      // Two scales of patch, a broad one and a smaller one, so groves differ in size; a faint fine octave only
      // roughens their edges.
      const p = 0.65 * this.patch.noise2(x / 650, z / 650) + 0.5 * this.patch.noise2(x / 240 + 40, z / 240) +
        0.15 * this.patch.noise2(x / 90, z / 90 - 20) + 0.08 * j;
      if (p < -0.38) return Biome.SAKURA_GROVE;
      if (p > 0.4) return Biome.BAMBOO_GROVE;
      return Biome.CEDAR_FOREST;
    }

    // Small groves of sakura and bamboo anywhere that is not the home country; Magnolia has plenty of sakura.
    const away = 1 - c.home;
    const magnolia = 1 - smoothstep((Math.hypot(wx - MAGNOLIA.x, wz - MAGNOLIA.z) - 450) / 650);
    if (away > 0.7 && this.sakura.noise2(wx / 380, wz / 380) + 0.4 * magnolia + 0.08 * j > 0.8) return Biome.SAKURA_GROVE;
    if (away > 0.7 && c.moisture > 0.1 && this.bamboo.noise2(wx / 420, wz / 420) + 0.08 * j > 0.8) return Biome.BAMBOO_GROVE;

    if (c.woodiness + 0.04 * j < 0) return Biome.MEADOW;

    // Which wood: cold gives pine, warm moist ground gives oak, the rest birch, with some cedar where it is cool and wet.
    const k = fbm(this.kind, wx / 1000, wz / 1000, { octaves: 2 }) + 0.5 * c.temperature + 0.1 * j;
    if (k < -0.3) return Biome.PINE_FOREST;
    if (c.moisture > 0.25 && c.temperature < 0.15 && k < 0.05) return Biome.CEDAR_FOREST;
    if (k < 0.12) return Biome.BIRCH_WOOD;
    return Biome.OAK_WOOD;
  }

  // Convenience for tools and tests that only have a position.
  biomeAt(x: number, z: number): Biome {
    const elev = this.elevation(x, z);
    return this.classify(x, z, elev, this.climate(x, z, elev, this.climateScratch));
  }
}
