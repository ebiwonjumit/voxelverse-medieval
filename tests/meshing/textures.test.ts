import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../content/blocks';
import { createDefaultTextureLayout } from '../../content/textures/layout';
import { createDefaultCatalog } from '../../content/textures/TextureCatalog';
import { MeshData, meshChunk } from '../../meshing/ChunkMesher';
import { BlockType } from '../../worldConstants';
import { MapReader, Quad, quadsOf } from './helpers';

// Each of these blocks gets its own registry so a test block never leaks into the shared one.
const registry = createDefaultRegistry();
const FLAT = 100;
const STONE_TINTED = 101;
const MISSING_TILE = 102;
registry.register({ id: FLAT, name: 'test:flat', color: '#336699', solid: true, opaque: true, emits: 0 });
registry.register({
  id: STONE_TINTED, name: 'test:tinted_stone', color: '#808080', solid: true, opaque: true, emits: 0,
  faces: { top: 'stone', bottom: 'stone', side: 'stone' }, tint: 'grass',
});
registry.register({
  id: MISSING_TILE, name: 'test:missing_tile', color: '#aa5500', solid: true, opaque: true, emits: 0,
  faces: { top: 'no_such_tile', bottom: 'no_such_tile', side: 'no_such_tile' },
});

const catalog = createDefaultCatalog();
const layout = createDefaultTextureLayout(registry, catalog);
const nameOf = (quad: Quad) => layout.layerNames[quad.layer];

const lone = (id: number): Quad[] => {
  const m: MeshData = meshChunk(new MapReader([[5, 5, 5, id]]), 0, 0, registry, { layout });
  return [...quadsOf(m.opaque), ...quadsOf(m.cutout)];
};
const facing = (quads: Quad[], nx: number, ny: number, nz: number) =>
  quads.find((q) => q.normal[0] === nx && q.normal[1] === ny && q.normal[2] === nz)!;

describe('texture layers of a grass block', () => {
  const quads = lone(BlockType.GRASS);

  it('puts the grass top on top, dirt underneath and the grass side on all four sides', () => {
    expect(nameOf(facing(quads, 0, 1, 0))).toBe('grass_top');
    expect(nameOf(facing(quads, 0, -1, 0))).toBe('dirt');
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) expect(nameOf(facing(quads, nx, 0, nz))).toBe('grass_side');
  });

  it('gives the sides a tint overlay layer, holding the fringe mask, and the top and bottom none', () => {
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const side = facing(quads, nx, 0, nz);
      expect(side.overlay).toBeGreaterThanOrEqual(0);
      expect(layout.layerNames[side.overlay]).toBe('grass_side#tint');
    }
    expect(facing(quads, 0, 1, 0).overlay).toBe(-1);
    expect(facing(quads, 0, -1, 0).overlay).toBe(-1);
  });

  it('tints the top and the sides but not the dirt bottom', () => {
    const white = [1, 1, 1];
    for (const c of facing(quads, 0, -1, 0).corners) expect(c.tint).toEqual(white);
    for (const q of [facing(quads, 0, 1, 0), facing(quads, 1, 0, 0), facing(quads, 0, 0, -1)]) {
      const tint = q.corners[0].tint;
      expect(tint).not.toEqual(white);
      for (const c of q.corners) expect(c.tint).toEqual(tint);
    }
    // The sides carry the very colour of the top, which is what makes the fringe follow the zone.
    expect(facing(quads, 1, 0, 0).corners[0].tint).toEqual(facing(quads, 0, 1, 0).corners[0].tint);
  });
});

describe('texture layers of a log', () => {
  it('puts the ring on top and bottom and the bark on the sides, with no tint', () => {
    const quads = lone(BlockType.WOOD_LOG);
    expect(nameOf(facing(quads, 0, 1, 0))).toBe('log_top');
    expect(nameOf(facing(quads, 0, -1, 0))).toBe('log_top');
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) expect(nameOf(facing(quads, nx, 0, nz))).toBe('log_side');
    for (const q of quads) {
      expect(q.overlay).toBe(-1);
      for (const c of q.corners) expect(c.tint).toEqual([1, 1, 1]);
    }
  });

  it('does the same for the birch log', () => {
    const quads = lone(BlockType.BIRCH_LOG);
    expect(nameOf(facing(quads, 0, 1, 0))).toBe('birch_log_top');
    expect(nameOf(facing(quads, 1, 0, 0))).toBe('birch_log_side');
  });
});

