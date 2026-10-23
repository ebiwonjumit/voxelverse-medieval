import { BoxHouseKit } from '../../structures/BoxHouseKit';
import { KitRegistry } from '../../structures/KitRegistry';
import { GateKit } from './GateKit';
import { LanternPostKit } from './LanternPostKit';
import { RoofStudyKit } from './RoofStudyKit';
import { TimberHouseKit } from './TimberHouseKit';

export { GateKit, LanternPostKit, RoofStudyKit, TimberHouseKit };

/**
 * The kits Tempest has. Step 7.1b ships the placeholder box house for every district and three demonstration kits that
 * prove the builder; the real kits of the next steps register here with their district weights.
 */
export const createTempestKits = (): KitRegistry =>
  new KitRegistry()
    .register(new BoxHouseKit(), { residential: 1, commercial: 1, production: 1, storage: 1, luxury: 1, guest: 1, government: 1, public: 1, tourism: 1 }, 0)
    .register(new TimberHouseKit(), { residential: 0.01 }, 0)
    .register(new GateKit(), {}, 0)
    .register(new LanternPostKit(), {}, 0)
    .register(new RoofStudyKit(), {}, 0);
