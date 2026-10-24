import { arena } from './Arena';
import { centralSquare } from './CentralSquare';
import { civicCompound } from './CivicCompound';
import { eastGatehouse, northGate, southGatehouse, westGate } from './Gatehouse';
import { arenaGuardHut, westStallsNorth, westStallsSouth } from './GuardHutAndStalls';
import { interiorGallery } from './InteriorGallery';
import { townHall } from './TownHall';
import { aqueduct, eastBridge } from './Waterworks';
import { cavePools, horsePasture, lumberClearing, northCave, paddock, southCairn } from './Wilds';
import { LandmarkSpec } from './LandmarkSpec';

export * from './LandmarkSpec';

/** The landmarks of Tempest by id, in the order of the plan. */
export class LandmarkRegistry {
  private readonly list: LandmarkSpec[] = [];

  register(spec: LandmarkSpec): this {
    if (this.list.some((s) => s.id === spec.id)) throw new Error(`Landmark ${spec.id} is already registered`);
    this.list.push(spec);
    return this;
  }

  get specs(): readonly LandmarkSpec[] {
    return this.list;
  }

  get(id: string): LandmarkSpec | undefined {
    return this.list.find((s) => s.id === id);
  }

  /** The spec that builds a layout landmark, which may be the one that covers it (the compound covers the Town Hall). */
  covering(layoutId: string): LandmarkSpec | undefined {
    return this.list.find((s) => s.covers.includes(layoutId));
  }
}

export const createTempestLandmarks = (): LandmarkRegistry => new LandmarkRegistry().register(centralSquare()).register(civicCompound()).register(townHall()).register(arena()).register(northCave()).register(cavePools()).register(southCairn()).register(eastBridge()).register(aqueduct()).register(lumberClearing()).register(horsePasture()).register(paddock()).register(arenaGuardHut()).register(westStallsNorth()).register(westStallsSouth())
    .register(westGate()).register(northGate()).register(eastGatehouse()).register(southGatehouse()).register(interiorGallery());