describe('fallback tile', () => {
  it('draws a block without faces as a flat tile of its registry colour on every face', () => {
    const quads = lone(FLAT);
    expect(quads).toHaveLength(6);
    for (const q of quads) {
      expect(nameOf(q)).toBe('flat:#336699');
      expect(q.overlay).toBe(-1);
      for (const c of q.corners) expect(c.tint).toEqual([1, 1, 1]);
    }
  });

  it('falls back to the flat tile when a block names a texture the catalog does not have', () => {
    for (const q of lone(MISSING_TILE)) expect(nameOf(q)).toBe('flat:#aa5500');
    expect(layout.missing).toContain('no_such_tile');
  });

  it('shares one flat tile between blocks of the same colour', () => {
    const flatLayers = layout.layerNames.filter((n) => n.startsWith('flat:'));
    expect(new Set(flatLayers).size).toBe(flatLayers.length);
  });

  it('draws a block id the registry has never heard of in the magenta tile', () => {
    const m = meshChunk(new MapReader([[5, 5, 5, 3000]]), 0, 0, registry, { layout });
    for (const q of quadsOf(m.cutout)) expect(nameOf(q)).toBe('flat:#ff00ff');
  });
});

describe('tinted and untinted faces', () => {
  it('leaves the faces of blocks without a tint white', () => {
    for (const id of [BlockType.STONE, BlockType.DIRT, BlockType.SAND, BlockType.WOOD_PLANK, BlockType.PINE_LEAVES]) {
      for (const q of lone(id)) for (const c of q.corners) expect(c.tint, BlockType[id]).toEqual([1, 1, 1]);
    }
  });

  it('tints oak leaves on every face, darker than grass', () => {
    const leaves = lone(BlockType.LEAVES);
    const grass = lone(BlockType.GRASS);
    const l = facing(leaves, 0, 1, 0).corners[0].tint;
    const g = facing(grass, 0, 1, 0).corners[0].tint;
    for (const q of leaves) expect(q.corners[0].tint).toEqual(l);
    expect(l[1]).toBeCloseTo(g[1] * 0.7, 6);
  });

  it('ignores a tint on a block whose tile cannot take one', () => {
    for (const q of lone(STONE_TINTED)) for (const c of q.corners) expect(c.tint).toEqual([1, 1, 1]);
  });

  it('puts the tint of a block at its own position, so neighbouring zones differ', () => {
    const at = (x: number, z: number, cx: number) =>
      facing(quadsOf(meshChunk(new MapReader([[x, 5, z, BlockType.GRASS]]), cx, 0, registry, { layout }).opaque), 0, 1, 0)
        .corners[0].tint;
    expect(at(0, 0, 0)).not.toEqual(at(3 * 1600, 0, 150));
  });
});

describe('uv and shared tiles', () => {
  it('maps every face onto the whole tile, upright on walls', () => {
    for (const q of lone(BlockType.STONE_BRICK)) {
      const us = q.corners.map((c) => c.uv[0]).sort();
      const vs = q.corners.map((c) => c.uv[1]).sort();
      expect(us).toEqual([0, 0, 1, 1]);
      expect(vs).toEqual([0, 0, 1, 1]);
      if (q.normal[1] === 0) {
        // The top of the tile (v = 0) is the top edge of the wall.
        for (const c of q.corners) expect(c.uv[1]).toBe(c.pos[1] > 5.5 ? 0 : 1);
      }
    }
  });

  it('reads left to right as seen from outside, so a tile is never mirrored', () => {
    const quads = lone(BlockType.STONE_BRICK);
    // Facing +z the viewer's right is +x; facing +x it is -z.
    for (const c of facing(quads, 0, 0, 1).corners) expect(c.uv[0]).toBe(c.pos[0] > 5.5 ? 1 : 0);
    for (const c of facing(quads, 1, 0, 0).corners) expect(c.uv[0]).toBe(c.pos[2] > 5.5 ? 0 : 1);
    for (const c of facing(quads, 0, 0, -1).corners) expect(c.uv[0]).toBe(c.pos[0] > 5.5 ? 0 : 1);
    for (const c of facing(quads, -1, 0, 0).corners) expect(c.uv[0]).toBe(c.pos[2] > 5.5 ? 1 : 0);
  });

  it('textures water and glass, the other two buckets, from their tiles', () => {
    const w = meshChunk(new MapReader([[5, 5, 5, BlockType.WATER]]), 0, 0, registry, { layout });
    for (const q of quadsOf(w.water)) expect(nameOf(q)).toBe('water');
    const g = meshChunk(new MapReader([[5, 5, 5, BlockType.GLASS]]), 0, 0, registry, { layout });
    for (const q of quadsOf(g.cutout)) expect(nameOf(q)).toBe('glass');
  });

  it('uses the same layer numbers when the layout is built twice', () => {
    const again = createDefaultTextureLayout(registry, createDefaultCatalog());
    expect(again.layerNames).toEqual(layout.layerNames);
    expect(Array.from(again.faceLayers)).toEqual(Array.from(layout.faceLayers));
  });
});
