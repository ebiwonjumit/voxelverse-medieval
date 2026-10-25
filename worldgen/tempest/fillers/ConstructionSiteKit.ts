import { TempestBlock as T } from '../../../content/blocksTempest';
import { BlockType } from '../../../worldConstants';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, rect } from '../../structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../structures/BuildingKit';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';

// A building site: the plan marks some of the public strip, the luxury quarter and the tourism sector as still under
// construction. A bamboo fence round the plot with a gap for the carts, a stone footing, and by variant
//   0  the footing and the heaps: logs, planks, crates, rice bales, a barrel
//   1  the timber frame standing: posts and tie beams two storeys high, bamboo scaffolding at the front
//   2  the plaster walls half built on two sides, scaffolding, a lantern for the night watch
export class ConstructionSiteKit extends BuildingKit {
  readonly name: string = 'construction-site';
  readonly frontage: KitSize = { min: 7, max: 70 };
  readonly depth: KitSize = { min: 7, max: 70 };
  readonly floors: KitSize = { min: 1, max: 3 };
  readonly variants = 3;

  preferredSize(): { frontage: number; depth: number; floors: number } {
    return { frontage: 19, depth: 19, floors: 2 };
  }

  build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const W = lot.frontage, D = lot.depth;
    const gateX = Math.floor(W / 2);
    const gaps: Array<[number, number]> = [];
    for (let x = gateX - 2; x <= gateX + 2; x++) gaps.push([x, D - 1]);
    b.fenceRect(rect(0, 0, W - 1, D - 1), 1, gaps);
    // Packed earth where the carts go in.
    for (let z = D - 1; z >= Math.floor(D / 2); z--) for (let x = gateX - 1; x <= gateX + 1; x++) b.set(x, 0, z, BlockType.PATH);

    const foot = rect(3, 3, W - 4, D - 6);
    const storeys = Math.max(1, lot.floors);
    if (foot.x1 - foot.x0 >= 5 && foot.z1 - foot.z0 >= 5) {
      b.floor(foot, 0, 'wallBase');
      b.ring(foot, 1, 1, 'wallBase');
      if (variant === 1) {
        // The frame: posts every four cells, tie beams at each storey, no walls.
        const top = 3 * storeys;
        for (let x = foot.x0; x <= foot.x1; x += 4) for (const z of [foot.z0, foot.z1]) b.column(x, z, 2, top, 'post');
        for (let z = foot.z0 + 4; z < foot.z1; z += 4) for (const x of [foot.x0, foot.x1]) b.column(x, z, 2, top, 'post');
        for (let s = 1; s <= storeys; s++) b.beamRing(foot, 3 * s, 'beam');
        for (let x = foot.x0 + 1; x < foot.x1; x += 4) b.beam(x, foot.z0, x, foot.z1, 3 * storeys, 'beam');
      } else if (variant === 2) {
        b.walls(rect(foot.x0, foot.z0, foot.x1, foot.z0), 2, 3 + rng.int(3), 'wall');
        b.walls(rect(foot.x0, foot.z0, foot.x0, foot.z1), 2, 2 + rng.int(3), 'wall');
        for (const x of [foot.x1, foot.x0 + Math.floor((foot.x1 - foot.x0) / 2)]) b.column(x, foot.z1, 2, 4, 'post');
        b.beam(foot.x0, foot.z1, foot.x1, foot.z1, 5, 'beam');
        b.stoneLantern(foot.x1 + 1, 1, foot.z1 + 1);
      }
      // Scaffolding on the front of a frame or a wall: bamboo poles and cross rails.
      if (variant !== 0) {
        const sz = foot.z1 + 1;
        const h = variant === 1 ? 3 * storeys + 1 : 6;
        for (let x = foot.x0; x <= foot.x1; x += 3) b.column(x, sz, 1, h, T.BAMBOO_POLE);
        for (let y = 3; y <= h; y += 3) b.fence(foot.x0, sz, foot.x1, sz, y, T.BAMBOO_FENCE);
      }
    }
    // Heaps of material on the open ground: logs, planks, crates, bales and barrels, in a heap each.
    const heap = (x: number, z: number, block: number, h: number, w = 1, d = 1): void => {
      for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) for (let y = 1; y <= h - ((i + j) & 1); y++) b.set(x + i, y, z + j, block);
    };
    const spots: Array<[number, number]> = [[1, D - 4], [W - 3, D - 4], [1, 1], [W - 3, 1]].filter(([x, z]) => x >= 1 && z >= 1 && x < W - 1 && z < D - 1) as Array<[number, number]>;
    const kinds = [
      (x: number, z: number) => heap(x, z, BlockType.WOOD_LOG, 2, 2, 2),
      (x: number, z: number) => heap(x, z, BlockType.WOOD_PLANK, 2, 2, 1),
      (x: number, z: number) => heap(x, z, T.CRATE, 2, 1, 2),
      (x: number, z: number) => { b.set(x, 1, z, T.RICE_BALE); b.set(x + 1, 1, z, T.RICE_BALE); b.set(x, 1, z + 1, T.BARREL); },
    ];
    spots.forEach(([x, z], i) => kinds[(i + variant + rng.int(4)) % kinds.length](x, z));
    return b.build();
  }
}
