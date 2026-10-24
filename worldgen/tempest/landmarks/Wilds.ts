import { NatureBlock } from '../../../content/blocksNature';
import { TempestBlock as T } from '../../../content/blocksTempest';
import { Rng } from '../../noise';
import { Blueprint } from '../../structures/Blueprint';
import { BlueprintBuilder, DX, DZ, EAST, NORTH, SOUTH, WEST, rect } from '../../structures/BlueprintBuilder';
import { FLARED_TIGHT } from '../../structures/roofProfile';
import { StylePack } from '../../structures/StylePack';
import { LandmarkSpec } from './LandmarkSpec';
import { FLOWERS, STONE, TOP, WOOD, annulus, cedar, circlePoints, disc, hash01, ringCells, sakura, turnsOf } from './parts';
import { footprintOf } from './specs';

// The pieces of the wilderness around the town: the sealed cave's portal in its rock face and the glowing pools below it, the
// memorial cairn on its hill, the lumber clearing, and the two fenced pastures.

// --- The sealed cave ----------------------------------------------------------------------------------------------------------

const ROCK = [STONE.stone, STONE.granite, STONE.cobble, STONE.mossyCobble] as const;

/**
 * The portal in its rock face, 19 by 19 with the face looking south: a cliff of grey and granite stone with moss, built from
 * below the ground (the zone's ground here is the wilderness, not the town's flat one) to a grassy crown with cedars. In the
 * face, a doorway five wide framed by lacquered posts and a lintel under a small tile roof, its floor a stone paving; set back in
 * it, two blocks in, the seal: black basalt with a rune of blue ore that glows. In front, a forecourt of paving, a path
 * of stepping stones, two stone lanterns, a low mossy wall and bollards.
 */
