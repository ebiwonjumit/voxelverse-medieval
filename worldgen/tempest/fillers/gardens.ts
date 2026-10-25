import { NatureBlock } from '../../../content/blocksNature';
import { TempestBlock as T } from '../../../content/blocksTempest';
import { BlockType } from '../../../worldConstants';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, SOUTH, rect } from '../../structures/BlueprintBuilder';
import { BuildingKit, KitSize } from '../../structures/BuildingKit';
import { Lot } from '../../structures/Lot';
import { StylePack } from '../../structures/StylePack';
import { FLARED_TIGHT } from '../../structures/roofProfile';

// The lots the planner leaves as gardens, parks and meadows: the kits that fill them. They are real kits (`garden-lot`,
// `park-lot`, `meadow-lot`), so a zone looks them up in the registry first and a better one registered later replaces them.
// They draw in the kit frame (front south, corner at 0, 0), keep every tree marker clear of the edges (the zone grows the
// tree where the crown fits) and leave the cells they say nothing about to the ground.

const FLOWERS = [NatureBlock.WILDFLOWER_PINK, NatureBlock.WILDFLOWER_WHITE, NatureBlock.WILDFLOWER_BLUE, BlockType.FLOWER_YELLOW, BlockType.FLOWER_RED, NatureBlock.WILDFLOWER_PURPLE];

/** Flowers and tufts on the bare ground cells of a rectangle, `chance` of the cells, and nothing on a cell the blueprint already uses. */
const sprinkle = (b: BlueprintBuilder, r: { x0: number; z0: number; x1: number; z1: number }, chance: number, rng: Rng, tall = 0): void => {
  for (let z = r.z0; z <= r.z1; z++) {
    for (let x = r.x0; x <= r.x1; x++) {
      if (b.bp.has(x, 0, z) || b.bp.has(x, 1, z)) continue;
      const roll = rng.next();
      if (roll < chance) b.set(x, 1, z, FLOWERS[rng.int(FLOWERS.length)]);
      else if (roll < chance + tall) b.set(x, 1, z, rng.chance(0.25) ? NatureBlock.FERN : BlockType.TALL_GRASS);
    }
  }
};

/** A bamboo fence round the lot with a gate gap and two posts in the middle of the front. */
const enclose = (b: BlueprintBuilder, W: number, D: number, gateX: number): void => {
  const gaps: Array<[number, number]> = [];
  for (let x = gateX - 1; x <= gateX + 1; x++) gaps.push([x, D - 1]);
  b.fenceRect(rect(0, 0, W - 1, D - 1), 1, gaps);
  if (W >= 9) {
    b.column(gateX - 2, D - 1, 1, 2, 'accent');
    b.column(gateX + 2, D - 1, 1, 2, 'accent');
    b.beam(gateX - 2, D - 1, gateX + 2, D - 1, 3, 'accent');
    b.set(gateX, 2, D - 1, 'light');
  }
};

/** A path of stepping stones or paving from the gate to a point, one cell wide. */
const walk = (b: BlueprintBuilder, x0: number, z0: number, x1: number, z1: number, paved: boolean): void => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / Math.max(n, 1));
    const z = Math.round(z0 + ((z1 - z0) * i) / Math.max(n, 1));
    if (paved) b.set(x, 0, z, 'path'); else b.set(x, 1, z, T.STEPPING_STONES);
  }
};

abstract class FillerKit extends BuildingKit {
  readonly frontage: KitSize = { min: 5, max: 70 };
  readonly depth: KitSize = { min: 5, max: 70 };
  readonly floors: KitSize = { min: 1, max: 3 };
}

// A walled garden: a bamboo fence with a lacquered gate, a path from the gate, and in the middle
//   variant 0 a koi pond with stepping stones and a stone lantern, 1 a paved court with a lantern and a basin,
//   2 a bamboo grove with a path of stepping stones and a lantern.
export class GardenLotKit extends FillerKit {
  readonly name: string = 'garden-lot';
  readonly variants = 3;

