import { registerTempestKits } from '../kits/tempest';
import { KitRegistry } from '../structures/KitRegistry';
import { StylePack } from '../structures/StylePack';
import { TEMPEST_STYLE } from './style';

/**
 * The kits the town is built with: the district kits (townhouse, shop, inn, shrine, watchtower, storehouse, garden house and
 * plot, market stall, well, river bridge) with their weights by district. The hand-built landmarks are not in it: the zone
 * stamps those from the landmark registry (`createTempestLandmarks`), and its own fillers (gardens, parks, meadows, building
 * sites) take the lots no kit is wanted for. The placeholder box house stays the zone's fallback for a lot nothing fits.
 */
export const createTempestCityKits = (style: StylePack = TEMPEST_STYLE): KitRegistry => registerTempestKits(new KitRegistry(), style);
