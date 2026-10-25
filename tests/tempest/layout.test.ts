import { describe, expect, it } from 'vitest';
import { WORLD_SEED } from '../../worldConstants';
import { GATES, EDGES } from '../../worldgen/roads/layout';
import { ZONE_INFOS, insideCore, zoneInfoByName } from '../../worldgen/zones/ZoneInfo';
import { RoadNetwork } from '../../worldgen/roads/RoadNetwork';
import {
  AVENUE_HALF, BLOCK, BLOCKS, COMPOUND, SECTORS, sectorOfBlock, GRID_REACH, LANDMARKS, PITCH, RIVER, ROADS, ROAD_GATES, Rect, Shape, TEMPEST_CENTER_X,
  TEMPEST_CORE, TEMPEST_RADIUS, blockAt, blockById, districtAt, farmField, inBlock, inShape, isClearing, isWooded, landmarkAt,
  landmarkById, localX, localZ, openLandRadius, riverDistance, roadAt, shapeBounds, worldX, worldZ,
} from '../../worldgen/tempest/layout';

const overlap = (a: Rect, b: Rect): boolean => a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1;
const cellsOf = (s: Shape): Array<[number, number]> => {
  const b = shapeBounds(s);
  const out: Array<[number, number]> = [];
  for (let x = b.x0; x <= b.x1; x++) for (let z = b.z0; z <= b.z1; z++) if (inShape(s, x, z)) out.push([x, z]);
  return out;
};

