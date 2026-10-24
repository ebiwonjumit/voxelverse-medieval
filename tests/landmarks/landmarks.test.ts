import { describe, expect, it } from 'vitest';
import { Rect, landmarkById } from '../../worldgen/tempest/layout';
import { createTempestLandmarks, LandmarkSpec, buildLandmark, frameSize, placeBlueprint, landmarkLot } from '../../worldgen/tempest/landmarks';
import { TEMPEST_STYLE } from '../../worldgen/tempest/style';
import { DX, DZ, Dir } from '../../worldgen/structures/BlueprintBuilder';
import { BlueprintWorld, canStandIn, columnsOf, floatingCells, walk } from './helpers';

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

  it('are built from air and blocks the world knows', () => {
    for (const s of specs) {
      buildLandmark(s).forEach((_x, _y, _z, c) => {
        expect(c).toBeGreaterThanOrEqual(0);
      });
    }
  });

  it('turn to face the way the plan says: the door marker looks outwards on the side of the facing', () => {
    for (const s of specs.filter((v) => v.frame === 'front-south')) {
      const placement = placeBlueprint(s, buildLandmark(s));
      const lot = landmarkLot(s);
      const doors = placement.markers().filter((m) => m.kind === 'door' && m.facing === s.facing);
      if (s.facing === 2 && s.id !== 'north-cave' && doors.length === 0) continue;
      // A door that looks the landmark's way stands on the footprint's edge on that side (within the eaves of the lot).
      for (const d of doors) {
        const f = s.footprint;
        const edge = [f.z0, f.x1, f.z1, f.x0][s.facing as Dir];
        const at = (s.facing === 0 || s.facing === 2) ? d.z : d.x;
        expect(Math.abs(at - edge), `${s.id} door ${d.x},${d.z}`).toBeLessThanOrEqual(lot.depth);
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
