import { TempestBlock as T } from '../../../content/blocksTempest';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, EAST, NORTH, SOUTH, WEST, rect } from '../../structures/BlueprintBuilder';
import { FLARED_TIGHT } from '../../structures/roofProfile';
import { StylePack } from '../../structures/StylePack';
import { LandmarkSpec } from './LandmarkSpec';
import { wallRun } from './parts';
import { footprintOf } from './specs';

// The four gates of the town. Each is 19 wide along the road's cross direction and 7 deep along the road, written with its
// front towards south and the road running north to south through the middle, then turned to the side it stands on.
//
// The big gatehouses (west, towards the Town of Beginnings, and north, towards Fremmevilla) are the timber gates of the
// pictures: two stone piers with lacquered posts at the passage, a long upper hall of plaster and timber over the road with
// lit paper windows, a hip and gable roof whose eaves sweep up with horned ridge ends, banners, hanging lanterns, and a
// short run of wall each side with a stone lantern on its end. The modest ones (east and south) are a roofed gate on four
// posts with the same walls. The passage is seven wide in the big gates and five in the modest ones, floored with the
// town's paving; the upper hall of a big gate is a closed room, lit from inside for the night.

const W = 19;
const D = 7;

/** The big gatehouse; `variant` 0 has vermilion posts under a dark-tile roof, 1 a terracotta roof over dark timber. */
const buildBigGate = (style: StylePack, rng: Rng, variant: number): Blueprint => {
  const pack = style.family(variant === 0 ? 'vermilion-dark' : 'timber-terracotta');
  const b = new BlueprintBuilder(pack, rng, 'big-gate');
  const post = variant === 0 ? 'accent' : 'post';
  // Ground: a plinth under everything, the road's paving through the passage.
  b.floor(rect(0, 0, W - 1, D - 1), 0, 'wallBase');
  b.floor(rect(6, 0, 12, D - 1), 0, 'path');
  for (let x = 6; x <= 12; x++) if (x % 3 === 0) for (let z = 0; z < D; z++) b.set(x, 0, z, 'pathAlt');

  // The piers: stone with bands of plaster stone, a lattice slit on each face, a cap beam.
  for (const x0 of [2, 13]) {
    const pier = rect(x0, 1, x0 + 3, 5);
    for (let y = 1; y <= 4; y++) {
      for (let z = pier.z0; z <= pier.z1; z++) for (let x = pier.x0; x <= pier.x1; x++) b.set(x, y, z, y === 1 || y === 4 ? 'wallBase' : 'stone');
    }
    b.beamRing(pier, 5, 'beam');
    b.floor(rect(pier.x0 + 1, pier.z0 + 1, pier.x1 - 1, pier.z1 - 1), 5, 'beam');
    for (const z of [pier.z0, pier.z1]) b.set(x0 + 1, 3, z, 'lattice');
  }
  // The passage: posts at its edges, tie beams across, lanterns hung from them.
  for (const x of [6, 12]) for (const z of [1, 5]) b.column(x, z, 1, 4, post);
  for (const z of [1, 3, 5]) b.beam(6, z, 12, z, 5, 'beam');
  b.floor(rect(6, 1, 12, 5), 6, 'floor');
  for (const x of [7, 11]) for (const z of [2, 4]) b.set(x, 4, z, z === 2 ? 'light' : 'lightAlt');
  // The upper hall: a timber frame filled with plaster, lit shoji screens front and back and a lattice at the sides.
  const hall = rect(2, 1, 16, 5);
  b.frame(hall, 7, 9, { panel: 'wall', post: 'post', beam: 'beam', spacing: 3 });
  b.beamRing(hall, 10, 'beam');
  b.floor(rect(hall.x0 + 1, hall.z0 + 1, hall.x1 - 1, hall.z1 - 1), 10, 'beam');
  for (const side of [SOUTH, NORTH] as const) {
    for (const at of [2, 5, 8, 11]) b.opening(hall, { side, at, y: 8, width: 2, height: 1, kind: 'shoji', lit: true });
  }
  b.opening(hall, { side: EAST, at: 2, y: 8, width: 2, kind: 'lattice' });
  b.opening(hall, { side: WEST, at: 2, y: 8, width: 2, kind: 'lattice' });
  // A lamp in the closed hall, so its screens glow.
  for (const x of [5, 9, 13]) b.set(x, 9, 3, 'light');
  // The roof: hip and gable, eaves swept up, horned ridge; its overhang fills the footprint.
  b.hipGable(hall, 10, { profile: FLARED_TIGHT, tips: 2, gableWall: 'wallFrame' });
  // Banners hung from the eave between the screens, a signboard over the passage, hanging lanterns at the posts.
  for (const x of [4, 14]) for (let k = 0; k < 3; k++) b.set(x, 6 - k, 6, T.NOREN_RED, 0);
  for (const x of [8, 9, 10]) b.signboard(x, 6, 6, 'x');
  for (const [x, z] of [[2, 6], [16, 6], [2, 0], [16, 0]]) { b.set(x, 5, z, 'beam'); b.set(x, 4, z, 'lightAlt'); }
  // The wings of wall: a plaster wall with a tile cap along the road's cross line, a stone lantern on the end.
  for (const [x0, x1] of [[0, 1], [17, 18]]) {
    wallRun(b, x0, 3, x1, 3, 0, 3, { spacing: 2 });
    b.stoneLantern(x0 === 0 ? 0 : 18, 5, 3);
  }
  // A cedar behind each wing, a sakura in front: markers only, the zone grows them with its own features.
  b.treeSpot(0, 0, 'cedar');
  b.treeSpot(W - 1, 0, 'cedar');
  b.treeSpot(0, D - 1, 'sakura');
  b.treeSpot(W - 1, D - 1, 'sakura');
  // The doors: the two ends of the passage.
  b.mark({ kind: 'door', x: 9, y: 1, z: D - 1, facing: SOUTH });
  b.mark({ kind: 'door', x: 9, y: 1, z: 0, facing: NORTH });
  return b.build();
};