  preferredSize(): { frontage: number; depth: number; floors: number } {
    return { frontage: 17, depth: 17, floors: 1 };
  }

  build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const W = lot.frontage, D = lot.depth;
    const gateX = Math.floor(W / 2);
    const cz = Math.floor(D / 2);
    if (W >= 7 && D >= 7) enclose(b, W, D, gateX);
    if (variant === 0 && W >= 11 && D >= 11) {
      const pw = Math.min(6, Math.floor(W / 3)), pd = Math.min(5, Math.floor(D / 3));
      const px = rng.chance(0.5) ? 2 : W - 2 - pw, pz = 2;
      b.pond(rect(px, pz, px + pw - 1, pz + pd - 1), 0, 3);
      walk(b, gateX, D - 2, gateX, pz + pd + 2, false);
      b.stoneLantern(px < gateX ? px + pw + 1 : px - 2, 1, pz + pd + 1);
    } else if (variant === 1 && W >= 11 && D >= 11) {
      const court = rect(gateX - 3, cz - 3, gateX + 3, cz + 3);
      b.floor(court, 0, 'pathAlt');
      b.ring(court, 0, 0, 'stone');
      b.set(gateX, 1, cz, T.STONE_BASIN);
      b.set(gateX, 2, cz, T.WATER_JET);
      walk(b, gateX, D - 2, gateX, cz + 4, true);
      b.stoneLantern(court.x0 - 1, 1, court.z0 - 1);
      b.stoneLantern(court.x1 + 1, 1, court.z0 - 1);
    } else {
      // A grove along the back: bamboo stalks of different heights, leaves on top.
      const stalks = Math.max(3, Math.floor(W * 0.8));
      for (let i = 0; i < stalks; i++) {
        const x = 1 + rng.int(Math.max(1, W - 2)), z = 1 + rng.int(Math.max(1, Math.min(4, D - 2)));
        if (b.bp.has(x, 1, z)) continue;
        const h = 4 + rng.int(4);
        b.column(x, z, 1, h, NatureBlock.BAMBOO);
        b.set(x, h + 1, z, NatureBlock.BAMBOO_LEAVES);
      }
      walk(b, gateX, D - 2, gateX, Math.min(D - 2, 7), false);
      b.stoneLantern(gateX + 2, 1, Math.min(D - 3, 7));
    }
    // Trees: a sakura and a cedar at the back, a sakura by the gate. The zone keeps them if a crown fits.
    if (W >= 9 && D >= 9) {
      b.treeSpot(3, 3, 'sakura');
      b.treeSpot(W - 4, 3, variant === 2 ? 'cedar' : 'sakura');
      if (D >= 13) b.treeSpot(rng.chance(0.5) ? 3 : W - 4, D - 4, 'cedar');
    }
    sprinkle(b, rect(1, 1, W - 2, D - 2), 0.1, rng);
    return b.build();
  }
}

// A park: a lawn with winding paths, trees, benches (a stone slab and its back), and
//   variant 0 a pond with a pavilion on its bank, 1 a grove of many trees round a lantern, 2 an open lawn with one great sakura.
export class ParkLotKit extends FillerKit {
  readonly name: string = 'park-lot';
  readonly variants = 3;

  preferredSize(): { frontage: number; depth: number; floors: number } {
    return { frontage: 23, depth: 23, floors: 1 };
  }