const buildCavePortal = (style: StylePack, rng: Rng): Blueprint => {
  const b = new BlueprintBuilder(style.family('vermilion-dark'), rng, 'north-cave');
  const FACE = 11;
  const faceHeight = (x: number): number => 12 + Math.round(3 * Math.sin((Math.PI * (x + 1)) / 20)) + (hash01(x, 7, 1) < 0.35 ? 1 : 0);
  // Rock: every column from deep in the ground to its height, rough on the face and the sides.
  for (let x = 0; x <= 18; x++) {
    for (let z = 0; z <= FACE; z++) {
      // The cliff recedes at the sides and the back; the height steps down towards the back.
      const edge = Math.min(x, 18 - x);
      const slope = Math.floor((FACE - z) / 3);
      const rough = hash01(x, z, 2);
      let h = faceHeight(x) - slope - (edge < 2 ? (2 - edge) * 3 : 0) + (rough < 0.25 ? 1 : 0) - (rough > 0.85 ? 1 : 0);
      if (h < 2) continue;
      for (let y = -6; y <= h; y++) {
        // The face is rough: some cells at the front are left out (ledges, a leaning slab), only above the ground and below the top.
        const faceZ = FACE - (hash01(x, y, 3) < 0.14 && y > 2 && y < h - 1 ? 1 : 0);
        if (z > faceZ) continue;
        const pick = hash01(x + z * 31, y, 4);
        const block = y === h ? STONE.moss : pick < 0.5 ? ROCK[0] : pick < 0.72 ? ROCK[1] : pick < 0.9 ? ROCK[2] : ROCK[3];
        b.set(x, y, z, y === h && hash01(x, z, 9) < 0.5 ? STONE.grass : block);
      }
    }
  }
  // The portal: the face is cut back two blocks into a doorway, five wide and six high, with a floor of paving.
  const cx = 9;
  for (let z = 9; z <= FACE; z++) {
    for (let x = cx - 2; x <= cx + 2; x++) {
      for (let y = 1; y <= 6; y++) b.carve(x, y, z);
      b.set(x, 0, z, 'path');
    }
  }
  // The frame: lacquered posts, a lintel two blocks deep, a tile roof, lanterns hung under it.
  for (const x of [cx - 3, cx + 3]) for (let z = FACE - 1; z <= FACE; z++) for (let y = 1; y <= 7; y++) b.set(x, y, z, z === FACE ? 'accent' : STONE.cobble);
  for (let x = cx - 3; x <= cx + 3; x++) for (let z = FACE - 1; z <= FACE; z++) { b.set(x, 7, z, 'beam'); b.set(x, 8, z, STONE.cobble); }
  for (let x = cx - 2; x <= cx + 2; x++) { b.set(x, 7, FACE, 'beam'); b.set(x, 7, FACE - 1, 'beam'); }
  const roofB = new BlueprintBuilder(style.family('plaster-dark'), rng.fork(0x71), 'portal-roof');
  roofB.gable(rect(cx - 2, FACE - 1, cx + 2, FACE), 8, { profile: FLARED_TIGHT, axis: 'x', tips: 1, gableWall: 'wallBase', endOverhang: 1 });
  b.bp.merge(roofB.build());
  for (const x of [cx - 1, cx + 1]) b.set(x, 6, FACE, 'light');
  // The seal, two blocks in: basalt with a rune of blue ore that glows (a ring of lamps round a bar).
  for (let x = cx - 2; x <= cx + 2; x++) for (let y = 1; y <= 6; y++) b.set(x, y, 9, STONE.basalt);
  for (const [x, y] of [[cx, 2], [cx, 3], [cx, 4], [cx, 5], [cx - 1, 4], [cx + 1, 4], [cx - 2, 3], [cx + 2, 3]]) b.set(x, y, 9, T.BLUE_ORE_LAMP);
  b.set(cx, 6, 9, STONE.basalt);
  // The forecourt: paving, a path of stones, lanterns and a low wall with bollards.
  for (let z = FACE + 1; z <= 18; z++) {
    for (let x = 1; x <= 17; x++) {
      const near = Math.abs(x - cx) <= 3 || z <= FACE + 2;
      if (near || hash01(x, z, 11) < 0.2) b.set(x, 0, z, hash01(x, z, 12) < 0.3 ? 'pathAlt' : 'path');
    }
  }
  for (let z = FACE + 1; z <= 18; z++) b.set(cx, 0, z, 'pathAlt');
  for (const x of [cx - 4, cx + 4]) b.stoneLantern(x, 1, FACE + 2);
  for (const x of [1, 2, 3, 4, 14, 15, 16, 17]) b.set(x, 1, 18, 'stoneSlab', 0);
  for (const x of [cx - 3, cx + 3]) { b.set(x, 1, 18, T.STONE_BOLLARD); }
  // Trees on the crown, built; moss and wildflowers at the foot.
  cedar(b, 4, 5, faceHeight(4) - 3, 6);
  cedar(b, 14, 4, faceHeight(14) - 3, 7);
  cedar(b, 9, 3, faceHeight(9) - 4, 8);
  sakura(b, 14, 14, 0, 4);
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(hash01(i, 1, 21) * 19);
    const z = FACE + 1 + Math.floor(hash01(i, 2, 22) * 7);
    if (Math.abs(x - cx) <= 3) continue;
    b.setIfEmpty(x, 1, z, FLOWERS[i % FLOWERS.length]);
  }
  b.mark({ kind: 'door', x: cx, y: 1, z: 18, facing: SOUTH });
  b.mark({ kind: 'room', x: cx, y: 1, z: 10, tag: 'portal' });
  return b.build();
};

export const northCave = (): LandmarkSpec => ({
  id: 'north-cave', name: 'Sealed cave', covers: ['north-cave'], facing: 1, footprint: footprintOf('north-cave'), frame: 'front-south', build: buildCavePortal,
});

// --- The glowing pools ----------------------------------------------------------------------------------------------------------

/**
 * Terraced pools, 33 by 33: four basins stepping down the slope from the north west to the south east, each lower than the last,
 * each in a rim of mossy stone and filled with water over a floor of blue ore that lights it from beneath, water pouring from
 * each into the next. Stone steps run down the side, lanterns of blue ore stand at the corners.
 */