describe('Tempest layout: the grid', () => {
  it('has 64 blocks, each 38 cells square (the two beside the compound narrower), on a pitch of 44', () => {
    expect(BLOCKS).toHaveLength(64);
    for (const b of BLOCKS) {
      const w = b.rect.x1 - b.rect.x0 + 1;
      const d = b.rect.z1 - b.rect.z0 + 1;
      expect(d, b.id).toBe(BLOCK);
      expect(w === BLOCK || (b.row === -4 && Math.abs(b.col) === 1 && w === 12), `${b.id} ${w}`).toBe(true);
    }
    expect(PITCH).toBe(44);
    expect(GRID_REACH).toBe(181);
  });

  it('keeps blocks apart from each other, from the avenues and the streets, and inside the built town', () => {
    for (let i = 0; i < BLOCKS.length; i++) {
      const a = BLOCKS[i];
      for (let j = i + 1; j < BLOCKS.length; j++) expect(overlap(a.rect, BLOCKS[j].rect), `${a.id} ${BLOCKS[j].id}`).toBe(false);
      expect(localX(a.rect.x0)).toBeGreaterThanOrEqual(-GRID_REACH);
      expect(localX(a.rect.x1)).toBeLessThanOrEqual(GRID_REACH);
      expect(localZ(a.rect.z0)).toBeGreaterThanOrEqual(-GRID_REACH);
      expect(localZ(a.rect.z1)).toBeLessThanOrEqual(GRID_REACH);
      expect(overlap(a.rect, COMPOUND), a.id).toBe(false);
    }
    // No cell of a block is on an axis-aligned road. The diagonals are the only roads that cut blocks, on purpose.
    for (const b of BLOCKS) {
      for (let x = b.rect.x0; x <= b.rect.x1; x++) {
        for (let z = b.rect.z0; z <= b.rect.z1; z++) {
          if (!inBlock(b, x, z)) continue;
          const r = roadAt(x, z);
          expect(r === null || r.kind === 'diagonal', `${b.id} ${x},${z} on ${r?.id}`).toBe(true);
        }
      }
    }
  });

  it('makes the avenues 11 wide and the grid streets 6 wide, and clips the four corners round the Central Square', () => {
    for (const r of ROADS) {
      if (r.kind === 'avenue') expect(r.width).toBe(11);
      if (r.kind === 'street') expect(r.width).toBe(6);
      if (r.rect && (r.kind === 'avenue' || r.kind === 'street')) {
        const w = r.rect.x1 - r.rect.x0 + 1;
        const d = r.rect.z1 - r.rect.z0 + 1;
        expect(Math.min(w, d)).toBe(r.width);
      }
      if (r.kind === 'diagonal') expect(r.width).toBe(5);
    }
    expect(AVENUE_HALF * 2 + 1).toBe(11);
    // The block at the corner of the avenues has its inner corner cut away, so its first cell (6, 6) is not in it.
    const c1r1 = blockById('c1r1')!;
    expect(inBlock(c1r1, worldX(6), worldZ(6))).toBe(false);
    expect(inBlock(c1r1, worldX(16), worldZ(6))).toBe(true);
    expect(inBlock(c1r1, worldX(14), worldZ(6))).toBe(false);
    expect(inBlock(c1r1, worldX(14), worldZ(14))).toBe(true);
    for (const id of ['c-1r1', 'c-1r-1', 'c1r-1']) expect(blockById(id)!.corners.filter((c) => c === 9)).toHaveLength(1);
    // The Central Square is a roundabout of radius 7.
    expect(landmarkById('central-square')!.shape).toEqual({ kind: 'circle', cx: worldX(0), cz: worldZ(0), r: 7 });
  });

  it('answers blockAt in constant time and exactly as a scan of the blocks does', () => {
    let seen = 0;
    for (let lx = -190; lx <= 190; lx += 3) {
      for (let lz = -190; lz <= 190; lz += 3) {
        const x = worldX(lx), z = worldZ(lz);
        const scan = BLOCKS.find((b) => inBlock(b, x, z)) ?? null;
        expect(blockAt(x, z)?.id ?? null, `${lx},${lz}`).toBe(scan?.id ?? null);
        if (scan) seen++;
      }
    }
    expect(seen).toBeGreaterThan(5000);
  });

  it('follows the plan\'s zoning: government in the north west, commerce and production in the west, tourism in the south east', () => {
    const count = (d: string): number => BLOCKS.filter((b) => b.district === d).length;
    expect(count('tourism')).toBe(16);
    expect(count('guest')).toBe(2);
    expect(count('government')).toBe(2);
    expect(count('public')).toBe(4);
    expect(count('luxury')).toBe(4);
    expect(count('commercial')).toBe(8);
    expect(count('production')).toBe(2);
    expect(count('storage')).toBe(4);
    expect(count('residential')).toBe(64 - 16 - 2 - 2 - 4 - 4 - 8 - 2 - 4);
    // The tourism sector is the whole south east quadrant: every block with col > 0 and row > 0.
    for (const b of BLOCKS) expect(b.district === 'tourism', b.id).toBe(b.col > 0 && b.row > 0);
    // Commerce lies on both sides of the east-west avenue, in the west.
    for (const b of BLOCKS) if (b.district === 'commercial') expect(b.col, b.id).toBeLessThan(0);
    for (const b of BLOCKS) if (b.district === 'commercial') expect(Math.abs(b.row), b.id).toBe(1);
    // Production and storage are south of the avenue, storage further west, and the guest houses are the far north west.
    for (const b of BLOCKS) {
      if (b.district === 'production') expect(b.row).toBeGreaterThan(1);
      if (b.district === 'storage') expect(b.col).toBeLessThanOrEqual(-3);
      if (b.district === 'guest') { expect(b.row).toBe(-4); expect(b.col).toBeLessThanOrEqual(-3); }
      if (b.district === 'public') { expect(b.row).toBe(-4); expect(b.col).toBeGreaterThan(0); }
    }
    expect(districtAt(worldX(100), worldZ(100))).toBe('tourism');
    expect(districtAt(worldX(-100), worldZ(-20))).toBe('commercial');
    expect(districtAt(worldX(0), worldZ(-165))).toBe('civic');
    expect(districtAt(worldX(260), worldZ(60))).toBe('farm');
    expect(districtAt(worldX(-228), worldZ(64))).toBe('pasture');
    expect(districtAt(worldX(40), worldZ(0))).toBe('open');
  });

  it('groups the blocks into the plan\'s named sectors, each block in exactly one, with bounds that hold them', () => {
    expect(SECTORS.map((s) => s.id)).toEqual([
      'civic-compound', 'guest-houses', 'government-residences', 'public-facilities', 'luxury-villas', 'commercial', 'production', 'storage',
      'residences-north-west', 'residences-north-east', 'residences-south-west', 'tourism',
    ]);
    const owners = new Map<string, number>();
    for (const s of SECTORS) for (const id of s.blocks) owners.set(id, (owners.get(id) ?? 0) + 1);
    expect(owners.size).toBe(BLOCKS.length);
    for (const n of owners.values()) expect(n).toBe(1);
    for (const b of BLOCKS) {
      const sector = sectorOfBlock(b);
      expect(sector.district).toBe(b.district);
      expect(overlap(b.rect, sector.bounds)).toBe(true);
      expect(b.rect.x0 >= sector.bounds.x0 && b.rect.x1 <= sector.bounds.x1 && b.rect.z0 >= sector.bounds.z0 && b.rect.z1 <= sector.bounds.z1).toBe(true);
    }
    const sector = (id: string) => SECTORS.find((s) => s.id === id)!;
    expect(sector('tourism').blocks).toHaveLength(16);
    expect(sector('guest-houses').bounds.z1).toBeLessThan(worldZ(-130));
    expect(sector('civic-compound').bounds).toEqual(COMPOUND);
  });

  it('keeps diagonals 5 wide cutting blocks corner to corner, and the north east one in four pieces', () => {
    const d = ROADS.filter((r) => r.kind === 'diagonal');
    expect(d.map((r) => r.id)).toEqual(['diag-nw-a', 'diag-nw-b', 'diag-ne']);
    const ne = d.find((r) => r.id === 'diag-ne')!.line!;
    // Runs north west to south east, along x - z = 181: through the corners of c2r-3, c3r-2 and c4r-1.
    for (const [lx, lz] of [[50, -131], [87, -94], [94, -87], [131, -50], [138, -43], [175, -6]]) expect(roadAt(worldX(lx), worldZ(lz))?.id, `${lx},${lz}`).toBe('diag-ne');
    expect(Math.abs((ne.x1 - ne.x0) - (ne.z1 - ne.z0))).toBeLessThan(1e-9);
    // The two on the north west side are parallel and run south west to north east.
    const a = d.find((r) => r.id === 'diag-nw-a')!.line!;
    const b = d.find((r) => r.id === 'diag-nw-b')!.line!;
    expect((a.x1 - a.x0) + (a.z1 - a.z0)).toBeCloseTo(0, 6);
    expect((b.x1 - b.x0) + (b.z1 - b.z0)).toBeCloseTo(0, 6);
    expect(roadAt(worldX(-100), worldZ(-81))?.id).toBe('diag-nw-a');
    // Five cells wide: the centre-line and two cells either side are road, four cells away is not.
    expect(roadAt(worldX(112), worldZ(-69))?.kind).toBe('diagonal');
    expect(roadAt(worldX(112 + 4), worldZ(-69))).toBeNull();
  });
});

