import { NatureBlock } from '../../../content/blocksNature';
import { BlockType } from '../../../worldConstants';
import { Rng } from '../../noise';
import { BlueprintBuilder, rect } from '../../structures/BlueprintBuilder';
import { Rect, bench, boulder, gardenBridge } from './parts';

// Garden pieces the garden house, the inn and the plots share: a pond with stepping stones and a small arched bridge, a
// lantern, a bench, boulders, moss and gravel, a bamboo fence with a gate, and places left for trees.

export interface GardenOptions {
  /** Cell of the fence (x) where the gate is, on the south side, or null for none. */
  gate?: number | null;
  fence?: boolean;
  pond?: boolean;
  bridge?: boolean;
  lanterns?: number;
  bench?: boolean;
  trees?: number;
  bamboo?: boolean;
  /** Cover the ground with gravel and moss instead of leaving the lawn. */
  rock?: boolean;
}

export interface GardenResult {
  pond: Rect | null;
  path: Array<[number, number]>;
}

/** Lays a garden inside `g` (inclusive). The front is the south edge, z = g.z1. */
export const layGarden = (b: BlueprintBuilder, g: Rect, rng: Rng, o: GardenOptions = {}): GardenResult => {
  const w = g.x1 - g.x0 + 1;
  const d = g.z1 - g.z0 + 1;
  const result: GardenResult = { pond: null, path: [] };
  // Ground: patches of moss, and gravel when it is a rock garden.
  for (let z = g.z0; z <= g.z1; z++) {
    for (let x = g.x0; x <= g.x1; x++) {
      const n = (x * 73856093 ^ z * 19349663) >>> 0;
      if (o.rock) b.set(x, 0, z, n % 7 === 0 ? NatureBlock.MOSS : NatureBlock.GRAVEL);
      else if (n % 9 === 0) b.set(x, 0, z, NatureBlock.MOSS);
    }
  }
  const gate = o.gate === undefined ? Math.floor((g.x0 + g.x1) / 2) : o.gate;
  if (o.fence !== false) {
    b.fenceRect(g, 1, gate !== null ? [[gate, g.z1], [gate + 1, g.z1]] : []);
    if (gate !== null) {
      // Gate posts either side of the gap.
      b.column(gate - 1, g.z1, 1, 2, 'post');
      b.column(gate + 2, g.z1, 1, 2, 'post');
      b.beam(gate - 1, g.z1, gate + 2, g.z1, 3, 'beam');
      b.set(gate, 2, g.z1, 'light');
    }
  }
  // The pond sits on the side away from the gate's path so a path of stones passes beside it.
  let bridgeStart: [number, number] | null = null;
  if (o.pond !== false && w >= 9 && d >= 7) {
    const pw = Math.min(w - 6, 5 + rng.int(3));
    const ph = Math.min(d - 5, 3 + rng.int(2));
    const leftSide = gate === null ? rng.chance(0.5) : gate - g.x0 > g.x1 - gate;
    const px0 = leftSide ? g.x0 + 2 : g.x1 - 2 - pw + 1;
    const pz0 = g.z0 + 2 + rng.int(Math.max(1, d - ph - 5));
    const pond = rect(px0, pz0, px0 + pw - 1, pz0 + ph - 1);
    b.pond(pond, 0, 2 + rng.int(2), 'stone');
    result.pond = pond;
    if (o.bridge !== false && ph >= 3) {
      const bx = pond.x0 + Math.floor(pw / 2);
      gardenBridge(b, bx, pond.z0 - 1, ph + 2, 'z', 1);
      bridgeStart = [bx, pond.z1 + 2];
    }
    b.stoneLantern(leftSide ? pond.x1 + 2 : pond.x0 - 2, 1, pond.z1 + 1);
  }
  // A line of stepping stones from the gate towards the middle of the garden (or the bridge).
  if (gate !== null) {
    const tz = bridgeStart ? bridgeStart[1] : Math.max(g.z0 + 2, g.z1 - 6);
    const tx = bridgeStart ? bridgeStart[0] : gate;
    const n = Math.max(Math.abs(g.z1 - 1 - tz), Math.abs(gate - tx), 1);
    for (let i = 0; i <= n; i++) {
      const sx = Math.round(gate + ((tx - gate) * i) / n);
      const sz = Math.round(g.z1 - 1 + ((tz - (g.z1 - 1)) * i) / n);
      b.steppingStones([[sx, sz]], 1);
      result.path.push([sx, sz]);
    }
  }
  for (let i = 0; i < (o.lanterns ?? 1); i++) b.stoneLantern(i % 2 === 0 ? g.x0 + 2 : g.x1 - 2, 1, g.z1 - 2 - Math.floor(i / 2) * 3);
  if (o.bench !== false && d >= 7) bench(b, g.x1 - 4, g.z0 + 1, 'x');
  if (w >= 9) boulder(b, g.x0 + 1 + rng.int(3), g.z0 + 1 + rng.int(2), 3);
  for (let i = 0; i < (o.trees ?? 2); i++) {
    const tx = i % 2 === 0 ? g.x0 + 2 : g.x1 - 2;
    const tz = g.z0 + 2 + (i >> 1) * 3 + (i % 2);
    b.treeSpot(tx, tz, i % 2 === 0 ? 'sakura' : 'cedar');
  }
  if (o.bamboo) {
    const bx = g.x1 - 1;
    const bz = g.z0 + 1;
    for (const [dx, dz, h] of [[0, 0, 5], [1, 0, 4], [0, 1, 4], [-1, 0, 3]] as const) {
      if (bx + dx > g.x1 - 1) continue;
      for (let k = 0; k < h; k++) b.set(bx + dx, 1 + k, bz + dz, NatureBlock.BAMBOO);
    }
  }
  return result;
};

/** Rows of crops in a fenced kitchen garden: furrows of farmland planted at different stages. */
export const layKitchenGarden = (b: BlueprintBuilder, g: Rect, rng: Rng): void => {
  const stages = [BlockType.WHEAT_STAGE_1, BlockType.WHEAT_STAGE_2, BlockType.WHEAT];
  for (let z = g.z0 + 1; z <= g.z1 - 1; z++) {
    for (let x = g.x0 + 1; x <= g.x1 - 1; x++) {
      const furrow = (x - g.x0) % 3 !== 0;
      if (furrow) {
        b.set(x, 0, z, BlockType.FARMLAND);
        b.set(x, 1, z, stages[(x + z + rng.int(2)) % 3]);
      } else {
        b.set(x, 0, z, 'path');
      }
    }
  }
};