const buildPools = (style: StylePack, rng: Rng): Blueprint => {
  const b = new BlueprintBuilder(style.family('vermilion-dark'), rng, 'cave-pools');
  const pools = [
    { cx: 8, cz: 8, rx: 6, rz: 4, level: 5 },
    { cx: 15, cz: 15, rx: 7, rz: 5, level: 4 },
    { cx: 22, cz: 22, rx: 7, rz: 5, level: 3 },
    { cx: 26, cz: 28, rx: 5, rz: 3, level: 2 },
  ];
  // The ground under everything: a stepped bank of mossy stone, to the level of the pool it holds.
  for (let z = 0; z < 33; z++) {
    for (let x = 0; x < 33; x++) {
      let level = -1;
      for (const p of pools) {
        const e = ((x - p.cx) / (p.rx + 2)) ** 2 + ((z - p.cz) / (p.rz + 2)) ** 2;
        if (e <= 1) level = Math.max(level, p.level);
      }
      if (level < 0) continue;
      for (let y = -2; y <= level; y++) b.set(x, y, z, hash01(x, z + y * 7, 31) < 0.3 ? STONE.mossyCobble : STONE.stone);
    }
  }
  for (const p of pools) {
    for (let z = p.cz - p.rz - 1; z <= p.cz + p.rz + 1; z++) {
      for (let x = p.cx - p.rx - 1; x <= p.cx + p.rx + 1; x++) {
        const e = ((x - p.cx) / p.rx) ** 2 + ((z - p.cz) / p.rz) ** 2;
        if (e <= 1) {
          // The basin: a floor of ore, water over it level with the bank.
          b.set(x, p.level - 1, z, hash01(x, z, 41) < 0.5 ? T.BLUE_ORE_LAMP : T.GREEN_ORE_LAMP);
          b.set(x, p.level, z, STONE.water);
        } else if (e <= 1.45) {
          b.set(x, p.level, z, 'stone');
          // Every few cells of the rim a lump of ore stands in place of the slab: the pools are lit from their banks as well.
          const lamp = (x * 3 + z * 5) % 7 === 0;
          if (lamp) b.set(x, p.level + 1, z, (x + z) % 2 === 0 ? T.BLUE_ORE_LAMP : T.GREEN_ORE_LAMP);
          else b.set(x, p.level + 1, z, 'stoneSlab', 0);
        }
      }
    }
  }
  // Water pours from each pool into the next at the south east lip.
  for (let i = 0; i + 1 < pools.length; i++) {
    const p = pools[i];
    const q = pools[i + 1];
    const x = Math.round((p.cx + q.cx) / 2) + 2;
    const z = Math.round((p.cz + q.cz) / 2) + 2;
    for (let y = q.level + 1; y <= p.level; y++) b.set(x, y, z, STONE.water);
    b.set(x, q.level, z, STONE.water);
  }
  // Stairs where one terrace meets the next: on the lower bank, climbing towards the higher, two at each step down on the west side.
  const levelAt = (x: number, z: number): number => {
    let level = -1;
    for (const p of pools) {
      if (((x - p.cx) / (p.rx + 2)) ** 2 + ((z - p.cz) / (p.rz + 2)) ** 2 <= 1) level = Math.max(level, p.level);
    }
    return level;
  };
  const wet = (x: number, z: number): boolean => pools.some((p) => ((x - p.cx) / p.rx) ** 2 + ((z - p.cz) / p.rz) ** 2 <= 1.45);
  for (let i = 0; i + 1 < pools.length; i++) {
    const lower = pools[i + 1].level;
    let placed = 0;
    for (let x = 0; x < 33 && placed < 2; x++) {
      for (let z = 0; z < 33 && placed < 2; z++) {
        if (levelAt(x, z) !== lower || wet(x, z) || b.bp.has(x, lower + 1, z)) continue;
        for (const d of [EAST, SOUTH, WEST, NORTH] as const) {
          const nx = x + DX[d];
          const nz = z + DZ[d];
          if (levelAt(nx, nz) === lower + 1 && !wet(nx, nz) && !wet(x - DX[d], z - DZ[d]) && levelAt(x - DX[d], z - DZ[d]) === lower) {
            b.stair(x, lower + 1, z, d, 'stoneStairs');
            placed++;
            break;
          }
        }
      }
    }
  }
  for (const [x, z] of [[1, 1], [31, 1], [1, 31], [31, 31]]) {
    b.set(x, 0, z, STONE.stone);
    b.column(x, z, 1, 3, 'post');
    b.set(x, 4, z, x < 16 ? T.BLUE_ORE_LAMP : T.GREEN_ORE_LAMP);
  }
  return b.build();
};

