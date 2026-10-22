import { describe, expect, it } from 'vitest';
import { LEGACY_BOXES, meshChunk } from '../../meshing/ChunkMesher';
import { BlockType } from '../../worldConstants';
import { WHITE, MapReader, bounds, faceCount, registry, totalFaces } from './helpers';

// The scale and offset World.tsx applied to each instance, written out again here from the old file:
// [block, scale x, scale y, scale z, centre moved by y].
const OLD_WORLD_TSX: Array<[BlockType, number, number, number, number]> = [
  [BlockType.FLOWER_YELLOW, 0.3, 0.4, 0.3, -0.3],
  [BlockType.FLOWER_RED, 0.3, 0.4, 0.3, -0.3],
  [BlockType.SMALL_ROCK, 0.4, 0.2, 0.4, -0.4],
  [BlockType.MAGIC_CRYSTAL, 0.6, 0.8, 0.6, 0],
  [BlockType.WOOD_FENCE, 0.25, 1, 0.25, 0],
  [BlockType.WHEAT, 0.8, 0.7, 0.8, -0.15],
  [BlockType.WHEAT_STAGE_1, 0.5, 0.3, 0.5, -0.35],
  [BlockType.WHEAT_STAGE_2, 0.6, 0.5, 0.6, -0.25],
  [BlockType.FARMLAND, 1, 0.9, 1, -0.05],
  [BlockType.LILY_PAD, 0.6, 0.05, 0.6, 0.51],
  [BlockType.SUGARCANE, 0.2, 1, 0.2, 0],
  [BlockType.TALL_GRASS, 0.6, 0.6, 0.6, -0.2],
  [BlockType.LANTERN, 0.3, 0.4, 0.3, -0.2],
  [BlockType.RED_APPLE, 0.2, 0.2, 0.2, 0],
];

describe('legacy shaped blocks', () => {
  it('covers exactly the blocks the old renderer scaled', () => {
    expect(Object.keys(LEGACY_BOXES).map(Number).sort((a, b) => a - b))
      .toEqual(OLD_WORLD_TSX.map(([id]) => id).sort((a, b) => a - b));
  });

  for (const [id, sx, sy, sz, dy] of OLD_WORLD_TSX) {
    it(`draws ${BlockType[id]} as a ${sx} x ${sy} x ${sz} box`, () => {
      // Block at (4, 10, 6): the old cube was centred on (4, 10, 6), the new one starts there, so the centre is +0.5.
      const m = meshChunk(new MapReader([[4, 10, 6, id]]), 0, 0, registry);
      expect(faceCount(m.cutout)).toBe(6);
      const { min, max } = bounds(m.cutout);
      const centre = [4.5, 10.5 + dy, 6.5];
      const size = [sx, sy, sz];
      for (let a = 0; a < 3; a++) {
        expect(max[a] - min[a]).toBeCloseTo(size[a], 5);
        expect((max[a] + min[a]) / 2).toBeCloseTo(centre[a], 5);
      }
    });
  }

  it('draws all six faces even with solid blocks on every side, and hides nothing', () => {
    const ring: Array<[number, number, number, number]> = [
      [5, 5, 5, BlockType.FLOWER_RED],
      [4, 5, 5, WHITE], [6, 5, 5, WHITE], [5, 4, 5, WHITE], [5, 6, 5, WHITE], [5, 5, 4, WHITE], [5, 5, 6, WHITE],
    ];
    const m = meshChunk(new MapReader(ring), 0, 0, registry);
    expect(faceCount(m.cutout)).toBe(6);
    // Each of the six stone blocks keeps all six faces, including the one toward the flower.
    expect(faceCount(m.opaque)).toBe(6 * 6);
  });

  it('does not hide a neighbouring box, even the same block', () => {
    const m = meshChunk(new MapReader([[5, 5, 5, BlockType.WOOD_FENCE], [6, 5, 5, BlockType.WOOD_FENCE]]), 0, 0, registry);
    expect(totalFaces(m)).toBe(12);
  });

  it('sits a lily pad on a cube of water', () => {
    const m = meshChunk(new MapReader([[8, 6, 8, BlockType.LILY_PAD]]), 0, 0, registry);
    expect(faceCount(m.cutout)).toBe(6);
    expect(faceCount(m.water)).toBe(6);
    expect(bounds(m.cutout).min[1]).toBeCloseTo(6 + 0.5 + 0.51 - 0.025, 5);
  });
});
