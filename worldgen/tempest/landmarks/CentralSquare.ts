import { TempestBlock as T } from '../../../content/blocksTempest';
import { Rng } from '../../noise';
import { BlueprintBuilder } from '../../structures/BlueprintBuilder';
import { Blueprint } from '../../structures/Blueprint';
import { StylePack } from '../../structures/StylePack';
import { shapeBounds } from '../layout';
import { LandmarkSpec, layoutLandmark } from './LandmarkSpec';
import { STONE, TOP, annulus, circlePoints, disc, turnsOf } from './parts';

// The Central Square: where the two avenues cross, a small circular roundabout 15 across. Fan-pattern cobbles run out from
// a round basin in wedges; at its middle a pillar of blue and green magic ore on a stone pedestal, ringed by water jets,
// glows over the water and lights the square at night. Round it a line of bollards with a gap at each avenue, benches
// between them and eight lamp posts hung with red lanterns. There is no statue: the pillar is the centre.

const R = 7;

const build = (style: StylePack, rng: Rng): Blueprint => {
  const b = new BlueprintBuilder(style, rng, 'central-square');
  const c = 7;

  // Paving: fan cobbles in wedges of a sixteenth of a turn, alternating with plain paving, so the pattern radiates from the
  // basin; a plain stone ring at the rim bounds it.
  disc(c, c, R, (x, z) => {
    const wedge = Math.floor(turnsOf(c, c, x, z) * 16);
    b.set(x, 0, z, (wedge & 1) === 0 ? 'pathAlt' : 'path');
  });
  annulus(c, c, 6.2, R, (x, z) => b.set(x, 0, z, 'path'));
  annulus(c, c, 3.6, 4.6, (x, z) => b.set(x, 0, z, 'path'));

  // The basin: water at the ground row inside a wall of stone with a mossy slab on it, half a block high, to sit on.
  disc(c, c, 2.7, (x, z) => b.set(x, 0, z, STONE.water));
  annulus(c, c, 2.7, 3.6, (x, z) => {
    b.set(x, 0, z, 'stone');
    b.set(x, 1, z, 'stoneSlab', 0);
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

  // Bollards on a ring of 5.4 with a gap at each avenue; the cells on the diagonals carry a lamp post.
  const lamps: Array<[number, number]> = [];
  for (const [x, z] of circlePoints(c, c, 5.6, 48)) {
    if (Math.abs(x - c) <= 2 || Math.abs(z - c) <= 2) continue;
    if (Math.abs(x - c) === Math.abs(z - c)) { lamps.push([x, z]); continue; }
    b.set(x, 1, z, T.STONE_BOLLARD);
  }
  for (const [x, z] of lamps) {
    // A slim lamp: a bamboo mast, a rail arm towards the basin and a red lantern under its end.
    const sx = Math.sign(c - x);
    const sz = Math.sign(c - z);
    b.set(x, 0, z, 'stone');
    b.column(x, z, 1, 4, T.BAMBOO_POLE);
    b.set(x + sx, 5, z, 'rail');
    b.set(x, 5, z, 'rail');
    b.set(x + sx, 4, z, 'light');
    b.set(x, 5, z + sz, 'rail');
    b.set(x, 4, z + sz, 'light');
  }
  // Mossy slabs as benches between the basin and the bollards, one pair on each diagonal.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    for (const [dx, dz] of [[3, 4], [4, 3]]) b.set(c + sx * dx, 1, c + sz * dz, 'stoneSlab', TOP);
  }
  b.mark({ kind: 'plaza', x: c, y: 1, z: c, tag: 'central-square' });
  return b.build();
};

export const centralSquare = (): LandmarkSpec => {
  const l = layoutLandmark('central-square');
  return { id: l.id, name: l.name, covers: [l.id], facing: 2, footprint: shapeBounds(l.shape), frame: 'front-south', build };
};