export const cavePools = (): LandmarkSpec => ({
  id: 'cave-pools', name: 'Cave pools', covers: ['cave-pools'], facing: 2, footprint: footprintOf('cave-pools'), frame: 'front-south', optional: true,
  build: buildPools,
});

// --- The memorial cairn ---------------------------------------------------------------------------------------------------------------

/**
 * The memorial cairn on its hill, 25 by 25 with the way up on the west side: a round green hill five blocks high with a paved
 * terrace on top and in the middle of it the cairn, a stepped pile of grey, mossy and granite stones with a standing stone behind
 * it, a stone basin of offerings and vases before it, four stone lanterns at the points of the terrace and a tall bamboo pole with
 * red and white banners. A flight of steps climbs the west slope between low walls, and a lacquered gate stands at its foot with
 * a lantern hung under its beam. Flowers on the slopes, a sakura and two cedars.
 */
const buildCairn = (style: StylePack, rng: Rng): Blueprint => {
  const b = new BlueprintBuilder(style.family('vermilion-dark'), rng, 'south-cairn');
  const c = 12;
  const HILL = 5;
  const R = 11.5;
  const surface = (x: number, z: number): number => {
    const d = Math.hypot(x - c, z - c);
    return d > R ? -1 : Math.round(HILL * (1 - (d / R) ** 2));
  };
  for (let z = 0; z < 25; z++) {
    for (let x = 0; x < 25; x++) {
      const h = surface(x, z);
      if (h < 0) continue;
      for (let y = -2; y < h; y++) b.set(x, y, z, STONE.dirt);
      b.set(x, h, z, STONE.grass);
    }
  }
  const top = surface(c, c);
  const TERRACE = 5.2;
  // The terrace: a paved disc of fan cobbles with a plain rim, on fill where the hill is lower, edged by a low wall with a gap
  // where the steps come in.
  disc(c, c, TERRACE, (x, z, d) => {
    for (let yy = Math.max(0, surface(x, z)); yy < top; yy++) b.set(x, yy, z, STONE.dirt);
    b.set(x, top, z, d > TERRACE - 1 ? 'path' : (Math.floor(turnsOf(c, c, x, z) * 12) & 1) === 0 ? 'pathAlt' : 'path');
  });
  for (const [x, z] of ringCells(c, c, TERRACE)) {
    if (x <= c - 4 && Math.abs(z - c) <= 2) continue;
    b.set(x, top + 1, z, STONE.mossyCobble);
    if ((x + z) % 3 === 0) b.set(x, top + 2, z, STONE.cobbleSlab, 0);
  }
  // The cairn: courses of rough stone, each narrower than the last, no two cells alike.
  const courses: Array<[number, number]> = [[2.3, 1], [1.8, 1], [1.3, 2], [0.8, 2]];
  let y = top + 1;
  for (const [r, count] of courses) {
    for (let k = 0; k < count; k++, y++) {
      disc(c, c, r, (x, z) => {
        const n = hash01(x, z + y * 13, 51);
        b.set(x, y, z, n < 0.35 ? STONE.mossyCobble : n < 0.65 ? STONE.granite : STONE.cobble);
      });
    }
  }
  b.set(c, y, c, STONE.granite);
  b.set(c, y + 1, c, STONE.cobbleSlab, 0);
  // A standing stone behind it, tall and narrow, and the offering basin and vases beside the cairn.
  for (let k = 1; k <= 6; k++) b.set(c + 3, top + k, c, k >= 5 ? STONE.granite : STONE.cobble);
  b.set(c + 3, top + 7, c, STONE.cobbleSlab, 0);
  b.set(c + 2, top + 1, c - 3, T.STONE_BASIN);
  b.set(c + 3, top + 1, c - 3, T.VASE);
  b.set(c + 1, top + 1, c - 3, T.VASE);
  b.set(c - 3, top + 1, c + 3, 'stoneSlab', TOP);
  b.set(c - 2, top + 1, c + 3, T.VASE);
  // Stone lanterns at the points, and a tall mast with banners at the back.
  for (const [dx, dz] of [[0, -4], [0, 4], [4, 0]]) b.stoneLantern(c + dx, top + 1, c + dz);
  b.column(c + 3, c + 3, top + 1, top + 12, T.BAMBOO_POLE);
  for (let k = 0; k < 6; k++) b.set(c + 2, top + 12 - k, c + 3, k % 2 === 0 ? T.NOREN_RED : T.NOREN_WHITE, 1);
  // The way up: three wide from the west edge, level paving across the lawn and then a stair, one block a cell, between low walls.
  const rise = (x: number): number => Math.max(0, surface(x, c));
  for (let x = 0; x <= c - 6; x++) {
    const h = rise(x);
    for (const z of [c - 1, c, c + 1]) {
      for (let yy = 0; yy < h; yy++) b.set(x, yy, z, STONE.dirt);
      if (x > 0 && h > rise(x - 1)) b.stair(x, h, z, EAST, 'stoneStairs');
      else b.set(x, h, z, 'path');
    }
    if (h >= 1) for (const z of [c - 2, c + 2]) { b.set(x, h, z, 'stone'); b.set(x, h + 1, z, 'stoneSlab', 0); }
  }
  // The last step, onto the terrace.
  for (const z of [c - 1, c, c + 1]) b.stair(c - 5, top, z, EAST, 'stoneStairs');
  // The gate at the foot: two lacquered posts, a lintel, a second beam, a lantern hanging under it.
  const gateX = 3;
  const gh = rise(gateX);
  for (const z of [c - 2, c + 2]) b.column(gateX, z, gh + 1, gh + 5, 'accent');
  for (let z = c - 3; z <= c + 3; z++) b.set(gateX, gh + 6, z, 'accent');
  for (let z = c - 2; z <= c + 2; z++) b.set(gateX, gh + 5, z, 'beam');
  b.set(gateX, gh + 4, c, 'light');
  // Flowers on the slopes, and trees.
  for (let z = 0; z < 25; z++) for (let x = 0; x < 25; x++) {
    const h = surface(x, z);
    if (h < 0 || Math.hypot(x - c, z - c) < TERRACE + 0.8 || (x < c - 3 && Math.abs(z - c) <= 2)) continue;
    if (hash01(x, z, 61) < 0.1) b.setIfEmpty(x, h + 1, z, FLOWERS[Math.floor(hash01(x, z, 62) * FLOWERS.length)]);
  }
  sakura(b, c + 7, c - 4, surface(c + 7, c - 4), 4);
  cedar(b, c + 5, c + 8, surface(c + 5, c + 8), 6);
  cedar(b, c - 6, c + 8, surface(c - 6, c + 8), 5);
  b.mark({ kind: 'door', x: 0, y: 1, z: c, facing: WEST });
  b.mark({ kind: 'room', x: c, y: top + 1, z: c - 3, tag: 'cairn' });
  return b.build();
};