describe('Tempest layout: landmarks', () => {
  it('has unique ids, a name and a facing for everything with a front, and all inside the footprint', () => {
    const ids = new Set<string>();
    for (const l of LANDMARKS) {
      expect(ids.has(l.id), l.id).toBe(false);
      ids.add(l.id);
      expect(l.name.length).toBeGreaterThan(3);
      const b = shapeBounds(l.shape);
      for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) {
        expect(Math.hypot(x - TEMPEST_CENTER_X, z), l.id).toBeLessThan(TEMPEST_RADIUS);
      }
      if (['hall', 'gate', 'arena', 'compound', 'portal'].includes(l.kind)) expect(l.facing, l.id).not.toBeNull();
      // Nothing carries a canon name from the series.
      expect(l.name).not.toMatch(/rimuru|shizu|dwargon|blumund|eurazania/i);
    }
    for (const must of ['central-square', 'civic-compound', 'town-hall', 'arena', 'north-cave', 'south-cairn', 'west-gate', 'north-gate', 'horse-pasture', 'east-bridge']) {
      expect(landmarkById(must), must).toBeDefined();
    }
  });

  it('does not overlap: landmarks stay apart except inside their parent, off the blocks and off the roads unless built on one', () => {
    for (let i = 0; i < LANDMARKS.length; i++) {
      for (let j = i + 1; j < LANDMARKS.length; j++) {
        const a = LANDMARKS[i], b = LANDMARKS[j];
        if (a.parent === b.id || b.parent === a.id) continue;
        if (a.parent && a.parent === b.parent) {
          const ca = new Set(cellsOf(a.shape).map(([x, z]) => `${x},${z}`));
          for (const [x, z] of cellsOf(b.shape)) expect(ca.has(`${x},${z}`), `${a.id} ${b.id}`).toBe(false);
          continue;
        }
        const ba = shapeBounds(a.shape), bb = shapeBounds(b.shape);
        if (!overlap(ba, bb)) continue;
        const cb = cellsOf(b.shape);
        for (const [x, z] of cb) expect(inShape(a.shape, x, z), `${a.id} overlaps ${b.id} at ${x},${z}`).toBe(false);
      }
    }
  });

  it('keeps landmarks off blocks and roads, except the ones that stand on a road', () => {
    for (const l of LANDMARKS) {
      for (const [x, z] of cellsOf(l.shape)) {
        if (l.id === 'town-hall' || l.parent === 'civic-compound' || l.id === 'civic-compound') continue;
        expect(blockAt(x, z), `${l.id} on a block at ${x},${z}`).toBeNull();
        if (!l.onRoad) expect(roadAt(x, z)?.id ?? null, `${l.id} on road at ${x},${z}`).toBeNull();
      }
    }
    // Gates and the bridge are on a road: some cell of each is.
    for (const id of ['west-gate', 'north-gate', 'east-gatehouse', 'south-gatehouse', 'east-bridge', 'central-square']) {
      expect(cellsOf(landmarkById(id)!.shape).some(([x, z]) => roadAt(x, z) !== null), id).toBe(true);
    }
  });

  it('puts the Town Hall in the compound at the head of the north-south avenue, facing it', () => {
    const hall = landmarkById('town-hall')!;
    const forecourt = landmarkById('town-hall-forecourt')!;
    expect(hall.parent).toBe('civic-compound');
    expect(hall.facing).toBe(2);
    const hb = shapeBounds(hall.shape), fb = shapeBounds(forecourt.shape);
    // On the avenue's axis, behind its forecourt.
    expect((hb.x0 + hb.x1) / 2).toBe(TEMPEST_CENTER_X);
    expect(hb.z1).toBeLessThan(fb.z0);
    // The avenue ends at the compound's front wall.
    expect(roadAt(worldX(0), COMPOUND.z1 + 1)?.kind).toBe('avenue');
    expect(roadAt(worldX(0), COMPOUND.z1)).toBeNull();
    expect(landmarkAt(worldX(0), worldZ(-170))?.id).toBe('town-hall');
    expect(landmarkAt(worldX(0), worldZ(-150))?.id).toBe('town-hall-forecourt');
    expect(landmarkAt(worldX(-23), worldZ(-170))?.id).toBe('civic-compound');
    // Compound 49 by 51 (the plan: about 45 by 50).
    expect(COMPOUND.x1 - COMPOUND.x0 + 1).toBe(49);
    expect(COMPOUND.z1 - COMPOUND.z0 + 1).toBe(51);
  });

  it('places the arena north east in a clearing, the cave beyond the north gate and the cairn beside the south road', () => {
    const arena = landmarkById('arena')!.shape;
    expect(arena.kind).toBe('circle');
    if (arena.kind === 'circle') {
      expect(arena.cx).toBeGreaterThan(TEMPEST_CENTER_X);
      expect(arena.cz).toBeLessThan(-GRID_REACH);
      expect(isClearing(arena.cx, arena.cz + 40)).toBe(true);
      expect(isWooded(arena.cx, arena.cz)).toBe(false);
    }
    const cave = landmarkById('north-cave')!.shape;
    if (cave.kind === 'circle') {
      expect(cave.cz).toBeLessThan(worldZ(-GRID_REACH));
      expect(Math.abs(cave.cx - TEMPEST_CENTER_X)).toBeLessThan(60);
      // Beyond the core, in the band where the zone blends into the wilderness.
      expect(Math.hypot(cave.cx - TEMPEST_CENTER_X, cave.cz)).toBeGreaterThan(TEMPEST_CORE);
    }
    const cairn = landmarkById('south-cairn')!.shape;
    if (cairn.kind === 'circle') {
      expect(cairn.cz).toBeGreaterThan(worldZ(GRID_REACH));
      expect(Math.abs(cairn.cx - TEMPEST_CENTER_X)).toBeGreaterThan(20);
      expect(Math.abs(cairn.cx - TEMPEST_CENTER_X)).toBeLessThan(120);
    }
    expect(landmarkById('horse-pasture')!.shape).toMatchObject({ kind: 'circle' });
    expect(landmarkById('horse-pasture')!.district).toBe('pasture');
  });
});

