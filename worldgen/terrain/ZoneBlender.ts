import { TERRAIN_MAX_Y, TERRAIN_MIN_Y } from '../../engine/coords';
import { Zone } from '../../zones/Zone';
import { getZone } from '../../zones';
import { WILDERNESS_NAME, clampToCore, insetFromEdge, zoneInfoByName } from '../zones/ZoneInfo';
import { TerrainField } from './TerrainField';

// The band samples the zone's rim on a 3 x 3 grid this many blocks apart and averages it. The legacy zones are not
// smooth along their rim (Greensom's stream is cut off by a circle, for one), and carrying a 4 block step out into
// the band would leave a cliff. Averaging turns such a step into a ramp a dozen blocks wide.
const RIM_BLUR = 5;

const smoothstep = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// The one place where zone terrain meets the wilderness. A column's height is the wilderness height W, or, inside
// a zone, the zone's own height computed with W as the base it blends towards. Zone cores are returned untouched.
// Between a core and the zone's edge (the band) the zone's height near the core's rim is faded into W with a
// smoothstep on the distance from the edge. That is what removes the cliffs the flat zones used to end in, and
// it keeps the legacy edge quirks (road strips, cut-off streams) from showing up at the border.
// Zones with no band (Tempest, Amestris) already end exactly on the base height they are given.
export class ZoneBlender {
  private readonly core = { x: 0, z: 0 };

  constructor(readonly field: TerrainField) {}

  // The zone that owns this column, as the legacy lookup decides it.
  zoneAt(x: number, z: number): Zone {
    return getZone(x, z);
  }

  // Ground height before rounding.
  blendedHeight(x: number, z: number, zone: Zone = getZone(x, z)): number {
    const wild = this.field.height(x, z);
    if (zone.name === WILDERNESS_NAME) return wild;

    const info = zoneInfoByName(zone.name);
    if (!info) throw new Error(`No ZoneInfo for zone "${zone.name}"`);

    if (info.band <= 0) return zone.getHeight(x, z, wild);
    const inset = insetFromEdge(info.shape, x, z);
    // Returning the zone's height as is in the core keeps legacy heights bit for bit, which a lerp would not.
    if (inset > info.band) return zone.getHeight(x, z, wild);
    let sum = 0;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        clampToCore(info, x + i * RIM_BLUR, z + j * RIM_BLUR, this.core);
        sum += zone.getHeight(this.core.x, this.core.z, wild);
      }
    }
    const own = sum / 9;
    const weight = smoothstep(inset / info.band);
    return weight >= 1 ? own : wild + (own - wild) * weight;
  }

  // The ground height as a whole number: where the surface block sits.
  height(x: number, z: number, zone?: Zone): number {
    const h = Math.floor(this.blendedHeight(x, z, zone));
    return h < TERRAIN_MIN_Y ? TERRAIN_MIN_Y : h > TERRAIN_MAX_Y ? TERRAIN_MAX_Y : h;
  }
}