export const southCairn = (): LandmarkSpec => ({
  id: 'south-cairn', name: 'Memorial cairn', covers: ['south-cairn'], facing: 3, footprint: footprintOf('south-cairn'), frame: 'front-south', build: buildCairn,
});

// --- The lumber clearing ------------------------------------------------------------------------------------------------------------

/**
 * The lumber clearing, 61 across: trodden earth, felled trunks and stumps, stacks of logs and planks, a sawing frame, a small open
 * shed with a thatched roof, a hand cart, a path in from the south east and a firepit with a bench. The forest stands round it.
 */
const buildLumber = (style: StylePack, rng: Rng): Blueprint => {
  const b = new BlueprintBuilder(style.family('thatch'), rng, 'lumber-clearing');
  const c = 30;
  const R = 29;
  // Trodden earth: a disc of podzol with patches of mud, feathering out into the grass; the path in from the south east is gravel.
  disc(c, c, R - 4, (x, z, d) => {
    const n = hash01(x >> 1, z >> 1, 71);
    const edge = d > 19 ? (d - 19) / (R - 4 - 19) : 0;
    if (hash01(x, z, 72) < edge * 0.9) return;
    b.set(x, 0, z, n < 0.14 ? NatureBlock.MUD : NatureBlock.PODZOL);
  });
  for (let t = 0; t <= 30; t++) {
    const x = c + Math.round(t * 0.7) + 2;
    const z = c + Math.round(t * 0.7) + 2;
    for (const w of [0, 1, 2]) { b.set(x + w, 0, z, STONE.gravel); b.set(x, 0, z + w, STONE.gravel); b.set(x + w, 0, z + 1, STONE.gravel); }
  }
  const log = (x: number, z: number, h: number, material: number = WOOD.cedarLog): void => { for (let y = 1; y <= h; y++) b.set(x, y, z, material); };
  // Stumps: a log block or two, scattered by the hash, and a few felled trunks lying along x or z.
  for (let i = 0; i < 26; i++) {
    const a = hash01(i, 1, 81) * Math.PI * 2;
    const r = 6 + hash01(i, 2, 82) * 20;
    const x = Math.round(c + Math.cos(a) * r);
    const z = Math.round(c + Math.sin(a) * r);
    if (b.bp.has(x, 1, z)) continue;
    log(x, z, hash01(i, 3, 83) < 0.3 ? 2 : 1);
  }
  for (let i = 0; i < 6; i++) {
    const a = hash01(i, 5, 84) * Math.PI * 2;
    const r = 8 + hash01(i, 6, 85) * 14;
    const x = Math.round(c + Math.cos(a) * r);
    const z = Math.round(c + Math.sin(a) * r);
    const len = 5 + Math.floor(hash01(i, 7, 86) * 5);
    const alongX = hash01(i, 8, 87) < 0.5;
    for (let k = 0; k < len; k++) b.setIfEmpty(alongX ? x + k : x, 1, alongX ? z : z + k, WOOD.cedarLog);
  }
  // Stacks of logs, three layers high in rows, beside the shed.
  for (const [x0, z0] of [[38, 18], [38, 22]] as const) {
    for (let k = 0; k < 7; k++) for (let y = 1; y <= 3 - (k > 5 ? 1 : 0); y++) b.set(x0 + k, y, z0, WOOD.cedarLog);
    for (let k = 0; k < 7; k++) for (let y = 1; y <= 3 - (k > 5 ? 1 : 0); y++) b.set(x0 + k, y, z0 + 1, WOOD.log);
  }
  // Planks: crates and a pile of plank slabs.
  for (let k = 0; k < 4; k++) { b.set(40 + k, 1, 28, T.CRATE); if (k % 2 === 0) b.set(40 + k, 2, 28, T.CRATE); }
  for (let k = 0; k < 5; k++) for (let y = 1; y <= 2; y++) b.set(40 + k, y, 31, WOOD.plankSlab, 0);
  // A sawing frame: a log laid across two trestles, a stack of cut planks beside it and a bucket.
  for (const x of [20, 28]) { b.column(x, 41, 1, 2, 'post'); b.set(x, 3, 40, 'beam'); b.set(x, 3, 42, 'beam'); b.set(x, 2, 40, 'post'); b.set(x, 2, 42, 'post'); }
  for (let x = 19; x <= 29; x++) b.set(x, 3, 41, WOOD.cedarLog);
  b.set(23, 1, 38, T.BUCKET);
  for (let k = 0; k < 4; k++) for (let y = 1; y <= 2; y++) b.set(23 + k, y, 44, WOOD.plankSlab, 0);
  // The shed: an open lean-to of four posts and a thatched hip, a bench and tools under it.
  const shed = rect(10, 12, 16, 17);
  for (const [x, z] of [[shed.x0, shed.z0], [shed.x1, shed.z0], [shed.x0, shed.z1], [shed.x1, shed.z1]]) b.column(x, z, 1, 4, 'post');
  b.beamRing(shed, 5, 'beam');
  b.hip(shed, 5, { profile: FLARED_TIGHT, ridgeCap: false });
  for (let x = shed.x0 + 1; x <= shed.x1 - 1; x++) b.set(x, 1, shed.z0, T.CRATE);
  b.set(shed.x0 + 2, 1, shed.z1 - 1, 'stoneSlab', TOP);
  b.set(shed.x0 + 3, 1, shed.z1 - 1, 'stoneSlab', TOP);
  b.set(shed.x1 - 1, 1, shed.z1 - 1, T.BARREL);
  b.set(shed.x0 + 3, 4, shed.z0 + 2, 'light');
  // A hand cart: a bed of planks on two blocks for wheels, shafts out the front, logs on it.
  for (let x = 44; x <= 46; x++) for (let z = 36; z <= 38; z++) b.set(x, 2, z, WOOD.plank);
  b.set(44, 1, 36, T.BARREL); b.set(46, 1, 36, T.BARREL); b.set(44, 1, 38, T.BARREL); b.set(46, 1, 38, T.BARREL);
  b.set(45, 3, 37, WOOD.log); b.set(44, 3, 37, WOOD.log);
  for (let x = 41; x <= 43; x++) b.set(x, 2, 37, 'fence');
  // A firepit and a bench round it, with a lantern post.
  for (const [x, z] of circlePoints(20, 20, 2, 8)) b.set(x, 0, z, STONE.cobble);
  b.set(20, 0, 20, T.HEARTH);
  for (const [x, z] of [[17, 20], [23, 20]]) b.set(x, 1, z, 'stoneSlab', TOP);
  b.stoneLantern(24, 1, 17);
  // The forest edge: cedars and sakura just inside the rim.
  annulus(c, c, R - 8, R - 4, (x, z) => {
    if (hash01(x, z, 91) < 0.06) { if (hash01(x, z, 92) < 0.7) cedar(b, x, z, 0, 6 + Math.floor(hash01(x, z, 93) * 4)); else sakura(b, x, z, 0, 4); }
  });
  return b.build();
};

