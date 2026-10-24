import { describe, expect, it } from 'vitest';
import { TempestBlock as T } from '../../content/blocksTempest';
import { BlockType } from '../../worldConstants';
import { Rect, landmarkById } from '../../worldgen/tempest/layout';
import { AIR_CELL, cellId, cellState } from '../../engine/cell';
import { Lot } from '../../worldgen/structures/Lot';
import { createTempestLandmarks, LandmarkSpec, buildLandmark, frameSize, placeBlueprint, landmarkLot, placeOnLot } from '../../worldgen/tempest/landmarks';
import { TEMPEST_STYLE } from '../../worldgen/tempest/style';
import { DX, DZ, Dir } from '../../worldgen/structures/BlueprintBuilder';
import { bridgeDeck } from '../../worldgen/tempest/landmarks/Waterworks';
import { BlueprintWorld, canStandIn, columnsOf, floatingCells, registry as blocks, walk } from './helpers';

// The hand-authored landmarks: each one fits its footprint, is the same every time, has nothing floating, can be walked into
// from the street and through, and is built quickly. The walkers are the game's own collision (helpers.ts).

const registry = createTempestLandmarks();
const specs = registry.specs.filter((s) => s.id !== 'interior-gallery');

const size = (r: Rect): { w: number; d: number } => ({ w: r.x1 - r.x0 + 1, d: r.z1 - r.z0 + 1 });

describe('landmarks', () => {
  it('cover the layout: every landmark of the plan that is not a pond, bridge or part of another has a spec', () => {
    const covered = new Set(registry.specs.flatMap((s) => s.covers));
    for (const id of [
      'central-square', 'civic-compound', 'town-hall', 'town-hall-forecourt', 'compound-lodge', 'west-gate', 'north-gate', 'east-gatehouse',
      'south-gatehouse', 'west-stalls-north', 'west-stalls-south', 'horse-pasture', 'paddock', 'arena', 'arena-guard-hut', 'north-cave',
      'cave-pools', 'south-cairn', 'east-bridge', 'aqueduct', 'lumber-clearing',
    ]) expect(covered.has(id), id).toBe(true);
    // Every spec covers layout landmarks that exist, and the ids are unique.
    expect(new Set(registry.specs.map((s) => s.id)).size).toBe(registry.specs.length);
    for (const s of specs) for (const c of s.covers) expect(landmarkById(c), `${s.id} covers ${c}`).toBeDefined();
  });

  it('draw the same blueprint for the same seed and a different one for another', () => {
    for (const s of specs) {
      const a = buildLandmark(s);
      const b = buildLandmark(s);
      expect(a.hash(), s.id).toBe(b.hash());
      expect(a.size, s.id).toBeGreaterThan(50);
    }
    // Seeded details change something in most of them (never the footprint).
    let differing = 0;
    for (const s of specs) if (buildLandmark(s).hash() !== buildLandmark(s, TEMPEST_STYLE, 99).hash()) differing++;
    expect(differing).toBeGreaterThan(specs.length / 3);
  });

  it('stay inside their footprint, in the blueprint frame and placed in the world', () => {
    for (const s of specs) {
      const bp = buildLandmark(s);
      const bounds = bp.bounds();
      const { frontage, depth } = frameSize(s);
      expect(bounds.minX, `${s.id} min x`).toBeGreaterThanOrEqual(0);
      expect(bounds.minZ, `${s.id} min z`).toBeGreaterThanOrEqual(0);
      expect(bounds.maxX, `${s.id} max x`).toBeLessThan(frontage);
      expect(bounds.maxZ, `${s.id} max z`).toBeLessThan(depth);
      const placed = placeBlueprint(s, bp).bounds();
      expect(placed.minX, s.id).toBeGreaterThanOrEqual(s.footprint.x0);
      expect(placed.minZ, s.id).toBeGreaterThanOrEqual(s.footprint.z0);
      expect(placed.maxX, s.id).toBeLessThanOrEqual(s.footprint.x1);
      expect(placed.maxZ, s.id).toBeLessThanOrEqual(s.footprint.z1);
      // The footprint is the layout's rectangle.
      const { w, d } = size(s.footprint);
      expect(frontage * depth, s.id).toBe(w * d);
    }
  });

  it('have nothing floating: every block joins the ground through blocks, faces, edges or corners', () => {
    for (const s of specs) {
      const floating = floatingCells(buildLandmark(s));
      expect(floating.slice(0, 5), `${s.id}: ${floating.length} floating`).toEqual([]);
    }
  });

  it('are built from air and blocks the world knows, in legal states', () => {
    for (const s of specs) {
      buildLandmark(s).forEach((_x, _y, _z, c) => {
        if (c === AIR_CELL) return;
        expect(blocks.has(cellId(c)), `${s.id} uses block ${cellId(c)}`).toBe(true);
        expect(cellState(c)).toBeLessThanOrEqual(15);
      });
    }
  });

  it('turn to face the way the plan says: every front door of the blueprint looks the landmark\'s way once placed, inside the footprint', () => {
    for (const s of specs.filter((v) => v.frame === 'front-south')) {
      const bp = buildLandmark(s);
      const front = bp.markers.filter((m) => m.kind === 'door' && m.facing === 2);
      const placed = placeBlueprint(s, bp).markers().filter((m) => m.kind === 'door' && m.facing === s.facing);
      expect(placed.length, s.id).toBe(front.length);
      for (const d of placed) {
        expect(d.x, `${s.id} door x`).toBeGreaterThanOrEqual(s.footprint.x0);
        expect(d.x, `${s.id} door x`).toBeLessThanOrEqual(s.footprint.x1);
        expect(d.z, `${s.id} door z`).toBeGreaterThanOrEqual(s.footprint.z0);
        expect(d.z, `${s.id} door z`).toBeLessThanOrEqual(s.footprint.z1);
      }
    }
  });

  it('build in a bounded time', () => {
    const times: string[] = [];
    for (const s of specs) {
      const t0 = performance.now();
      buildLandmark(s);
      const ms = performance.now() - t0;
      times.push(`${s.id} ${ms.toFixed(0)} ms`);
      // Generous: the biggest takes a few hundred milliseconds on the development machine, in a worker, once.
      expect(ms, s.id).toBeLessThan(4000);
    }
    // eslint-disable-next-line no-console
    console.info(times.join(', '));
  });
});

