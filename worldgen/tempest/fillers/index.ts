import { KitRegistry } from '../../structures/KitRegistry';
import { PlaceholderBridgeKit } from './BridgeKit';
import { ConstructionSiteKit } from './ConstructionSiteKit';
import { StallKit } from './StallKit';
import { GardenLotKit, MeadowLotKit, ParkLotKit } from './gardens';

export { ConstructionSiteKit, GardenLotKit, MeadowLotKit, ParkLotKit, PlaceholderBridgeKit, StallKit };

/**
 * The kits the planner's own lots need (gardens, parks, meadows, building sites) and the placeholder bridge. The zone looks a
 * kit up in the registry it is given first, by these names, and falls back to these.
 */
export const createFillerKits = (): KitRegistry =>
  new KitRegistry()
    .register(new GardenLotKit(), {}, 0)
    .register(new ParkLotKit(), {}, 0)
    .register(new MeadowLotKit(), {}, 0)
    .register(new ConstructionSiteKit(), {}, 0)
    .register(new PlaceholderBridgeKit(), {}, 0)
    .register(new StallKit(), {}, 0);