  build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const W = lot.frontage, D = lot.depth;
    const gateX = Math.floor(W / 2);
    const cz = Math.floor(D / 2);
    // A hedge of low fence along the sides and the back, open all along the front: a park is for walking into.
    b.fence(0, 0, W - 1, 0, 1);
    b.fence(0, 0, 0, D - 3, 1);
    b.fence(W - 1, 0, W - 1, D - 3, 1);
    // The main path, a paved strip from the street to the middle, and a ring path round it.
    const ringR = Math.max(3, Math.min(Math.floor(Math.min(W, D) / 2) - 3, 7));
    for (let z = D - 1; z >= cz + ringR; z--) { b.set(gateX, 0, z, 'path'); b.set(gateX + 1, 0, z, 'path'); }
    for (let a = 0; a < 64; a++) {
      const t = (a / 64) * Math.PI * 2;
      b.set(Math.round(gateX + Math.cos(t) * ringR), 0, Math.round(cz + Math.sin(t) * ringR), 'path');
    }
    if (variant === 0 && W >= 15 && D >= 15) {
      const pw = Math.min(8, Math.floor(W / 3)), pd = Math.min(6, Math.floor(D / 4));
      b.pond(rect(2, 2, 2 + pw - 1, 2 + pd - 1), 0, 4);
      // The pavilion: four posts, a floor and a flared hip roof, on the lawn beside the pond.
      const px = W - 7, pz = cz - 2;
      const body = rect(px, pz, px + 2, pz + 2);
      b.floor(rect(px - 1, pz - 1, px + 3, pz + 3), 0, 'stone');
      b.columns([[body.x0, body.z0], [body.x1, body.z0], [body.x0, body.z1], [body.x1, body.z1]], 1, 3, 'accent');
      b.hip(body, 4, { profile: FLARED_TIGHT, tips: 2 });
      b.stair(px + 1, 0, pz + 4, SOUTH, 'stoneStairs');
    } else if (variant === 1) {
      b.stoneLantern(gateX, 1, cz);
      for (let i = 0; i < Math.max(6, Math.floor((W * D) / 40)); i++) {
        b.treeSpot(3 + rng.int(Math.max(1, W - 6)), 3 + rng.int(Math.max(1, D - 8)), rng.chance(0.55) ? 'cedar' : 'sakura');
      }
    } else {
      b.treeSpot(gateX, cz, 'sakura');
      b.treeSpot(3, 3, 'cedar');
      b.treeSpot(W - 4, 3, 'cedar');
    }
    // Benches along the ring path: a slab seat with a rail behind.
    for (const [x, z] of [[gateX - ringR - 1, cz], [gateX + ringR + 1, cz]]) {
      if (x > 0 && x < W - 1) { b.set(x, 1, z, 'stoneSlab'); b.set(x + (x < gateX ? -1 : 1), 1, z, 'fence'); }
    }
    if (variant !== 1 && W >= 11) { b.treeSpot(4, D - 5, 'sakura'); b.treeSpot(W - 5, D - 5, 'sakura'); }
    sprinkle(b, rect(1, 1, W - 2, D - 2), 0.07, rng, 0.04);
    return b.build();
  }
}

// A meadow: bare ground left wild, with flowers and tall grass, a few trees and a path across; a signboard by the street
// marks it as a plot waiting for a builder.
export class MeadowLotKit extends FillerKit {
  readonly name: string = 'meadow-lot';
  readonly variants = 2;

  preferredSize(): { frontage: number; depth: number; floors: number } {
    return { frontage: 21, depth: 21, floors: 1 };
  }

  build(lot: Lot, style: StylePack, rng: Rng, variant: number): Blueprint {
    const b = new BlueprintBuilder(style, rng, this.name);
    const W = lot.frontage, D = lot.depth;
    const gateX = Math.floor(W / 2);
    // A footpath worn across the plot, front to back.
    let x = gateX;
    for (let z = D - 1; z >= 0; z--) {
      b.set(x, 0, z, BlockType.PATH);
      if (rng.chance(0.18)) x = Math.max(1, Math.min(W - 2, x + (rng.chance(0.5) ? 1 : -1)));
    }
    if (W >= 9 && D >= 9) {
      b.treeSpot(3 + rng.int(3), 3, variant === 0 ? 'sakura' : 'cedar');
      b.treeSpot(W - 4 - rng.int(3), 4 + rng.int(3), 'sakura');
      if (D >= 15) b.treeSpot(rng.chance(0.5) ? 3 : W - 4, D - 5, 'cedar');
    }
    b.set(Math.max(1, gateX - 3), 1, D - 1, 'fence');
    b.signboard(Math.max(1, gateX - 3), 2, D - 1, 'x');
    sprinkle(b, rect(0, 0, W - 1, D - 1), 0.22, rng, 0.3);
    return b.build();
  }
}