/** The places a walker can reach from the street in front of a door, on a world of this blueprint. */
const reachFrom = (s: LandmarkSpec, door: { x: number; y: number; z: number; facing?: number }, run = 3) => {
  const bp = buildLandmark(s);
  const { frontage, depth } = frameSize(s);
  const world = new BlueprintWorld(bp);
  const f = (door.facing ?? 2) as Dir;
  const start = { x: door.x + DX[f] * run, z: door.z + DZ[f] * run, feet: door.y - 0.5 };
  const places = walk(world, start, { minX: -4, maxX: frontage + 3, minZ: -4, maxZ: depth + 3, max: 600000 });
  return { places, bp, f };
};

describe('free set pieces', () => {
  const free = registry.specs.filter((s) => s.free);

  it('are the bell tower, the market hall and the bath house, and no zone places them', () => {
    expect(free.map((s) => s.id).sort()).toEqual(['bath-house', 'bell-tower', 'market-hall']);
    for (const s of free) expect(s.covers, s.id).toEqual([]);
  });

  it('stand on a lot facing any way, with the footprint on the lot and the door looking the lot\'s way', () => {
    for (const s of free) {
      const { frontage, depth } = frameSize(s);
      for (const facing of [0, 1, 2, 3] as const) {
        const lot = new Lot({ id: `lot-${s.id}`, x: 1000, z: 2000, w: facing & 1 ? depth : frontage, d: facing & 1 ? frontage : depth, facing, district: 'tourism', seed: 5, groundY: 8 });
        const placed = placeOnLot(s, lot);
        const b = placed.bounds();
        expect(b.minX, `${s.id} ${facing}`).toBeGreaterThanOrEqual(1000);
        expect(b.minZ).toBeGreaterThanOrEqual(2000);
        expect(b.maxX).toBeLessThan(1000 + (facing & 1 ? depth : frontage));
        expect(b.maxZ).toBeLessThan(2000 + (facing & 1 ? frontage : depth));
        const doors = placed.markers().filter((m) => m.kind === 'door' && m.facing === facing);
        expect(doors.length, `${s.id} has a door looking ${facing}`).toBeGreaterThan(0);
      }
    }
  });

  it('refuse a lot that is too small', () => {
    const s = registry.get('market-hall')!;
    const lot = new Lot({ id: 'small', x: 0, z: 0, w: 20, d: 10, facing: 2, district: 'tourism', seed: 1, groundY: 8 });
    expect(() => placeOnLot(s, lot)).toThrow(RangeError);
  });
});

