import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, NORTH, SOUTH, rect } from '../../structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../structures/BuildingKit';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';
import { FLARED } from '../../structures/roofProfile';

// A roofed gate with low plaster walls either side: four lacquered posts, a tie beam and a plate, a low gable roof with
// the eaves swept up and horned ridge ends, lanterns on the beam, a stone lantern outside each wing. A passage three
// blocks wide goes straight through.
//   variant 0 vermilion posts, 1 dark timber posts with a signboard
export class GateKit extends BuildingKit {
  readonly name = 'gate';
  readonly frontage: KitSize = { min: 13, max: 31 };
  readonly depth: KitSize = { min: 7, max: 9 };
  readonly floors: KitSize = { min: 1, max: 1 };
  readonly variants = 2;

  preferredSize(): { frontage: number; depth: number; floors: number } {
    return { frontage: 17, depth: 7, floors: 1 };
  }

  build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const W = lot.frontage;
    const D = lot.depth;
    const o = FLARED.overhang;
    const cx = Math.floor(W / 2);
    // The body is five wide with the passage between its posts; the roof reaches one block past it at the ends.
    const body = rect(cx - 2, o, cx + 2, D - 1 - o);
    const post = variant === 0 ? 'accent' : 'post';
    const PLATE = 5;
    const zc = Math.floor((body.z0 + body.z1) / 2);

    // The floor of the passage and the stone plinth under the posts.
    b.floor(rect(body.x0, body.z0, body.x1, body.z1), 0, 'wallBase');
    b.floor(rect(cx - 1, body.z0, cx + 1, body.z1), 0, 'path');
    // Wings: a plaster wall one block thick with a tile cap, from the body's edge to the lot's edge, a stone footing under it.
    for (const [from, to] of [[0, body.x0 - 1], [body.x1 + 1, W - 1]] as const) {
      b.box(from, 0, zc, to, 0, zc, 'wallBase');
      b.box(from, 1, zc, to, 3, zc, 'wall');
      b.box(from, 1, zc, to, 1, zc, 'wallBase');
      b.box(from, 4, zc, to, 4, zc, 'roofSlab', 0);
    }
    // Wall posts every four blocks, and the end posts.
    for (const x of [0, 4, W - 5, W - 1].filter((x) => x < body.x0 || x > body.x1)) b.column(x, zc, 1, 3, 'post');

    // The four big posts, the tie beams and the plate.
    b.columns([[body.x0, body.z0], [body.x1, body.z0], [body.x0, body.z1], [body.x1, body.z1]], 1, 4, post);
    b.beam(body.x0, body.z0, body.x1, body.z0, 5, 'beam');
    b.beam(body.x0, body.z1, body.x1, body.z1, 5, 'beam');
    b.beam(body.x0, body.z0, body.x0, body.z1, 5, 'beam');
    b.beam(body.x1, body.z0, body.x1, body.z1, 5, 'beam');
    b.beam(body.x0, zc, body.x1, zc, 5, 'beam');
    // A lintel across the passage a block under the beam, and brackets at the posts.
    b.beam(body.x0, body.z0, body.x1, body.z0, 4, 'beam');
    b.beam(body.x0, body.z1, body.x1, body.z1, 4, 'beam');
    for (const x of [body.x0, body.x1]) for (const z of [body.z0, body.z1]) b.set(x, 4, z, post);
    // The passage is open: carve it so a stamp clears whatever the ground grew there.
    for (let y = 1; y <= 4; y++) for (let z = body.z0; z <= body.z1; z++) for (let x = cx - 1; x <= cx + 1; x++) b.carve(x, y, z);

    // The roof, ridge along x.
    b.gable(body, PLATE, { profile: FLARED, axis: 'x', tips: 1, gableWall: 'wallFrame' });

    // Lanterns hung from the lintels, on both faces, and a signboard on the second variant.
    for (const z of [body.z0, body.z1]) {
      b.set(cx - 1, 3, z, 'light');
      b.set(cx + 1, 3, z, 'light');
    }
    if (variant === 1) b.signboard(cx, 4, body.z1 + 1, 'x');

    // Steps up to the plinth on both sides.
    for (let x = cx - 1; x <= cx + 1; x++) {
      b.stair(x, 0, body.z1 + 1, SOUTH, 'stoneStairs');
      b.stair(x, 0, body.z0 - 1, NORTH, 'stoneStairs');
    }
    // A stone lantern outside each wing, and a tree beside the left one.
    b.stoneLantern(2, 1, D - 1);
    b.stoneLantern(W - 3, 1, D - 1);
    b.treeSpot(1, 1, 'cedar');
    b.treeSpot(W - 2, 1, 'sakura');
    b.mark({ kind: 'door', x: cx, y: 1, z: D - 1, facing: 2 });
    b.mark({ kind: 'door', x: cx, y: 1, z: 0, facing: 0 });
    return b.build();
  }
}