/** The modest gatehouse: four posts, a tie beam and a low flared roof, with a run of wall each side. */
const buildModestGate = (style: StylePack, rng: Rng, variant: number): Blueprint => {
  const pack = style.family(variant === 0 ? 'timber-terracotta' : 'plaster-dark');
  const b = new BlueprintBuilder(pack, rng, 'modest-gate');
  b.floor(rect(0, 0, W - 1, D - 1), 0, 'wallBase');
  b.floor(rect(7, 0, 11, D - 1), 0, 'path');
  const body = rect(6, 1, 12, 5);
  for (const [x, z] of [[6, 1], [12, 1], [6, 5], [12, 5]]) b.column(x, z, 1, 4, 'accent');
  for (const z of [1, 3, 5]) b.beam(6, z, 12, z, 5, 'beam');
  for (const x of [6, 12]) b.beam(x, 1, x, 5, 5, 'beam');
  b.beam(6, 1, 12, 1, 4, 'beam');
  b.beam(6, 5, 12, 5, 4, 'beam');
  b.gable(body, 5, { profile: FLARED_TIGHT, axis: 'x', tips: 1, gableWall: 'wallFrame' });
  for (const z of [1, 5]) { b.set(8, 3, z, 'light'); b.set(10, 3, z, 'light'); }
  b.signboard(9, 4, 6, 'x');
  for (const [x0, x1] of [[0, 5], [13, 18]]) {
    wallRun(b, x0, 3, x1, 3, 0, 3, { spacing: 3 });
    b.stoneLantern(x0 === 0 ? 1 : 17, 5, 3);
  }
  b.treeSpot(1, 1, 'cedar');
  b.treeSpot(W - 2, 1, 'sakura');
  b.mark({ kind: 'door', x: 9, y: 1, z: D - 1, facing: SOUTH });
  b.mark({ kind: 'door', x: 9, y: 1, z: 0, facing: NORTH });
  return b.build();
};

const gate = (id: string, name: string, facing: 0 | 1 | 2 | 3, big: boolean, variant: number): LandmarkSpec => ({
  id, name, covers: [id], facing, footprint: footprintOf(id), frame: 'front-south',
  build: (style, rng) => (big ? buildBigGate(style, rng, variant) : buildModestGate(style, rng, variant)),
});

export const westGate = (): LandmarkSpec => gate('west-gate', 'West gate', 3, true, 0);
export const northGate = (): LandmarkSpec => gate('north-gate', 'North gate', 0, true, 1);
export const eastGatehouse = (): LandmarkSpec => gate('east-gatehouse', 'East gatehouse', 1, false, 0);
export const southGatehouse = (): LandmarkSpec => gate('south-gatehouse', 'South gatehouse', 2, false, 1);
