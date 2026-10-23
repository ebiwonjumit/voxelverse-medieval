import { TempestBlock as T } from '../../../content/blocksTempest';
import { cellId } from '../../../engine/cell';
import { Rng } from '../../noise';
import { Blueprint, NO_CELL } from '../../structures/Blueprint';
import { BlueprintBuilder, EAST, NORTH, SOUTH, WEST, rect } from '../../structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../structures/BuildingKit';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';
import { FLARED } from '../../structures/roofProfile';

// A small timber house: a raised floor on a stone footing, plaster walls in a dark frame, lit shoji screens, a veranda
// along the front and a roof whose eaves run out flat and sweep up, with horned ridge ends and lifted corners. A yard in
// front with stepping stones, a stone lantern and a fence. It is the first proof of the builder; the town's real houses are
// written the same way.
//   variant 0 a gable roof, 1 a hip and gable roof (irimoya), 2 a hip roof
export class TimberHouseKit extends BuildingKit {
  readonly name = 'timber-house';
  readonly frontage: KitSize = { min: 13, max: 21 };
  readonly depth: KitSize = { min: 14, max: 20 };
  readonly floors: KitSize = { min: 1, max: 1 };
  readonly variants = 3;

  preferredSize(): { frontage: number; depth: number; floors: number } {
    return { frontage: 13, depth: 14, floors: 1 };
  }

  build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const W = lot.frontage;
    const D = lot.depth;
    const o = FLARED.overhang;
    // The eaves reach `o` past the walls at the front and back and one block past the gable ends; the rest of the depth is yard.
    const yard = Math.min(3, D - 11);
    const walls = rect(2, o, W - 3, D - 1 - o - yard);
    const FLOOR = 1;
    const PLATE = 5;
    const mid = Math.floor((walls.x1 - walls.x0) / 2);

    // Footing and floor.
    b.floor(walls, 0, 'wallBase');
    b.floor(rect(walls.x0 + 1, walls.z0 + 1, walls.x1 - 1, walls.z1 - 1), FLOOR, 'interiorFloor');
    b.ring(walls, FLOOR, FLOOR, 'wallBase');

    // Walls: plaster in a dark frame with a half-timber band under the plate.
    b.frame(walls, 2, 3, { panel: 'wall', post: 'post', spacing: 3 });
    b.walls(walls, 4, 4, 'wallFrame');
    b.columns([[walls.x0, walls.z0], [walls.x1, walls.z0], [walls.x0, walls.z1], [walls.x1, walls.z1]], 2, 4, 'post');
    b.beamRing(walls, PLATE, 'beam');

    // Front (south): a doorway with a noren, lit screens either side. Lattice windows on the other walls.
    b.opening(walls, { side: SOUTH, at: mid, y: 2, kind: 'door', noren: true });
    b.opening(walls, { side: SOUTH, at: mid - 3, y: 2, width: 2, height: 2, kind: 'shoji', lit: true });
    b.opening(walls, { side: SOUTH, at: mid + 2, y: 2, width: 2, height: 2, kind: 'shoji', lit: true });
    for (const z of [walls.z0 + 2, walls.z1 - 2]) {
      b.opening(walls, { side: EAST, at: z - walls.z0, y: 3, kind: 'lattice' });
      b.opening(walls, { side: WEST, at: z - walls.z0, y: 3, kind: 'lattice' });
    }
    b.opening(walls, { side: NORTH, at: mid, y: 3, kind: 'lattice' });

    // The veranda along the front under the eave, posts holding it up, steps down to the yard.
    b.engawa(walls, FLOOR, SOUTH, 1, { from: walls.x0, to: walls.x1, gap: [walls.x0 + mid], posts: 4, postTop: PLATE });
    b.steps(walls.x0 + mid, FLOOR, walls.z1 + 2, SOUTH, 1, 1, 'stoneStairs');

    // The roof.
    const roof = variant === 1 ? b.hipGable(walls, PLATE, { profile: FLARED, tips: 2 })
      : variant === 2 ? b.hip(walls, PLATE, { profile: FLARED, tips: 2 })
      : b.gable(walls, PLATE, { profile: FLARED, axis: 'x', tips: 2 });
    // A king post up the middle of each gable triangle, in the frame's dark timber.
    if (roof.gable) {
      const { wall, axis } = roof.gable;
      const c = axis === 'x' ? Math.floor((wall.z0 + wall.z1) / 2) : Math.floor((wall.x0 + wall.x1) / 2);
      for (const t of axis === 'x' ? [wall.x0, wall.x1] : [wall.z0, wall.z1]) {
        for (let y = roof.base; y < roof.crestTop - 1; y++) {
          const [x, z] = axis === 'x' ? [t, c] : [c, t];
          if (b.bp.get(x, y, z) !== NO_CELL && cellId(b.bp.get(x, y, z)) === style.block('wall')) b.set(x, y, z, 'post');
        }
      }
    }

    // Lanterns under the eave and by the door.
    b.lanternHanger(walls.x0 + 1, 5, walls.z1 + 1, SOUTH, 'light');
    b.lanternHanger(walls.x1 - 1, 5, walls.z1 + 1, SOUTH, 'light');

    // The yard: a path of stepping stones, a stone lantern, a fence along the street and a tree.
    if (yard >= 2) {
      const fenceZ = D - 1;
      const gateX = walls.x0 + mid;
      b.steppingPath(gateX, walls.z1 + 3, gateX, fenceZ - 1, 1, 1);
      b.fence(1, fenceZ, W - 2, fenceZ, 1, 'fence');
      b.clear(gateX, 1, fenceZ);
      b.stoneLantern(walls.x1 - 1, 1, walls.z1 + 3);
      b.treeSpot(walls.x0 - 1, walls.z1 + 2, 'sakura');
    }

    // Inside: tatami, a low table with cushions, a futon and a shelf; the door stays clear.
    const interior = rect(walls.x0 + 1, walls.z0 + 1, walls.x1 - 1, walls.z1 - 1);
    const room = b.room(interior, FLOOR, { doors: [{ x: walls.x0 + mid, z: walls.z1 - 1, inward: NORTH }] });
    b.tatami(room);
    b.furnish(room, [
      { block: T.LOW_TABLE, count: 1, where: 'center' },
      { block: T.CUSHION, count: 3, where: 'any' },
      { block: T.FUTON, count: 2, where: 'wall' },
      { block: T.BOOKSHELF, count: 1, where: 'wall', tall: 1 },
      { block: T.HEARTH, count: 1, where: 'corner' },
      { block: T.VASE, count: 1, where: 'wall' },
    ]);
    return b.build();
  }
}
