import { TempestBlock as T } from '../../../content/blocksTempest';
import { Rng } from '../../noise';
import { BlueprintBuilder } from '../../structures/BlueprintBuilder';
import { Blueprint } from '../../structures/Blueprint';
import { StylePack } from '../../structures/StylePack';
import { shapeBounds } from '../layout';
import { SPLITTER_RADIUS, islandBollard, kerbBollard, ringZone, wedgeOf } from '../roundabout';
import { LandmarkSpec, layoutLandmark } from './LandmarkSpec';
import { STONE, disc } from './parts';

// The Central Square: where the two avenues cross, a circular roundabout 15 across, drawn in rings (roundabout.ts). A round basin with
// a pillar of blue and green magic ore on a stone pedestal, ringed by water jets, glows over the water and lights the square at night;
// round it an island of fan cobbles in wedges with twelve bollards on it, a raised kerb, the ring road in dark slate, and an outer
// kerb, a low wall a block high with bollards on it, that is open only where an avenue enters, so the avenues' stone and fan paving stops at the ring. Four lamp
// posts hung with red lanterns stand on the outer kerb. There is no statue: the pillar is the centre.

const build = (style: StylePack, rng: Rng): Blueprint => {
  const b = new BlueprintBuilder(style, rng, 'central-square');
  const c = 7;

  disc(c, c, SPLITTER_RADIUS, (x, z) => {
    const dx = x - c, dz = z - c;
    if (x < 0 || z < 0 || x > 2 * c || z > 2 * c) return;
    switch (ringZone(dx, dz)) {
      case 'water':
        b.set(x, 0, z, STONE.water);
        break;
      case 'rim':
        // The basin's wall: mossy stone with a slab on it, half a block high, to sit on.
        b.set(x, 0, z, 'stone');
        b.set(x, 1, z, 'stoneSlab', 0);
        break;
      case 'island':
        b.set(x, 0, z, (wedgeOf(dx, dz) & 1) === 0 ? 'pathAlt' : 'path');
        if (islandBollard(dx, dz)) b.set(x, 1, z, T.STONE_BOLLARD);
        break;
      case 'kerbIn':
        b.set(x, 0, z, STONE.cobble);
        b.set(x, 1, z, T.STONE_CURB, 0);
        break;
      case 'splitter':
        // The outer kerb is a low wall a block high: the ring is closed to everything but the four mouths.
        b.set(x, 0, z, STONE.cobble);
        b.set(x, 1, z, STONE.cobble);
        break;
      case 'road':
        b.set(x, 0, z, STONE.brick);
        break;
      case 'entry':
        // Where an avenue comes in: its own fan strip, flush with the ring road.
        b.set(x, 0, z, 'pathAlt');
        break;
      case 'kerbOut':
        b.set(x, 0, z, STONE.cobble);
        b.set(x, 1, z, STONE.cobble);
        if (kerbBollard(dx, dz)) b.set(x, 2, z, T.STONE_BOLLARD);
        break;
      default:
        break;
    }
  });

  // The pedestal and the pillar of ore.
  disc(c, c, 1.1, (x, z) => b.set(x, 0, z, STONE.brick));
  for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) b.set(c + dx, 1, c + dz, 'stoneSlab', 0);
  b.set(c, 1, c, STONE.brick);
  b.set(c, 2, c, T.BLUE_ORE_LAMP);
  b.set(c, 3, c, T.GREEN_ORE_LAMP);
  b.set(c, 4, c, T.BLUE_ORE_LAMP);
  b.set(c, 5, c, T.STONE_LANTERN_CAP);
  // Jets at the four sides of the pedestal, spraying over the water.
  for (const [dx, dz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) b.set(c + dx, 1, c + dz, T.WATER_JET);

  // A lamp post on the outer kerb in each quarter: a bamboo mast, a rail arm towards the basin and a red lantern under its end.
  for (const [dx, dz] of [[5, 4], [-4, 5], [-5, -4], [4, -5]]) {
    const x = c + dx, z = c + dz;
    const sx = Math.sign(c - x), sz = Math.sign(c - z);
    b.set(x, 0, z, STONE.brick);
    b.column(x, z, 1, 4, T.BAMBOO_POLE);
    b.set(x + sx, 5, z, 'rail');
    b.set(x, 5, z, 'rail');
    b.set(x + sx, 4, z, 'light');
    b.set(x, 5, z + sz, 'rail');
    b.set(x, 4, z + sz, 'light');
  }
  b.mark({ kind: 'plaza', x: c, y: 1, z: c, tag: 'central-square' });
  return b.build();
};

export const centralSquare = (): LandmarkSpec => {
  const l = layoutLandmark('central-square');
  return { id: l.id, name: l.name, covers: [l.id], facing: 2, footprint: shapeBounds(l.shape), frame: 'front-south', build };
};