describe('Tempest layout: the roads out and the RoadNetwork', () => {
  it('uses exactly the gates the RoadNetwork has, on the roads the layout lays to them', () => {
    expect(ROAD_GATES.west).toEqual({ x: GATES.tempestWest.x, z: GATES.tempestWest.z, dx: GATES.tempestWest.dx, dz: GATES.tempestWest.dz, half: GATES.tempestWest.half });
    expect(ROAD_GATES.north).toEqual({ x: GATES.tempestNorth.x, z: GATES.tempestNorth.z, dx: GATES.tempestNorth.dx, dz: GATES.tempestNorth.dz, half: GATES.tempestNorth.half });
    expect(ROAD_GATES.west.x).toBe(900);
    expect(ROAD_GATES.north.z).toBe(-600);
    // The layout's road covers the gate cell and is as wide as the road at the gate: 9, half 4.5.
    const west = roadAt(ROAD_GATES.west.x, ROAD_GATES.west.z);
    const north = roadAt(ROAD_GATES.north.x, ROAD_GATES.north.z);
    expect(west?.id).toBe('road-west');
    expect(north?.id).toBe('road-north');
    for (let k = -4; k <= 4; k++) {
      expect(roadAt(ROAD_GATES.west.x, ROAD_GATES.west.z + k)?.id).toBe('road-west');
      expect(roadAt(ROAD_GATES.north.x + k, ROAD_GATES.north.z)?.id).toBe('road-north');
    }
    expect(roadAt(ROAD_GATES.west.x, ROAD_GATES.west.z + 5)).toBeNull();
    expect(roadAt(ROAD_GATES.north.x + 5, ROAD_GATES.north.z)).toBeNull();
    expect(west!.width).toBe(GATES.tempestWest.half * 2);
    expect(north!.width).toBe(GATES.tempestNorth.half * 2);
    // The roads run straight from the grid to the gate along the avenues' axes: no bend is needed.
    for (let x = ROAD_GATES.west.x; x <= worldX(-GRID_REACH - 1); x += 7) expect(roadAt(x, 0)?.id).toBe('road-west');
    for (let z = ROAD_GATES.north.z; z <= worldZ(-202); z += 7) expect(roadAt(TEMPEST_CENTER_X, z)?.id).toBe('road-north');
    // The gates are on the zone's core rim and the roads between are inside the footprint.
    const info = zoneInfoByName('Federation of Tempest')!;
    expect(insideCore(info, ROAD_GATES.west.x, 0)).toBe(false);
    expect(insideCore(info, ROAD_GATES.west.x + 60, 0)).toBe(true);
  });

  it('matches the road network built from the seed: its Tempest roads start at the layout\'s gates', () => {
    const net = new RoadNetwork(WORLD_SEED, () => 8, () => true);
    const tempestEdges = EDGES.filter((e) => e.from === GATES.tempestWest || e.to === GATES.tempestWest || e.from === GATES.tempestNorth || e.to === GATES.tempestNorth);
    expect(tempestEdges).toHaveLength(2);
    for (const def of tempestEdges) {
      const edge = net.edges.find((e) => e.name === def.name)!;
      const gate = def.from === GATES.tempestWest || def.from === GATES.tempestNorth ? def.from : def.to;
      const atStart = def.from === gate;
      const i = atStart ? 0 : edge.x.length - 1;
      expect(Math.round(edge.x[i])).toBe(gate.x);
      expect(Math.round(edge.z[i])).toBe(gate.z);
      // The road leaves the gate straight away from the town, so it meets the layout's road head on.
      const j = atStart ? 1 : edge.x.length - 2;
      const dx = edge.x[j] - edge.x[i], dz = edge.z[j] - edge.z[i];
      expect(dx * gate.dx + dz * gate.dz).toBeGreaterThan(0);
      expect(Math.abs(dx * gate.dz - dz * gate.dx)).toBeLessThan(0.2);
      // At the gate the road is as wide as the layout's: its half width.
      expect(edge.half[i]).toBeCloseTo(gate.half, 6);
    }
  });

  it('leaves the plain roads east and south as stubs of the same width, for the network to adopt later', () => {
    for (const id of ['road-east', 'road-south']) {
      const r = ROADS.find((x) => x.id === id)!;
      expect(r.width).toBe(9);
    }
    const info = ZONE_INFOS.find((z) => z.name === 'Federation of Tempest')!;
    expect(info.shape).toMatchObject({ kind: 'circle', cx: 1500, cz: 0, radius: 700 });
  });
});

