import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, SOUTH, EAST } from '../../structures/BlueprintBuilder';
import { StylePack } from '../../structures/StylePack';
import { InteriorFurnisher, ROOM_KINDS, RoomKind } from '../interiors/InteriorFurnisher';
import { buildBoxRoom } from '../interiors/boxRoom';
import { TEMPEST_GROUND, TEMPEST_CENTER_X } from '../layout';
import { LandmarkSpec } from './LandmarkSpec';

// Not a place in the town: a row of plain box rooms, one furnished as each kind, for the viewer. It is how the interiors are
// looked at on their own (`?sandbox=landmarks&landmark=interior-gallery&maxY=4` takes the ceilings off). It sits far from
// everything, outside the layout, and is skipped by the tests that check footprints.

const SIZES: Record<RoomKind, [number, number, number?]> = {
  living: [9, 7], bedroom: [7, 7], kitchen: [7, 6], shop: [9, 7], storage: [7, 7], study: [7, 6], inn: [11, 9], lobby: [9, 6],
  barracks: [9, 7], council: [17, 13, 8], forge: [9, 7], weaving: [9, 7],
};

export const GALLERY_COLUMNS = 4;
const GAP = 3;

export const interiorGallery = (): LandmarkSpec => {
  // The layout of the gallery is fixed by the sizes, so the footprint can be known before building.
  const cells = ROOM_KINDS.map((k) => SIZES[k]);
  const colW: number[] = [];
  const rowD: number[] = [];
  cells.forEach(([w, d], i) => {
    const c = i % GALLERY_COLUMNS;
    const r = Math.floor(i / GALLERY_COLUMNS);
    colW[c] = Math.max(colW[c] ?? 0, w + 2);
    rowD[r] = Math.max(rowD[r] ?? 0, d + 2);
  });
  const width = colW.reduce((a, b) => a + b + GAP, -GAP);
  const depth = rowD.reduce((a, b) => a + b + GAP, -GAP);
  const build = (style: StylePack, rng: Rng): Blueprint => {
    const b = new BlueprintBuilder(style, rng, 'interior-gallery');
    const furnisher = new InteriorFurnisher(b.bp, style);
    ROOM_KINDS.forEach((kind, i) => {
      const [w, d, h] = SIZES[kind];
      const c = i % GALLERY_COLUMNS;
      const r = Math.floor(i / GALLERY_COLUMNS);
      const x0 = colW.slice(0, c).reduce((a, v) => a + v + GAP, 0) + 1;
      const z0 = rowD.slice(0, r).reduce((a, v) => a + v + GAP, 0) + 1;
      const interior = { x0, z0, x1: x0 + w - 1, z1: z0 + d - 1 };
      const room = buildBoxRoom(b, interior, { ceilingY: h ?? 4, doors: kind === 'council' || kind === 'inn' ? [{ side: SOUTH }, { side: EAST, at: 2 }] : [{ side: SOUTH }] });
      furnisher.furnish(room, kind, rng.fork(i + 1));
    });
    return b.build();
  };
  const x0 = TEMPEST_CENTER_X + 2000;
  return {
    id: 'interior-gallery', name: 'Interior gallery', covers: [], facing: 2, frame: 'front-south', optional: true,
    footprint: { x0, z0: 0, x1: x0 + width - 1, z1: depth - 1 }, build,
  };
};
void TEMPEST_GROUND;
