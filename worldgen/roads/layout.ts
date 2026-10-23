import { MILE } from '../../worldConstants';
import { ZONE_INFOS, ZoneInfo } from '../zones/ZoneInfo';

// Where the roads join the zones, and which gates each road links. A gate is the point on a legacy zone's own road
// where the network takes over, with the direction that leads away from the zone.
//
// The legacy roads, which this has to meet exactly:
//  - Town of Beginnings: axis roads with |x| < 12 or |z| < 12 (23 blocks wide) as far as distance 150 from the
//    centre, and the south road to the edge.
//  - Greensom: the road with |x| < 3 running north and south through the village to its edge.
//  - Tempest: the planned grid's avenues, |x| < 5 or |z| < 5 (9 wide), reach 600 blocks from the centre.
//  - Amestris: industrial streets of 5 blocks; the one along z = 0 reaches 500 blocks from the centre, which is
//    inside the core (550), so the road starts at the core's rim.
//  - Bosse, Fremmevilla and Magnolia have no roads. Their gates sit on the core's rim.
// Inside a zone's core nothing is changed. Between the core and the footprint's edge the network paints its road
// onto the zone's ground (see ColumnSampler), so the two meet.

export interface Gate {
  readonly name: string;
  readonly x: number;
  readonly z: number;
  // Unit vector pointing away from the zone.
  readonly dx: number;
  readonly dz: number;
  // Half width of the road at the gate: that of the legacy road it joins. The road narrows to its own width over
  // FLARE blocks.
  readonly half: number;
}

export interface EdgeDef {
  readonly name: string;
  readonly from: Gate;
  readonly to: Gate;
  readonly importance: number;  // 0..1: more important roads are wider
  readonly bend: number;        // how far the road wanders sideways, in blocks (0 is a straight line)
  readonly wavelength: number;  // of the wandering
}

// How far from a gate the road takes to narrow from the legacy width to its own.
export const FLARE = 70;
// The wandering fades to nothing this far from a gate, so a road always meets the zone road head on.
export const END_PIN = 90;

const info = (name: string): ZoneInfo => {
  const found = ZONE_INFOS.find((z) => z.name === name);
  if (!found) throw new Error(`No zone called ${name}`);
  return found;
};

// A gate just outside the rim of a zone's core, on the line towards a point.
const rimGate = (name: string, zone: string, towardX: number, towardZ: number, half: number): Gate => {
  const z = info(zone);
  const dx = towardX - z.shape.cx;
  const dz = towardZ - z.shape.cz;
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;
  return { name, x: Math.round(z.shape.cx + ux * (z.core + 1.5)), z: Math.round(z.shape.cz + uz * (z.core + 1.5)), dx: ux, dz: uz, half };
};

const TEMPEST_X = 3 * MILE;

export const GATES = {
  townEast: { name: 'Town east', x: 150, z: 0, dx: 1, dz: 0, half: 11.5 },
  townWest: { name: 'Town west', x: -150, z: 0, dx: -1, dz: 0, half: 11.5 },
  townNorth: { name: 'Town north', x: 0, z: -150, dx: 0, dz: -1, half: 11.5 },
  // The south road is paved to the edge of the footprint, so the network starts right there.
  townSouth: { name: 'Town south', x: 0, z: 200, dx: 0, dz: 1, half: 11.5 },
  greensomNorth: { name: 'Greensom north', x: 0, z: 230, dx: 0, dz: -1, half: 2.5 },
  greensomSouth: { name: 'Greensom south', x: 0, z: 370, dx: 0, dz: 1, half: 2.5 },
  tempestWest: { name: 'Tempest west avenue', x: TEMPEST_X - 600, z: 0, dx: -1, dz: 0, half: 4.5 },
  tempestNorth: { name: 'Tempest north avenue', x: TEMPEST_X, z: -600, dx: 0, dz: -1, half: 4.5 },
  amestrisEast: { name: 'Amestris east street', x: -TEMPEST_X + 550, z: 0, dx: 1, dz: 0, half: 4.5 },
  bosseSouth: rimGate('Bosse south', 'Kingdom of Bosse', 0, 0, 2.5),
  fremmevillaSouth: rimGate('Fremmevilla south', 'Kingdom of Fremmevilla', TEMPEST_X, -600, 2.5),
  magnoliaEast: rimGate('Magnolia east', 'Magnolia Town', 0, 370, 2.5),
} as const satisfies Record<string, Gate>;

export const EDGES: readonly EdgeDef[] = [
  // The old straight road north to south.
  { name: 'Town of Beginnings - Greensom', from: GATES.townSouth, to: GATES.greensomNorth, importance: 1, bend: 0, wavelength: 300 },
  { name: 'Town of Beginnings - Tempest', from: GATES.townEast, to: GATES.tempestWest, importance: 1, bend: 14, wavelength: 300 },
  { name: 'Town of Beginnings - Amestris', from: GATES.townWest, to: GATES.amestrisEast, importance: 0.8, bend: 14, wavelength: 280 },
  { name: 'Town of Beginnings - Bosse', from: GATES.townNorth, to: GATES.bosseSouth, importance: 0.7, bend: 10, wavelength: 320 },
  { name: 'Tempest - Fremmevilla', from: GATES.tempestNorth, to: GATES.fremmevillaSouth, importance: 0.5, bend: 12, wavelength: 300 },
  { name: 'Greensom - Magnolia', from: GATES.greensomSouth, to: GATES.magnoliaEast, importance: 0.4, bend: 20, wavelength: 340 },
];