describe('Tempest layout: the land beyond the grid', () => {
  it('has a river that crosses the east road under the bridge and stays out of the town, and farms with curved radial fields', () => {
    let nearest = Infinity;
    for (let lx = -GRID_REACH; lx <= 200; lx += 5) for (let lz = -GRID_REACH; lz <= GRID_REACH; lz += 5) nearest = Math.min(nearest, riverDistance(worldX(lx), worldZ(lz)));
    expect(nearest).toBeGreaterThan(40);
    const bridge = landmarkById('east-bridge')!;
    expect(inShape(bridge.shape, worldX(340), worldZ(0))).toBe(true);
    expect(riverDistance(worldX(340), worldZ(0))).toBeLessThan(1);
    for (const p of RIVER.path) expect(Math.hypot(p.x - TEMPEST_CENTER_X, p.z)).toBeLessThan(TEMPEST_CORE);
    const a = farmField(worldX(220), worldZ(30))!;
    const b = farmField(worldX(222), worldZ(30))!;
    expect(a).toBeTruthy();
    // A field is a ring of 26 cells and a sector of 3 degrees: the same field a few cells along, another a ring further.
    expect(farmField(worldX(220 + 26), worldZ(30))!.ring).toBe(a.ring + 1);
    expect(b.sector).toBe(a.sector);
    expect(farmField(worldX(100), worldZ(0))).toBeNull();
  });

  it('puts the forest round the edge with an irregular outline, clearings excepted, never inside the grid or on a road', () => {
    const radii: number[] = [];
    for (let a = -Math.PI; a < Math.PI; a += 0.05) radii.push(openLandRadius(a));
    expect(Math.min(...radii)).toBeGreaterThan(240);
    expect(Math.max(...radii)).toBeLessThan(360);
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(30);
    expect(isWooded(worldX(0), worldZ(0))).toBe(false);
    expect(isWooded(worldX(150), worldZ(-150))).toBe(false);
    expect(isWooded(worldX(-600), worldZ(300))).toBe(true);
    expect(isWooded(worldX(-300), worldZ(0))).toBe(false); // on the road out
    expect(isWooded(worldX(-420), worldZ(30))).toBe(true);
    expect(districtAt(worldX(-450), worldZ(300))).toBe('forest');
  });

  it('keeps a clearing round the east bridge, so the arch and the river are seen from the banks and not through trees', () => {
    const b = landmarkById('east-bridge')!.shape as { x0: number; x1: number; z0: number; z1: number };
    for (const [x, z] of [[b.x0 - 20, b.z0 - 20], [b.x1 + 20, b.z1 + 20], [b.x0 - 20, b.z1 + 20], [(b.x0 + b.x1) / 2, b.z0 - 20]]) expect(isClearing(x, z), `${x},${z}`).toBe(true);
    expect(isClearing(b.x0 - 30, 0)).toBe(false);
  });

  it('is deterministic and pure: asking twice gives the same answers', () => {
    for (let i = 0; i < 300; i++) {
      const x = 1500 - 400 + ((i * 97) % 800), z = -400 + ((i * 131) % 800);
      expect(districtAt(x, z)).toBe(districtAt(x, z));
      expect(roadAt(x, z)?.id ?? null).toBe(roadAt(x, z)?.id ?? null);
    }
  });
});