describe('the long set pieces', () => {
  it('the east bridge can be crossed on foot from one end to the other, over the crown', () => {
    const s = registry.get('east-bridge')!;
    const bp = buildLandmark(s);
    const { frontage, depth } = frameSize(s);
    const world = new BlueprintWorld(bp);
    const places = walk(world, { x: -3, z: 6, feet: 0.5 }, { minX: -4, maxX: frontage + 3, minZ: -4, maxZ: depth + 3 });
    expect(canStandIn(places, 14, bridgeDeck(14) + 1, 6), 'the crown').toBe(true);
    expect(canStandIn(places, frontage + 2, 1, 6), 'the far bank').toBe(true);
    // And the arch is open under it: a person could stand in the river bed under the crown.
    expect(bp.solid(14, 0, 6)).toBe(false);
  });

  it('the aqueduct carries water on its deck and has arches a person could walk through at its foot', () => {
    const s = registry.get('aqueduct')!;
    const bp = buildLandmark(s);
    let water = 0;
    bp.forEach((_x, y, _z, c) => { if (cellId(c) === BlockType.WATER && y > 10) water++; });
    expect(water).toBeGreaterThan(200);
    const world = new BlueprintWorld(bp);
    const { frontage, depth } = frameSize(s);
    const places = walk(world, { x: 5, z: -3, feet: 0.5 }, { minX: 0, maxX: frontage - 1, minZ: -4, maxZ: depth + 3, max: 20000 });
    // From the north side a walker passes under the first arch to the south side.
    const cols = columnsOf(places);
    expect(cols.has('9,6') || cols.has('13,6') || cols.has('17,6')).toBe(true);
  });
});

describe('landmark entrances and interiors', () => {
  const withDoors = specs.filter((s) => s.frame === 'front-south' && buildLandmark(s).markers.some((m) => m.kind === 'door'));

  it('have door markers on the specs that are buildings', () => {
    const ids = withDoors.map((s) => s.id);
    for (const id of ['civic-compound', 'town-hall', 'arena', 'west-gate', 'north-gate', 'east-gatehouse', 'south-gatehouse', 'arena-guard-hut']) expect(ids, id).toContain(id);
  });

  it('let a walker go from the street through every door to the cell just inside', () => {
    for (const s of withDoors) {
      const bp = buildLandmark(s);
      for (const d of bp.markers.filter((m) => m.kind === 'door')) {
        const { places, f } = reachFrom(s, d);
        const inside = { x: d.x - DX[f] * 2, z: d.z - DZ[f] * 2 };
        expect(canStandIn(places, d.x, d.y, d.z), `${s.id} reaches its door ${d.x},${d.z}`).toBe(true);
        expect(canStandIn(places, inside.x, d.y, inside.z) || canStandIn(places, inside.x, d.y + 1, inside.z) || canStandIn(places, inside.x, d.y - 1, inside.z),
          `${s.id} reaches inside its door ${d.x},${d.z}`).toBe(true);
      }
    }
  });

  it('let a walker from the first door reach every room marker of the landmark', () => {
    for (const s of withDoors) {
      const bp = buildLandmark(s);
      const rooms = bp.markers.filter((m) => m.kind === 'room');
      if (rooms.length === 0) continue;
      const door = bp.markers.find((m) => m.kind === 'door')!;
      const { places } = reachFrom(s, door);
      for (const r of rooms) {
        const ok = [0, -1, 1].some((dy) => canStandIn(places, r.x, r.y + dy, r.z));
        expect(ok, `${s.id} reaches room ${r.tag} at ${r.x},${r.y},${r.z}`).toBe(true);
      }
    }
  });

  it('the Town Hall council hall is walkable: most of its floor can be stood on from the door', () => {
    const s = registry.get('town-hall')!;
    const bp = buildLandmark(s);
    const door = bp.markers.find((m) => m.kind === 'door')!;
    const { places } = reachFrom(s, door);
    const cols = columnsOf(places);
    const council = bp.markers.find((m) => m.kind === 'room' && m.tag === 'council-hall')!;
    expect(council).toBeDefined();
    let near = 0;
    for (let z = council.z - 4; z <= council.z + 4; z++) for (let x = council.x - 6; x <= council.x + 6; x++) if (cols.has(`${x},${z}`)) near++;
    expect(near, 'cells of the council hall a walker can stand on').toBeGreaterThan(40);
  });
});