export const lumberClearing = (): LandmarkSpec => ({
  id: 'lumber-clearing', name: 'Lumber clearing', covers: ['lumber-clearing'], facing: 2, footprint: footprintOf('lumber-clearing'), frame: 'front-south', optional: true,
  build: buildLumber,
});

// --- The pastures --------------------------------------------------------------------------------------------------------------------

/** A fenced round pasture: a ring of rail fence with a gate gap on the road's side, a trough, hay, an open shelter and some trees. */
const buildPasture = (radius: number): ((style: StylePack, rng: Rng) => Blueprint) => (style, rng) => {
  const b = new BlueprintBuilder(style.family('thatch'), rng, 'pasture');
  const size = radius * 2 + 1;
  const c = radius;
  // The fence: a ring joined face to face, with the gap on the south side (the front).
  const gate = Math.round(radius * 0.25);
  for (const [x, z] of ringCells(c, c, radius - 0.5)) {
    if (z > c + radius - 5 && Math.abs(x - c) <= gate) continue;
    b.set(x, 1, z, 'fence');
  }
  // Gateposts either side of the gap, with lanterns.
  for (const side of [-1, 1]) {
    const x = c + side * (gate + 1);
    const z = Math.round(c + Math.sqrt((radius - 0.5) ** 2 - (side * (gate + 1)) ** 2));
    b.column(x, z, 1, 3, 'post');
    b.set(x, 4, z, 'light');
  }
  // A trodden path from the gate to the shelter.
  for (let z = c + 4; z <= size - 1; z++) { b.set(c, 0, z, STONE.gravel); b.set(c + 1, 0, z, STONE.gravel); }
  // The shelter: four posts and a thatched hip, hay and a rack under it.
  const sx = c - 8;
  const sz = c - 6;
  const shelter = rect(sx, sz, sx + 6, sz + 4);
  for (const [x, z] of [[shelter.x0, shelter.z0], [shelter.x1, shelter.z0], [shelter.x0, shelter.z1], [shelter.x1, shelter.z1]]) b.column(x, z, 1, 3, 'post');
  b.beamRing(shelter, 4, 'beam');
  b.hip(shelter, 4, { profile: FLARED_TIGHT, ridgeCap: false });
  for (let x = shelter.x0 + 1; x <= shelter.x1 - 1; x++) b.set(x, 1, shelter.z0, x % 2 === 0 ? T.RICE_BALE : T.BARREL);
  // The lamp hangs from a tie beam across the shelter.
  for (let x = shelter.x0; x <= shelter.x1; x++) b.set(x, 4, shelter.z0 + 2, 'beam');
  b.set(shelter.x0 + 3, 3, shelter.z0 + 2, 'light');
  // The trough: stone basins in a row, with water in them.
  for (let k = 0; k < 3; k++) b.set(c + 6 + k, 1, c + 4, T.STONE_BASIN);
  b.set(c + 6, 1, c + 5, T.BUCKET);
  // A worn track round the field, a little inside the fence, with hay stacked by the shelter and a hitching rail at the gate.
  annulus(c, c, radius - 5.2, radius - 3.6, (x, z) => { if (hash01(x, z, 101) < 0.85 && !(z > c + radius - 8 && Math.abs(x - c) <= gate + 1)) b.set(x, 0, z, NatureBlock.PODZOL); });
  for (const [x, z] of [[sx - 2, sz + 1], [sx - 2, sz + 2], [sx - 1, sz + 5], [sx, sz + 5]]) {
    b.set(x, 1, z, T.RICE_BALE);
    if (hash01(x, z, 102) < 0.6) b.set(x, 2, z, T.RICE_BALE);
  }
  for (let x = c - gate - 4; x <= c - gate - 2; x++) b.set(x, 1, c + radius - 6, 'rail');
  b.column(c - gate - 4, c + radius - 6, 1, 2, 'post');
  b.column(c - gate - 2, c + radius - 6, 1, 2, 'post');
  // Long grass, ferns and wildflowers in the field, thinner the nearer the track.
  disc(c, c, radius - 6, (x, z) => {
    const n = hash01(x, z, 103);
    if (b.bp.has(x, 1, z) || b.bp.has(x, 0, z)) return;
    if (n < 0.05) b.set(x, 1, z, NatureBlock.FERN);
    else if (n < 0.09) b.set(x, 1, z, FLOWERS[Math.floor(hash01(x, z, 104) * FLOWERS.length)]);
  });
  // Trees: a few built ones inside the fence, apart from the shelter.
  sakura(b, c + 10, c - 8, 0, 4);
  cedar(b, c - 12, c + 8, 0, 6);
  cedar(b, c + 12, c + 6, 0, 5);
  return b.build();
};

export const horsePasture = (): LandmarkSpec => ({
  id: 'horse-pasture', name: 'Horse pasture', covers: ['horse-pasture'], facing: 0, footprint: footprintOf('horse-pasture'), frame: 'front-south',
  build: buildPasture(34),
});

export const paddock = (): LandmarkSpec => ({
  id: 'paddock', name: 'Paddock', covers: ['paddock'], facing: 2, footprint: footprintOf('paddock'), frame: 'front-south', build: buildPasture(28),
});

