import { KitRegistry } from '../../structures/KitRegistry';
import { StylePack } from '../../structures/StylePack';
import { GardenHouseKit } from './GardenHouseKit';
import { GardenPlotKit } from './GardenPlotKit';
import { InnKit } from './InnKit';
import { MarketStallKit } from './MarketStallKit';
import { PublicHallKit } from './PublicHallKit';
import { RiverBridgeKit } from './RiverBridgeKit';
import { ShopKit } from './ShopKit';
import { ShrineKit } from './ShrineKit';
import { StorehouseKit } from './StorehouseKit';
import { TownhouseKit } from './TownhouseKit';
import { WatchtowerKit } from './WatchtowerKit';
import { WellKit } from './WellKit';
import { WorkshopKit } from './WorkshopKit';

export { GardenHouseKit, GardenPlotKit, InnKit, MarketStallKit, PublicHallKit, RiverBridgeKit, ShopKit, ShrineKit, StorehouseKit, TownhouseKit, WatchtowerKit, WellKit, WorkshopKit };

// The kits of Tempest's districts and the chance of each on a lot of a district. The names are the layout's districts
// (civic, guest, government, public, luxury, commercial, production, storage, residential, tourism) and the kinds of lot the
// planner may add on top of them: `market` (the stalls round a square), `shrine`, `forest-edge` (the lots where the town meets
// the trees) and `bridge`. A district that is not listed gets nothing from that kit. The weights are relative and only the kits
// that fit the lot's size and storeys are offered (see KitRegistry).
const WEIGHTS = {
  townhouse: { residential: 8, commercial: 2, production: 3, storage: 1, luxury: 1.5, guest: 1, government: 2, public: 2, tourism: 1, 'forest-edge': 2 },
  shop: { commercial: 8, market: 5, residential: 0.5, production: 2, public: 1, civic: 0.5, tourism: 3 },
  inn: { tourism: 6, guest: 3, commercial: 1, residential: 0.2, public: 1 },
  shrine: { shrine: 10, tourism: 0.8, residential: 0.05, luxury: 0.2, 'forest-edge': 0.5 },
  watchtower: { civic: 2, government: 1, public: 1, 'forest-edge': 2, storage: 0.3 },
  storehouse: { storage: 8, production: 4, residential: 0.4, government: 1, public: 2, civic: 1, 'forest-edge': 2 },
  'garden-house': { luxury: 8, guest: 6, tourism: 2, government: 3, residential: 0.4 },
  'garden-plot': { luxury: 3, guest: 3, tourism: 3, residential: 0.7, public: 1, civic: 2, shrine: 1, commercial: 0.2, 'forest-edge': 1 },
  'market-stall': { market: 6, commercial: 3, tourism: 3, production: 0.5, residential: 0.3 },
  well: { residential: 0.6, civic: 2, production: 0.5, commercial: 0.3, shrine: 0.5, luxury: 0.3, 'forest-edge': 0.5 },
  'river-bridge': { bridge: 10 },
  // The production sector's forges, smithies, weaving halls and lumber yards; the public strip's schools, clinics and barracks.
  workshop: { production: 9, storage: 1, commercial: 0.3, residential: 0.03 },
  'public-hall': { public: 9, government: 1.5, civic: 0.5, tourism: 0.2 },
} as const;

/**
 * Registers the Tempest district kits on a registry. `style` is the pack the kits will be built with: a pack that lacks a role
 * or has no families fails here, at start-up, and not on the first lot a worker builds.
 */
export const registerTempestKits = (registry: KitRegistry, style: StylePack): KitRegistry => {
  if (style.familyNames.length === 0) throw new Error(`Style pack ${style.name} has no palette families: the Tempest kits choose one per lot`);
  const kits = [
    new TownhouseKit(), new ShopKit(), new InnKit(), new ShrineKit(), new WatchtowerKit(), new StorehouseKit(),
    new GardenHouseKit(), new GardenPlotKit(), new MarketStallKit(), new WellKit(), new RiverBridgeKit(), new WorkshopKit(), new PublicHallKit(),
  ];
  for (const kit of kits) registry.register(kit, WEIGHTS[kit.name as keyof typeof WEIGHTS], 0);
  return registry;
};

/** The registry of Tempest's district kits, ready for the planner. */
export const createTempestKitRegistry = (style: StylePack): KitRegistry => registerTempestKits(new KitRegistry(), style);