describe('the Town Hall and its compound: an impressive landmark', () => {
  const hall = buildLandmark(registry.get('town-hall')!);
  const compound = buildLandmark(registry.get('civic-compound')!);
  const countOf = (bp: typeof hall, ids: number[]): number => {
    let n = 0;
    bp.forEach((_x, _y, _z, c) => { if (ids.includes(cellId(c))) n++; });
    return n;
  };

  it('towers over the town: four storeys under a teal roof, forty blocks to the flagpole, over three times the height of a street of houses', () => {
    const b = hall.bounds()!;
    expect(b.maxY).toBeGreaterThanOrEqual(38);
    // Walls of plaster stand to the third floor's ceiling, a block under the roof: at least eighteen blocks of wall at the front corners.
    let wall = 0;
    for (let y = 2; y < 30; y++) if (hall.get(2, y, 22) !== -1 && cellId(hall.get(2, y, 22)) !== 0) wall++;
    expect(wall).toBeGreaterThanOrEqual(18);
    expect(countOf(hall, [T.TEAL_ROOF, T.TEAL_ROOF_STAIRS, T.TEAL_ROOF_SLAB])).toBeGreaterThan(400);
  });

  it('has a portico of four columns two storeys high with a pediment over it, arched windows, pilasters and balustrades', () => {
    for (const x of [11, 13, 17, 19]) {
      for (let y = 2; y <= 12; y++) expect(cellId(hall.get(x, y, 22)), `column ${x},${y}`).toBe(T.WHITE_COLUMN);
    }
    // The pediment of the portico: plaster rising above the cornice over the columns.
    expect(cellId(hall.get(14, 16, 22))).toBe(T.PLASTER_WHITE);
    expect(cellId(hall.get(15, 16, 22))).toBe(T.SHOJI_PANE_LIT); // and a lit round window in its middle
    // Arched windows: upside-down stairs at the head of each opening (the arch's corners), many of them.
    expect(countOf(hall, [T.PLASTER_STAIRS])).toBeGreaterThanOrEqual(120);
    // Pilasters: a pier of plaster a block proud of the wing's front, from the plinth to the cornice, on both wings.
    for (const x of [5, 6, 24, 25]) for (let y = 2; y <= 18; y++) expect(hall.get(x, y, 23), `pilaster ${x},${y}`).not.toBe(-1);
    // Balusters in front of the second-floor windows and along the balcony.
    let balusters = 0;
    for (let x = 1; x <= 29; x++) if (cellId(hall.get(x, 8, 23)) === T.WHITE_COLUMN) balusters++;
    expect(balusters).toBeGreaterThanOrEqual(14);
  });

  it('is a lit face at night: lit paper windows on the upper floors, red lanterns under every string course, stone lanterns along the plinth', () => {
    expect(countOf(hall, [T.SHOJI_PANE_LIT])).toBeGreaterThanOrEqual(100);
    expect(countOf(hall, [T.PAPER_LANTERN_RED, T.PAPER_LANTERN_STRIPED])).toBeGreaterThanOrEqual(50);
    expect(countOf(hall, [T.STONE_LANTERN_LIGHT])).toBeGreaterThanOrEqual(6);
    // Windows on all three floors of both wings' fronts glow: lit panes at the second and third floors of the front.
    for (const y of [F2_WINDOW, F3_WINDOW]) {
      let lit = 0;
      for (let x = 2; x <= 28; x++) if (cellId(hall.get(x, y, 22)) === T.SHOJI_PANE_LIT) lit++;
      expect(lit, `row ${y}`).toBeGreaterThanOrEqual(8);
    }
  });

  it('stands in view from the avenue: the compound\'s front wall is a low rail between posts, and only the towers at the gate and the corners are tall', () => {
    const top = (x: number): number => {
      let t = 0;
      for (let y = 1; y <= 14; y++) {
        const c = compound.get(x, y, 50);
        if (c !== -1 && blocks.isOpaque(cellId(c))) t = y;
      }
      return t;
    };
    // Between the gate towers and the corner towers (x 7 to 13 and 36 to 41) the wall is a footing, posts and a slab: four blocks at the most.
    for (const x of [7, 8, 9, 10, 11, 12, 13, 36, 37, 38, 39, 40, 41]) expect(top(x), `front wall at ${x}`).toBeLessThanOrEqual(4);
    // The rail is there between the posts, and the towers beside the gate are lower than the hall by far.
    expect(cellId(compound.get(8, 2, 50))).toBe(T.VERMILION_RAIL);
    expect(cellId(compound.get(40, 2, 50))).toBe(T.VERMILION_RAIL);
    expect(Math.max(...[16, 17, 18, 31, 32, 33].map(top))).toBeLessThanOrEqual(14);
    expect(compound.bounds()!.maxY).toBeGreaterThanOrEqual(38);
  });

  it('is walked from the door through all three floors of a wing to its top floor with the game\'s own collision', () => {
    const s = registry.get('town-hall')!;
    const door = hall.markers.find((m) => m.kind === 'door')!;
    const { places } = reachFrom(s, door, 3);
    let top = 0;
    for (const p of places.values()) top = Math.max(top, p.feet);
    // The third floor is at row 13; a walker on it has its feet at 13.5 or a little more.
    expect(top).toBeGreaterThanOrEqual(13.5);
    const rooms = hall.markers.filter((m) => m.kind === 'room' && /top|study/.test(m.tag ?? ''));
    expect(rooms.length).toBeGreaterThanOrEqual(5);
    for (const r of rooms) {
      const ok = [0, -1, 1].some((dy) => canStandIn(places, r.x, r.y + dy, r.z));
      expect(ok, `${r.tag} at ${r.x},${r.y},${r.z}`).toBe(true);
    }
  });
});

const F2_WINDOW = 9;
const F3_WINDOW = 15;
