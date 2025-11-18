import { Zone } from './Zone';
import { SAOZone } from './SAOZone';
import { GreensomZone } from './GreensomZone';
import { TempestZone } from './TempestZone';
import { AmestrisZone } from './AmestrisZone';
import { RankingZone } from './RankingZone';
import { FremmevillaZone } from './FremmevillaZone';
import { MagnoliaZone } from './MagnoliaZone';
import { WildernessZone } from './WildernessZone';

const zones: Zone[] = [
  new SAOZone(),
  new GreensomZone(), 
  new TempestZone(),
  new AmestrisZone(),
  new RankingZone(),
  new FremmevillaZone(),
  new MagnoliaZone()
];
const wilderness = new WildernessZone();

export const getZone = (x: number, z: number): Zone => {
  for (const zone of zones) {
    if (zone.isInside(x, z)) return zone;
  }
  return wilderness;
};

export const getCurrentZoneName = (x: number, z: number): string => {
    return getZone(x, z).name;
};